import {
  US_JURISDICTION_PROFILE_BY_CODE,
  US_STATE_POSTAL_CODE_BY_NAME,
} from "../shared/us-jurisdiction-profiles.js";
import {
  addressResolutionMatchesProfile,
  complianceSnapshotMatchesProfile,
  evaluateComplianceSnapshot,
  isVersionedComplianceSnapshot,
  normalizeComplianceEventInstant,
  normalizeAddressResolution,
} from "../shared/us-compliance-engine.js";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";
import {
  validateExternalComplianceAttestation,
  validateExternalComplianceMonitor,
} from "../shared/external-compliance-monitor.js";
import { requiredClaimAttestations } from "../shared/claim-policies.js";
import {
  dynamicComplianceFactForProfile,
} from "../shared/us-compliance-facts.js";
import {
  getDepositAssetForTerms,
  validateDepositAssetTerms,
} from "../shared/deposit-assets.js";
import {
  FUNDING_CHECKOUT_EVENT_SOURCES,
  FUNDING_CHECKOUT_EVENT_VERIFICATIONS,
  FUNDING_CHECKOUT_SCHEMA,
  applyFundingCheckoutEvent,
  createFundingCheckoutAttempt,
  createFundingIntent,
  fundingIntentKey,
  isFundingCheckoutLifecycle,
} from "../shared/funding-routes.js";
import {
  addressAttestationConfigured,
  createAddressAttestation,
  verifyAddressAttestation,
} from "./address-attestation.js";
import { RELEASE_PROVENANCE } from "./release-provenance.js";

const AGREEMENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS agreement_negotiations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  terms_json TEXT NOT NULL,
  landlord_email TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  arbiter_email TEXT,
  landlord_token_hash TEXT NOT NULL,
  tenant_token_hash TEXT NOT NULL,
  arbiter_token_hash TEXT,
  tenant_approved_revision INTEGER,
  arbiter_approved_revision INTEGER,
  tenant_wallet TEXT,
  arbiter_wallet TEXT,
  onchain_agreement_id TEXT,
  onchain_tx_hash TEXT
)`;

const AGREEMENT_LANDLORD_DISCOVERY_INDEX = `
CREATE INDEX IF NOT EXISTS agreement_negotiations_landlord_discovery_idx
ON agreement_negotiations (lower(landlord_email), updated_at DESC)`;

const AGREEMENT_ARBITER_DISCOVERY_INDEX = `
CREATE INDEX IF NOT EXISTS agreement_negotiations_arbiter_discovery_idx
ON agreement_negotiations (lower(arbiter_email), updated_at DESC)`;

const AGREEMENT_STATUS_UPDATED_INDEX = `
CREATE INDEX IF NOT EXISTS agreement_negotiations_status_updated_idx
ON agreement_negotiations (status, updated_at)`;

const EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  revision INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id)
)`;

const EVENTS_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_events_negotiation_id_idx
ON negotiation_events (negotiation_id, id)`;

const RECEIPT_GUARDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_receipt_guards (
  negotiation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (negotiation_id, action, transaction_hash),
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id) ON DELETE CASCADE
)`;

const TENANT_BOUND_RECEIPT_REPLAY_ACTIONS = new Set([
  "operations_reserve_paid",
  "tenant_share_funded",
  "agreement_funded",
  "claim_response",
  "withdrawal_completed",
  "timeout_executed",
]);

const RECEIPT_GUARDS_BACKFILL = `
INSERT OR IGNORE INTO negotiation_receipt_guards
  (negotiation_id, action, transaction_hash, created_at)
SELECT negotiation_id, action,
       lower(json_extract(metadata_json, '$.transactionHash')),
       MIN(created_at)
FROM negotiation_events
WHERE action IN (
  'posted_onchain',
  'operations_reserve_paid',
  'tenant_share_funded',
  'agreement_funded',
  'record_snapshot_anchored',
  'activity_hash_published',
  'deduction_claim_submitted',
  'deduction_claim_amended',
  'claim_response_submitted',
  'arbiter_ruling_submitted',
  'withdrawal_completed',
  'timeout_executed',
  'arbiter_replacement_proposed',
  'arbiter_replacement_confirmed',
  'arbiter_replacement_cancelled',
  'arbiter_replacement_accepted',
  'onchain_proposal_cancelled'
)
AND json_type(metadata_json, '$.transactionHash') = 'text'
GROUP BY negotiation_id, action,
         lower(json_extract(metadata_json, '$.transactionHash'))`;

const RECEIPT_GUARDS_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS negotiation_events_receipt_guard
BEFORE INSERT ON negotiation_events
WHEN NEW.action IN (
  'posted_onchain',
  'operations_reserve_paid',
  'tenant_share_funded',
  'agreement_funded',
  'record_snapshot_anchored',
  'activity_hash_published',
  'deduction_claim_submitted',
  'deduction_claim_amended',
  'claim_response_submitted',
  'arbiter_ruling_submitted',
  'withdrawal_completed',
  'timeout_executed',
  'arbiter_replacement_proposed',
  'arbiter_replacement_confirmed',
  'arbiter_replacement_cancelled',
  'arbiter_replacement_accepted',
  'onchain_proposal_cancelled'
)
AND json_type(NEW.metadata_json, '$.transactionHash') = 'text'
BEGIN
  INSERT INTO negotiation_receipt_guards
    (negotiation_id, action, transaction_hash, created_at)
  VALUES (
    NEW.negotiation_id,
    NEW.action,
    lower(json_extract(NEW.metadata_json, '$.transactionHash')),
    NEW.created_at
  );
END`;

const FINALIZATION_RECEIPT_ASSIGNMENT_GUARD = `
CREATE TRIGGER IF NOT EXISTS negotiation_receipt_guards_unique_finalization
BEFORE INSERT ON negotiation_receipt_guards
FOR EACH ROW
WHEN NEW.action = 'posted_onchain'
AND EXISTS (
  SELECT 1
  FROM negotiation_receipt_guards
  WHERE action = 'posted_onchain'
    AND transaction_hash = lower(NEW.transaction_hash)
    AND negotiation_id <> NEW.negotiation_id
)
BEGIN
  SELECT RAISE(ABORT, 'finalization receipt already assigned');
END`;

const ACCOUNT_ACCESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_account_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id)
)`;

const ACCOUNT_ACCESS_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_account_access_lookup_idx
ON negotiation_account_access (negotiation_id, token_hash, expires_at)`;

const ACCOUNT_ACCESS_EXPIRES_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_account_access_expires_idx
ON negotiation_account_access (expires_at)`;

const ACCOUNT_ACCESS_SESSION_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_account_access_session_idx
ON negotiation_account_access
  (negotiation_id, user_id, role, created_at DESC, id DESC)`;

const ACCOUNT_ACCESS_USER_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_account_access_user_idx
ON negotiation_account_access (user_id, expires_at)`;

const ACCOUNT_RECORD_ARCHIVES_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_record_archives (
  user_id TEXT NOT NULL,
  negotiation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (user_id, negotiation_id, role),
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id) ON DELETE CASCADE
)`;

const ACCOUNT_RECORD_ARCHIVES_INDEX = `
CREATE INDEX IF NOT EXISTS account_record_archives_user_idx
ON account_record_archives (user_id, role, archived_at)`;

const NOTIFICATION_PREFERENCES_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  agreement_activity INTEGER NOT NULL DEFAULT 0,
  deadline_reminders INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  updated_at TEXT NOT NULL
)`;

const NOTIFICATION_PREFERENCES_EMAIL_INDEX = `
CREATE INDEX IF NOT EXISTS notification_preferences_email_consent_idx
ON notification_preferences (lower(email))
WHERE consented_at IS NOT NULL`;

const EVIDENCE_FILES_SCHEMA = `
CREATE TABLE IF NOT EXISTS evidence_files (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  uploader_role TEXT NOT NULL,
  storage_kind TEXT NOT NULL,
  object_key TEXT,
  cid TEXT,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  encryption_version TEXT,
  encryption_iv TEXT,
  encryption_key_id TEXT,
  encryption_key_fingerprint TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id)
)`;

const EVIDENCE_FILES_INDEX = `
CREATE INDEX IF NOT EXISTS evidence_files_negotiation_id_idx
ON evidence_files (negotiation_id, created_at)`;

const NOTIFICATION_UNSUBSCRIBE_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_unsubscribe_tokens (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES notification_preferences(user_id) ON DELETE CASCADE
)`;

const NOTIFICATION_DELIVERIES_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_deliveries (
  idempotency_key TEXT PRIMARY KEY,
  negotiation_id TEXT,
  recipient_email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  scheduled_for TEXT,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id)
)`;

const NOTIFICATION_DELIVERIES_INDEX = `
CREATE INDEX IF NOT EXISTS notification_deliveries_negotiation_id_idx
ON notification_deliveries (negotiation_id, created_at)`;

const NOTIFICATION_DELIVERIES_PROVIDER_INDEX = `
CREATE INDEX IF NOT EXISTS notification_deliveries_provider_message_idx
ON notification_deliveries (provider_message_id)
WHERE provider_message_id IS NOT NULL`;

const NOTIFICATION_DELIVERY_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_delivery_events (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
)`;

const NOTIFICATION_DELIVERY_EVENTS_INDEX = `
CREATE INDEX IF NOT EXISTS notification_delivery_events_message_idx
ON notification_delivery_events (provider_message_id, occurred_at)`;

const NOTIFICATION_SUPPRESSIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS notification_suppressions (
  email TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  reason TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const NOTIFICATION_SUPPRESSIONS_INDEX = `
CREATE INDEX IF NOT EXISTS notification_suppressions_updated_idx
ON notification_suppressions (updated_at)`;

const NEGOTIATION_TENANTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_tenants (
  id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  approved_revision INTEGER,
  wallet TEXT,
  is_funding_tenant INTEGER NOT NULL DEFAULT 0,
  deposit_share_bps INTEGER NOT NULL DEFAULT 10000,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id) ON DELETE CASCADE
)`;

const NEGOTIATION_TENANTS_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS negotiation_tenants_email_idx
ON negotiation_tenants (negotiation_id, email)`;

const NEGOTIATION_TENANTS_DISCOVERY_INDEX = `
CREATE INDEX IF NOT EXISTS negotiation_tenants_email_discovery_idx
ON negotiation_tenants (lower(email), negotiation_id)`;

const ACCOUNT_ACCESS_CONTEXT_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_account_access_context (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT,
  FOREIGN KEY (token_hash) REFERENCES negotiation_account_access(token_hash) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES negotiation_tenants(id) ON DELETE CASCADE
)`;

const ARBITER_REPLACEMENT_ACCESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS arbiter_replacement_access (
  negotiation_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  wallet TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  proposed_by_role TEXT NOT NULL
    CHECK (proposed_by_role IN ('landlord', 'tenant')),
  status TEXT NOT NULL
    CHECK (status IN ('proposed', 'confirmed')),
  proposed_tx_hash TEXT NOT NULL UNIQUE,
  confirmed_tx_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE CASCADE
)`;

const ARBITER_REPLACEMENT_ACCESS_INDEX = `
CREATE INDEX IF NOT EXISTS arbiter_replacement_access_status_idx
ON arbiter_replacement_access (status, updated_at)`;

const ARBITER_REPLACEMENT_DISCOVERY_INDEX = `
CREATE INDEX IF NOT EXISTS arbiter_replacement_access_email_discovery_idx
ON arbiter_replacement_access (lower(email), negotiation_id)
WHERE status = 'confirmed'`;

const ARBITER_REPLACEMENT_ACCOUNT_ACCESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS arbiter_replacement_account_access (
  token_hash TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  FOREIGN KEY (token_hash)
    REFERENCES negotiation_account_access(token_hash) ON DELETE CASCADE,
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE CASCADE
)`;

const ARBITER_REPLACEMENT_ACCOUNT_ACCESS_INDEX = `
CREATE INDEX IF NOT EXISTS arbiter_replacement_account_access_negotiation_idx
ON arbiter_replacement_account_access (negotiation_id)`;

const FUNDING_CHECKOUT_ATTEMPTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS funding_checkout_attempts (
  attempt_id TEXT PRIMARY KEY,
  negotiation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  intent_key TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment = 'sandbox'),
  asset_id TEXT NOT NULL,
  provider_strategy TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount_micros TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (negotiation_id) REFERENCES agreement_negotiations(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES negotiation_tenants(id) ON DELETE CASCADE
)`;

const FUNDING_CHECKOUT_ATTEMPTS_HISTORY_INDEX = `
CREATE INDEX IF NOT EXISTS funding_checkout_attempts_history_idx
ON funding_checkout_attempts (negotiation_id, tenant_id, created_at DESC)`;

const FUNDING_CHECKOUT_ATTEMPTS_ACTIVE_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS funding_checkout_attempts_active_tenant_idx
ON funding_checkout_attempts (negotiation_id, tenant_id)
WHERE status IN ('opening', 'submitted', 'unknown', 'confirmed', 'refund_pending')`;

const FUNDING_CHECKOUT_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS funding_checkout_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'browser_callback'
    CHECK (source IN ('browser_callback', 'provider_webhook', 'operator_reconciliation')),
  verification TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification IN ('unverified', 'provider_signed', 'operator_verified')),
  reconciliation_key TEXT,
  payload_digest TEXT,
  occurred_at TEXT NOT NULL,
  CHECK (
    (source = 'browser_callback' AND verification = 'unverified'
      AND reconciliation_key IS NULL AND payload_digest IS NULL)
    OR
    (source = 'provider_webhook' AND verification = 'provider_signed'
      AND reconciliation_key IS NOT NULL AND payload_digest IS NOT NULL)
    OR
    (source = 'operator_reconciliation' AND verification = 'operator_verified'
      AND reconciliation_key IS NOT NULL AND payload_digest IS NOT NULL)
  ),
  UNIQUE (attempt_id, event_id),
  FOREIGN KEY (attempt_id) REFERENCES funding_checkout_attempts(attempt_id) ON DELETE CASCADE
)`;

const FUNDING_CHECKOUT_EVENTS_INDEX = `
CREATE INDEX IF NOT EXISTS funding_checkout_events_attempt_idx
ON funding_checkout_events (attempt_id, sequence)`;

const FUNDING_CHECKOUT_EVENTS_RECONCILIATION_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS funding_checkout_events_reconciliation_idx
ON funding_checkout_events (reconciliation_key)
WHERE reconciliation_key IS NOT NULL`;

const FUNDING_CHECKOUT_EVENTS_PROVENANCE_INSERT_GUARD = `
CREATE TRIGGER IF NOT EXISTS funding_checkout_events_provenance_insert_guard
BEFORE INSERT ON funding_checkout_events
FOR EACH ROW
WHEN NOT COALESCE((
  (
    NEW.source = 'browser_callback'
    AND NEW.verification = 'unverified'
    AND NEW.reconciliation_key IS NULL
    AND NEW.payload_digest IS NULL
  )
  OR
  (
    NEW.source = 'provider_webhook'
    AND NEW.verification = 'provider_signed'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
  OR
  (
    NEW.source = 'operator_reconciliation'
    AND NEW.verification = 'operator_verified'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
), 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid funding checkout event provenance');
END`;

const FUNDING_CHECKOUT_EVENTS_PROVENANCE_UPDATE_GUARD = `
CREATE TRIGGER IF NOT EXISTS funding_checkout_events_provenance_update_guard
BEFORE UPDATE OF source, verification, reconciliation_key, payload_digest
ON funding_checkout_events
FOR EACH ROW
WHEN NOT COALESCE((
  (
    NEW.source = 'browser_callback'
    AND NEW.verification = 'unverified'
    AND NEW.reconciliation_key IS NULL
    AND NEW.payload_digest IS NULL
  )
  OR
  (
    NEW.source = 'provider_webhook'
    AND NEW.verification = 'provider_signed'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
  OR
  (
    NEW.source = 'operator_reconciliation'
    AND NEW.verification = 'operator_verified'
    AND length(NEW.reconciliation_key) = 71
    AND substr(NEW.reconciliation_key, 1, 7) = 'sha256:'
    AND substr(NEW.reconciliation_key, 8) NOT GLOB '*[^0-9a-f]*'
    AND length(NEW.payload_digest) = 71
    AND substr(NEW.payload_digest, 1, 7) = 'sha256:'
    AND substr(NEW.payload_digest, 8) NOT GLOB '*[^0-9a-f]*'
  )
), 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid funding checkout event provenance');
END`;

const BACKFILL_PRIMARY_TENANTS = `
INSERT OR IGNORE INTO negotiation_tenants
  (id, negotiation_id, name, email, token_hash, approved_revision, wallet,
   is_funding_tenant, deposit_share_bps, created_at, accepted_at)
SELECT
  id || ':primary', id, NULL, tenant_email, tenant_token_hash,
  tenant_approved_revision, tenant_wallet, 1, 10000, created_at,
  CASE WHEN tenant_approved_revision IS NOT NULL THEN updated_at ELSE NULL END
FROM agreement_negotiations`;

const SCHEDULED_JOB_RUNS_SCHEMA = `
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  name TEXT PRIMARY KEY,
  last_started_at TEXT NOT NULL
)`;

const ONCHAIN_INDEXER_STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS onchain_indexer_state (
  name TEXT PRIMARY KEY,
  next_block INTEGER NOT NULL,
  latest_finalized_block INTEGER,
  last_started_at TEXT,
  last_succeeded_at TEXT,
  last_error TEXT
)`;

const INDEXED_CHAIN_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS indexed_chain_events (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  onchain_agreement_id TEXT NOT NULL,
  negotiation_id TEXT,
  event_type TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  FOREIGN KEY (negotiation_id)
    REFERENCES agreement_negotiations(id) ON DELETE SET NULL
)`;

const INDEXED_CHAIN_EVENTS_RECONCILIATION_INDEX = `
CREATE INDEX IF NOT EXISTS indexed_chain_events_reconciliation_idx
ON indexed_chain_events (processing_status, onchain_agreement_id, block_number)`;

const INDEXED_CHAIN_EVENTS_NEGOTIATION_INDEX = `
CREATE INDEX IF NOT EXISTS indexed_chain_events_negotiation_idx
ON indexed_chain_events (negotiation_id, block_number, log_index)`;

const SCHEDULED_IN_APP_NOTIFICATION_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS negotiation_events_scheduled_notice_idx
ON negotiation_events (
  negotiation_id,
  json_extract(metadata_json, '$.idempotencyKey')
)
WHERE action = 'scheduled_notification_due'`;

const COMPLIANCE_SOURCE_CHECKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS compliance_source_checks (
  source_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  citation TEXT NOT NULL,
  url TEXT NOT NULL,
  baseline_signature TEXT,
  current_signature TEXT,
  http_status INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TEXT,
  last_verified_at TEXT,
  last_changed_at TEXT,
  error TEXT
)`;

const COMPLIANCE_SOURCE_CHECKS_INDEX = `
CREATE INDEX IF NOT EXISTS compliance_source_checks_status_idx
ON compliance_source_checks (status, last_checked_at)`;

const API_RATE_LIMITS_SCHEMA = `
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bucket, subject_hash, window_started_at)
)`;

const API_RATE_LIMITS_UPDATED_INDEX = `
CREATE INDEX IF NOT EXISTS api_rate_limits_updated_idx
ON api_rate_limits (updated_at)`;

const SQLITE_OPTIMIZE = "PRAGMA optimize";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const DEDUCTION_CATEGORY_LABEL = {
  "10": "Unpaid rent",
  "11": "Damage beyond ordinary wear",
  "12": "Cleaning needed to restore move-in cleanliness",
  "13": "Lease-authorized restoration or replacement of landlord property",
  "14": "Other documented test deduction",
};
const DEDUCTION_CATEGORY_ID_BY_LABEL = Object.freeze(
  Object.fromEntries(
    Object.entries(DEDUCTION_CATEGORY_LABEL).map(([id, label]) => [label, id]),
  ),
);
const PRIVY_APP_ID = "cmrzdp7ss00670cju098baqsr";
const ACCOUNT_ACCESS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_ACCESS_SESSION_LIMIT = 5;
const ACCOUNT_DISCOVERY_ROWS_PER_BATCH = 20;
const DEFAULT_GEOCODER_BASE_URL = "https://photon.komoot.io";
const ADDRESS_SUGGESTION_CACHE_TTL_MS = 10 * 60 * 1000;
const ADDRESS_SUGGESTION_CACHE_LIMIT = 200;
const ADDRESS_GEOCODER_TIMEOUT_MS = 3_000;
const DEFAULT_API_BODY_LIMIT_BYTES = 512 * 1024;
const PROVIDER_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
const EVIDENCE_UPLOAD_BODY_LIMIT_BYTES = 11 * 1024 * 1024;
const EVIDENCE_DOWNLOAD_BODY_LIMIT_BYTES = 16 * 1024;
const PRIVY_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const PRIVY_JWKS_UNKNOWN_KEY_REFRESH_MS = 60 * 1000;
const PRIVY_JWKS_TIMEOUT_MS = 3_000;
const PRIVY_JWKS_CACHE_LIMIT = 8;
const JSON_RPC_RESPONSE_LIMIT_BYTES = 512 * 1024;
const COMPLIANCE_SOURCE_FRESHNESS_MS = 21 * 24 * 60 * 60 * 1000;
const COMPLIANCE_SOURCE_EXCEPTION_RECHECK_MS = 48 * 60 * 60 * 1000;
const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const FALLBACK_BASE_SEPOLIA_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
const DEFAULT_OPEN_ESCROW_ADDRESS = "0x9F8C9555f28C10347C58fc71F430F4cbc3724b10";
const DEFAULT_USDC_ADDRESS = "0x3d147C9c4a9191cAbA99be3174C674C04B33E152";
const DEFAULT_YIELD_USDC_ADDRESS = "0x596bF42F18d2a82C346b7007402Fe9f22C1ad32f";
const DEFAULT_OPERATIONS_RESERVE_ADDRESS =
  "0xDB6637e5A858A8FD3a3CD85c1625d9A0b022A626";
const DEFAULT_ACTIVITY_REGISTRY_ADDRESS =
  "0x88b53d6C35020e82B97462E8a1cBCDc8D6d50f53";
const ACTIVITY_REGISTRY_ESCROW_SELECTOR = "0xe681c4aa";
const ACTIVITY_REGISTRY_READINESS_TTL_MS = 60_000;
const HOSTED_NOTIFICATION_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
const HOSTED_NOTIFICATION_SCHEDULER_GRACE_MS = 2 * HOSTED_NOTIFICATION_SCHEDULER_INTERVAL_MS;
const DEFAULT_OPEN_ESCROW_DEPLOYMENT_BLOCK = 45_283_514;
const ONCHAIN_INDEXER_CONFIRMATION_BLOCKS = 20;
const ONCHAIN_INDEXER_BLOCK_RANGE = 2_000;
const ONCHAIN_INDEXER_MAX_RANGES_PER_RUN = 4;
const ONCHAIN_INDEXER_HEALTH_GRACE_MS = 2 * HOSTED_NOTIFICATION_SCHEDULER_INTERVAL_MS;
const COMPLIANCE_SOURCE_BOOTSTRAP_INTERVAL_MS = 15 * 60 * 1000;
const COMPLIANCE_SOURCE_MONITOR_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RECEIPT_EVENT_TOPICS = Object.freeze({
  agreementProposed:
    "0x664e4c94d146ccef3e51a2b7665242fbd89c9e268a28a1807fc660bfc39327f6",
  proposalCancelled:
    "0x416e669c63d9a3a5e36ee7cc7e2104b8db28ccd286aa18966e98fa230c73b08c",
  tenantParticipantAdded:
    "0x30ab399feb0ae9b4c920d576e81a8e47863afdae2efa0fc6d97a13114f5440ad",
  operationsReservePaid:
    "0x8817d9a1dd298236cd746a97680a13cf2e5d0a9d970b20e26b8fa0ee32cd855b",
  tenantShareFunded:
    "0xa59b69e1d871c72525782e2de73d8b4a83a1bf00840689625923330b4464544d",
  agreementFunded:
    "0xce24c0ae1d73d57cf2e6d1d90b94b11b288e5cfb1c0aa6e7f8ed3391f0c0f021",
  claimSubmitted:
    "0xcf394f7701f2b1dae6f328cbc70c1f155122b124431f95bbf4a483bba6854555",
  claimAmended:
    "0x478de1b8c18ffc9b16915e850b17f80fc5fe83405310df3db31765a38a3365ff",
  claimRetracted:
    "0x78ed2810f3e800697035ce152a2c6e2d92fe189711545693db5d97ac0b9f7eb9",
  tenantClaimResponse:
    "0x270cfb5d0a1ef7453b09614e7321e2bc1c39e82a0642070b4247c08452dca245",
  legacyClaimResponse:
    "0x0e3cd88697129d255d76bfa437dbf12aaeaef7601cf1c8d5f75ad2ba18e0cd4b",
  disputeResolved:
    "0x959dc01840aa516bf9407cffa45326c7b6821c48feff7b91eb0c743c8f460fd6",
  withdrawn:
    "0xcf7d23a3cbe4e8b36ff82fd1b05b1b17373dc7804b4ebbd6e2356716ef202372",
  noClaimWithdrawal:
    "0x845bd4e89218507974962580a9461fcb8f451ebd83d8c3b843d2c9032217d179",
  responseTimedOut:
    "0xfad75d47bd1a89b1c3f46dd58d38a0b9fe3c1b992a6077875a9ebb5432ba513a",
  arbiterTimedOut:
    "0xab22e8614f3457bfcf1e3c2852a4c49aceafbd8c37e6a3181f13c8472f916e3d",
  arbiterReplacementProposed:
    "0xeeb50d0c2e09bed6f700dae5147fb9dc20cbf64a51ae5598ff4bf3fef65bd899",
  arbiterReplacementConfirmed:
    "0x24561e96f9483b651114378fd5f5303482cb09292d94295bf12e8b08b570783e",
  arbiterReplacementCancelled:
    "0xea55ed64aa907da9463ef6eb21d16b92c8672b37f1305df22c0555cd0cc175cf",
  arbiterReplaced:
    "0x61fd94062542edfecb31f240c9ef0bab60274ed951f163e40614c3d4d02146d1",
  arbiterResigned:
    "0xcdf89760bd3dd0338c147bd48cbbb478470981d1ad6a52f99ec80d7e3c17bc71",
  recordSnapshotAnchored:
    "0x4012b6d2c58584f354b2ad24151a4b24d5e18ea9aff9ced4667a2ffe01305ab6",
  activityPublished:
    "0x2aca0841f18e301ab87df30a3dd50b022d848e0b1ee373dcbe9f914886b2eea7",
});
const INDEXED_OPEN_ESCROW_EVENTS = Object.freeze({
  [RECEIPT_EVENT_TOPICS.proposalCancelled]: {
    eventType: "onchain_proposal_cancelled",
    recordedActions: ["onchain_proposal_cancelled"],
  },
  [RECEIPT_EVENT_TOPICS.tenantShareFunded]: {
    eventType: "tenant_share_funded",
    recordedActions: ["tenant_share_funded", "agreement_funded"],
  },
  [RECEIPT_EVENT_TOPICS.agreementFunded]: {
    eventType: "agreement_funded",
    recordedActions: ["agreement_funded"],
  },
  [RECEIPT_EVENT_TOPICS.claimSubmitted]: {
    eventType: "claim_submitted",
    recordedActions: ["deduction_claim_submitted"],
  },
  [RECEIPT_EVENT_TOPICS.claimAmended]: {
    eventType: "claim_amended",
    recordedActions: ["deduction_claim_amended"],
  },
  [RECEIPT_EVENT_TOPICS.claimRetracted]: {
    eventType: "claim_retracted",
    recordedActions: ["deduction_claim_amended"],
  },
  [RECEIPT_EVENT_TOPICS.tenantClaimResponse]: {
    eventType: "claim_response",
    recordedActions: ["claim_response_submitted"],
  },
  [RECEIPT_EVENT_TOPICS.disputeResolved]: {
    eventType: "arbiter_ruling",
    recordedActions: ["arbiter_ruling_submitted"],
  },
  [RECEIPT_EVENT_TOPICS.withdrawn]: {
    eventType: "withdrawal_completed",
    recordedActions: ["withdrawal_completed"],
  },
  [RECEIPT_EVENT_TOPICS.noClaimWithdrawal]: {
    eventType: "no_claim_refund_available",
    recordedActions: ["timeout_executed"],
  },
  [RECEIPT_EVENT_TOPICS.responseTimedOut]: {
    eventType: "response_timeout_escalated",
    recordedActions: ["timeout_executed"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterTimedOut]: {
    eventType: "arbiter_timeout_allocation",
    recordedActions: ["timeout_executed"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterReplacementProposed]: {
    eventType: "arbiter_replacement_proposed",
    recordedActions: ["arbiter_replacement_proposed"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterReplacementConfirmed]: {
    eventType: "arbiter_replacement_confirmed",
    recordedActions: ["arbiter_replacement_confirmed"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterReplacementCancelled]: {
    eventType: "arbiter_replacement_cancelled",
    recordedActions: ["arbiter_replacement_cancelled"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterReplaced]: {
    eventType: "arbiter_replacement_accepted",
    recordedActions: ["arbiter_replacement_accepted"],
  },
  [RECEIPT_EVENT_TOPICS.arbiterResigned]: {
    eventType: "arbiter_resigned",
    recordedActions: ["arbiter_resigned"],
  },
});
const ADDRESS_ATTRIBUTION = Object.freeze({
  label: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
});
const addressSuggestionCache = new Map();
const activityRegistryReadinessCache = new Map();
const complianceSourceChecksInFlight = new WeakMap();
const databaseInitializationPromises = new WeakMap();
const privyJwksCache = new Map();
const privyJwksRequestsInFlight = new Map();
const jsonRpcRequestsInFlight = new Map();
const baseSepoliaRpcValidationCache = new Map();
const COMPLIANCE_SOURCE_STATUS_VALUES = new Set([
  "pending",
  "unchanged",
  "changed",
  "unreachable",
]);
const encoder = new TextEncoder();
const INVITATION_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{1,200}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function requestBodyLimitBytes(url) {
  if (url.pathname === "/api/notifications/provider/resend") {
    return PROVIDER_WEBHOOK_BODY_LIMIT_BYTES;
  }
  if (url.pathname === "/api/evidence") return EVIDENCE_UPLOAD_BODY_LIMIT_BYTES;
  if (/^\/api\/evidence\/[a-fA-F0-9-]+$/.test(url.pathname)) {
    return EVIDENCE_DOWNLOAD_BODY_LIMIT_BYTES;
  }
  return DEFAULT_API_BODY_LIMIT_BYTES;
}

function requestTooLargeResponse(url, limit) {
  return json(
    {
      error:
        url.pathname === "/api/evidence"
          ? "This upload is too large. Choose a supported file no larger than 10 MB."
          : "This request is too large. Reduce it and try again.",
      code: "request-too-large",
      maximumBytes: limit,
    },
    413,
  );
}

export async function requestBodyLimitResponse(request, url = new URL(request.url)) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const declaredLimit = declaredRequestBodyLimitResponse(request, url);
  if (declaredLimit) return declaredLimit;
  return streamedRequestBodyLimitResponse(request, url);
}

function declaredRequestBodyLimitResponse(request, url) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return json(
      { error: "The request size could not be verified.", code: "invalid-content-length" },
      400,
    );
  }
  const limit = requestBodyLimitBytes(url);
  if (contentLength !== null && Number(contentLength) > limit) {
    return requestTooLargeResponse(url, limit);
  }
  return null;
}

async function streamedRequestBodyLimitResponse(request, url) {
  if (!request.body) return null;
  const limit = requestBodyLimitBytes(url);

  let reader;
  try {
    reader = request.clone().body.getReader();
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      bytesRead += value.byteLength;
      if (bytesRead > limit) {
        return requestTooLargeResponse(url, limit);
      }
    }
  } catch {
    return json(
      { error: "The request body could not be read safely.", code: "invalid-request-body" },
      400,
    );
  } finally {
    reader?.releaseLock();
  }
}

const API_RATE_LIMIT_POLICIES = Object.freeze({
  "address-lookup": Object.freeze({ limit: 60, windowMs: 60_000 }),
  "compliance-refresh": Object.freeze({ limit: 6, windowMs: 5 * 60_000 }),
  "evidence-upload": Object.freeze({ limit: 12, windowMs: 10 * 60_000 }),
  "evidence-download": Object.freeze({ limit: 120, windowMs: 60_000 }),
  notification: Object.freeze({ limit: 20, windowMs: 60_000 }),
  "profile-invite": Object.freeze({ limit: 5, windowMs: 10 * 60_000 }),
  "proposal-invite": Object.freeze({ limit: 10, windowMs: 10 * 60_000 }),
  profile: Object.freeze({ limit: 120, windowMs: 60_000 }),
  "negotiation-write": Object.freeze({ limit: 180, windowMs: 60_000 }),
  "negotiation-read": Object.freeze({ limit: 300, windowMs: 60_000 }),
  "system-read": Object.freeze({ limit: 120, windowMs: 60_000 }),
});

export function apiRateLimitPolicy(request, url = new URL(request.url)) {
  if (url.pathname === "/api/address-suggestions") return "address-lookup";
  if (url.pathname === "/api/compliance/source-status") return "compliance-refresh";
  if (url.pathname === "/api/evidence") return "evidence-upload";
  if (/^\/api\/evidence\/[a-fA-F0-9-]+$/.test(url.pathname)) {
    return "evidence-download";
  }
  if (url.pathname.startsWith("/api/notifications/")) return "notification";
  if (url.pathname === "/api/profile/landlord-invite") return "profile-invite";
  if (url.pathname.startsWith("/api/profile/")) return "profile";
  if (/^\/api\/negotiations\/[a-zA-Z0-9-]+\/invitations$/.test(url.pathname)) {
    return "proposal-invite";
  }
  if (url.pathname.startsWith("/api/negotiations")) {
    return request.method === "GET" ? "negotiation-read" : "negotiation-write";
  }
  if (url.pathname === "/api/system/readiness") return "system-read";
  return null;
}

function apiRateLimitEnabled(request, env) {
  const configured = cleanText(env.API_RATE_LIMIT_ENABLED, 20).toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return Boolean(request.headers.get("cf-connecting-ip"));
}

async function apiRateLimitSubject(request) {
  const clientIp = cleanText(request.headers.get("cf-connecting-ip"), 80) || "missing-client-ip";
  return hashToken(clientIp);
}

async function enforceApiRateLimit(request, env, url, nowMs) {
  const bucket = apiRateLimitPolicy(request, url);
  if (!bucket || !env.DB || !apiRateLimitEnabled(request, env)) return null;
  const policy = API_RATE_LIMIT_POLICIES[bucket];
  const windowStartedAt = Math.floor(nowMs / policy.windowMs) * policy.windowMs;
  const subjectHash = await apiRateLimitSubject(request);
  let row;
  try {
    row = await env.DB
      .prepare(
        `INSERT INTO api_rate_limits
         (bucket, subject_hash, window_started_at, request_count, updated_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(bucket, subject_hash, window_started_at) DO UPDATE SET
           request_count = api_rate_limits.request_count + 1,
           updated_at = excluded.updated_at
         RETURNING request_count`,
      )
      .bind(bucket, subjectHash, windowStartedAt, new Date(nowMs).toISOString())
      .first();
  } catch {
    return json(
      {
        error: "OpenEscrow could not safely check the request limit. Try again shortly.",
        code: "rate-limit-unavailable",
      },
      503,
    );
  }
  const requestCount = Number(row?.request_count || 0);
  if (requestCount <= policy.limit) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((windowStartedAt + policy.windowMs - nowMs) / 1000),
  );
  const response = json(
    {
      error: "Too many requests were made from this connection. Wait a moment and try again.",
      code: "rate-limited",
      retryAfterSeconds: retryAfter,
    },
    429,
  );
  response.headers.set("retry-after", String(retryAfter));
  response.headers.set("x-ratelimit-limit", String(policy.limit));
  response.headers.set("x-ratelimit-remaining", "0");
  return response;
}

export async function applyApiAbuseControls(
  request,
  env,
  url = new URL(request.url),
  nowMs = Date.now(),
) {
  if (!url.pathname.startsWith("/api/")) return null;
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    !sameOriginPost(request)
  ) {
    return json({ error: "Cross-origin writes are not allowed." }, 403);
  }
  const declaredBodyLimit = declaredRequestBodyLimitResponse(request, url);
  if (declaredBodyLimit) return declaredBodyLimit;
  if (
    env.DB &&
    apiRateLimitPolicy(request, url) &&
    apiRateLimitEnabled(request, env)
  ) {
    await initialize(env.DB);
    const rateLimit = await enforceApiRateLimit(request, env, url, nowMs);
    if (rateLimit) return rateLimit;
  }
  return streamedRequestBodyLimitResponse(request, url);
}

const VERSIONED_STATIC_ASSET_PATH = /^\/assets\/.+-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/;

const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
  "connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://sepolia.base.org https://base-sepolia-rpc.publicnode.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

function staticAssetCacheControl(requestUrl, responseOk, spaFallback = false) {
  if (spaFallback || !responseOk) return "no-cache";
  const pathname = new URL(requestUrl).pathname;
  return VERSIONED_STATIC_ASSET_PATH.test(pathname)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function secureResponse(response, requestUrl, spaFallback = false) {
  const headers = new Headers(response.headers);
  if (
    headers.get("content-type")?.toLowerCase().includes("text/html") &&
    !headers.has("content-security-policy")
  ) {
    headers.set("content-security-policy", APP_CONTENT_SECURITY_POLICY);
  }
  if (!headers.has("referrer-policy")) {
    headers.set("referrer-policy", "no-referrer");
  }
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  if (!headers.has("x-frame-options")) {
    headers.set("x-frame-options", "DENY");
  }
  headers.set(
    "cache-control",
    staticAssetCacheControl(requestUrl, response.ok, spaFallback),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function receiptVerificationEnabled(env) {
  return cleanText(env.VERIFY_TRANSACTION_RECEIPTS, 20).toLowerCase() !== "false";
}

async function activityRegistryReadiness(env) {
  const expectedEscrowAddress = cleanText(
    env.OPEN_ESCROW_ADDRESS || DEFAULT_OPEN_ESCROW_ADDRESS,
    80,
  ).toLowerCase();
  const registryAddress = cleanText(
    env.ACTIVITY_REGISTRY_ADDRESS || DEFAULT_ACTIVITY_REGISTRY_ADDRESS,
    80,
  ).toLowerCase();
  const verificationEnabled =
    cleanText(env.VERIFY_ACTIVITY_REGISTRY_BINDING, 20).toLowerCase() !==
    "false";
  const configured =
    WALLET_PATTERN.test(expectedEscrowAddress) &&
    WALLET_PATTERN.test(registryAddress);
  if (!configured || !verificationEnabled) {
    return {
      configured,
      verificationEnabled,
      ready: false,
      registryAddress,
      expectedEscrowAddress,
      boundEscrowAddress: null,
      checkedAt: null,
      error: configured
        ? "Onchain registry binding verification is disabled."
        : "The activity registry or escrow address is invalid.",
    };
  }

  const configuredRpcUrl = cleanText(env.BASE_SEPOLIA_RPC_URL, 1000);
  const rpcUrls = Array.from(
    new Set([
      configuredRpcUrl || DEFAULT_BASE_SEPOLIA_RPC_URL,
      ...(configuredRpcUrl ? [] : [FALLBACK_BASE_SEPOLIA_RPC_URL]),
    ]),
  );
  const cacheKey = `${rpcUrls.join(",")}:${registryAddress}:${expectedEscrowAddress}`;
  const cached = activityRegistryReadinessCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.cachedAt < ACTIVITY_REGISTRY_READINESS_TTL_MS
  ) {
    return cached.value;
  }

  let boundEscrowAddress = null;
  let rpcResponded = false;
  let rpcChainMismatch = false;
  for (const rpcUrl of rpcUrls) {
    let parsedRpcUrl;
    try {
      parsedRpcUrl = new URL(rpcUrl);
      if (parsedRpcUrl.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (configuredRpcUrl && !(await isBaseSepoliaRpc(parsedRpcUrl))) {
      rpcChainMismatch = true;
      continue;
    }
    const rpc = await fetchJsonRpc(
      parsedRpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          { to: registryAddress, data: ACTIVITY_REGISTRY_ESCROW_SELECTOR },
          "latest",
        ],
      },
      3_000,
    );
    if (/^0x[a-fA-F0-9]{64}$/.test(rpc.result || "")) {
      rpcResponded = true;
      boundEscrowAddress = `0x${rpc.result.slice(-40)}`.toLowerCase();
      break;
    }
  }

  const checkedAt = new Date().toISOString();
  const ready = boundEscrowAddress === expectedEscrowAddress;
  const value = {
    configured,
    verificationEnabled,
    ready,
    registryAddress,
    expectedEscrowAddress,
    boundEscrowAddress,
    checkedAt,
    error: ready
      ? null
      : rpcChainMismatch
        ? "The configured receipt verifier does not report Base Sepolia."
        : rpcResponded
          ? "The activity registry is not bound to the active OpenEscrow release."
          : "The activity registry binding could not be read from Base Sepolia.",
  };
  activityRegistryReadinessCache.set(cacheKey, {
    cachedAt: Date.now(),
    value,
  });
  return value;
}

function uint256Topic(value) {
  try {
    const encoded = BigInt(value).toString(16);
    if (encoded.startsWith("-") || encoded.length > 64) return null;
    return `0x${encoded.padStart(64, "0")}`;
  } catch {
    return null;
  }
}

function addressTopic(value) {
  const address = cleanText(value, 80).toLowerCase();
  return WALLET_PATTERN.test(address)
    ? `0x${address.slice(2).padStart(64, "0")}`
    : null;
}

function topicAddress(value) {
  const word = cleanText(value, 80).toLowerCase();
  if (!/^0x0{24}[a-f0-9]{40}$/.test(word)) return null;
  return `0x${word.slice(-40)}`;
}

function normalizedReceiptWord(value) {
  const word = cleanText(value, 80).toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(word) ? word : null;
}

function receiptDataWords(value) {
  const data = cleanText(value, 20_000).toLowerCase();
  if (data === "0x") return [];
  if (!/^0x(?:[a-f0-9]{64})+$/.test(data)) return null;
  return data
    .slice(2)
    .match(/.{64}/g)
    .map((word) => `0x${word}`);
}

function tokenAddressForTerms(terms, env) {
  const configured =
    terms?.tokenChoice === "yield"
      ? env.YIELD_USDC_ADDRESS || DEFAULT_YIELD_USDC_ADDRESS
      : env.USDC_ADDRESS || DEFAULT_USDC_ADDRESS;
  const address = cleanText(configured, 80).toLowerCase();
  return WALLET_PATTERN.test(address) ? address : null;
}

function latestVerifiedLandlordWallet(recordedEvents) {
  const event = [...recordedEvents]
    .reverse()
    .find(
      (candidate) =>
        candidate.action === "transaction_receipt_verified" &&
        candidate.metadata?.eventType === "posted_onchain" &&
        WALLET_PATTERN.test(candidate.metadata?.actorAddress || ""),
    );
  return event?.metadata?.actorAddress?.toLowerCase() || null;
}

async function receiptParticipantContext(db, row, role, token, recordedEvents) {
  const tenantRows = await tenantsFor(db, row.id);
  const tenant = role === "tenant" ? await tenantForToken(db, row.id, token) : null;
  const arbiterReplacement = await arbiterReplacementFor(db, row.id);
  const tenantWallets = tenantRows
    .map((candidate) => cleanText(candidate.wallet, 80).toLowerCase())
    .filter((wallet) => WALLET_PATTERN.test(wallet));
  const fundingTenant =
    tenantRows.find((candidate) => candidate.is_funding_tenant === 1) ||
    tenantRows[0] ||
    null;
  const arbiterWallet = WALLET_PATTERN.test(row.arbiter_wallet || "")
    ? row.arbiter_wallet.toLowerCase()
    : null;
  const landlordWallet = latestVerifiedLandlordWallet(recordedEvents);
  const exactWallet =
    role === "tenant"
      ? WALLET_PATTERN.test(tenant?.wallet || "")
        ? tenant.wallet.toLowerCase()
        : null
      : role === "arbiter"
        ? arbiterWallet
        : role === "landlord"
          ? landlordWallet
          : null;
  return {
    role,
    tenant,
    tenantRows,
    tenantWallets,
    fundingTenant,
    arbiterWallet,
    landlordWallet,
    exactWallet,
    arbiterReplacement,
    forbiddenLandlordWallets: [
      ...new Set([...tenantWallets, arbiterWallet].filter(Boolean)),
    ],
  };
}

function variant({
  address,
  topic0,
  agreementTopic,
  agreementTopicIndex = 1,
  topicWords = {},
  dataWords = {},
  topicCount,
  dataWordCount,
  exactSender = null,
  forbiddenSenders = [],
  senderTopicIndex = null,
  captureActorTopicIndex = null,
}) {
  return {
    address,
    topic0,
    topicWords: {
      [agreementTopicIndex]: agreementTopic,
      ...topicWords,
    },
    dataWords,
    topicCount,
    dataWordCount,
    exactSender,
    forbiddenSenders,
    senderTopicIndex,
    captureActorTopicIndex,
  };
}

function receiptExpectation(body, row, env, context, recordedEvents) {
  const agreementId = cleanText(
    body.type === "finalize" ? body.agreementId : row.onchain_agreement_id,
    80,
  );
  const agreementTopic = uint256Topic(agreementId);
  if (!agreementTopic) {
    return {
      error: "The agreement id required to verify this transaction is unavailable.",
      status: 409,
    };
  }
  const openEscrowAddress = cleanText(
    env.OPEN_ESCROW_ADDRESS || DEFAULT_OPEN_ESCROW_ADDRESS,
    80,
  ).toLowerCase();
  const reserveAddress = cleanText(
    env.OPERATIONS_RESERVE_ADDRESS || DEFAULT_OPERATIONS_RESERVE_ADDRESS,
    80,
  ).toLowerCase();
  const registryAddress = cleanText(
    env.ACTIVITY_REGISTRY_ADDRESS || DEFAULT_ACTIVITY_REGISTRY_ADDRESS,
    80,
  ).toLowerCase();
  const terms = JSON.parse(row.terms_json);
  const depositMicros = tokenMicros(terms.deposit);
  const actorTopic = addressTopic(context.exactWallet);
  const exactSender = context.exactWallet;
  const landlordActor = {
    exactSender,
    forbiddenSenders: exactSender ? [] : context.forbiddenLandlordWallets,
  };
  const requireKnownActor = (label) =>
    actorTopic
      ? null
      : {
          error: `The approved ${label} wallet required to verify this transaction is unavailable.`,
          status: 409,
        };
  let variants = [];
  const extra = {};

  if (body.type === "finalize") {
    const tenantRows = context.tenantRows;
    const tenantWallets = tenantRows.map((tenant) =>
      WALLET_PATTERN.test(tenant.wallet || "") ? tenant.wallet.toLowerCase() : null,
    );
    const fundingTenantWallet = WALLET_PATTERN.test(context.fundingTenant?.wallet || "")
      ? context.fundingTenant.wallet.toLowerCase()
      : null;
    const arbiterAddress = row.arbiter_email
      ? context.arbiterWallet
      : "0x0000000000000000000000000000000000000000";
    const claimWindowStart = Math.floor(
      new Date(terms.claimWindowStart).getTime() / 1_000,
    );
    const claimPeriod = Number(terms.claimDays) * 86_400;
    const responsePeriod = Number(terms.responseDays) * 86_400;
    const arbiterRulingPeriod = Number(terms.arbiterDays) * 86_400;
    const expectedTokenAddress = tokenAddressForTerms(terms, env);
    const dataWords = {
      0: addressTopic(arbiterAddress),
      1: uint256Topic(depositMicros),
      2: uint256Topic(claimWindowStart),
      3: uint256Topic(claimPeriod),
      4: uint256Topic(responsePeriod),
      5: uint256Topic(arbiterRulingPeriod),
    };
    if (
      !fundingTenantWallet ||
      tenantWallets.some((wallet) => !wallet) ||
      Object.values(dataWords).some((word) => !word) ||
      !expectedTokenAddress
    ) {
      return {
        error:
          "The approved participant wallets, token, amount, or deadlines required to verify finalization are unavailable.",
        status: 409,
      };
    }
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.agreementProposed,
        agreementTopic,
        topicWords: { 3: addressTopic(fundingTenantWallet) },
        dataWords,
        topicCount: 4,
        dataWordCount: 6,
        forbiddenSenders: context.forbiddenLandlordWallets,
        senderTopicIndex: 2,
        captureActorTopicIndex: 2,
      }),
    ];
    extra.participantLogs = tenantRows.map((tenant) => ({
      address: openEscrowAddress,
      topic0: RECEIPT_EVENT_TOPICS.tenantParticipantAdded,
      topicWords: {
        1: agreementTopic,
        2: addressTopic(tenant.wallet),
      },
      dataWords: { 0: uint256Topic(tenant.deposit_share_bps) },
      topicCount: 3,
      dataWordCount: 1,
    }));
    extra.participantLogCount = tenantRows.length;
    extra.expectedAgreementToken = expectedTokenAddress;
    extra.openEscrowAddress = openEscrowAddress;
    extra.agreementTopic = agreementTopic;
  } else if (body.type === "onchain_proposal_cancelled") {
    const missingActor = requireKnownActor("landlord");
    if (missingActor) return missingActor;
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.proposalCancelled,
        agreementTopic,
        topicCount: 2,
        dataWordCount: 0,
        exactSender,
      }),
    ];
  } else if (body.type === "operations_reserve_paid") {
    const missingActor = requireKnownActor("tenant");
    if (missingActor) return missingActor;
    const tenantIndex = context.tenantRows.findIndex(
      (candidate) => candidate.id === context.tenant?.id,
    );
    const base = 5_000_000n / BigInt(context.tenantRows.length);
    const amount =
      tenantIndex === context.tenantRows.length - 1
        ? 5_000_000n - base * BigInt(context.tenantRows.length - 1)
        : base;
    const tokenAddress = tokenAddressForTerms(terms, env);
    variants = [
      variant({
        address: reserveAddress,
        topic0: RECEIPT_EVENT_TOPICS.operationsReservePaid,
        agreementTopic,
        agreementTopicIndex: 2,
        topicWords: {
          1: addressTopic(openEscrowAddress),
          3: actorTopic,
        },
        dataWords: {
          0: addressTopic(tokenAddress),
          1: uint256Topic(amount),
        },
        topicCount: 4,
        dataWordCount: 2,
        exactSender,
      }),
    ];
  } else if (
    body.type === "tenant_share_funded" ||
    body.type === "agreement_funded"
  ) {
    const missingActor = requireKnownActor("tenant");
    if (missingActor) return missingActor;
    const tenantIndex = context.tenantRows.findIndex(
      (candidate) => candidate.id === context.tenant?.id,
    );
    let allocatedMicros = 0n;
    for (let index = 0; index < context.tenantRows.length - 1; index += 1) {
      allocatedMicros +=
        (depositMicros * BigInt(context.tenantRows[index].deposit_share_bps)) /
        10_000n;
    }
    const contribution =
      tenantIndex === context.tenantRows.length - 1
        ? depositMicros - allocatedMicros
        : (depositMicros * BigInt(context.tenant.deposit_share_bps)) / 10_000n;
    const previouslyFunded = recordedEvents
      .filter(
        (event) =>
          event.action === "tenant_share_funded" ||
          event.action === "agreement_funded",
      )
      .reduce(
        (total, event) => total + (tokenMicros(event.metadata?.amount) || 0n),
        0n,
      );
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.tenantShareFunded,
        agreementTopic,
        topicWords: { 2: actorTopic },
        dataWords: {
          0: uint256Topic(contribution),
          1: uint256Topic(previouslyFunded + contribution),
        },
        topicCount: 3,
        dataWordCount: 2,
        exactSender,
      }),
    ];
  } else if (body.type === "claim_submitted") {
    const amount = tokenMicros(body.amount);
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.claimSubmitted,
        agreementTopic,
        dataWords: {
          0: uint256Topic(amount),
          1: uint256Topic(depositMicros - amount),
        },
        topicCount: 2,
        dataWordCount: 2,
        ...landlordActor,
      }),
    ];
  } else if (body.type === "claim_amended") {
    const priorClaim = latestClaimEvent(recordedEvents);
    const priorAmount = tokenMicros(priorClaim?.metadata?.amount);
    const amount = tokenMicros(body.amount);
    variants = [
      amount === 0n
        ? variant({
            address: openEscrowAddress,
            topic0: RECEIPT_EVENT_TOPICS.claimRetracted,
            agreementTopic,
            topicCount: 2,
            dataWordCount: 0,
            ...landlordActor,
          })
        : variant({
            address: openEscrowAddress,
            topic0: RECEIPT_EVENT_TOPICS.claimAmended,
            agreementTopic,
            dataWords: {
              0: uint256Topic(amount),
              1: uint256Topic(priorAmount - amount),
            },
            topicCount: 2,
            dataWordCount: 2,
            ...landlordActor,
          }),
    ];
  } else if (body.type === "claim_response") {
    const missingActor = requireKnownActor("tenant");
    if (missingActor) return missingActor;
    const priorResponses = recordedEvents.filter(
      (event) => event.action === "claim_response_submitted",
    ).length;
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.tenantClaimResponse,
        agreementTopic,
        topicWords: { 2: actorTopic },
        dataWords: {
          0: uint256Topic(tokenMicros(body.acceptedAmount)),
          1: uint256Topic(priorResponses + 1),
          2: uint256Topic(context.tenantRows.length),
        },
        topicCount: 3,
        dataWordCount: 3,
        exactSender,
      }),
    ];
  } else if (body.type === "arbiter_ruling") {
    const missingActor = requireKnownActor("arbiter");
    if (missingActor) return missingActor;
    const dispute = claimDisputeState(recordedEvents, context.tenantRows);
    const award = tokenMicros(body.awardToLandlord);
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.disputeResolved,
        agreementTopic,
        dataWords: {
          0: uint256Topic(award),
          1: uint256Topic(dispute.disputedMicros - award),
        },
        topicCount: 2,
        dataWordCount: 2,
        exactSender,
      }),
    ];
  } else if (body.type === "withdrawal_completed") {
    if (context.role === "tenant" && !actorTopic) {
      return requireKnownActor("tenant");
    }
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.withdrawn,
        agreementTopic,
        topicWords: actorTopic ? { 2: actorTopic } : {},
        dataWords: { 0: uint256Topic(tokenMicros(body.amount)) },
        topicCount: 3,
        dataWordCount: 1,
        ...(context.role === "landlord" ? landlordActor : { exactSender }),
        senderTopicIndex: 2,
        captureActorTopicIndex: 2,
      }),
    ];
  } else if (body.type === "timeout_executed") {
    const dispute = claimDisputeState(recordedEvents, context.tenantRows);
    const amount =
      body.timeout === "no_claim_refund"
        ? depositMicros
        : body.timeout === "no_response_dispute"
          ? dispute.claimMicros
          : dispute.disputedMicros;
    if (body.timeout === "no_claim_refund" && !actorTopic) {
      return requireKnownActor("tenant");
    }
    variants = [
      variant({
        address: openEscrowAddress,
        topic0:
          body.timeout === "no_claim_refund"
            ? RECEIPT_EVENT_TOPICS.noClaimWithdrawal
            : body.timeout === "no_response_dispute"
              ? RECEIPT_EVENT_TOPICS.responseTimedOut
              : RECEIPT_EVENT_TOPICS.arbiterTimedOut,
        agreementTopic,
        dataWords: { 0: uint256Topic(amount) },
        topicCount: 2,
        dataWordCount: 1,
        exactSender:
          body.timeout === "no_claim_refund" ? context.exactWallet : null,
      }),
    ];
  } else if (body.type === "arbiter_replacement_proposed") {
    const missingActor = requireKnownActor(context.role);
    if (missingActor) return missingActor;
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.arbiterReplacementProposed,
        agreementTopic,
        topicWords: {
          2: actorTopic,
          3: addressTopic(body.newArbiterWallet),
        },
        topicCount: 4,
        dataWordCount: 0,
        exactSender,
        senderTopicIndex: 2,
        captureActorTopicIndex: 2,
      }),
    ];
  } else if (body.type === "arbiter_replacement_confirmed") {
    const missingActor = requireKnownActor(context.role);
    if (missingActor) return missingActor;
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.arbiterReplacementConfirmed,
        agreementTopic,
        topicWords: { 2: actorTopic },
        topicCount: 3,
        dataWordCount: 0,
        exactSender,
        senderTopicIndex: 2,
        captureActorTopicIndex: 2,
      }),
    ];
  } else if (body.type === "arbiter_replacement_cancelled") {
    const missingActor = requireKnownActor(context.role);
    if (missingActor) return missingActor;
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.arbiterReplacementCancelled,
        agreementTopic,
        topicCount: 2,
        dataWordCount: 0,
        exactSender,
      }),
    ];
  } else if (body.type === "arbiter_replacement_accepted") {
    const replacement = context.arbiterReplacement;
    const replacementWallet = cleanText(replacement?.wallet, 80).toLowerCase();
    const oldArbiterWallet = WALLET_PATTERN.test(row.arbiter_wallet || "")
      ? row.arbiter_wallet.toLowerCase()
      : "0x0000000000000000000000000000000000000000";
    if (
      !replacement ||
      replacement.status !== "confirmed" ||
      !WALLET_PATTERN.test(replacementWallet)
    ) {
      return {
        error: "The mutually confirmed replacement-arbiter invitation is unavailable.",
        status: 409,
      };
    }
    variants = [
      variant({
        address: openEscrowAddress,
        topic0: RECEIPT_EVENT_TOPICS.arbiterReplaced,
        agreementTopic,
        topicWords: {
          2: addressTopic(oldArbiterWallet),
          3: addressTopic(replacementWallet),
        },
        topicCount: 4,
        dataWordCount: 0,
        exactSender: replacementWallet,
        senderTopicIndex: 3,
        captureActorTopicIndex: 3,
      }),
    ];
  } else if (body.type === "record_snapshot_anchored") {
    if (context.role !== "landlord" && !actorTopic) {
      return requireKnownActor(context.role);
    }
    variants = [
      variant({
        address: registryAddress,
        topic0: RECEIPT_EVENT_TOPICS.recordSnapshotAnchored,
        agreementTopic,
        topicWords: {
          2: normalizedReceiptWord(body.snapshotHash),
          ...(actorTopic ? { 3: actorTopic } : {}),
        },
        dataWordCount: 1,
        topicCount: 4,
        ...(context.role === "landlord" ? landlordActor : { exactSender }),
        senderTopicIndex: 3,
        captureActorTopicIndex: 3,
      }),
    ];
  } else if (body.type === "activity_hash_published") {
    if (context.role !== "landlord" && !actorTopic) {
      return requireKnownActor(context.role);
    }
    variants = [
      variant({
        address: registryAddress,
        topic0: RECEIPT_EVENT_TOPICS.activityPublished,
        agreementTopic,
        topicWords: {
          2: uint256Topic(body.activityType),
          ...(actorTopic ? { 3: actorTopic } : {}),
        },
        dataWords: { 0: normalizedReceiptWord(body.contentHash) },
        dataWordCount: 2,
        topicCount: 4,
        ...(context.role === "landlord" ? landlordActor : { exactSender }),
        senderTopicIndex: 3,
        captureActorTopicIndex: 3,
      }),
    ];
  } else {
    return {
      error: "This transaction type cannot be verified.",
      status: 409,
    };
  }
  if (
    variants.some(
      (candidate) =>
        !candidate.address ||
        !candidate.topic0 ||
        Object.values(candidate.topicWords).some((word) => !word) ||
        Object.values(candidate.dataWords).some((word) => !word),
    )
  ) {
    return {
      error: "The exact receipt fields required for verification are unavailable.",
      status: 409,
    };
  }
  return { variants, ...extra };
}

function receiptLogMatchesVariant(log, receipt, candidate) {
  if (
    cleanText(log?.address, 80).toLowerCase() !== candidate.address ||
    cleanText(log?.topics?.[0], 80).toLowerCase() !== candidate.topic0
  ) {
    return false;
  }
  const topics = Array.isArray(log?.topics) ? log.topics : [];
  if (candidate.topicCount !== undefined && topics.length !== candidate.topicCount) {
    return false;
  }
  for (const [index, expectedWord] of Object.entries(candidate.topicWords)) {
    if (normalizedReceiptWord(topics[Number(index)]) !== expectedWord) return false;
  }
  const words = receiptDataWords(log?.data);
  if (!words) return false;
  if (
    candidate.dataWordCount !== undefined &&
    words.length !== candidate.dataWordCount
  ) {
    return false;
  }
  for (const [index, expectedWord] of Object.entries(candidate.dataWords)) {
    if (words[Number(index)] !== expectedWord) return false;
  }
  const sender = cleanText(receipt?.from, 80).toLowerCase();
  if (candidate.exactSender && sender !== candidate.exactSender) return false;
  if ((candidate.forbiddenSenders || []).includes(sender)) return false;
  if (
    candidate.senderTopicIndex !== null &&
    candidate.senderTopicIndex !== undefined
  ) {
    const loggedActor = topicAddress(topics[candidate.senderTopicIndex]);
    if (!loggedActor || sender !== loggedActor) return false;
  }
  return true;
}

async function agreementTokenAtReceipt(
  parsedRpcUrls,
  openEscrowAddress,
  agreementTopic,
  blockNumber,
) {
  const callData = `0x4f9f6fe6${agreementTopic.slice(2)}`;
  let rpcResponded = false;
  for (const parsedRpcUrl of parsedRpcUrls) {
    const rpc = await fetchJsonRpc(
      parsedRpcUrl,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_call",
        params: [
          { to: openEscrowAddress, data: callData },
          blockNumber || "latest",
        ],
      },
      4_000,
    );
    if (rpc.ok) {
      const words = receiptDataWords(rpc.result);
      if (!words || words.length < 13) continue;
      rpcResponded = true;
      return { ok: true, tokenAddress: topicAddress(words[12]) };
    }
  }
  return { ok: false, rpcResponded };
}

function isConfirmedReceiptForTransaction(receipt, transactionHash) {
  return (
    receipt &&
    typeof receipt === "object" &&
    !Array.isArray(receipt) &&
    cleanText(receipt.transactionHash, 80).toLowerCase() ===
      transactionHash.toLowerCase() &&
    /^0x[a-fA-F0-9]{64}$/.test(cleanText(receipt.blockHash, 80)) &&
    /^0x[0-9a-fA-F]+$/.test(cleanText(receipt.blockNumber, 80)) &&
    (receipt.status === "0x0" || receipt.status === "0x1") &&
    WALLET_PATTERN.test(cleanText(receipt.from, 80)) &&
    Array.isArray(receipt.logs) &&
    receipt.logs.length <= 256
  );
}

async function verifiedBaseSepoliaReceipt(
  env,
  db,
  body,
  row,
  role,
  recordedEvents,
  transactionHash,
  { recoverLegacyLandlord = true } = {},
) {
  let context = await receiptParticipantContext(
    db,
    row,
    role,
    body.token,
    recordedEvents,
  );
  let recoveredLegacyLandlord = null;
  if (
    recoverLegacyLandlord &&
    body.type !== "finalize" &&
    role === "landlord" &&
    !context.landlordWallet
  ) {
    const originalAgreementId = cleanText(row.onchain_agreement_id, 80);
    const originalTransactionHash = cleanText(row.onchain_tx_hash, 100);
    if (
      !originalAgreementId ||
      !/^0x[a-fA-F0-9]{64}$/.test(originalTransactionHash)
    ) {
      return {
        ok: false,
        status: 409,
        error:
          "OpenEscrow cannot verify the original agreement creator for this older record. Preserve the record and contact support before saving another landlord transaction.",
      };
    }
    const originalVerification = await verifiedBaseSepoliaReceipt(
      env,
      db,
      { type: "finalize", agreementId: originalAgreementId },
      row,
      role,
      recordedEvents,
      originalTransactionHash,
      { recoverLegacyLandlord: false },
    );
    if (!originalVerification.ok || !originalVerification.actorAddress) {
      return {
        ok: false,
        status: originalVerification.status === 503 ? 503 : 409,
        error:
          originalVerification.status === 503
            ? "OpenEscrow could not recheck the original agreement creator right now. The onchain transaction is unchanged; retry saving this landlord receipt shortly."
            : "OpenEscrow could not prove the original agreement creator for this older record. Preserve the record and contact support before saving another landlord transaction.",
      };
    }
    recoveredLegacyLandlord = {
      actorAddress: originalVerification.actorAddress,
      blockNumber: originalVerification.blockNumber,
      transactionHash: originalTransactionHash,
    };
    context = {
      ...context,
      landlordWallet: originalVerification.actorAddress,
      exactWallet: originalVerification.actorAddress,
    };
  }
  const expectation = receiptExpectation(
    body,
    row,
    env,
    context,
    recordedEvents,
  );
  if (expectation.error) {
    return {
      ok: false,
      status: expectation.status,
      error: expectation.error,
    };
  }
  const configuredRpcUrl = cleanText(env.BASE_SEPOLIA_RPC_URL, 1000);
  const rpcUrls = Array.from(
    new Set([
      configuredRpcUrl || DEFAULT_BASE_SEPOLIA_RPC_URL,
      ...(configuredRpcUrl ? [] : [FALLBACK_BASE_SEPOLIA_RPC_URL]),
    ]),
  );
  const parsedRpcUrls = [];
  for (const rpcUrl of rpcUrls) {
    try {
      const parsed = new URL(rpcUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS is required.");
      parsedRpcUrls.push(parsed);
    } catch {
      return {
        ok: false,
        status: 503,
        error: "The configured Base Sepolia receipt verifier is invalid.",
      };
    }
  }
  if (configuredRpcUrl && !(await isBaseSepoliaRpc(parsedRpcUrls[0]))) {
    return {
      ok: false,
      status: 503,
      error: "The configured receipt verifier does not report Base Sepolia.",
    };
  }

  let receipt;
  let rpcResponded = false;
  for (const parsedRpcUrl of parsedRpcUrls) {
    const rpc = await fetchJsonRpc(
      parsedRpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [transactionHash],
      },
      7_500,
    );
    if (rpc.ok && rpc.result === null) {
      rpcResponded = true;
      continue;
    }
    if (rpc.ok && isConfirmedReceiptForTransaction(rpc.result, transactionHash)) {
      rpcResponded = true;
      receipt = rpc.result;
      break;
    }
  }
  if (!rpcResponded) {
    return {
      ok: false,
      status: 503,
      error:
        "OpenEscrow could not verify this Base Sepolia receipt. The onchain transaction is unchanged; retry saving its receipt shortly.",
    };
  }

  if (!receipt) {
    return {
      ok: false,
      status: 409,
      error:
        "This transaction is not confirmed on Base Sepolia yet. Wait for confirmation and retry saving its receipt.",
    };
  }
  if (receipt.status !== "0x1") {
    return {
      ok: false,
      status: 400,
      error: "The submitted Base Sepolia transaction reverted and cannot be recorded.",
    };
  }
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  let matchedVariant = null;
  const matchingLog = logs.find((log) =>
    expectation.variants.some((candidate) => {
      if (!receiptLogMatchesVariant(log, receipt, candidate)) return false;
      matchedVariant = candidate;
      return true;
    }),
  );
  if (!matchingLog) {
    return {
      ok: false,
      status: 400,
      error:
        "This transaction does not contain the expected event for the current OpenEscrow agreement.",
    };
  }
  if (expectation.participantLogs) {
    const matchingParticipantLogs = logs.filter(
      (log) =>
        cleanText(log?.address, 80).toLowerCase() ===
          expectation.openEscrowAddress &&
        cleanText(log?.topics?.[0], 80).toLowerCase() ===
          RECEIPT_EVENT_TOPICS.tenantParticipantAdded &&
        normalizedReceiptWord(log?.topics?.[1]) === expectation.agreementTopic,
    );
    if (
      matchingParticipantLogs.length !== expectation.participantLogCount ||
      !expectation.participantLogs.every((candidate) =>
        matchingParticipantLogs.some((log) =>
          receiptLogMatchesVariant(log, receipt, candidate),
        ),
      )
    ) {
      return {
        ok: false,
        status: 400,
        error:
          "This transaction does not contain the expected event for the current OpenEscrow agreement.",
      };
    }
  }
  if (expectation.expectedAgreementToken) {
    const tokenResult = await agreementTokenAtReceipt(
      parsedRpcUrls,
      expectation.openEscrowAddress,
      expectation.agreementTopic,
      cleanText(receipt.blockNumber, 80),
    );
    if (!tokenResult.ok) {
      return {
        ok: false,
        status: tokenResult.rpcResponded ? 400 : 503,
        error: tokenResult.rpcResponded
          ? "This transaction does not contain the expected event for the current OpenEscrow agreement."
          : "OpenEscrow could not verify the agreement token at the confirmed Base Sepolia block. Retry saving its receipt shortly.",
      };
    }
    if (tokenResult.tokenAddress !== expectation.expectedAgreementToken) {
      return {
        ok: false,
        status: 400,
        error:
          "This transaction does not contain the expected event for the current OpenEscrow agreement.",
      };
    }
  }
  const actorAddress =
    matchedVariant.captureActorTopicIndex !== null
      ? topicAddress(matchingLog.topics[matchedVariant.captureActorTopicIndex])
      : cleanText(receipt.from, 80).toLowerCase();
  return {
    ok: true,
    blockNumber: cleanText(receipt.blockNumber, 80),
    transactionHash,
    actorAddress: WALLET_PATTERN.test(actorAddress || "") ? actorAddress : null,
    recoveredLegacyLandlord,
  };
}

function emailProvider(env) {
  if (!env.NOTIFICATION_FROM_EMAIL) return null;
  if (env.RESEND_API_KEY) return "resend";
  if (env.EMAIL_WEBHOOK_URL) return "webhook";
  return null;
}

function emailSenderReadiness(env, provider) {
  if (!provider) {
    return {
      participantDeliveryReady: false,
      senderMode: "unconfigured",
    };
  }
  const configuredFrom = cleanText(env.NOTIFICATION_FROM_EMAIL, 320);
  const bracketedAddress = configuredFrom.match(/<([^<>\s]+@[^<>\s]+)>\s*$/)?.[1];
  const bareAddress = configuredFrom.match(/^([^<>\s]+@[^<>\s]+)$/)?.[1];
  const address = cleanText(bracketedAddress || bareAddress, 254).toLowerCase();
  const domain = address.split("@")[1] || "";
  const providerTestSender =
    provider === "resend" &&
    (domain === "resend.dev" || domain.endsWith(".resend.dev"));
  const participantDeliveryReady = Boolean(
    address && domain && !providerTestSender,
  );
  return {
    participantDeliveryReady,
    senderMode: !address || !domain
      ? "invalid"
      : providerTestSender
        ? "account-test-only"
        : "participant-capable",
  };
}

function publicAppOrigin(env, fallbackOrigin) {
  const fallback = new URL(fallbackOrigin).origin;
  const configured = cleanText(env.PUBLIC_APP_URL, 500);
  if (!configured) {
    const fallbackHostname = new URL(fallback).hostname.toLowerCase();
    if (
      fallbackHostname === "openescrow-demo.omrigross.chatgpt.site" ||
      fallbackHostname === "openescrow.omslice.workers.dev"
    ) {
      return "https://openescrow.io";
    }
    return fallback;
  }
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

function publicAppOriginForRequest(request, env) {
  return publicAppOrigin(env, new URL(request.url).origin);
}

const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const RESEND_DELIVERY_STATUSES = Object.freeze({
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "provider_failed",
  "email.suppressed": "suppressed",
});
const NOTIFICATION_SUPPRESSION_STATUSES = new Set([
  "bounced",
  "complained",
  "suppressed",
]);
const NOTIFICATION_ACCEPTED_STATUSES = new Set([
  "sent",
  "delivered",
  "delayed",
]);

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function verifyResendWebhook(request, env) {
  const secret = cleanText(env.RESEND_WEBHOOK_SECRET, 500);
  if (!secret.startsWith("whsec_")) {
    return {
      ok: false,
      response: json({ error: "Email delivery events are not configured." }, 503),
    };
  }
  const messageId = cleanText(request.headers.get("svix-id"), 200);
  const timestampText = cleanText(request.headers.get("svix-timestamp"), 40);
  const signatureHeader = cleanText(request.headers.get("svix-signature"), 1000);
  if (!messageId || !/^\d{10,13}$/.test(timestampText) || !signatureHeader) {
    return {
      ok: false,
      response: json({ error: "The email delivery event signature is missing." }, 400),
    };
  }
  const timestampSeconds = Number(timestampText);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) >
      RESEND_WEBHOOK_TOLERANCE_SECONDS
  ) {
    return {
      ok: false,
      response: json({ error: "The email delivery event has expired." }, 400),
    };
  }
  let secretBytes;
  try {
    secretBytes = decodeBase64(secret.slice("whsec_".length));
  } catch {
    return {
      ok: false,
      response: json({ error: "Email delivery events are not configured." }, 503),
    };
  }
  if (secretBytes.length < 16) {
    return {
      ok: false,
      response: json({ error: "Email delivery events are not configured." }, 503),
    };
  }
  const rawBody = await request.text();
  const signingKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      signingKey,
      encoder.encode(`${messageId}.${timestampText}.${rawBody}`),
    ),
  );
  const signatures = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.split(",", 2))
    .filter(([version, signature]) => version === "v1" && signature);
  const verified = signatures.some(([, signature]) => {
    try {
      return equalBytes(expected, decodeBase64(signature));
    } catch {
      return false;
    }
  });
  if (!verified) {
    return {
      ok: false,
      response: json({ error: "The email delivery event signature is invalid." }, 400),
    };
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: json({ error: "The email delivery event is not valid JSON." }, 400),
    };
  }
  return { ok: true, event, providerEventId: messageId };
}

async function isNotificationSuppressed(db, email) {
  if (!db) return false;
  const row = await db
    .prepare("SELECT email FROM notification_suppressions WHERE email = ?")
    .bind(normalizeEmail(email))
    .first();
  return Boolean(row);
}

async function resendDeliveryWebhook(request, env) {
  if (!env.DB) {
    return json({ error: "Notification delivery storage is not available." }, 503);
  }
  const verified = await verifyResendWebhook(request, env);
  if (!verified.ok) return verified.response;
  const eventType = cleanText(verified.event?.type, 80);
  const status = RESEND_DELIVERY_STATUSES[eventType];
  if (!status) {
    return json({ received: true, ignored: true });
  }
  const providerMessageId = cleanText(verified.event?.data?.email_id, 200);
  const occurredAt = cleanText(verified.event?.created_at, 80);
  if (!providerMessageId || !Number.isFinite(Date.parse(occurredAt))) {
    return json({ error: "The email delivery event is incomplete." }, 400);
  }
  const delivery = await env.DB
    .prepare(
      `SELECT idempotency_key, recipient_email
       FROM notification_deliveries
       WHERE provider_message_id = ?
       LIMIT 1`,
    )
    .bind(providerMessageId)
    .first();
  if (!delivery) {
    return json({ received: true, matched: false });
  }
  const recipientEmail = normalizeEmail(delivery.recipient_email);
  const eventRecipients = Array.isArray(verified.event?.data?.to)
    ? verified.event.data.to.map(normalizeEmail).filter(Boolean)
    : [];
  if (eventRecipients.length > 0 && !eventRecipients.includes(recipientEmail)) {
    return json({ error: "The email delivery event recipient does not match." }, 400);
  }
  const priorEvent = await env.DB
    .prepare(
      "SELECT provider_event_id FROM notification_delivery_events WHERE provider_event_id = ?",
    )
    .bind(verified.providerEventId)
    .first();
  if (priorEvent) {
    return json({ received: true, matched: true, duplicate: true });
  }

  const receivedAt = new Date().toISOString();
  const statements = [
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO notification_delivery_events
         (provider_event_id, provider, provider_message_id, event_type, status,
          occurred_at, received_at)
         VALUES (?, 'resend', ?, ?, ?, ?, ?)`,
      )
      .bind(
        verified.providerEventId,
        providerMessageId,
        eventType,
        status,
        new Date(occurredAt).toISOString(),
        receivedAt,
      ),
    env.DB
      .prepare(
        "UPDATE notification_deliveries SET status = ? WHERE provider_message_id = ?",
      )
      .bind(status, providerMessageId),
  ];
  if (NOTIFICATION_SUPPRESSION_STATUSES.has(status)) {
    statements.push(
      env.DB
        .prepare(
          `INSERT INTO notification_suppressions
           (email, provider, reason, provider_event_id, created_at, updated_at)
           VALUES (?, 'resend', ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             provider = excluded.provider,
             reason = excluded.reason,
             provider_event_id = excluded.provider_event_id,
             updated_at = excluded.updated_at`,
        )
        .bind(
          recipientEmail,
          status,
          verified.providerEventId,
          receivedAt,
          receivedAt,
        ),
      env.DB
        .prepare(
          `UPDATE notification_preferences
           SET agreement_activity = 0,
               deadline_reminders = 0,
               consented_at = NULL,
               updated_at = ?
           WHERE lower(email) = ?`,
        )
        .bind(receivedAt, recipientEmail),
    );
  }
  await env.DB.batch(statements);
  return json({
    received: true,
    matched: true,
    duplicate: false,
    status,
  });
}

async function deliverEmail(
  env,
  { to, subject, text, idempotencyKey },
) {
  const provider = emailProvider(env);
  const recipients = [
    ...new Set(
      (Array.isArray(to) ? to : [to])
        .map(normalizeEmail)
        .filter(Boolean),
    ),
  ];
  if (!provider || recipients.length === 0) return null;
  for (const recipient of recipients) {
    if (await isNotificationSuppressed(env.DB, recipient)) return null;
  }

  try {
    if (provider === "resend") {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          "user-agent": "OpenEscrow/1.0",
        },
        body: JSON.stringify({
          from: env.NOTIFICATION_FROM_EMAIL,
          to: recipients,
          subject,
          text,
        }),
      });
      const result = await sent.json().catch(() => ({}));
      return sent.ok && result.id
        ? { id: String(result.id), provider }
        : null;
    }

    const sent = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.EMAIL_WEBHOOK_TOKEN
          ? { authorization: `Bearer ${env.EMAIL_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        from: env.NOTIFICATION_FROM_EMAIL,
        to: recipients,
        subject,
        text,
        idempotencyKey: idempotencyKey || null,
      }),
    });
    const result = await sent.json().catch(() => ({}));
    const id = result.id || result.messageId || result.message_id;
    return sent.ok && id ? { id: String(id), provider } : null;
  } catch {
    return null;
  }
}

async function deliverTrackedEmail(
  env,
  {
    negotiationId = null,
    recipientEmail,
    notificationType,
    scheduledFor = null,
    subject,
    text,
    idempotencyKey,
  },
) {
  const email = normalizeEmail(recipientEmail);
  if (!email || !idempotencyKey) return null;
  const provider = emailProvider(env);
  const deliveryResult = (row, duplicate = true) => ({
    id: row?.provider_message_id ? String(row.provider_message_id) : null,
    provider,
    duplicate,
    pending: row?.status === "sending",
    status: row?.status || null,
    sentAt: row?.sent_at || null,
    idempotencyKey,
  });

  if (env.DB) {
    const startedAt = new Date(Date.now()).toISOString();
    const inserted = await env.DB
      .prepare(
        `INSERT OR IGNORE INTO notification_deliveries
         (idempotency_key, negotiation_id, recipient_email, notification_type,
          scheduled_for, status, provider_message_id, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sending', NULL, ?, NULL)`,
      )
      .bind(
        idempotencyKey,
        negotiationId,
        email,
        notificationType,
        scheduledFor,
        startedAt,
      )
      .run();
    let ownsSend = Number(inserted?.meta?.changes ?? inserted?.changes ?? 0) > 0;
    if (!ownsSend) {
      const prior = await env.DB
        .prepare(
          `SELECT status, provider_message_id, created_at, sent_at
           FROM notification_deliveries
           WHERE idempotency_key = ?`,
        )
        .bind(idempotencyKey)
        .first();
      if (
        NOTIFICATION_ACCEPTED_STATUSES.has(prior?.status) &&
        prior?.provider_message_id
      ) {
        return deliveryResult(prior);
      }
      if (NOTIFICATION_SUPPRESSION_STATUSES.has(prior?.status)) return null;

      const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const claimed = await env.DB
        .prepare(
          `UPDATE notification_deliveries
           SET negotiation_id = ?, recipient_email = ?, notification_type = ?,
               scheduled_for = ?, status = 'sending', provider_message_id = NULL,
               created_at = ?, sent_at = NULL
           WHERE idempotency_key = ?
             AND (
               status IN ('failed', 'provider_failed')
               OR (status = 'sending' AND created_at <= ?)
             )`,
        )
        .bind(
          negotiationId,
          email,
          notificationType,
          scheduledFor,
          startedAt,
          idempotencyKey,
          staleBefore,
        )
        .run();
      ownsSend = Number(claimed?.meta?.changes ?? claimed?.changes ?? 0) > 0;
      if (!ownsSend) {
        const active = await env.DB
          .prepare(
            `SELECT status, provider_message_id, created_at, sent_at
             FROM notification_deliveries
             WHERE idempotency_key = ?`,
          )
          .bind(idempotencyKey)
          .first();
        if (
          NOTIFICATION_ACCEPTED_STATUSES.has(active?.status) &&
          active?.provider_message_id
        ) {
          return deliveryResult(active);
        }
        if (NOTIFICATION_SUPPRESSION_STATUSES.has(active?.status)) return null;
        return deliveryResult(active);
      }
    }
  }

  const delivered = await deliverEmail(env, {
    to: [email],
    subject,
    text,
    idempotencyKey,
  });
  if (!env.DB) {
    return delivered
      ? {
          ...delivered,
          duplicate: false,
          pending: false,
          status: "sent",
          sentAt: new Date(Date.now()).toISOString(),
          idempotencyKey,
        }
      : null;
  }

  const now = new Date(Date.now()).toISOString();
  await env.DB
    .prepare(
      `UPDATE notification_deliveries
       SET status = ?, provider_message_id = ?, sent_at = ?
       WHERE idempotency_key = ? AND status = 'sending'`,
    )
    .bind(
      delivered?.id ? "sent" : "failed",
      delivered?.id || null,
      delivered?.id ? now : null,
      idempotencyKey,
    )
    .run();
  return delivered
    ? {
        ...delivered,
        duplicate: false,
        pending: false,
        status: "sent",
        sentAt: now,
        idempotencyKey,
      }
    : null;
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function invitationTokenFromFragment(url) {
  if (url.searchParams.has("token")) return null;
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
  );
  const values = fragment.getAll("token");
  if (values.length !== 1) return null;
  const token = values[0];
  return token && INVITATION_TOKEN_PATTERN.test(token) ? token : null;
}

function tokenMicros(value) {
  const normalized = cleanText(value, 80);
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  try {
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  } catch {
    return null;
  }
}

function cleanDeductionItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const items = value.map((item) => ({
    category:
      DEDUCTION_CATEGORY_LABEL[cleanText(item?.category, 120)] ||
      cleanText(item?.category, 120),
    description: cleanText(item?.description, 500),
    amount: cleanText(item?.amount, 80),
  }));
  if (
    items.some(
      (item) =>
        !item.category ||
        !item.description ||
        tokenMicros(item.amount) === null,
    )
  ) {
    return null;
  }
  return items;
}

function detectedEvidenceContentType(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (
    value.length >= 5 &&
    value[0] === 0x25 &&
    value[1] === 0x50 &&
    value[2] === 0x44 &&
    value[3] === 0x46 &&
    value[4] === 0x2d
  ) {
    return "application/pdf";
  }
  if (
    value.length >= 3 &&
    value[0] === 0xff &&
    value[1] === 0xd8 &&
    value[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    value.length >= 8 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47 &&
    value[4] === 0x0d &&
    value[5] === 0x0a &&
    value[6] === 0x1a &&
    value[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    value.length >= 12 &&
    value[0] === 0x52 &&
    value[1] === 0x49 &&
    value[2] === 0x46 &&
    value[3] === 0x46 &&
    value[8] === 0x57 &&
    value[9] === 0x45 &&
    value[10] === 0x42 &&
    value[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function deductionItemsMatchAmount(items, amount) {
  const expected = tokenMicros(amount);
  if (expected === null) return false;
  return (
    items.reduce((sum, item) => sum + (tokenMicros(item.amount) ?? 0n), 0n) === expected
  );
}

const CALIFORNIA_DEDUCTION_CATEGORIES = new Set(
  ["10", "11", "12", "13"].map((category) => DEDUCTION_CATEGORY_LABEL[category]),
);
const GENERIC_TEST_DEDUCTION_CATEGORIES = new Set(
  Object.values(DEDUCTION_CATEGORY_LABEL),
);

function validCaliforniaClaim(items, confirmations, evidenceUri, evidenceHash) {
  const hasConditionBasedDeduction = items.some((item) =>
    [
      DEDUCTION_CATEGORY_LABEL["11"],
      DEDUCTION_CATEGORY_LABEL["12"],
      DEDUCTION_CATEGORY_LABEL["13"],
    ].includes(item.category),
  );
  return (
    items.every((item) => CALIFORNIA_DEDUCTION_CATEGORIES.has(item.category)) &&
    confirmations &&
    confirmations.itemizedStatement === true &&
    confirmations.supportingDocuments === true &&
    (!hasConditionBasedDeduction ||
      (confirmations.moveInPhotos === true &&
        confirmations.preRepairPhotos === true &&
        confirmations.postRepairPhotos === true)) &&
    Boolean(evidenceUri) &&
    /^0x[a-fA-F0-9]{64}$/.test(evidenceHash)
  );
}

function validGenericTestClaim(items, confirmations, evidenceUri, evidenceHash) {
  return (
    items.every((item) => GENERIC_TEST_DEDUCTION_CATEGORIES.has(item.category)) &&
    confirmations?.itemizedStatement === true &&
    confirmations?.supportingDocuments === true &&
    Boolean(evidenceUri) &&
    /^0x[a-fA-F0-9]{64}$/.test(evidenceHash)
  );
}

function validVersionedStateClaim(
  items,
  confirmations,
  evidenceUri,
  evidenceHash,
  terms,
) {
  const policy = terms?.complianceSnapshot?.claimPolicy;
  if (
    policy?.schema !== "openescrow.claim-policy.v1" ||
    !Array.isArray(policy.allowedCategoryIds)
  ) {
    return false;
  }
  const categoryIds = items.map(
    (item) => DEDUCTION_CATEGORY_ID_BY_LABEL[item.category] || "",
  );
  const allowedCategories = new Set(policy.allowedCategoryIds);
  const requiredAttestations = requiredClaimAttestations(
    policy,
    categoryIds,
  );
  return (
    categoryIds.every(
      (categoryId) => categoryId && allowedCategories.has(categoryId),
    ) &&
    requiredAttestations.length > 0 &&
    requiredAttestations.every(
      (attestation) =>
        confirmations?.attestations?.[attestation.id] === true,
    ) &&
    Boolean(evidenceUri) &&
    /^0x[a-fA-F0-9]{64}$/.test(evidenceHash)
  );
}

function validClaimForTerms(items, confirmations, evidenceUri, evidenceHash, terms) {
  if (
    terms?.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
    terms?.policyVersion === CALIFORNIA_POLICY.version
  ) {
    return validCaliforniaClaim(
      items,
      confirmations,
      evidenceUri,
      evidenceHash,
    );
  }
  if (terms?.complianceSnapshot?.claimPolicy) {
    return validVersionedStateClaim(
      items,
      confirmations,
      evidenceUri,
      evidenceHash,
      terms,
    );
  }
  return validGenericTestClaim(
    items,
    confirmations,
    evidenceUri,
    evidenceHash,
  );
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function hasFirstAndLastName(value) {
  return cleanText(value, 120).split(/\s+/).filter(Boolean).length >= 2;
}

const CALIFORNIA_POLICY = Object.freeze({
  version: "ca-civ-1950.5-2026.1",
  jurisdiction: "us-ca",
  claimDays: "21",
  responseDays: "7",
  arbiterDays: "7",
  operationsReserve: "5",
});

const GENERIC_TEST_POLICY = Object.freeze({
  version: "generic-test-v1",
  jurisdiction: "testnet-generic",
  operationsReserve: "5",
});

function validPeriodDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 365;
}

function depositAssetTestnetLabel(terms) {
  return (
    terms?.depositAssetSnapshot?.testnetSymbol ||
    getDepositAssetForTerms(terms)?.testnetSymbol ||
    (terms?.tokenChoice === "yield" ? "taUSDC" : "testUSDC")
  );
}

function depositAssetAmountUnit(terms) {
  const symbol = depositAssetTestnetLabel(terms);
  return symbol === "taUSDC" ? "taUSDC shares" : symbol;
}

async function validTerms(terms, env) {
  const deposit = tokenMicros(terms?.deposit);
  const commonTermsAreValid =
    terms &&
    typeof terms === "object" &&
    cleanText(terms.propertyAddress, 300).length >= 5 &&
    (terms.tokenChoice === "plain" || terms.tokenChoice === "yield") &&
    validateDepositAssetTerms(terms) &&
    deposit !== null &&
    deposit > 0n &&
    terms.operationsReserve === "5" &&
    typeof terms.claimWindowStart === "string" &&
    !Number.isNaN(new Date(terms.claimWindowStart).getTime()) &&
    validPeriodDays(terms.claimDays) &&
    validPeriodDays(terms.responseDays) &&
    (terms.arbiterDays === undefined ||
      terms.arbiterDays === null ||
      terms.arbiterDays === "" ||
      validPeriodDays(terms.arbiterDays));
  if (!commonTermsAreValid) return false;

  const isGenericPolicy =
    terms.jurisdiction === GENERIC_TEST_POLICY.jurisdiction &&
    terms.policyVersion === GENERIC_TEST_POLICY.version &&
    terms.operationsReserve === GENERIC_TEST_POLICY.operationsReserve;
  if (isGenericPolicy) return true;

  const profile = US_JURISDICTION_PROFILE_BY_CODE[terms.jurisdiction];
  const monthlyRent = tokenMicros(terms.monthlyRent);
  const profileTermsAreValid = Boolean(
    profile &&
      monthlyRent !== null &&
      monthlyRent > 0n &&
      terms.policyVersion === profile.version &&
      terms.claimDays === profile.defaultClaimDays &&
      addressResolutionMatchesProfile(terms.addressResolution, profile) &&
      normalizeAddressResolution(terms.addressResolution)?.label ===
        cleanText(terms.propertyAddress, 300) &&
      complianceSnapshotMatchesProfile(
        terms.complianceSnapshot,
        profile,
        terms.addressResolution,
        { facts: terms.complianceFacts },
      ),
  );
  return (
    profileTermsAreValid &&
    (await verifyAddressAttestation(
      terms.addressResolution,
      env.ADDRESS_ATTESTATION_SECRET,
    ))
  );
}

function requiredComplianceSources(terms) {
  if (
    !terms ||
    terms.jurisdiction === GENERIC_TEST_POLICY.jurisdiction ||
    !terms.complianceSnapshot
  ) {
    return [];
  }
  const expectedVersions = new Map([
    [cleanText(terms.jurisdiction, 100), cleanText(terms.policyVersion, 100)],
    ...(Array.isArray(terms.complianceSnapshot.overlays)
      ? terms.complianceSnapshot.overlays.map((overlay) => [
          cleanText(overlay?.id, 100),
          cleanText(overlay?.version, 100),
        ])
      : []),
  ]);
  return COMPLIANCE_SOURCE_REGISTRY.filter(
    (sourceItem) =>
      expectedVersions.get(sourceItem.jurisdiction) === sourceItem.version,
  );
}

function currentComplianceSourceMonitoringException(
  sourceItem,
  row,
  now = new Date(Date.now()),
) {
  const exception = sourceItem?.monitoringException;
  const note = cleanText(exception?.note, 500);
  if (
    !exception ||
    exception.kind !== "reviewed-origin-incompatibility" ||
    !row ||
    row.profile_version !== sourceItem.version ||
    row.url !== sourceItem.url ||
    row.status !== "unreachable" ||
    !note ||
    !Array.isArray(exception.acceptableErrors) ||
    !exception.acceptableErrors.includes(cleanText(row.error, 300))
  ) {
    return null;
  }

  const nowMs = now.getTime();
  const reviewedAtMs = Date.parse(exception.reviewedAt);
  const expiresAtMs = Date.parse(exception.expiresAt);
  const lastCheckedAtMs = Date.parse(row.last_checked_at);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(reviewedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(lastCheckedAtMs) ||
    reviewedAtMs > nowMs ||
    expiresAtMs <= reviewedAtMs ||
    expiresAtMs < nowMs ||
    lastCheckedAtMs < reviewedAtMs ||
    lastCheckedAtMs > nowMs ||
    nowMs - lastCheckedAtMs > COMPLIANCE_SOURCE_EXCEPTION_RECHECK_MS
  ) {
    return null;
  }

  return {
    kind: exception.kind,
    reviewedAt: exception.reviewedAt,
    expiresAt: exception.expiresAt,
    note,
  };
}

function complianceEventKeysForSnapshot(snapshot) {
  if (
    !isVersionedComplianceSnapshot(snapshot) ||
    !Array.isArray(snapshot.deadlines) ||
    !Array.isArray(snapshot.overlays)
  ) {
    return new Set();
  }
  return new Set(
    [
      ...snapshot.deadlines,
      ...snapshot.overlays.flatMap((overlay) =>
        Array.isArray(overlay?.deadlines) ? overlay.deadlines : [],
      ),
    ]
      .map((deadline) => cleanText(deadline?.trigger, 80))
      .filter(Boolean),
  );
}

async function complianceSourceGate(terms, env, now = new Date(Date.now())) {
  if (
    terms?.jurisdiction === GENERIC_TEST_POLICY.jurisdiction ||
    env.COMPLIANCE_SOURCE_MONITOR_ENABLED !== "true"
  ) {
    return { allowed: true, enforced: false, sources: [] };
  }
  const requiredSources = requiredComplianceSources(terms);
  const expectedSourceCount =
    1 +
    (Array.isArray(terms?.complianceSnapshot?.overlays)
      ? terms.complianceSnapshot.overlays.reduce(
          (total, overlay) =>
            total + (Array.isArray(overlay?.sources) ? overlay.sources.length : 0),
          0,
        )
      : 0);
  if (!env.DB || requiredSources.length !== expectedSourceCount) {
    return {
      allowed: false,
      enforced: true,
      sources: [],
      reason: "registry-incomplete",
    };
  }
  const rows = await Promise.all(
    requiredSources.map((sourceItem) =>
      env.DB
        .prepare(
          `SELECT source_key, profile_version, url, baseline_signature,
                  current_signature, status, last_checked_at, last_verified_at, error
           FROM compliance_source_checks WHERE source_key = ?`,
        )
        .bind(sourceItem.key)
        .first(),
    ),
  );
  const staleBefore = now.getTime() - COMPLIANCE_SOURCE_FRESHNESS_MS;
  const currentTime = now.getTime();
  const sources = requiredSources.map((sourceItem, index) => {
    const row = rows[index];
    const verifiedAt = row?.last_verified_at
      ? new Date(row.last_verified_at).getTime()
      : Number.NaN;
    let status = cleanText(row?.status, 40) || "pending";
    let monitoringException = null;
    if (
      !row ||
      row.profile_version !== sourceItem.version ||
      row.url !== sourceItem.url
    ) {
      status = "pending";
    } else if (
      (monitoringException = currentComplianceSourceMonitoringException(
        sourceItem,
        row,
        now,
      ))
    ) {
      status = "manual-review-current";
    } else if (status !== "changed" && (
      !row.baseline_signature ||
      row.baseline_signature !== row.current_signature
    )) {
      status = "pending";
    } else if (status !== "changed" && (
      !Number.isFinite(verifiedAt) ||
      verifiedAt < staleBefore ||
      verifiedAt > currentTime
    )) {
      status = "stale";
    }
    return {
      key: sourceItem.key,
      citation: sourceItem.citation,
      status,
      lastCheckedAt: row?.last_checked_at || null,
      lastVerifiedAt: row?.last_verified_at || null,
      monitoringException,
    };
  });
  return {
    allowed: sources.every(
      (sourceItem) =>
        sourceItem.status === "unchanged" ||
        sourceItem.status === "unreachable" ||
        sourceItem.status === "manual-review-current",
    ),
    enforced: true,
    sources,
    reason: sources.find(
      (sourceItem) =>
        sourceItem.status !== "unchanged" &&
        sourceItem.status !== "unreachable" &&
        sourceItem.status !== "manual-review-current",
    )?.status,
  };
}

function complianceSourceGateResponse(gate) {
  const changed = gate.sources?.some((sourceItem) => sourceItem.status === "changed");
  return json(
    {
      error: changed
        ? "An official compliance source changed after this rule version was reviewed. Publish a reviewed profile version before creating or finalizing an agreement."
        : "The official sources for this compliance profile need a fresh successful check before creating or finalizing an agreement.",
      code: "compliance-source-review-required",
      sourceStatus: gate.sources || [],
    },
    503,
  );
}

async function complianceSourceStatus(request, env) {
  if (!sameOriginPost(request)) {
    return json({ error: "Cross-origin compliance checks are not allowed." }, 403);
  }
  if (!env.DB || env.COMPLIANCE_SOURCE_MONITOR_ENABLED !== "true") {
    return json(
      {
        error:
          "Official-source checking is not available in this environment. The recorded profile and source link remain visible.",
      },
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "A valid compliance profile is required." }, 400);
  }
  const jurisdiction = cleanText(body?.jurisdiction, 100);
  const profileVersion = cleanText(body?.profileVersion, 100);
  const requestedOverlays = body?.overlays ?? [];
  if (!Array.isArray(requestedOverlays) || requestedOverlays.length > 32) {
    return json({ error: "A valid set of compliance overlays is required." }, 400);
  }
  const overlayVersions = requestedOverlays.map((overlay) => ({
    id: cleanText(overlay?.id, 100),
    version: cleanText(overlay?.version, 100),
  }));
  if (
    overlayVersions.some((overlay) => !overlay.id || !overlay.version) ||
    new Set(overlayVersions.map((overlay) => overlay.id)).size !==
      overlayVersions.length
  ) {
    return json({ error: "A valid set of compliance overlays is required." }, 400);
  }
  const profile = US_JURISDICTION_PROFILE_BY_CODE[jurisdiction];
  const expectedVersions = new Map([
    [jurisdiction, profileVersion],
    ...overlayVersions.map((overlay) => [overlay.id, overlay.version]),
  ]);
  const sourceItems = COMPLIANCE_SOURCE_REGISTRY.filter(
    (item) => expectedVersions.get(item.jurisdiction) === item.version,
  );
  const stateSource = sourceItems.find(
    (item) => item.scope === "state" && item.jurisdiction === jurisdiction,
  );
  const registeredOverlayIds = new Set(
    sourceItems
      .filter((item) => item.scope !== "state")
      .map((item) => item.jurisdiction),
  );
  if (
    !profile ||
    profile.version !== profileVersion ||
    !stateSource ||
    overlayVersions.some((overlay) => !registeredOverlayIds.has(overlay.id))
  ) {
    return json({ error: "That versioned compliance profile is not available." }, 404);
  }

  await initialize(env.DB);
  await seedComplianceSources(env.DB);
  const minimumRefreshIntervalMs = 5 * 60 * 1000;
  const sourceRows = [];
  for (const sourceItem of sourceItems) {
    let row = await env.DB
      .prepare("SELECT * FROM compliance_source_checks WHERE source_key = ?")
      .bind(sourceItem.key)
      .first();
    const lastCheckedMs = row?.last_checked_at
      ? new Date(row.last_checked_at).getTime()
      : Number.NaN;
    if (
      !Number.isFinite(lastCheckedMs) ||
      Date.now() - lastCheckedMs >= minimumRefreshIntervalMs
    ) {
      await checkComplianceSourceOnce(env.DB, row, new Date(Date.now()));
      row = await env.DB
        .prepare("SELECT * FROM compliance_source_checks WHERE source_key = ?")
        .bind(sourceItem.key)
        .first();
    }
    const storedStatus = cleanText(row?.status, 40) || "pending";
    const monitoringException = currentComplianceSourceMonitoringException(
      sourceItem,
      row,
      new Date(Date.now()),
    );
    const status = monitoringException
      ? "manual-review-current"
      : COMPLIANCE_SOURCE_STATUS_VALUES.has(storedStatus)
        ? storedStatus
        : "pending";
    sourceRows.push({
      key: sourceItem.key,
      scope: sourceItem.scope,
      jurisdiction: sourceItem.jurisdiction,
      citation: sourceItem.citation,
      url: sourceItem.url,
      status,
      lastCheckedAt: row?.last_checked_at || null,
      lastVerifiedAt: row?.last_verified_at || null,
      requiresReview:
        status !== "unchanged" && status !== "manual-review-current",
      monitoringException,
    });
  }

  return json({
    jurisdiction,
    profileVersion,
    overlays: overlayVersions,
    source: sourceRows[0],
    sources: sourceRows,
    immutableSnapshotNotice:
      "Finalized agreements keep their recorded compliance snapshot. A source change must be reviewed and published as a new profile version before a draft can adopt it.",
  });
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value) {
  const normalized = cleanText(value, 500)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

const DEFAULT_EVIDENCE_ENCRYPTION_KEY_ID = "primary";
const EVIDENCE_ENCRYPTION_KEY_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

class EvidenceKeyConfigurationError extends Error {}

function evidenceEncryptionKeyId(value) {
  const keyId = cleanText(value, 64) || DEFAULT_EVIDENCE_ENCRYPTION_KEY_ID;
  if (!EVIDENCE_ENCRYPTION_KEY_ID_PATTERN.test(keyId)) {
    throw new EvidenceKeyConfigurationError(
      "EVIDENCE_ENCRYPTION_KEY_ID may contain only letters, numbers, dots, underscores, and hyphens.",
    );
  }
  return keyId;
}

function decodeEvidenceMasterKey(value, variableName) {
  if (!value) {
    throw new EvidenceKeyConfigurationError(`${variableName} is not configured.`);
  }
  let rawKey;
  try {
    rawKey = decodeBase64(value);
  } catch {
    throw new EvidenceKeyConfigurationError(
      `${variableName} must be a base64-encoded 32-byte key.`,
    );
  }
  if (rawKey.length !== 32) {
    throw new EvidenceKeyConfigurationError(
      `${variableName} must be a base64-encoded 32-byte key.`,
    );
  }
  return rawKey;
}

function retainedEvidenceDecryptionKeys(env) {
  if (!env.EVIDENCE_DECRYPTION_KEYS) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(String(env.EVIDENCE_DECRYPTION_KEYS));
  } catch {
    throw new EvidenceKeyConfigurationError(
      "EVIDENCE_DECRYPTION_KEYS must be a JSON object mapping key IDs to base64 keys.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new EvidenceKeyConfigurationError(
      "EVIDENCE_DECRYPTION_KEYS must be a JSON object mapping key IDs to base64 keys.",
    );
  }
  const entries = Object.entries(parsed);
  if (entries.length > 20) {
    throw new EvidenceKeyConfigurationError(
      "EVIDENCE_DECRYPTION_KEYS is limited to 20 retained keys.",
    );
  }
  return new Map(
    entries.map(([keyId, encodedKey]) => {
      const normalizedKeyId = cleanText(keyId, 64);
      if (!EVIDENCE_ENCRYPTION_KEY_ID_PATTERN.test(normalizedKeyId)) {
        throw new EvidenceKeyConfigurationError(
          "Every EVIDENCE_DECRYPTION_KEYS key ID must contain only letters, numbers, dots, underscores, and hyphens.",
        );
      }
      return [
        normalizedKeyId,
        decodeEvidenceMasterKey(
          encodedKey,
          `EVIDENCE_DECRYPTION_KEYS.${normalizedKeyId}`,
        ),
      ];
    }),
  );
}

function activeEvidenceMasterKey(env) {
  return {
    keyId: evidenceEncryptionKeyId(env.EVIDENCE_ENCRYPTION_KEY_ID),
    rawKey: decodeEvidenceMasterKey(
      env.EVIDENCE_ENCRYPTION_KEY,
      "EVIDENCE_ENCRYPTION_KEY",
    ),
  };
}

function evidenceEncryptionConfiguration(env) {
  const active = activeEvidenceMasterKey(env);
  const retained = retainedEvidenceDecryptionKeys(env);
  if (retained.has(active.keyId)) {
    throw new EvidenceKeyConfigurationError(
      "EVIDENCE_DECRYPTION_KEYS must not repeat the active EVIDENCE_ENCRYPTION_KEY_ID.",
    );
  }
  return { active, retained };
}

function evidenceMasterKeyForId(env, storedKeyId) {
  const requestedKeyId = evidenceEncryptionKeyId(storedKeyId);
  const configuration = evidenceEncryptionConfiguration(env);
  if (requestedKeyId === configuration.active.keyId) {
    return configuration.active.rawKey;
  }
  const retainedKey = configuration.retained.get(requestedKeyId);
  if (!retainedKey) {
    throw new EvidenceKeyConfigurationError(
      `The evidence decryption key "${requestedKeyId}" is not configured.`,
    );
  }
  return retainedKey;
}

async function evidenceMasterKeyFingerprint(rawKey) {
  const digest = await crypto.subtle.digest("SHA-256", rawKey);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function evidenceEncryptionReadiness(env) {
  if (!env.EVIDENCE_ENCRYPTION_KEY) {
    return {
      configured: false,
      activeKeyId: null,
      retainedKeyCount: 0,
      availableKeyIds: new Set(),
      keyFingerprints: new Map(),
      error: env.EVIDENCE_DECRYPTION_KEYS
        ? "EVIDENCE_ENCRYPTION_KEY is required even when retired decryption keys are retained."
        : null,
    };
  }
  try {
    const { active, retained } = evidenceEncryptionConfiguration(env);
    const keyEntries = [
      [active.keyId, active.rawKey],
      ...retained.entries(),
    ];
    const keyFingerprints = new Map(
      await Promise.all(
        keyEntries.map(async ([keyId, rawKey]) => [
          keyId,
          await evidenceMasterKeyFingerprint(rawKey),
        ]),
      ),
    );
    return {
      configured: true,
      activeKeyId: active.keyId,
      retainedKeyCount: retained.size,
      availableKeyIds: new Set([active.keyId, ...retained.keys()]),
      keyFingerprints,
      error: null,
    };
  } catch (error) {
    return {
      configured: false,
      activeKeyId: null,
      retainedKeyCount: 0,
      availableKeyIds: new Set(),
      keyFingerprints: new Map(),
      error:
        error instanceof EvidenceKeyConfigurationError
          ? error.message
          : "Evidence encryption key configuration is invalid.",
    };
  }
}

async function deriveEvidenceEncryptionKey(rawKey, evidenceId) {
  const sourceKey = await crypto.subtle.importKey("raw", rawKey, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(evidenceId),
      info: encoder.encode("OpenEscrow evidence encryption v1"),
    },
    sourceKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptEvidenceBytes(env, evidenceId, bytes) {
  const { active: activeKey } = evidenceEncryptionConfiguration(env);
  const key = await deriveEvidenceEncryptionKey(activeKey.rawKey, evidenceId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    bytes,
  );
  return {
    bytes: encrypted,
    version: "aes-256-gcm-hkdf-v1",
    iv: encodeBase64(iv),
    keyId: activeKey.keyId,
    keyFingerprint: await evidenceMasterKeyFingerprint(activeKey.rawKey),
  };
}

async function decryptEvidenceBytes(env, evidenceId, bytes, iv, keyId) {
  const rawKey = evidenceMasterKeyForId(env, keyId);
  const key = await deriveEvidenceEncryptionKey(rawKey, evidenceId);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    key,
    bytes,
  );
}

function decodeJwtJson(segment) {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(segment.length / 4) * 4,
    "=",
  );
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeJwtBytes(segment) {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(segment.length / 4) * 4,
    "=",
  );
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function usablePrivyJwk(candidate) {
  return (
    candidate?.kty === "EC" &&
    candidate?.crv === "P-256" &&
    (candidate.alg === undefined || candidate.alg === "ES256") &&
    (candidate.use === undefined || candidate.use === "sig") &&
    typeof candidate.kid === "string" &&
    candidate.kid.length > 0 &&
    candidate.kid.length <= 200
  );
}

async function readBoundedJsonResponse(response, maximumBytes) {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)
  ) {
    throw new Error("Remote response exceeded its safety limit.");
  }
  if (!response.body) throw new Error("Remote response was empty.");

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("remote response exceeds OpenEscrow limit");
        throw new Error("Remote response exceeded its safety limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function fetchJsonRpc(parsedUrl, payload, timeoutMs) {
  const requestKey = `${parsedUrl.toString()}\n${timeoutMs}\n${JSON.stringify(payload)}`;
  const existing = jsonRpcRequestsInFlight.get(requestKey);
  if (existing) return existing;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(parsedUrl.toString(), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, result: null };
      const envelope = await readBoundedJsonResponse(
        response,
        JSON_RPC_RESPONSE_LIMIT_BYTES,
      );
      if (
        !envelope ||
        typeof envelope !== "object" ||
        Array.isArray(envelope) ||
        envelope.jsonrpc !== "2.0" ||
        envelope.id !== payload.id ||
        Object.hasOwn(envelope, "error") ||
        !Object.hasOwn(envelope, "result")
      ) {
        return { ok: false, result: null };
      }
      return { ok: true, result: envelope.result };
    } catch {
      return { ok: false, result: null };
    } finally {
      clearTimeout(timeout);
    }
  })();
  jsonRpcRequestsInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (jsonRpcRequestsInFlight.get(requestKey) === request) {
      jsonRpcRequestsInFlight.delete(requestKey);
    }
  }
}

async function isBaseSepoliaRpc(parsedUrl) {
  const cacheKey = parsedUrl.toString();
  const cachedAt = baseSepoliaRpcValidationCache.get(cacheKey);
  if (cachedAt && Date.now() - cachedAt < 5 * 60 * 1000) return true;
  const rpc = await fetchJsonRpc(
    parsedUrl,
    { jsonrpc: "2.0", id: 84532, method: "eth_chainId", params: [] },
    3_000,
  );
  if (
    !rpc.ok ||
    typeof rpc.result !== "string" ||
    rpc.result.toLowerCase() !== BASE_SEPOLIA_CHAIN_ID_HEX
  ) {
    return false;
  }
  if (
    baseSepoliaRpcValidationCache.size >= 8 &&
    !baseSepoliaRpcValidationCache.has(cacheKey)
  ) {
    baseSepoliaRpcValidationCache.delete(
      baseSepoliaRpcValidationCache.keys().next().value,
    );
  }
  baseSepoliaRpcValidationCache.set(cacheKey, Date.now());
  return true;
}

function onchainActivityIndexerEnabled(env) {
  return cleanText(env.ONCHAIN_ACTIVITY_INDEXER_ENABLED, 20).toLowerCase() === "true";
}

function configuredOpenEscrowDeploymentBlock(env) {
  const configured = Number(cleanText(env.OPEN_ESCROW_DEPLOYMENT_BLOCK, 30));
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_OPEN_ESCROW_DEPLOYMENT_BLOCK;
}

function rpcHexNumber(value) {
  if (!/^0x[0-9a-fA-F]+$/.test(cleanText(value, 100))) return null;
  const parsed = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function indexedAgreementId(log) {
  const word = normalizedReceiptWord(log?.topics?.[1]);
  if (!word) return null;
  try {
    return BigInt(word).toString(10);
  } catch {
    return null;
  }
}

function indexedLogRecord(log, expectedAddress, indexedAt) {
  const topic0 = cleanText(log?.topics?.[0], 80).toLowerCase();
  const definition = INDEXED_OPEN_ESCROW_EVENTS[topic0];
  const transactionHash = cleanText(log?.transactionHash, 100).toLowerCase();
  const blockHash = cleanText(log?.blockHash, 100).toLowerCase();
  const blockNumber = rpcHexNumber(log?.blockNumber);
  const logIndex = rpcHexNumber(log?.logIndex);
  const agreementId = indexedAgreementId(log);
  if (
    !definition ||
    cleanText(log?.address, 80).toLowerCase() !== expectedAddress ||
    !/^0x[0-9a-f]{64}$/.test(transactionHash) ||
    !/^0x[0-9a-f]{64}$/.test(blockHash) ||
    blockNumber === null ||
    logIndex === null ||
    agreementId === null ||
    log?.removed === true
  ) {
    return null;
  }
  return {
    chainId: 84532,
    contractAddress: expectedAddress,
    transactionHash,
    logIndex,
    blockNumber,
    blockHash,
    onchainAgreementId: agreementId,
    eventType: definition.eventType,
    recordedActions: definition.recordedActions,
    indexedAt,
  };
}

async function baseSepoliaRpcUrls(env) {
  const candidates = Array.from(
    new Set(
      [
        cleanText(env.BASE_SEPOLIA_RPC_URL, 1000),
        DEFAULT_BASE_SEPOLIA_RPC_URL,
        FALLBACK_BASE_SEPOLIA_RPC_URL,
      ].filter(Boolean),
    ),
  );
  const parsed = [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:") continue;
      if (await isBaseSepoliaRpc(url)) parsed.push(url);
    } catch {
      // Ignore malformed or wrong-chain fallbacks; readiness exposes failure.
    }
  }
  return parsed;
}

async function indexedRpcResult(rpcUrls, method, params, timeoutMs = 7_500) {
  for (const rpcUrl of rpcUrls) {
    const rpc = await fetchJsonRpc(
      rpcUrl,
      { jsonrpc: "2.0", id: 84533, method, params },
      timeoutMs,
    );
    if (rpc.ok) return rpc.result;
  }
  throw new Error("Base Sepolia activity could not be read from the configured RPCs.");
}

async function matchingNegotiationForIndexedEvent(db, agreementId) {
  const matches = await db
    .prepare(
      `SELECT * FROM agreement_negotiations
       WHERE status IN ('finalized', 'cancelled') AND onchain_agreement_id = ?
       ORDER BY updated_at DESC
       LIMIT 2`,
    )
    .bind(agreementId)
    .all();
  return matches.results?.length === 1 ? matches.results[0] : null;
}

async function recordedAppEventForIndexedEvent(db, record) {
  const definition = Object.values(INDEXED_OPEN_ESCROW_EVENTS).find(
    (candidate) => candidate.eventType === record.event_type,
  );
  if (!definition?.recordedActions?.length || !record.negotiation_id) return false;
  const placeholders = definition.recordedActions.map(() => "?").join(", ");
  const existing = await db
    .prepare(
      `SELECT id FROM negotiation_events
       WHERE negotiation_id = ?
         AND action IN (${placeholders})
         AND lower(json_extract(metadata_json, '$.transactionHash')) = ?
       LIMIT 1`,
    )
    .bind(record.negotiation_id, ...definition.recordedActions, record.transaction_hash)
    .first();
  return Boolean(existing?.id);
}

async function processIndexedChainEvent(env, record) {
  let negotiationId = cleanText(record.negotiation_id, 100);
  let row = negotiationId ? await rowFor(env.DB, negotiationId).catch(() => null) : null;
  if (!row) {
    row = await matchingNegotiationForIndexedEvent(
      env.DB,
      String(record.onchain_agreement_id),
    );
    negotiationId = row?.id || "";
  }
  if (!row || !negotiationId) {
    await env.DB
      .prepare(
        `UPDATE indexed_chain_events
         SET processing_status = 'unmatched', negotiation_id = NULL
         WHERE chain_id = ? AND transaction_hash = ? AND log_index = ?`,
      )
      .bind(record.chain_id, record.transaction_hash, record.log_index)
      .run();
    return;
  }

  const boundRecord = { ...record, negotiation_id: negotiationId };
  const recordedInApp = await recordedAppEventForIndexedEvent(env.DB, boundRecord);

  const eventAlreadyRecorded = await env.DB
    .prepare(
      `SELECT id FROM negotiation_events
       WHERE negotiation_id = ?
         AND action = 'onchain_activity_indexed'
         AND lower(json_extract(metadata_json, '$.transactionHash')) = ?
         AND json_extract(metadata_json, '$.logIndex') = ?
       LIMIT 1`,
    )
    .bind(negotiationId, record.transaction_hash, record.log_index)
    .first();
  const now = new Date().toISOString();
  if (!recordedInApp && !eventAlreadyRecorded?.id) {
    await env.DB.batch([
      env.DB
        .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
        .bind(now, negotiationId),
      eventStatement(
        env.DB,
        negotiationId,
        now,
        "system",
        "onchain_activity_indexed",
        `Detected ${record.event_type.replaceAll("_", " ")} directly on Base Sepolia and reconciled it with this agreement.`,
        Number(row.revision),
        {
          eventType: record.event_type,
          transactionHash: record.transaction_hash,
          blockNumber: record.block_number,
          blockHash: record.block_hash,
          logIndex: record.log_index,
          chainId: record.chain_id,
        },
      ),
    ]);
    row = await rowFor(env.DB, negotiationId);
  }

  const provider = emailProvider(env);
  if (!provider || !emailSenderReadiness(env, provider).participantDeliveryReady) {
    throw new Error("Participant email delivery is not ready for indexed activity.");
  }
  const canonicalRequest = new Request(publicAppOrigin(env, "https://openescrow.io/"));
  const deliveryKey = record.transaction_hash.slice(2);
  const deliveries = await sendOptedInAgreementActivityEmails(
    canonicalRequest,
    env,
    row,
    record.event_type,
    { deliveryKey, indexedOnchain: true },
    true,
  );
  const processedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE indexed_chain_events
         SET negotiation_id = ?, processing_status = ?, processed_at = ?
         WHERE chain_id = ? AND transaction_hash = ? AND log_index = ?`,
      )
      .bind(
        negotiationId,
        recordedInApp ? "recorded_in_app" : "processed",
        processedAt,
        record.chain_id,
        record.transaction_hash,
        record.log_index,
      ),
    ...deliveries.filter((delivery) => !delivery.duplicate).map((delivery) =>
      eventStatement(
        env.DB,
        negotiationId,
        processedAt,
        "system",
        "agreement_activity_notification_sent",
        `Sent the indexed ${record.event_type.replaceAll("_", " ")} notice to the opted-in ${delivery.recipientRole}.`,
        Number(row.revision),
        {
          eventType: record.event_type,
          recipientRole: delivery.recipientRole,
          messageId: delivery.messageId,
          indexedOnchain: true,
          transactionHash: record.transaction_hash,
          logIndex: record.log_index,
        },
      ),
    ),
  ]);
}

async function reconcilePendingIndexedEvents(env) {
  const pending = await env.DB
    .prepare(
      `SELECT * FROM indexed_chain_events
       WHERE processing_status IN ('pending', 'unmatched')
       ORDER BY CASE processing_status WHEN 'pending' THEN 0 ELSE 1 END,
                block_number, log_index
       LIMIT 100`,
    )
    .all();
  for (const record of pending.results || []) {
    await processIndexedChainEvent(env, record);
  }
}

async function runOnchainActivityIndexer(env, now = new Date()) {
  if (!env.DB || !onchainActivityIndexerEnabled(env)) return;
  await initialize(env.DB);
  const stateName = "base-sepolia-openescrow-activity";
  const deploymentBlock = configuredOpenEscrowDeploymentBlock(env);
  const startedAt = now.toISOString();
  await env.DB
    .prepare(
      `INSERT INTO onchain_indexer_state
         (name, next_block, last_started_at)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at`,
    )
    .bind(stateName, deploymentBlock, startedAt)
    .run();

  try {
    const rpcUrls = await baseSepoliaRpcUrls(env);
    if (!rpcUrls.length) throw new Error("No verified Base Sepolia RPC is available.");
    const latestHex = await indexedRpcResult(rpcUrls, "eth_blockNumber", []);
    const latestBlock = rpcHexNumber(latestHex);
    if (latestBlock === null) throw new Error("Base Sepolia returned an invalid block number.");
    const finalizedBlock = Math.max(0, latestBlock - ONCHAIN_INDEXER_CONFIRMATION_BLOCKS);
    let state = await env.DB
      .prepare("SELECT * FROM onchain_indexer_state WHERE name = ?")
      .bind(stateName)
      .first();
    let nextBlock = Math.max(deploymentBlock, Number(state?.next_block || deploymentBlock));
    const address = cleanText(
      env.OPEN_ESCROW_ADDRESS || DEFAULT_OPEN_ESCROW_ADDRESS,
      80,
    ).toLowerCase();
    if (!WALLET_PATTERN.test(address)) {
      throw new Error("The active OpenEscrow address is invalid.");
    }
    const topicFilter = Object.keys(INDEXED_OPEN_ESCROW_EVENTS);
    for (
      let range = 0;
      range < ONCHAIN_INDEXER_MAX_RANGES_PER_RUN && nextBlock <= finalizedBlock;
      range += 1
    ) {
      const toBlock = Math.min(
        finalizedBlock,
        nextBlock + ONCHAIN_INDEXER_BLOCK_RANGE - 1,
      );
      const result = await indexedRpcResult(
        rpcUrls,
        "eth_getLogs",
        [
          {
            address,
            topics: [topicFilter],
            fromBlock: `0x${nextBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      );
      if (!Array.isArray(result) || result.length > 5_000) {
        throw new Error("Base Sepolia returned an invalid activity-log result.");
      }
      const indexedAt = new Date().toISOString();
      let records = result
        .map((log) => indexedLogRecord(log, address, indexedAt))
        .filter(Boolean)
        .sort(
          (left, right) =>
            left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
        );
      const fullyFundedTransactions = new Set(
        records
          .filter((record) => record.eventType === "agreement_funded")
          .map(
            (record) => `${record.transactionHash}:${record.onchainAgreementId}`,
          ),
      );
      records = records.filter(
        (record) =>
          record.eventType !== "tenant_share_funded" ||
          !fullyFundedTransactions.has(
            `${record.transactionHash}:${record.onchainAgreementId}`,
          ),
      );
      for (const record of records) {
        const inserted = await env.DB
          .prepare(
            `INSERT OR IGNORE INTO indexed_chain_events
               (chain_id, contract_address, transaction_hash, log_index,
                block_number, block_hash, onchain_agreement_id, negotiation_id,
                event_type, processing_status, indexed_at, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending', ?, NULL)`,
          )
          .bind(
            record.chainId,
            record.contractAddress,
            record.transactionHash,
            record.logIndex,
            record.blockNumber,
            record.blockHash,
            record.onchainAgreementId,
            record.eventType,
            record.indexedAt,
          )
          .run();
        if (Number(inserted?.meta?.changes ?? inserted?.changes ?? 0) > 0) {
          await processIndexedChainEvent(env, {
            chain_id: record.chainId,
            contract_address: record.contractAddress,
            transaction_hash: record.transactionHash,
            log_index: record.logIndex,
            block_number: record.blockNumber,
            block_hash: record.blockHash,
            onchain_agreement_id: record.onchainAgreementId,
            negotiation_id: null,
            event_type: record.eventType,
            processing_status: "pending",
            indexed_at: record.indexedAt,
          });
        }
      }
      nextBlock = toBlock + 1;
      await env.DB
        .prepare(
          `UPDATE onchain_indexer_state
           SET next_block = ?, latest_finalized_block = ?,
               last_succeeded_at = ?, last_error = NULL
           WHERE name = ?`,
        )
        .bind(nextBlock, finalizedBlock, new Date().toISOString(), stateName)
        .run();
    }
    await reconcilePendingIndexedEvents(env);
    await env.DB
      .prepare(
        `UPDATE onchain_indexer_state
         SET latest_finalized_block = ?, last_succeeded_at = ?, last_error = NULL
         WHERE name = ?`,
      )
      .bind(finalizedBlock, new Date().toISOString(), stateName)
      .run();
  } catch (error) {
    await env.DB
      .prepare(
        `UPDATE onchain_indexer_state
         SET last_error = ? WHERE name = ?`,
      )
      .bind(
        cleanText(error instanceof Error ? error.message : "Indexer failed.", 500),
        stateName,
      )
      .run();
    throw error;
  }
}

async function fetchPrivyJwks(appId, forceRefresh = false) {
  const now = Date.now();
  const cached = privyJwksCache.get(appId);
  if (!forceRefresh && cached && now - cached.fetchedAt < PRIVY_JWKS_CACHE_TTL_MS) {
    return cached;
  }
  const inFlight = privyJwksRequestsInFlight.get(appId);
  if (inFlight) return inFlight;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRIVY_JWKS_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`,
        {
          headers: { accept: "application/json", "user-agent": "OpenEscrow/1.0" },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("Account verification is temporarily unavailable.");
      const jwks = await readBoundedJsonResponse(response, 128 * 1024);
      const keys = Array.isArray(jwks?.keys) ? jwks.keys.filter(usablePrivyJwk) : [];
      if (keys.length === 0 || keys.length > 20) {
        throw new Error("Account verification is temporarily unavailable.");
      }
      const entry = { fetchedAt: Date.now(), keys };
      if (privyJwksCache.size >= PRIVY_JWKS_CACHE_LIMIT && !privyJwksCache.has(appId)) {
        privyJwksCache.delete(privyJwksCache.keys().next().value);
      }
      privyJwksCache.set(appId, entry);
      return entry;
    } catch {
      throw new Error("Account verification is temporarily unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  })();
  privyJwksRequestsInFlight.set(appId, request);
  try {
    return await request;
  } finally {
    if (privyJwksRequestsInFlight.get(appId) === request) {
      privyJwksRequestsInFlight.delete(appId);
    }
  }
}

async function verifyPrivyIdentity(request, env) {
  const token = cleanText(request.headers.get("privy-id-token"), 20_000);
  const segments = token.split(".");
  if (segments.length !== 3) throw new Error("Sign in again to securely find account proposals.");

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJwtJson(encodedHeader);
  const payload = decodeJwtJson(encodedPayload);
  const appId = cleanText(env.PRIVY_APP_ID, 100) || PRIVY_APP_ID;
  const now = Math.floor(Date.now() / 1000);
  const audienceMatches =
    payload.aud === appId || (Array.isArray(payload.aud) && payload.aud.includes(appId));
  if (
    header.alg !== "ES256" ||
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    header.kid.length > 200 ||
    payload.iss !== "privy.io" ||
    !audienceMatches ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 500 ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now ||
    payload.exp > now + 24 * 60 * 60 ||
    (payload.nbf !== undefined &&
      (typeof payload.nbf !== "number" ||
        !Number.isFinite(payload.nbf) ||
        payload.nbf > now + 60)) ||
    (payload.iat !== undefined &&
      (typeof payload.iat !== "number" ||
        !Number.isFinite(payload.iat) ||
        payload.iat > now + 60))
  ) {
    throw new Error("The signed-in account could not be verified.");
  }

  let jwks = await fetchPrivyJwks(appId);
  let jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (
    !jwk &&
    Date.now() - jwks.fetchedAt >= PRIVY_JWKS_UNKNOWN_KEY_REFRESH_MS
  ) {
    jwks = await fetchPrivyJwks(appId, true);
    jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) throw new Error("The signed-in account uses an unknown verification key.");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    decodeJwtBytes(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw new Error("The signed-in account could not be verified.");

  let linkedAccounts = [];
  try {
    linkedAccounts =
      typeof payload.linked_accounts === "string"
        ? JSON.parse(payload.linked_accounts)
        : payload.linked_accounts;
  } catch {
    linkedAccounts = [];
  }
  const emails = [
    ...new Set(
      (Array.isArray(linkedAccounts) ? linkedAccounts : [])
        .flatMap((account) => [account?.email, account?.address])
        .map(normalizeEmail)
        .filter((email) => EMAIL_PATTERN.test(email)),
    ),
  ];
  if (!emails.length) {
    throw new Error("Link a verified Google or email account before finding proposals.");
  }
  return { userId: payload.sub, emails };
}

async function initialize(db) {
  const existing = databaseInitializationPromises.get(db);
  if (existing) return existing;
  const initialization = db.batch([
    db.prepare(AGREEMENTS_SCHEMA),
    db.prepare(AGREEMENT_LANDLORD_DISCOVERY_INDEX),
    db.prepare(AGREEMENT_ARBITER_DISCOVERY_INDEX),
    db.prepare(AGREEMENT_STATUS_UPDATED_INDEX),
    db.prepare(EVENTS_SCHEMA),
    db.prepare(EVENTS_INDEX),
    db.prepare(RECEIPT_GUARDS_SCHEMA),
    db.prepare(RECEIPT_GUARDS_BACKFILL),
    db.prepare(FINALIZATION_RECEIPT_ASSIGNMENT_GUARD),
    db.prepare(RECEIPT_GUARDS_TRIGGER),
    db.prepare(ACCOUNT_ACCESS_SCHEMA),
    db.prepare(ACCOUNT_ACCESS_INDEX),
    db.prepare(ACCOUNT_ACCESS_EXPIRES_INDEX),
    db.prepare(ACCOUNT_ACCESS_SESSION_INDEX),
    db.prepare(ACCOUNT_ACCESS_USER_INDEX),
    db.prepare(ACCOUNT_RECORD_ARCHIVES_SCHEMA),
    db.prepare(ACCOUNT_RECORD_ARCHIVES_INDEX),
    db.prepare(NOTIFICATION_PREFERENCES_SCHEMA),
    db.prepare(NOTIFICATION_PREFERENCES_EMAIL_INDEX),
    db.prepare(EVIDENCE_FILES_SCHEMA),
    db.prepare(EVIDENCE_FILES_INDEX),
    db.prepare(NOTIFICATION_UNSUBSCRIBE_SCHEMA),
    db.prepare(NOTIFICATION_DELIVERIES_SCHEMA),
    db.prepare(NOTIFICATION_DELIVERIES_INDEX),
    db.prepare(NOTIFICATION_DELIVERIES_PROVIDER_INDEX),
    db.prepare(NOTIFICATION_DELIVERY_EVENTS_SCHEMA),
    db.prepare(NOTIFICATION_DELIVERY_EVENTS_INDEX),
    db.prepare(NOTIFICATION_SUPPRESSIONS_SCHEMA),
    db.prepare(NOTIFICATION_SUPPRESSIONS_INDEX),
    db.prepare(NEGOTIATION_TENANTS_SCHEMA),
    db.prepare(NEGOTIATION_TENANTS_INDEX),
    db.prepare(NEGOTIATION_TENANTS_DISCOVERY_INDEX),
    db.prepare(ACCOUNT_ACCESS_CONTEXT_SCHEMA),
    db.prepare(ARBITER_REPLACEMENT_ACCESS_SCHEMA),
    db.prepare(ARBITER_REPLACEMENT_ACCESS_INDEX),
    db.prepare(ARBITER_REPLACEMENT_DISCOVERY_INDEX),
    db.prepare(ARBITER_REPLACEMENT_ACCOUNT_ACCESS_SCHEMA),
    db.prepare(ARBITER_REPLACEMENT_ACCOUNT_ACCESS_INDEX),
    db.prepare(FUNDING_CHECKOUT_ATTEMPTS_SCHEMA),
    db.prepare(FUNDING_CHECKOUT_ATTEMPTS_HISTORY_INDEX),
    db.prepare(FUNDING_CHECKOUT_ATTEMPTS_ACTIVE_INDEX),
    db.prepare(FUNDING_CHECKOUT_EVENTS_SCHEMA),
    db.prepare(FUNDING_CHECKOUT_EVENTS_INDEX),
    db.prepare(FUNDING_CHECKOUT_EVENTS_RECONCILIATION_INDEX),
    db.prepare(FUNDING_CHECKOUT_EVENTS_PROVENANCE_INSERT_GUARD),
    db.prepare(FUNDING_CHECKOUT_EVENTS_PROVENANCE_UPDATE_GUARD),
    db.prepare(BACKFILL_PRIMARY_TENANTS),
    db.prepare(SCHEDULED_JOB_RUNS_SCHEMA),
    db.prepare(ONCHAIN_INDEXER_STATE_SCHEMA),
    db.prepare(INDEXED_CHAIN_EVENTS_SCHEMA),
    db.prepare(INDEXED_CHAIN_EVENTS_RECONCILIATION_INDEX),
    db.prepare(INDEXED_CHAIN_EVENTS_NEGOTIATION_INDEX),
    db.prepare(SCHEDULED_IN_APP_NOTIFICATION_INDEX),
    db.prepare(COMPLIANCE_SOURCE_CHECKS_SCHEMA),
    db.prepare(COMPLIANCE_SOURCE_CHECKS_INDEX),
    db.prepare(API_RATE_LIMITS_SCHEMA),
    db.prepare(API_RATE_LIMITS_UPDATED_INDEX),
    db.prepare(SQLITE_OPTIMIZE),
  ]);
  databaseInitializationPromises.set(db, initialization);
  try {
    await initialization;
  } catch (error) {
    databaseInitializationPromises.delete(db);
    throw error;
  }
}

async function ensureUnsubscribeToken(db, userId) {
  const existing = await db
    .prepare("SELECT token FROM notification_unsubscribe_tokens WHERE user_id = ?")
    .bind(userId)
    .first();
  if (existing?.token) return existing.token;
  const token = randomToken();
  await db
    .prepare(
      "INSERT INTO notification_unsubscribe_tokens (user_id, token, created_at) VALUES (?, ?, ?)",
    )
    .bind(userId, token, new Date().toISOString())
    .run();
  return token;
}

async function unsubscribeUrlFor(db, origin, email) {
  const preference = await db
    .prepare(
      `SELECT user_id
       FROM notification_preferences
       WHERE lower(email) = lower(?) AND consented_at IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(email)
    .first();
  if (!preference?.user_id) return null;
  const token = await ensureUnsubscribeToken(db, preference.user_id);
  const url = new URL("/api/notifications/unsubscribe", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

async function unsubscribe(request, env) {
  const token = cleanText(new URL(request.url).searchParams.get("token"), 200);
  if (!token) return json({ error: "This unsubscribe link is incomplete." }, 400);
  const row = await env.DB
    .prepare("SELECT user_id FROM notification_unsubscribe_tokens WHERE token = ?")
    .bind(token)
    .first();
  if (!row?.user_id) return json({ error: "This unsubscribe link is invalid." }, 404);
  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `UPDATE notification_preferences
       SET agreement_activity = 0, deadline_reminders = 0, consented_at = NULL, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(now, row.user_id)
    .run();
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenEscrow notifications</title><body style="font-family:system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem;color:#171923"><h1>Email notifications are off</h1><p>Optional agreement-activity and deadline-reminder emails have been disabled for this OpenEscrow account. Required invitation or deduction-claim notices may still be sent as part of an active agreement.</p><p><a href="/">Return to OpenEscrow</a></p></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

async function notificationPreferences(request, env) {
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The signed-in account could not be verified.",
      },
      401,
    );
  }

  let existing = await env.DB
    .prepare("SELECT * FROM notification_preferences WHERE user_id = ?")
    .bind(identity.userId)
    .first();
  const suppression = await env.DB
    .prepare("SELECT reason, updated_at FROM notification_suppressions WHERE email = ?")
    .bind(identity.emails[0])
    .first();
  if (request.method === "GET") {
    if (!existing) {
      const now = new Date().toISOString();
      const enabledByDefault = !suppression;
      await env.DB
        .prepare(
          `INSERT INTO notification_preferences
           (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO NOTHING`,
        )
        .bind(
          identity.userId,
          identity.emails[0],
          enabledByDefault ? 1 : 0,
          enabledByDefault ? 1 : 0,
          enabledByDefault ? now : null,
          now,
        )
        .run();
      existing = await env.DB
        .prepare("SELECT * FROM notification_preferences WHERE user_id = ?")
        .bind(identity.userId)
        .first();
      if (enabledByDefault) {
        await ensureUnsubscribeToken(env.DB, identity.userId);
      }
    }
    return json({
      agreementActivity: existing?.agreement_activity === 1,
      deadlineReminders: existing?.deadline_reminders === 1,
      consentedAt: existing?.consented_at || null,
      updatedAt: existing?.updated_at || null,
      deliveryPaused: Boolean(suppression),
      deliveryPauseReason: suppression?.reason || null,
      deliveryPausedAt: suppression?.updated_at || null,
    });
  }

  const body = await request.json();
  if (
    typeof body.agreementActivity !== "boolean" ||
    typeof body.deadlineReminders !== "boolean"
  ) {
    return json({ error: "Choose valid notification preferences." }, 400);
  }
  const now = new Date().toISOString();
  const enabled = body.agreementActivity || body.deadlineReminders;
  if (enabled && suppression) {
    return json(
      {
        error:
          suppression.reason === "complained"
            ? "Email notifications stay off because this address marked a prior OpenEscrow message as spam."
            : "Email notifications stay off because the email provider could not safely deliver to this address.",
        code: "email-delivery-paused",
      },
      409,
    );
  }
  const consentedAt = enabled ? existing?.consented_at || now : null;
  await env.DB
    .prepare(
      `INSERT INTO notification_preferences
       (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         agreement_activity = excluded.agreement_activity,
         deadline_reminders = excluded.deadline_reminders,
         consented_at = excluded.consented_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      identity.userId,
      identity.emails[0],
      body.agreementActivity ? 1 : 0,
      body.deadlineReminders ? 1 : 0,
      consentedAt,
      now,
    )
    .run();
  if (enabled) await ensureUnsubscribeToken(env.DB, identity.userId);
  return json({
    agreementActivity: body.agreementActivity,
    deadlineReminders: body.deadlineReminders,
    consentedAt,
    updatedAt: now,
  });
}

async function serviceReadiness(env) {
  let schedulerLastRunAt = null;
  let onchainIndexerState = null;
  let onchainIndexerPendingEvents = 0;
  let onchainIndexerUnmatchedEvents = 0;
  let complianceSourceLastRunAt = null;
  let referencedEvidenceKeys = [];
  let complianceSourceStats = {
    tracked: 0,
    changed: 0,
    unreachable: 0,
    manualReviewCurrent: 0,
    pending: 0,
    stale: 0,
    blocked: 0,
  };
  if (env.DB) {
    await initialize(env.DB);
    const evidenceKeyRows = await env.DB
      .prepare(
        `SELECT DISTINCT encryption_key_id, encryption_key_fingerprint
         FROM evidence_files
         WHERE encryption_version IS NOT NULL
           AND encryption_key_id IS NOT NULL
           AND encryption_key_id <> ''`,
      )
      .all();
    referencedEvidenceKeys = (evidenceKeyRows.results || []).map((row) => ({
      keyId: String(row.encryption_key_id),
      fingerprint: cleanText(row.encryption_key_fingerprint, 80).toLowerCase(),
    }));
    const scheduledRun = await env.DB
      .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
      .bind("notification-reminders")
      .first();
    schedulerLastRunAt = scheduledRun?.last_started_at || null;
    onchainIndexerState = await env.DB
      .prepare("SELECT * FROM onchain_indexer_state WHERE name = ?")
      .bind("base-sepolia-openescrow-activity")
      .first();
    const pendingIndexedEvents = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count FROM indexed_chain_events
         WHERE processing_status = 'pending'`,
      )
      .first();
    onchainIndexerPendingEvents = Number(pendingIndexedEvents?.count || 0);
    const unmatchedIndexedEvents = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count FROM indexed_chain_events
         WHERE processing_status = 'unmatched'`,
      )
      .first();
    onchainIndexerUnmatchedEvents = Number(unmatchedIndexedEvents?.count || 0);
    const sourceRun = await env.DB
      .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
      .bind("compliance-source-monitor")
      .first();
    complianceSourceLastRunAt = sourceRun?.last_started_at || null;
    const sourceRows = await env.DB
      .prepare(
        `SELECT source_key, profile_version, url, baseline_signature,
                current_signature, status, last_checked_at, last_verified_at, error
         FROM compliance_source_checks`,
      )
      .all();
    const rows = sourceRows.results || [];
    const rowByKey = new Map(rows.map((row) => [row.source_key, row]));
    const sourceEvaluationTime = Date.now();
    const staleBefore = sourceEvaluationTime - COMPLIANCE_SOURCE_FRESHNESS_MS;
    const blockedKeys = new Set();
    let tracked = 0;
    let changed = 0;
    let unreachable = 0;
    let manualReviewCurrent = 0;
    let pending = 0;
    let stale = 0;
    for (const expected of COMPLIANCE_SOURCE_REGISTRY) {
      const row = rowByKey.get(expected.key);
      if (!row) {
        blockedKeys.add(expected.key);
        continue;
      }
      tracked += 1;
      const verifiedAt = row.last_verified_at
        ? new Date(row.last_verified_at).getTime()
        : Number.NaN;
      const versionMatches =
        expected.version === row.profile_version && expected.url === row.url;
      const monitoringException = currentComplianceSourceMonitoringException(
        expected,
        row,
        new Date(sourceEvaluationTime),
      );
      const signatureMatches = Boolean(
        row.baseline_signature &&
          row.baseline_signature === row.current_signature,
      );
      if (row.status === "changed") changed += 1;
      if (row.status === "unreachable") unreachable += 1;
      if (monitoringException) manualReviewCurrent += 1;
      if (row.status === "pending") pending += 1;
      const isStale =
        !monitoringException &&
        (!Number.isFinite(verifiedAt) ||
          verifiedAt < staleBefore ||
          verifiedAt > sourceEvaluationTime);
      if (isStale) stale += 1;
      if (
        !versionMatches ||
        (!monitoringException && !signatureMatches) ||
        row.status === "changed" ||
        row.status === "pending" ||
        isStale
      ) {
        blockedKeys.add(expected.key);
      }
    }
    complianceSourceStats = {
      tracked,
      changed,
      unreachable,
      manualReviewCurrent,
      pending,
      stale,
      blocked: blockedKeys.size,
    };
  }
  const provider = emailProvider(env);
  const nowMs = Date.now();
  const schedulerLastRunMs = schedulerLastRunAt
    ? Date.parse(schedulerLastRunAt)
    : Number.NaN;
  const complianceSourceLastRunMs = complianceSourceLastRunAt
    ? Date.parse(complianceSourceLastRunAt)
    : Number.NaN;
  const schedulerHealthy =
    env.DB &&
    Number.isFinite(schedulerLastRunMs) &&
    nowMs - schedulerLastRunMs <= HOSTED_NOTIFICATION_SCHEDULER_GRACE_MS &&
    nowMs >= schedulerLastRunMs;
  const complianceSourceBootstrapInProgress =
    complianceSourceStats.tracked < COMPLIANCE_SOURCE_REGISTRY.length ||
    complianceSourceStats.pending > 0;
  const complianceSourceCurrentIntervalMs = complianceSourceBootstrapInProgress
    ? COMPLIANCE_SOURCE_BOOTSTRAP_INTERVAL_MS
    : COMPLIANCE_SOURCE_MONITOR_INTERVAL_MS;
  const complianceSourceMonitorHealthy =
    env.DB &&
    env.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true" &&
    Number.isFinite(complianceSourceLastRunMs) &&
    nowMs - complianceSourceLastRunMs <= 2 * complianceSourceCurrentIntervalMs &&
    nowMs >= complianceSourceLastRunMs;
  const schedulerAgeMinutes =
    !Number.isFinite(schedulerLastRunMs)
      ? null
      : Math.max(0, Math.round((nowMs - schedulerLastRunMs) / (60 * 1000)));
  const onchainIndexerLastSuccessMs = onchainIndexerState?.last_succeeded_at
    ? Date.parse(onchainIndexerState.last_succeeded_at)
    : Number.NaN;
  const onchainIndexerNextBlock = Number(onchainIndexerState?.next_block);
  const onchainIndexerLatestFinalizedBlock = Number(
    onchainIndexerState?.latest_finalized_block,
  );
  const onchainIndexerCaughtUp =
    Number.isSafeInteger(onchainIndexerNextBlock) &&
    Number.isSafeInteger(onchainIndexerLatestFinalizedBlock) &&
    onchainIndexerNextBlock > onchainIndexerLatestFinalizedBlock;
  const onchainIndexerHealthy =
    onchainActivityIndexerEnabled(env) &&
    Number.isFinite(onchainIndexerLastSuccessMs) &&
    nowMs - onchainIndexerLastSuccessMs <= ONCHAIN_INDEXER_HEALTH_GRACE_MS &&
    nowMs >= onchainIndexerLastSuccessMs &&
    onchainIndexerCaughtUp &&
    onchainIndexerPendingEvents === 0 &&
    !onchainIndexerState?.last_error;
  const complianceSourceMonitorAgeMinutes = !Number.isFinite(
    complianceSourceLastRunMs,
  )
    ? null
    : Math.max(0, Math.round((nowMs - complianceSourceLastRunMs) / (60 * 1000)));
  const evidenceEncryption = await evidenceEncryptionReadiness(env);
  const referencedEvidenceKeyIds = [
    ...new Set(referencedEvidenceKeys.map((key) => key.keyId)),
  ];
  const missingEvidenceKeyCount = referencedEvidenceKeyIds.filter(
    (keyId) => !evidenceEncryption.availableKeyIds.has(keyId),
  ).length;
  const unverifiedEvidenceKeyIds = new Set(
    referencedEvidenceKeys
      .filter(
        ({ fingerprint }) => !/^sha256:[0-9a-f]{64}$/.test(fingerprint),
      )
      .map(({ keyId }) => keyId),
  );
  const mismatchedEvidenceKeyIds = new Set(
    referencedEvidenceKeys
      .filter(
        ({ keyId, fingerprint }) =>
          /^sha256:[0-9a-f]{64}$/.test(fingerprint) &&
          evidenceEncryption.keyFingerprints.has(keyId) &&
          evidenceEncryption.keyFingerprints.get(keyId) !== fingerprint,
      )
      .map(({ keyId }) => keyId),
  );
  const decentralizedReady = Boolean(
    env.PINATA_JWT && evidenceEncryption.configured,
  );
  const evidenceMode =
    cleanText(env.EVIDENCE_STORAGE_MODE, 40) === "encrypted-ipfs" &&
    decentralizedReady
      ? "encrypted-ipfs"
      : env.EVIDENCE
        ? "private-r2"
        : decentralizedReady
          ? "encrypted-ipfs"
          : "unconfigured";
  const registryReadiness = await activityRegistryReadiness(env);
  const senderReadiness = emailSenderReadiness(env, provider);
  return json({
    release: RELEASE_PROVENANCE,
    email: {
      configured: Boolean(provider),
      provider,
      participantDeliveryReady: senderReadiness.participantDeliveryReady,
      senderMode: senderReadiness.senderMode,
      deliveryStatusConfigured: Boolean(
        provider === "resend"
          ? cleanText(env.RESEND_WEBHOOK_SECRET, 500).startsWith("whsec_")
          : provider === "webhook" &&
              cleanText(env.EMAIL_WEBHOOK_STATUS_TRACKING, 20).toLowerCase() === "true",
      ),
      schedulerConfigured: Boolean(env.DB),
      schedulerLastRunAt,
      schedulerHealthy,
      schedulerExpectedIntervalMinutes:
        HOSTED_NOTIFICATION_SCHEDULER_INTERVAL_MS / (60 * 1000),
      schedulerAgeMinutes,
    },
    evidence: {
      configured: Boolean(env.EVIDENCE || decentralizedReady),
      mode: evidenceMode,
      encryptedAtRest: evidenceEncryption.configured,
      activeEncryptionKeyId: evidenceEncryption.activeKeyId,
      retainedDecryptionKeyCount: evidenceEncryption.retainedKeyCount,
      referencedEncryptionKeyCount: referencedEvidenceKeyIds.length,
      missingDecryptionKeyCount: missingEvidenceKeyCount,
      unverifiedEncryptionKeyCount: unverifiedEvidenceKeyIds.size,
      mismatchedDecryptionKeyCount: mismatchedEvidenceKeyIds.size,
      keyringReady:
        evidenceEncryption.configured &&
        missingEvidenceKeyCount === 0 &&
        unverifiedEvidenceKeyIds.size === 0 &&
        mismatchedEvidenceKeyIds.size === 0,
      encryptionError: evidenceEncryption.error,
      decentralizedReady,
      contentTypeValidation: true,
    },
    recordIntegrity: {
      lifecycleStateGuards: true,
      transactionReceiptVerification: receiptVerificationEnabled(env),
      chain: "Base Sepolia",
      activityRegistry: registryReadiness,
      activityIndexer: {
        configured: onchainActivityIndexerEnabled(env),
        healthy: onchainIndexerHealthy,
        caughtUp: onchainIndexerCaughtUp,
        lastStartedAt: onchainIndexerState?.last_started_at || null,
        lastSucceededAt: onchainIndexerState?.last_succeeded_at || null,
        nextBlock: onchainIndexerState?.next_block ?? null,
        latestFinalizedBlock:
          onchainIndexerState?.latest_finalized_block ?? null,
        pendingEventCount: onchainIndexerPendingEvents,
        unmatchedEventCount: onchainIndexerUnmatchedEvents,
        error: onchainIndexerState?.last_error || null,
        confirmationBlocks: ONCHAIN_INDEXER_CONFIRMATION_BLOCKS,
      },
    },
    addressValidation: {
      configured: addressAttestationConfigured(
        env.ADDRESS_ATTESTATION_SECRET,
      ),
      provider: "Photon / OpenStreetMap",
      tamperResistantProfiles: true,
    },
    complianceSources: {
      configured: env.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true",
      proposalGateEnforced:
        env.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true",
      total: COMPLIANCE_SOURCE_REGISTRY.length,
      ...complianceSourceStats,
      lastRunAt: complianceSourceLastRunAt,
      monitorHealthy: complianceSourceMonitorHealthy,
      monitorExpectedIntervalMinutes:
        COMPLIANCE_SOURCE_MONITOR_INTERVAL_MS / (60 * 1000),
      monitorCurrentIntervalMinutes:
        complianceSourceCurrentIntervalMs / (60 * 1000),
      bootstrapInProgress: complianceSourceBootstrapInProgress,
      monitorLastRunAgeMinutes: complianceSourceMonitorAgeMinutes,
      maxVerificationAgeDays:
        COMPLIANCE_SOURCE_FRESHNESS_MS / (24 * 60 * 60 * 1000),
      ready:
        env.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true" &&
        complianceSourceStats.tracked === COMPLIANCE_SOURCE_REGISTRY.length &&
        complianceSourceStats.blocked === 0 &&
        Boolean(
          complianceSourceLastRunAt &&
            Date.now() - new Date(complianceSourceLastRunAt).getTime() <
              48 * 60 * 60 * 1000,
        ),
    },
  });
}

async function sendTestEmail(request, env) {
  if (!env.DB) return json({ error: "Account preference storage is not available." }, 503);
  if (!emailProvider(env)) {
    return json({ error: "Automatic email delivery is not configured yet." }, 503);
  }
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Sign in again to send a test email." },
      401,
    );
  }
  const email = identity.emails[0];
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const recipientKey = (await hashToken(email)).slice(0, 24);
  const idempotencyKey = `email-test:${recipientKey}:${timeBucket}`;
  const delivered = await deliverTrackedEmail(env, {
    recipientEmail: email,
    notificationType: "email_configuration_test",
    subject: "Your OpenEscrow email notifications are ready",
    text: [
      "This test confirms that OpenEscrow can deliver automatic agreement and deadline notifications to this verified account.",
      "Private agreement details, addresses, amounts, evidence, and notes are intentionally omitted from notification emails.",
      "You can change your notification preferences from the signed-in OpenEscrow account panel.",
    ].join("\n\n"),
    idempotencyKey,
  });
  if (!delivered?.id) {
    return json({ error: "The email provider rejected the test message." }, 502);
  }
  return json({
    sent: true,
    duplicate: Boolean(delivered.duplicate),
    provider: delivered.provider,
    messageId: delivered.id,
  });
}

async function sendLandlordIntroduction(request, env) {
  if (!env.DB) return json({ error: "Email delivery tracking is not available." }, 503);
  const provider = emailProvider(env);
  if (!provider) {
    return json({ error: "Automatic email delivery is not configured yet." }, 503);
  }
  if (!emailSenderReadiness(env, provider).participantDeliveryReady) {
    return json(
      { error: "Participant email delivery is waiting for the OpenEscrow sending domain." },
      503,
    );
  }

  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Sign in again to send this invitation." },
      401,
    );
  }

  const body = await request.json().catch(() => ({}));
  const recipientEmail = normalizeEmail(body.landlordEmail);
  if (!EMAIL_PATTERN.test(recipientEmail)) {
    return json({ error: "Enter a valid landlord email address." }, 400);
  }
  const inviterEmail = identity.emails[0];
  const recipientKey = (await hashToken(recipientEmail)).slice(0, 24);
  const inviterKey = (await hashToken(identity.userId)).slice(0, 24);
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const appUrl = publicAppOriginForRequest(request, env);
  const delivered = await deliverTrackedEmail(env, {
    recipientEmail,
    notificationType: "landlord_introduction",
    subject: "Your tenant invited you to OpenEscrow",
    text: [
      `A tenant signed in as ${inviterEmail} invited you to try OpenEscrow, a free and open-source security-deposit application.`,
      "OpenEscrow helps landlords and tenants agree on deposit terms, document deductions, and keep a timestamped record of approvals and disputes.",
      `Open OpenEscrow and sign in with this email address: ${appUrl}`,
      "Choose “I am a landlord,” create the proposal, and send the tenant their private review invitation.",
      "This introduction does not grant access to the tenant's account or any agreement record.",
      "OpenEscrow is a Base Sepolia testnet prototype. Do not send real funds or upload real tenancy documents.",
    ].join("\n\n"),
    idempotencyKey: `landlord-introduction:${inviterKey}:${recipientKey}:${timeBucket}`,
  });
  if (!delivered?.id) {
    return json({ error: "The email provider could not deliver this invitation." }, 502);
  }
  return json({
    sent: true,
    duplicate: Boolean(delivered.duplicate),
    provider: delivered.provider,
    messageId: delivered.id,
  });
}

async function sendProposalInvitation(request, env, proposalId) {
  if (!env.DB) return json({ error: "Email delivery tracking is not available." }, 503);
  const body = await request.json().catch(() => ({}));
  const validateOnly = body.validateOnly === true;
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(env.DB, row, cleanText(body.token, 500));
  if (role !== "landlord") {
    return json({ error: "Only the landlord may send proposal invitations." }, 403);
  }
  if (row.status === "cancelled" || row.status === "superseded") {
    return json({ error: "This proposal no longer accepts invitation emails." }, 409);
  }

  const provider = validateOnly ? null : emailProvider(env);
  if (!validateOnly && !provider) {
    return json({ error: "Automatic email delivery is not configured yet." }, 503);
  }
  if (
    !validateOnly &&
    !emailSenderReadiness(env, provider).participantDeliveryReady
  ) {
    return json(
      { error: "Participant email delivery is waiting for the OpenEscrow sending domain." },
      503,
    );
  }

  const invitedRole = body.invitedRole;
  if (invitedRole !== "tenant" && invitedRole !== "arbiter") {
    return json({ error: "Choose a valid participant invitation." }, 400);
  }

  let recipientEmail;
  let expectedTokenHash;
  let invitedTenant = null;
  if (invitedRole === "tenant") {
    const invitedTenantId = cleanText(body.invitedTenantId, 100);
    if (!invitedTenantId) {
      return json({ error: "Choose the tenant who should receive this invitation." }, 400);
    }
    invitedTenant = await env.DB
      .prepare(
        `SELECT id, email, token_hash, approved_revision
         FROM negotiation_tenants
         WHERE negotiation_id = ? AND id = ?`,
      )
      .bind(proposalId, invitedTenantId)
      .first();
    if (!invitedTenant) {
      return json({ error: "The selected tenant is not part of this proposal." }, 404);
    }
    recipientEmail = normalizeEmail(invitedTenant.email);
    expectedTokenHash = cleanText(invitedTenant.token_hash, 200);
  } else {
    if (cleanText(body.invitedTenantId, 100)) {
      return json({ error: "An arbiter invitation cannot target a tenant." }, 400);
    }
    recipientEmail = normalizeEmail(row.arbiter_email);
    expectedTokenHash = cleanText(row.arbiter_token_hash, 200);
    if (!recipientEmail || !expectedTokenHash) {
      return json({ error: "This proposal does not include an arbiter." }, 404);
    }
  }

  let suppliedUrl;
  try {
    suppliedUrl = new URL(cleanText(body.invitationUrl, 2000));
  } catch {
    return json({ error: "Create a new invitation link before sending this email." }, 400);
  }
  const queryKeys = [...new Set([...suppliedUrl.searchParams.keys()])].sort();
  const fragment = new URLSearchParams(
    suppliedUrl.hash.startsWith("#") ? suppliedUrl.hash.slice(1) : suppliedUrl.hash,
  );
  const fragmentKeys = [...new Set([...fragment.keys()])].sort();
  const invitationToken = invitationTokenFromFragment(suppliedUrl);
  if (
    suppliedUrl.protocol !== "https:" ||
    suppliedUrl.username ||
    suppliedUrl.password ||
    (suppliedUrl.pathname !== "/" && suppliedUrl.pathname !== "/index.html") ||
    suppliedUrl.searchParams.getAll("invite").length !== 1 ||
    suppliedUrl.searchParams.get("invite") !== invitedRole ||
    suppliedUrl.searchParams.getAll("proposal").length !== 1 ||
    suppliedUrl.searchParams.get("proposal") !== proposalId ||
    queryKeys.join(",") !== "invite,proposal" ||
    fragmentKeys.join(",") !== "token" ||
    !invitationToken
  ) {
    return json({ error: "The participant invitation link does not match this proposal." }, 400);
  }
  const suppliedTokenHash = await hashToken(invitationToken);
  if (!expectedTokenHash || suppliedTokenHash !== expectedTokenHash) {
    return json({ error: "This invitation link was replaced. Send the current link instead." }, 409);
  }

  if (validateOnly) {
    return json({ current: true, recipientEmail });
  }

  const canonicalUrl = new URL(publicAppOriginForRequest(request, env));
  canonicalUrl.pathname = "/";
  canonicalUrl.searchParams.set("invite", invitedRole);
  canonicalUrl.searchParams.set("proposal", proposalId);
  canonicalUrl.hash = `token=${encodeURIComponent(invitationToken)}`;

  const participantLabel = invitedRole === "tenant" ? "tenant" : "optional arbiter";
  const recordReady = row.status === "finalized";
  const targetKey = invitedRole === "tenant" ? invitedTenant.id : "arbiter";
  const notificationType =
    invitedRole === "tenant" ? "proposal_invitation_tenant" : "proposal_invitation_arbiter";
  const deliveryKeyPrefix =
    `proposal-invitation:${proposalId}:${invitedRole}:${targetKey}:` +
    `${suppliedTokenHash.slice(0, 24)}:`;
  const cooldownStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let recentDelivery;
  try {
    recentDelivery = await env.DB
      .prepare(
        `SELECT idempotency_key, status, provider_message_id, sent_at
         FROM notification_deliveries
         WHERE negotiation_id = ?
           AND recipient_email = ?
           AND notification_type = ?
           AND idempotency_key LIKE ?
           AND status IN ('sent', 'delivered', 'delayed')
           AND provider_message_id IS NOT NULL
           AND sent_at >= ?
         ORDER BY sent_at DESC
         LIMIT 1`,
      )
      .bind(
        proposalId,
        recipientEmail,
        notificationType,
        `${deliveryKeyPrefix}%`,
        cooldownStartedAt,
      )
      .first();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "proposal_invitation_step_failed",
        step: "recent_delivery_lookup",
      }),
    );
    throw error;
  }
  const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  let delivered;
  try {
    delivered = recentDelivery
      ? {
          id: String(recentDelivery.provider_message_id),
          provider,
          duplicate: true,
          pending: false,
          status: recentDelivery.status,
          sentAt: recentDelivery.sent_at,
          idempotencyKey: recentDelivery.idempotency_key,
        }
      : await deliverTrackedEmail(env, {
          negotiationId: proposalId,
          recipientEmail,
          notificationType,
          subject: recordReady
            ? "Open your OpenEscrow agreement record"
            : "Review an OpenEscrow agreement proposal",
          text: [
            recordReady
              ? `You have access to an OpenEscrow agreement record as the ${participantLabel}.`
              : `A landlord invited you to review an OpenEscrow security-deposit proposal as the ${participantLabel}.`,
            recordReady
              ? `Open your record: ${canonicalUrl.toString()}`
              : `Review the terms, request a change, or approve the current revision: ${canonicalUrl.toString()}`,
            "This role-locked link is intended only for the invited participant. Do not forward it.",
            "Sign in using the invited email address to keep access connected to your OpenEscrow account.",
            "OpenEscrow is a Base Sepolia testnet prototype. Do not send real funds or upload real tenancy documents.",
          ].join("\n\n"),
          idempotencyKey: `${deliveryKeyPrefix}${timeBucket}`,
        });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "proposal_invitation_step_failed",
        step: "tracked_delivery",
      }),
    );
    throw error;
  }
  if (delivered?.pending) {
    return json(
      {
        sent: false,
        pending: true,
        duplicate: true,
        provider: delivered.provider,
        recipientEmail,
      },
      202,
    );
  }
  if (!delivered?.id) {
    return json({ error: "The email provider could not deliver this invitation." }, 502);
  }

  const eventAt = delivered.sentAt || new Date(Date.now()).toISOString();
  const eventMetadata = {
    invitedRole,
    tenantId: invitedTenant?.id || null,
    provider: delivered.provider,
    messageId: delivered.id,
    deliveryKey: delivered.idempotencyKey,
  };
  await env.DB
    .prepare(
      `INSERT INTO negotiation_events
       (negotiation_id, created_at, actor_role, action, summary, revision, metadata_json)
       SELECT ?, ?, 'landlord', 'invitation_sent', ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1
         FROM negotiation_events
         WHERE negotiation_id = ?
           AND action = 'invitation_sent'
           AND json_extract(metadata_json, '$.deliveryKey') = ?
       )`,
    )
    .bind(
      proposalId,
      eventAt,
      `Sent the ${participantLabel} invitation email.`,
      Number(row.revision),
      JSON.stringify(eventMetadata),
      proposalId,
      delivered.idempotencyKey,
    )
    .run();

  return json({
    sent: true,
    duplicate: Boolean(delivered.duplicate),
    provider: delivered.provider,
    messageId: delivered.id,
    recipientEmail,
  });
}

async function discoverNegotiations(request, env) {
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The signed-in account could not be verified.",
      },
      401,
    );
  }

  const body = await request.json();
  const role = body.role;
  const placeholders = identity.emails.map(() => "?").join(", ");
  let result;
  if (role === "tenant") {
    result = await env.DB
      .prepare(
        `SELECT negotiation.*, tenant.id AS participant_id
         FROM agreement_negotiations negotiation
         JOIN negotiation_tenants tenant ON tenant.negotiation_id = negotiation.id
         WHERE lower(tenant.email) IN (${placeholders})
         ORDER BY negotiation.updated_at DESC`,
      )
      .bind(...identity.emails)
      .all();
  } else if (role === "landlord") {
    result = await env.DB
      .prepare(
        `SELECT * FROM agreement_negotiations
         WHERE lower(landlord_email) IN (${placeholders})
         ORDER BY updated_at DESC`,
      )
      .bind(...identity.emails)
      .all();
  } else if (role === "arbiter") {
    result = await env.DB
      .prepare(
        `WITH matching_negotiations AS (
           SELECT id
           FROM agreement_negotiations
           WHERE lower(arbiter_email) IN (${placeholders})
           UNION
           SELECT negotiation_id
           FROM arbiter_replacement_access
           WHERE status = 'confirmed'
             AND lower(email) IN (${placeholders})
         )
         SELECT negotiation.*, replacement.email AS replacement_email
         FROM matching_negotiations matching
         JOIN agreement_negotiations negotiation
           ON negotiation.id = matching.id
         LEFT JOIN arbiter_replacement_access replacement
           ON replacement.negotiation_id = negotiation.id
          AND replacement.status = 'confirmed'
         ORDER BY negotiation.updated_at DESC`,
      )
      .bind(...identity.emails, ...identity.emails)
      .all();
  } else {
    return json({ error: "Choose a valid account role before searching." }, 400);
  }
  const rows = result.results || [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCOUNT_ACCESS_LIFETIME_MS).toISOString();
  const accesses = [];
  const archiveResult = await env.DB
    .prepare(
      `SELECT negotiation_id
       FROM account_record_archives
       WHERE user_id = ? AND role = ?`,
    )
    .bind(identity.userId, role)
    .all();
  const archivedNegotiationIds = new Set(
    (archiveResult.results || []).map((archive) => archive.negotiation_id),
  );

  await env.DB
    .prepare("DELETE FROM negotiation_account_access WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();
  const sessionStatementGroups = [];
  for (const row of rows) {
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const statements = [
      env.DB
        .prepare(
          "INSERT INTO negotiation_account_access (negotiation_id, user_id, role, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(row.id, identity.userId, role, tokenHash, now.toISOString(), expiresAt),
    ];
    if (role === "tenant" && row.participant_id) {
      statements.push(
        env.DB
          .prepare(
            "INSERT INTO negotiation_account_access_context (token_hash, tenant_id) VALUES (?, ?)",
          )
          .bind(tokenHash, row.participant_id),
      );
    }
    if (
      role === "arbiter" &&
      identity.emails.includes(normalizeEmail(row.replacement_email))
    ) {
      statements.push(
        env.DB
          .prepare(
            `INSERT INTO arbiter_replacement_account_access
             (token_hash, negotiation_id) VALUES (?, ?)`,
          )
          .bind(tokenHash, row.id),
      );
    }
    if (role === "tenant" && row.participant_id) {
      statements.push(
        env.DB
          .prepare(
            `DELETE FROM negotiation_account_access
             WHERE id IN (
               SELECT acc.id
               FROM negotiation_account_access AS acc
               JOIN negotiation_account_access_context AS context
                 ON context.token_hash = acc.token_hash
               WHERE acc.negotiation_id = ?
                 AND acc.user_id = ?
                 AND acc.role = ?
                 AND context.tenant_id = ?
               ORDER BY acc.created_at DESC, acc.id DESC
               LIMIT -1 OFFSET ?
             )`,
          )
          .bind(
            row.id,
            identity.userId,
            role,
            row.participant_id,
            ACCOUNT_ACCESS_SESSION_LIMIT,
          ),
      );
    } else {
      statements.push(
        env.DB
          .prepare(
            `DELETE FROM negotiation_account_access
             WHERE id IN (
               SELECT id
               FROM negotiation_account_access
               WHERE negotiation_id = ? AND user_id = ? AND role = ?
               ORDER BY created_at DESC, id DESC
               LIMIT -1 OFFSET ?
             )`,
          )
          .bind(row.id, identity.userId, role, ACCOUNT_ACCESS_SESSION_LIMIT),
      );
    }
    sessionStatementGroups.push(statements);
    accesses.push({
      proposalId: row.id,
      role,
      token,
      archived: archivedNegotiationIds.has(row.id),
    });
  }
  for (
    let offset = 0;
    offset < sessionStatementGroups.length;
    offset += ACCOUNT_DISCOVERY_ROWS_PER_BATCH
  ) {
    await env.DB.batch(
      sessionStatementGroups
        .slice(offset, offset + ACCOUNT_DISCOVERY_ROWS_PER_BATCH)
        .flat(),
    );
  }

  return json({ accesses });
}

async function identityCanAccessRecord(db, identity, row, role) {
  if (role === "landlord") {
    return identity.emails.includes(normalizeEmail(row.landlord_email));
  }
  if (role === "arbiter") {
    if (identity.emails.includes(normalizeEmail(row.arbiter_email))) {
      return true;
    }
    const replacement = await arbiterReplacementFor(db, row.id);
    return Boolean(
      replacement?.status === "confirmed" &&
        identity.emails.includes(normalizeEmail(replacement.email)),
    );
  }
  if (role !== "tenant") return false;
  const placeholders = identity.emails.map(() => "?").join(", ");
  const tenant = await db
    .prepare(
      `SELECT id
       FROM negotiation_tenants
       WHERE negotiation_id = ? AND lower(email) IN (${placeholders})
       LIMIT 1`,
    )
    .bind(row.id, ...identity.emails)
    .first();
  return Boolean(tenant?.id);
}

async function recordArchivePreference(request, env) {
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The signed-in account could not be verified.",
      },
      401,
    );
  }

  const body = await request.json();
  const proposalId = cleanText(body.proposalId, 80);
  const role = cleanText(body.role, 20);
  if (
    !proposalId ||
    (role !== "landlord" && role !== "tenant" && role !== "arbiter") ||
    typeof body.archived !== "boolean"
  ) {
    return json({ error: "Choose a valid agreement record and archive state." }, 400);
  }

  const row = await rowFor(env.DB, proposalId);
  if (!row) return json({ error: "This agreement record was not found." }, 404);
  if (!(await identityCanAccessRecord(env.DB, identity, row, role))) {
    return json({ error: "This account cannot change that agreement record view." }, 403);
  }

  const archivedAt = body.archived ? new Date().toISOString() : null;
  if (body.archived) {
    await env.DB
      .prepare(
        `INSERT INTO account_record_archives
         (user_id, negotiation_id, role, archived_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, negotiation_id, role) DO UPDATE SET
           archived_at = excluded.archived_at`,
      )
      .bind(identity.userId, proposalId, role, archivedAt)
      .run();
  } else {
    await env.DB
      .prepare(
        `DELETE FROM account_record_archives
         WHERE user_id = ? AND negotiation_id = ? AND role = ?`,
      )
      .bind(identity.userId, proposalId, role)
      .run();
  }

  return json({ proposalId, role, archived: body.archived, archivedAt });
}

async function revokeAccountSessions(request, env) {
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The signed-in account could not be verified.",
      },
      401,
    );
  }

  const existing = await env.DB
    .prepare(
      `SELECT COUNT(*) AS count
       FROM negotiation_account_access
       WHERE user_id = ?`,
    )
    .bind(identity.userId)
    .first();
  await env.DB
    .prepare("DELETE FROM negotiation_account_access WHERE user_id = ?")
    .bind(identity.userId)
    .run();

  return json({
    revoked: true,
    revokedSessions: Number(existing?.count || 0),
  });
}

async function accountDataInventory(request, env) {
  let identity;
  try {
    identity = await verifyPrivyIdentity(request, env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The signed-in account could not be verified.",
      },
      401,
    );
  }

  const placeholders = identity.emails.map(() => "?").join(", ");
  const recordResult = await env.DB
    .prepare(
      `SELECT id, status, updated_at, role
       FROM (
         SELECT id, status, updated_at, 'landlord' AS role
         FROM agreement_negotiations
         WHERE lower(landlord_email) IN (${placeholders})
         UNION
         SELECT id, status, updated_at, 'arbiter' AS role
         FROM agreement_negotiations
         WHERE lower(arbiter_email) IN (${placeholders})
         UNION
         SELECT negotiation.id, negotiation.status, negotiation.updated_at, 'arbiter' AS role
         FROM agreement_negotiations AS negotiation
         JOIN arbiter_replacement_access AS replacement
           ON replacement.negotiation_id = negotiation.id
          AND replacement.status = 'confirmed'
         WHERE lower(replacement.email) IN (${placeholders})
         UNION
         SELECT negotiation.id, negotiation.status, negotiation.updated_at, 'tenant' AS role
         FROM agreement_negotiations AS negotiation
         JOIN negotiation_tenants AS tenant ON tenant.negotiation_id = negotiation.id
         WHERE lower(tenant.email) IN (${placeholders})
       )
       ORDER BY updated_at DESC, id, role`,
    )
    .bind(
      ...identity.emails,
      ...identity.emails,
      ...identity.emails,
      ...identity.emails,
    )
    .all();
  const archiveResult = await env.DB
    .prepare(
      `SELECT negotiation_id, role
       FROM account_record_archives
       WHERE user_id = ?`,
    )
    .bind(identity.userId)
    .all();
  const archivedRecords = new Set(
    (archiveResult.results || []).map(
      (archive) => `${archive.negotiation_id}:${archive.role}`,
    ),
  );
  const preferences = await env.DB
    .prepare(
      `SELECT agreement_activity, deadline_reminders, consented_at, updated_at
       FROM notification_preferences
       WHERE user_id = ?`,
    )
    .bind(identity.userId)
    .first();
  const sessionCount = await env.DB
    .prepare(
      `SELECT COUNT(*) AS count
       FROM negotiation_account_access
       WHERE user_id = ? AND expires_at > ?`,
    )
    .bind(identity.userId, new Date().toISOString())
    .first();

  return json({
    schema: "openescrow.account-data-inventory.v1",
    generatedAt: new Date().toISOString(),
    scope:
      "Verified-account metadata only. Use each agreement's Record tab to export its complete shared record.",
    verifiedEmailCount: identity.emails.length,
    records: (recordResult.results || []).map((row) => ({
      proposalId: row.id,
      role: row.role,
      status: row.status,
      updatedAt: row.updated_at,
      archived: archivedRecords.has(`${row.id}:${row.role}`),
    })),
    accountSettings: {
      activeRecordSessions: Number(sessionCount?.count || 0),
      archivedRecordPreferences: archivedRecords.size,
      notificationPreferences: preferences
        ? {
            agreementActivity: preferences.agreement_activity === 1,
            deadlineReminders: preferences.deadline_reminders === 1,
            consentedAt: preferences.consented_at || null,
            updatedAt: preferences.updated_at,
          }
        : null,
    },
    boundaries: {
      includesPrivateEvidence: false,
      includesInvitationOrSessionTokens: false,
      includesOtherParticipantDetails: false,
      deletesOrChangesData: false,
      publicBlockchainRecordsCanBeErased: false,
    },
  });
}

async function rowFor(db, id) {
  return db
    .prepare("SELECT * FROM agreement_negotiations WHERE id = ?")
    .bind(id)
    .first();
}

async function arbiterReplacementFor(db, negotiationId) {
  return db
    .prepare(
      `SELECT negotiation_id, email, wallet, token_hash, proposed_by_role,
              status, proposed_tx_hash, confirmed_tx_hash, created_at, updated_at
       FROM arbiter_replacement_access
       WHERE negotiation_id = ?`,
    )
    .bind(negotiationId)
    .first();
}

async function authorize(db, row, token) {
  if (!row || !token) return null;
  const hash = await hashToken(token);
  if (hash === row.landlord_token_hash) return "landlord";
  if (hash === row.tenant_token_hash) return "tenant";
  if (row.arbiter_token_hash && hash === row.arbiter_token_hash) return "arbiter";
  const pendingArbiter = await db
    .prepare(
      `SELECT 1 AS allowed
       FROM arbiter_replacement_access
       WHERE negotiation_id = ? AND token_hash = ? AND status = 'confirmed'`,
    )
    .bind(row.id, hash)
    .first();
  if (pendingArbiter?.allowed === 1) return "arbiter";
  const invitedTenant = await db
    .prepare(
      "SELECT id FROM negotiation_tenants WHERE negotiation_id = ? AND token_hash = ?",
    )
    .bind(row.id, hash)
    .first();
  if (invitedTenant?.id) return "tenant";
  const accountAccess = await db
    .prepare(
      "SELECT role FROM negotiation_account_access WHERE negotiation_id = ? AND token_hash = ? AND expires_at > ?",
    )
    .bind(row.id, hash, new Date().toISOString())
    .first();
  if (
    accountAccess?.role === "landlord" ||
    accountAccess?.role === "tenant" ||
    accountAccess?.role === "arbiter"
  ) {
    return accountAccess.role;
  }
  return null;
}

async function tenantForToken(db, negotiationId, token) {
  const hash = await hashToken(token);
  const direct = await db
    .prepare(
      "SELECT * FROM negotiation_tenants WHERE negotiation_id = ? AND token_hash = ?",
    )
    .bind(negotiationId, hash)
    .first();
  if (direct) return direct;
  return db
    .prepare(
      `SELECT tenant.*
       FROM negotiation_account_access_context context
       JOIN negotiation_tenants tenant ON tenant.id = context.tenant_id
       WHERE context.token_hash = ? AND tenant.negotiation_id = ?`,
    )
    .bind(hash, negotiationId)
    .first();
}

async function tenantsFor(db, negotiationId) {
  const result = await db
    .prepare(
      `SELECT id, name, email, approved_revision, wallet, is_funding_tenant,
              deposit_share_bps, created_at, accepted_at
       FROM negotiation_tenants
       WHERE negotiation_id = ?
       ORDER BY is_funding_tenant DESC, created_at ASC`,
    )
    .bind(negotiationId)
    .all();
  return result.results || [];
}

async function fundingCheckoutForAttempt(db, attemptId) {
  const attempt = await db
    .prepare(
      `SELECT attempt_id, negotiation_id, tenant_id, intent_key, environment,
              asset_id, provider_strategy, wallet_address, amount_micros,
              status, provider_status, created_at, updated_at
       FROM funding_checkout_attempts
       WHERE attempt_id = ?`,
    )
    .bind(attemptId)
    .first();
  if (!attempt) return null;
  const eventResult = await db
    .prepare(
      `SELECT event_id, status, provider_status, source, verification,
              reconciliation_key, payload_digest, occurred_at
       FROM funding_checkout_events
       WHERE attempt_id = ?
       ORDER BY sequence ASC`,
    )
    .bind(attemptId)
    .all();
  const checkout = {
    schema: FUNDING_CHECKOUT_SCHEMA,
    intentKey: attempt.intent_key,
    attemptId: attempt.attempt_id,
    environment: attempt.environment,
    assetId: attempt.asset_id,
    providerStrategy: attempt.provider_strategy,
    walletAddress: attempt.wallet_address,
    amountMicros: attempt.amount_micros,
    status: attempt.status,
    providerStatus: attempt.provider_status,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
    events: (eventResult.results || []).map((event) => ({
      id: event.event_id,
      status: event.status,
      providerStatus: event.provider_status,
      source: event.source,
      verification: event.verification,
      reconciliationKey: event.reconciliation_key,
      payloadDigest: event.payload_digest,
      occurredAt: event.occurred_at,
    })),
  };
  if (!isFundingCheckoutLifecycle(checkout)) {
    throw new Error("The saved sandbox checkout lifecycle is internally inconsistent.");
  }
  return {
    checkout,
    negotiationId: attempt.negotiation_id,
    tenantId: attempt.tenant_id,
  };
}

function tenantContributionMicros(terms, tenantRows, tenant) {
  const depositMicros = tokenMicros(terms?.deposit);
  const tenantIndex = tenantRows.findIndex((candidate) => candidate.id === tenant.id);
  if (depositMicros === null || tenantIndex < 0) return null;
  let allocatedMicros = 0n;
  for (let index = 0; index < tenantRows.length - 1; index += 1) {
    allocatedMicros +=
      (depositMicros * BigInt(tenantRows[index].deposit_share_bps)) / 10_000n;
  }
  return tenantIndex === tenantRows.length - 1
    ? depositMicros - allocatedMicros
    : (depositMicros * BigInt(tenant.deposit_share_bps)) / 10_000n;
}

function tenantReserveMicros(terms, tenantRows, tenant) {
  const reserveMicros = tokenMicros(terms?.operationsReserve);
  const tenantIndex = tenantRows.findIndex((candidate) => candidate.id === tenant.id);
  if (reserveMicros === null || tenantIndex < 0 || tenantRows.length < 1) return null;
  const baseReserveMicros = reserveMicros / BigInt(tenantRows.length);
  return tenantIndex === tenantRows.length - 1
    ? reserveMicros - baseReserveMicros * BigInt(tenantRows.length - 1)
    : baseReserveMicros;
}

async function sandboxFundingContext(db, id, token, intentInput) {
  const row = await rowFor(db, id);
  if (!row) {
    return { error: "This agreement record was not found.", status: 404 };
  }
  const role = await authorize(db, row, token);
  if (role !== "tenant") {
    return {
      error: "Only an invited tenant may manage this sandbox checkout.",
      status: 403,
    };
  }
  const tenant = await tenantForToken(db, id, token);
  if (!tenant) {
    return {
      error: "This tenant session is no longer associated with the agreement.",
      status: 403,
    };
  }
  if (row.status !== "finalized" || !row.onchain_agreement_id) {
    return {
      error: "The agreement must be finalized before previewing a funding checkout.",
      status: 409,
    };
  }
  if (!tenant.wallet || !/^0x[a-fA-F0-9]{40}$/.test(tenant.wallet)) {
    return {
      error: "Approve the agreement with a valid destination wallet before previewing checkout.",
      status: 409,
    };
  }
  if (intentInput?.environment !== "sandbox") {
    return {
      error: "Only the no-money provider sandbox is available for this testnet agreement.",
      status: 403,
    };
  }

  let approvedTerms;
  try {
    approvedTerms = JSON.parse(row.terms_json);
  } catch {
    approvedTerms = null;
  }
  const depositAsset = getDepositAssetForTerms(approvedTerms);
  const amountText = cleanText(intentInput?.amountMicros, 80);
  if (!depositAsset || !/^[1-9][0-9]*$/.test(amountText)) {
    return { error: "The sandbox funding intent is invalid.", status: 400 };
  }

  const tenantRows = await tenantsFor(db, id);
  const recordedEvents = await eventsFor(db, id);
  const contributionMicros = tenantContributionMicros(approvedTerms, tenantRows, tenant);
  const reserveMicros = tenantReserveMicros(approvedTerms, tenantRows, tenant);
  if (contributionMicros === null || reserveMicros === null) {
    return {
      error: "The tenant's approved funding allocation is invalid.",
      status: 409,
    };
  }
  const reservePaid = tenantHasEvent(
    recordedEvents,
    ["operations_reserve_paid"],
    tenant,
    tenantRows,
  );
  const maxPurchaseMicros = contributionMicros + (reservePaid ? 0n : reserveMicros);
  let amountMicros;
  try {
    amountMicros = BigInt(amountText);
  } catch {
    amountMicros = 0n;
  }
  if (amountMicros <= 0n || amountMicros > maxPurchaseMicros) {
    return {
      error: "The sandbox purchase amount exceeds this tenant's remaining approved total.",
      status: 400,
    };
  }

  let requestedIntentKey;
  let intent;
  try {
    requestedIntentKey = fundingIntentKey(intentInput);
    intent = createFundingIntent({
      assetId: depositAsset.id,
      walletAddress: tenant.wallet,
      amountMicros,
      environment: "sandbox",
      onrampEnabled: true,
      productionApproved: false,
    });
  } catch {
    return { error: "The sandbox funding intent is invalid.", status: 400 };
  }
  if (requestedIntentKey !== fundingIntentKey(intent)) {
    return {
      error:
        "The sandbox funding intent does not match the approved asset, wallet, chain, or amount.",
      status: 400,
    };
  }
  return {
    row,
    tenant,
    tenantRows,
    recordedEvents,
    intent,
    intentKey: requestedIntentKey,
  };
}

async function createSandboxFundingCheckout(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter a valid sandbox checkout request." }, 400);
  }
  const context = await sandboxFundingContext(env.DB, id, body.token, body.intent);
  if (context.error) return json({ error: context.error }, context.status);
  if (
    tenantHasEvent(
      context.recordedEvents,
      ["tenant_share_funded", "agreement_funded"],
      context.tenant,
      context.tenantRows,
    )
  ) {
    return json(
      { error: "This tenant's approved deposit share is already recorded as funded." },
      409,
    );
  }

  let newCheckout;
  try {
    newCheckout = createFundingCheckoutAttempt(context.intent, {
      attemptId: body.attemptId,
    });
  } catch {
    return json({ error: "A valid unique sandbox checkout attempt is required." }, 400);
  }

  const existingAttempt = await fundingCheckoutForAttempt(env.DB, newCheckout.attemptId);
  if (existingAttempt) {
    if (
      existingAttempt.negotiationId !== id ||
      existingAttempt.tenantId !== context.tenant.id ||
      existingAttempt.checkout.intentKey !== context.intentKey
    ) {
      return json({ error: "That checkout attempt ID is already in use." }, 409);
    }
    return json({
      checkout: existingAttempt.checkout,
      created: false,
      requestedIntentMatched: true,
      durable: true,
      sandboxOnly: true,
    });
  }

  const activeAttempt = await env.DB
    .prepare(
      `SELECT attempt_id
       FROM funding_checkout_attempts
       WHERE negotiation_id = ? AND tenant_id = ?
         AND status IN ('opening', 'submitted', 'unknown', 'confirmed', 'refund_pending')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(id, context.tenant.id)
    .first();
  if (activeAttempt?.attempt_id) {
    const saved = await fundingCheckoutForAttempt(env.DB, activeAttempt.attempt_id);
    return json({
      checkout: saved.checkout,
      created: false,
      requestedIntentMatched: saved.checkout.intentKey === context.intentKey,
      durable: true,
      sandboxOnly: true,
    });
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO funding_checkout_attempts
         (attempt_id, negotiation_id, tenant_id, intent_key, environment,
          asset_id, provider_strategy, wallet_address, amount_micros, status,
          provider_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'sandbox', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newCheckout.attemptId,
        id,
        context.tenant.id,
        newCheckout.intentKey,
        newCheckout.assetId,
        newCheckout.providerStrategy,
        newCheckout.walletAddress,
        newCheckout.amountMicros,
        newCheckout.status,
        newCheckout.providerStatus,
        newCheckout.createdAt,
        newCheckout.updatedAt,
      )
      .run();
  } catch {
    const racedAttempt = await env.DB
      .prepare(
        `SELECT attempt_id
         FROM funding_checkout_attempts
         WHERE negotiation_id = ? AND tenant_id = ?
           AND status IN ('opening', 'submitted', 'unknown', 'confirmed', 'refund_pending')
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(id, context.tenant.id)
      .first();
    if (racedAttempt?.attempt_id) {
      const saved = await fundingCheckoutForAttempt(env.DB, racedAttempt.attempt_id);
      return json({
        checkout: saved.checkout,
        created: false,
        requestedIntentMatched: saved.checkout.intentKey === context.intentKey,
        durable: true,
        sandboxOnly: true,
      });
    }
    return json({ error: "The sandbox checkout attempt could not be saved." }, 503);
  }

  return json(
    {
      checkout: newCheckout,
      created: true,
      requestedIntentMatched: true,
      durable: true,
      sandboxOnly: true,
    },
    201,
  );
}

async function recoverSandboxFundingCheckout(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter a valid sandbox checkout recovery request." }, 400);
  }
  const context = await sandboxFundingContext(env.DB, id, body.token, body.intent);
  if (context.error) return json({ error: context.error }, context.status);
  const activeAttempt = await env.DB
    .prepare(
      `SELECT attempt_id
       FROM funding_checkout_attempts
       WHERE negotiation_id = ? AND tenant_id = ?
         AND status IN ('opening', 'submitted', 'unknown', 'confirmed', 'refund_pending')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(id, context.tenant.id)
    .first();
  const attempt =
    activeAttempt ||
    (await env.DB
      .prepare(
        `SELECT attempt_id
         FROM funding_checkout_attempts
         WHERE negotiation_id = ? AND tenant_id = ? AND intent_key = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(id, context.tenant.id, context.intentKey)
      .first());
  const saved = attempt?.attempt_id
    ? await fundingCheckoutForAttempt(env.DB, attempt.attempt_id)
    : null;
  return json({
    checkout: saved?.checkout || null,
    requestedIntentMatched:
      !saved || saved.checkout.intentKey === context.intentKey,
    durable: true,
    sandboxOnly: true,
  });
}

async function appendSandboxFundingCheckoutEvent(request, env, id, attemptId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter a valid sandbox checkout event." }, 400);
  }
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  const tenant = role === "tenant" ? await tenantForToken(env.DB, id, body.token) : null;
  if (!row || role !== "tenant" || !tenant) {
    return json(
      { error: "Only the tenant who opened this sandbox checkout may update it." },
      403,
    );
  }
  const saved = await fundingCheckoutForAttempt(env.DB, attemptId);
  if (
    !saved ||
    saved.negotiationId !== id ||
    saved.tenantId !== tenant.id ||
    saved.checkout.environment !== "sandbox"
  ) {
    return json({ error: "This sandbox checkout attempt was not found." }, 404);
  }

  let updatedCheckout;
  try {
    updatedCheckout = applyFundingCheckoutEvent(saved.checkout, {
      eventId: body.eventId,
      status: body.status,
      providerStatus: body.providerStatus,
      source: FUNDING_CHECKOUT_EVENT_SOURCES.BROWSER_CALLBACK,
      verification: FUNDING_CHECKOUT_EVENT_VERIFICATIONS.UNVERIFIED,
      reconciliationKey: null,
      payloadDigest: null,
      occurredAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The sandbox checkout event is invalid.",
      },
      409,
    );
  }
  if (updatedCheckout === saved.checkout) {
    return json({
      checkout: saved.checkout,
      duplicate: true,
      durable: true,
      sandboxOnly: true,
    });
  }

  const event = updatedCheckout.events.at(-1);
  try {
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO funding_checkout_events
           (attempt_id, event_id, status, provider_status, source, verification,
            reconciliation_key, payload_digest, occurred_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1
             FROM funding_checkout_attempts
             WHERE attempt_id = ?
               AND status = ?
               AND provider_status = ?
               AND updated_at = ?
           )`,
        )
        .bind(
          updatedCheckout.attemptId,
          event.id,
          event.status,
          event.providerStatus,
          event.source,
          event.verification,
          event.reconciliationKey,
          event.payloadDigest,
          event.occurredAt,
          saved.checkout.attemptId,
          saved.checkout.status,
          saved.checkout.providerStatus,
          saved.checkout.updatedAt,
        ),
      env.DB
        .prepare(
          `UPDATE funding_checkout_attempts
           SET status = ?, provider_status = ?, updated_at = ?
           WHERE attempt_id = ?
             AND status = ?
             AND provider_status = ?
             AND updated_at = ?
             AND EXISTS (
               SELECT 1
               FROM funding_checkout_events
               WHERE attempt_id = ?
                 AND event_id = ?
                 AND status = ?
                 AND provider_status = ?
                 AND source = ?
                 AND verification = ?
                 AND reconciliation_key IS ?
                 AND payload_digest IS ?
                 AND occurred_at = ?
             )`,
        )
        .bind(
          updatedCheckout.status,
          updatedCheckout.providerStatus,
          updatedCheckout.updatedAt,
          updatedCheckout.attemptId,
          saved.checkout.status,
          saved.checkout.providerStatus,
          saved.checkout.updatedAt,
          updatedCheckout.attemptId,
          event.id,
          event.status,
          event.providerStatus,
          event.source,
          event.verification,
          event.reconciliationKey,
          event.payloadDigest,
          event.occurredAt,
        ),
    ]);
  } catch {
    const current = await fundingCheckoutForAttempt(env.DB, attemptId);
    if (
      current?.checkout.events.some(
        (candidate) =>
          candidate.id === event.id &&
          candidate.status === event.status &&
          candidate.providerStatus === event.providerStatus &&
          candidate.source === event.source &&
          candidate.verification === event.verification &&
          candidate.reconciliationKey === event.reconciliationKey &&
          candidate.payloadDigest === event.payloadDigest,
      )
    ) {
      return json({
        checkout: current.checkout,
        duplicate: true,
        durable: true,
        sandboxOnly: true,
      });
    }
    return json({ error: "The sandbox checkout event could not be saved." }, 503);
  }
  const current = await fundingCheckoutForAttempt(env.DB, attemptId);
  if (
    !current?.checkout.events.some(
      (candidate) =>
        candidate.id === event.id &&
        candidate.status === event.status &&
        candidate.providerStatus === event.providerStatus &&
        candidate.source === event.source &&
        candidate.verification === event.verification &&
        candidate.reconciliationKey === event.reconciliationKey &&
        candidate.payloadDigest === event.payloadDigest,
    )
  ) {
    return json(
      {
        error:
          "The sandbox checkout changed while this provider result was being saved. Refresh its status before retrying.",
      },
      409,
    );
  }
  return json({
    checkout: current.checkout,
    duplicate: false,
    durable: true,
    sandboxOnly: true,
  });
}

async function eventsFor(db, id) {
  const result = await db
    .prepare(
      "SELECT id, created_at, actor_role, action, summary, revision, metadata_json FROM negotiation_events WHERE negotiation_id = ? ORDER BY id ASC",
    )
    .bind(id)
    .all();
  return (result.results || []).map((event) => ({
    id: event.id,
    createdAt: event.created_at,
    actorRole: event.actor_role,
    action: event.action,
    summary: event.summary,
    revision: event.revision,
    metadata: event.metadata_json ? JSON.parse(event.metadata_json) : null,
  }));
}

async function serialize(db, row) {
  const arbiterRequired = Boolean(row.arbiter_email);
  const events = await eventsFor(db, row.id);
  const tenantRows = await tenantsFor(db, row.id);
  const arbiterReplacement = await arbiterReplacementFor(db, row.id);
  const storedShareTotal = tenantRows.reduce(
    (total, tenant) => total + Number(tenant.deposit_share_bps || 0),
    0,
  );
  const equalBase = tenantRows.length ? Math.floor(10000 / tenantRows.length) : 0;
  const equalRemainder = tenantRows.length ? 10000 - equalBase * tenantRows.length : 0;
  const tenants = tenantRows.map((tenant, index) => ({
    id: tenant.id,
    name: tenant.name || null,
    email: tenant.email,
    approved: Number(tenant.approved_revision) === Number(row.revision),
    wallet: tenant.wallet || null,
    isFundingTenant: tenant.is_funding_tenant === 1,
    acceptedAt: tenant.accepted_at || null,
    depositShareBps:
      storedShareTotal === 10000
        ? Number(tenant.deposit_share_bps)
        : equalBase + (index < equalRemainder ? 1 : 0),
  }));
  const fundingTenant = tenants.find((tenant) => tenant.isFundingTenant) || tenants[0] || null;
  const participantNames = {
    landlordName: null,
    tenantName: fundingTenant?.name || null,
    arbiterName: null,
  };
  for (const event of events) {
    const participants = event.metadata?.participants;
    if (participants && typeof participants === "object") {
      for (const key of Object.keys(participantNames)) {
        if (
          !participantNames[key] &&
          typeof participants[key] === "string" &&
          participants[key].trim()
        ) {
          participantNames[key] = participants[key].trim();
        }
      }
    }
    if (
      event.action === "revision_approved" &&
      typeof event.metadata?.name === "string" &&
      event.metadata.name.trim() &&
      (event.actorRole === "arbiter" ||
        (event.actorRole === "tenant" && event.metadata?.isFundingTenant !== false))
    ) {
      const nameKey = `${event.actorRole}Name`;
      if (!participantNames[nameKey]) {
        participantNames[nameKey] = event.metadata.name.trim();
      }
    }
  }
  const latestAcceptedArbiterReplacement = [...events]
    .reverse()
    .find((event) => event.action === "arbiter_replacement_accepted");
  if (latestAcceptedArbiterReplacement) {
    participantNames.arbiterName =
      cleanText(latestAcceptedArbiterReplacement.metadata?.name, 120) || null;
  }
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...participantNames,
    landlordEmail: row.landlord_email,
    tenantEmail: fundingTenant?.email || row.tenant_email,
    arbiterEmail: row.arbiter_email,
    tenants,
    terms: JSON.parse(row.terms_json),
    tenantApproved:
      tenants.length > 0
        ? tenants.every((tenant) => tenant.approved)
        : row.tenant_approved_revision === row.revision,
    arbiterApproved: !arbiterRequired || row.arbiter_approved_revision === row.revision,
    tenantWallet: fundingTenant?.wallet || row.tenant_wallet,
    arbiterWallet: row.arbiter_wallet,
    arbiterReplacement: arbiterReplacement
      ? {
          email: arbiterReplacement.email,
          wallet: arbiterReplacement.wallet,
          status: arbiterReplacement.status,
          proposedByRole: arbiterReplacement.proposed_by_role,
          proposedAt: arbiterReplacement.created_at,
          confirmedAt:
            arbiterReplacement.status === "confirmed"
              ? arbiterReplacement.updated_at
              : null,
        }
      : null,
    onchainAgreementId: row.onchain_agreement_id,
    onchainTxHash: row.onchain_tx_hash,
    events,
  };
}

function eventStatement(db, id, now, actorRole, action, summary, revision, metadata = null) {
  return db
    .prepare(
      "INSERT INTO negotiation_events (negotiation_id, created_at, actor_role, action, summary, revision, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, now, actorRole, action, summary, revision, metadata ? JSON.stringify(metadata) : null);
}

async function createNegotiation(request, env) {
  const db = env.DB;
  const body = await request.json();
  const landlordName = cleanText(body.landlordName, 120);
  const landlordEmail = normalizeEmail(body.landlordEmail);
  const requestedTenants =
    Array.isArray(body.tenants) && body.tenants.length
      ? body.tenants
      : [{ name: body.tenantName, email: body.tenantEmail }];
  const limitedTenants = requestedTenants.slice(0, 5);
  const defaultShareBase = Math.floor(10000 / limitedTenants.length);
  const defaultShareRemainder = 10000 - defaultShareBase * limitedTenants.length;
  const tenants = limitedTenants.map((tenant, index) => ({
    id: crypto.randomUUID(),
    name: cleanText(tenant?.name, 120),
    email: normalizeEmail(tenant?.email),
    isFundingTenant: index === 0,
    depositShareBps:
      tenant?.depositShareBps === undefined
        ? defaultShareBase + (index < defaultShareRemainder ? 1 : 0)
        : Number(tenant.depositShareBps),
  }));
  const tenantName = tenants[0]?.name || "";
  const tenantEmail = tenants[0]?.email || "";
  const arbiterName = cleanText(body.arbiterName, 120);
  const arbiterEmail = normalizeEmail(body.arbiterEmail) || null;

  if (
    !EMAIL_PATTERN.test(landlordEmail) ||
    tenants.length < 1 ||
    tenants.length > 5 ||
    tenants.some((tenant) => !EMAIL_PATTERN.test(tenant.email))
  ) {
    return json({ error: "A valid landlord and tenant email are required." }, 400);
  }
  if (tenants.some((tenant) => !hasFirstAndLastName(tenant.name))) {
    return json(
      { error: "Enter each tenant’s legal first and last name." },
      400,
    );
  }
  if (
    tenants.some(
      (tenant) =>
        !Number.isInteger(tenant.depositShareBps) ||
        tenant.depositShareBps <= 0 ||
        tenant.depositShareBps > 10000,
    ) ||
    tenants.reduce((total, tenant) => total + tenant.depositShareBps, 0) !== 10000
  ) {
    return json({ error: "Tenant deposit shares must be positive and total exactly 100%." }, 400);
  }
  if (arbiterEmail && !EMAIL_PATTERN.test(arbiterEmail)) {
    return json({ error: "The optional arbiter email is invalid." }, 400);
  }
  const partyEmails = [
    landlordEmail,
    ...tenants.map((tenant) => tenant.email),
    arbiterEmail,
  ].filter(Boolean);
  if (new Set(partyEmails).size !== partyEmails.length) {
    return json({ error: "Each party must use a different email." }, 400);
  }
  if (!(await validTerms(body.terms, env))) {
    return json({ error: "The agreement terms are incomplete or invalid." }, 400);
  }
  const sourceGate = await complianceSourceGate(body.terms, env);
  if (!sourceGate.allowed) {
    return complianceSourceGateResponse(sourceGate);
  }

  const id = crypto.randomUUID().split("-")[0];
  const landlordToken = randomToken();
  const tenantTokens = tenants.map(() => randomToken());
  const arbiterToken = arbiterEmail ? randomToken() : null;
  const [landlordHash, tenantHashes, arbiterHash] = await Promise.all([
    hashToken(landlordToken),
    Promise.all(tenantTokens.map((token) => hashToken(token))),
    arbiterToken ? hashToken(arbiterToken) : Promise.resolve(null),
  ]);
  const now = new Date().toISOString();
  const termsJson = JSON.stringify(body.terms);

  await db.batch([
    db
      .prepare(
        `INSERT INTO agreement_negotiations (
          id, created_at, updated_at, status, revision, terms_json,
          landlord_email, tenant_email, arbiter_email,
          landlord_token_hash, tenant_token_hash, arbiter_token_hash
        ) VALUES (?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        now,
        now,
        termsJson,
        landlordEmail,
        tenantEmail,
        arbiterEmail,
        landlordHash,
        tenantHashes[0],
        arbiterHash,
      ),
    ...tenants.map((tenant, index) =>
      db
        .prepare(
          `INSERT INTO negotiation_tenants
           (id, negotiation_id, name, email, token_hash, approved_revision, wallet,
            is_funding_tenant, deposit_share_bps, created_at, accepted_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL)`,
        )
        .bind(
          tenant.id,
          id,
          tenant.name || null,
          tenant.email,
          tenantHashes[index],
          tenant.isFundingTenant ? 1 : 0,
          tenant.depositShareBps,
          now,
        ),
    ),
    eventStatement(
      db,
      id,
      now,
      "landlord",
      "proposal_created",
      `Created revision 1 for ${tenants.length} tenant${tenants.length === 1 ? "" : "s"}${arbiterEmail ? ` with ${arbiterEmail} as optional arbiter` : " without an arbiter"}.`,
      1,
      {
        terms: body.terms,
        participants: { landlordName, tenantName, arbiterName },
      },
    ),
  ]);

  const row = await rowFor(db, id);
  return json({
    record: await serialize(db, row),
    access: {
      landlord: landlordToken,
      tenant: tenantTokens[0],
      tenants: tenants.map((tenant, index) => ({
        id: tenant.id,
        name: tenant.name || null,
        email: tenant.email,
        token: tenantTokens[index],
        isFundingTenant: tenant.isFundingTenant,
        depositShareBps: tenant.depositShareBps,
      })),
      arbiter: arbiterToken,
    },
  }, 201);
}

async function getNegotiation(db, id, token) {
  const row = await rowFor(db, id);
  const role = await authorize(db, row, token);
  if (!role) return json({ error: "This proposal link is invalid or no longer available." }, 403);
  const record = await serialize(db, row);
  if (role === "tenant") {
    const tenant = await tenantForToken(db, id, token);
    if (tenant) {
      record.viewerTenantId = tenant.id;
      record.viewerEmail = tenant.email;
    }
  }
  return json(record);
}

async function addTenant(request, env, id) {
  const body = await request.json();
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may add a tenant reviewer." }, 403);
  }
  if (row.status === "finalized" || row.status === "cancelled" || row.status === "superseded") {
    return json(
      {
        error:
          "A finalized onchain agreement cannot add parties. Create a replacement proposal instead.",
      },
      409,
    );
  }
  const existingTenants = await tenantsFor(env.DB, id);
  if (existingTenants.length >= 5) {
    return json({ error: "This MVP supports up to five tenant reviewers." }, 409);
  }
  const name = cleanText(body.name, 120);
  const email = normalizeEmail(body.email);
  if (!EMAIL_PATTERN.test(email)) {
    return json({ error: "Enter a valid tenant email." }, 400);
  }
  if (!hasFirstAndLastName(name)) {
    return json({ error: "Enter the tenant’s legal first and last name." }, 400);
  }
  const reservedEmails = new Set([
    row.landlord_email,
    row.arbiter_email,
    ...existingTenants.map((tenant) => tenant.email),
  ].filter(Boolean));
  if (reservedEmails.has(email)) {
    return json({ error: "Each agreement party must use a different email." }, 400);
  }

  const tenantId = crypto.randomUUID();
  const tenantToken = randomToken();
  const tenantHash = await hashToken(tenantToken);
  const nextRevision = Number(row.revision) + 1;
  const now = new Date().toISOString();
  const nextTenantCount = existingTenants.length + 1;
  const equalBase = Math.floor(10000 / nextTenantCount);
  const equalRemainder = 10000 - equalBase * nextTenantCount;
  await env.DB.batch([
    ...existingTenants.map((tenant, index) =>
      env.DB
        .prepare(
          "UPDATE negotiation_tenants SET deposit_share_bps = ? WHERE negotiation_id = ? AND id = ?",
        )
        .bind(equalBase + (index < equalRemainder ? 1 : 0), id, tenant.id),
    ),
    env.DB
      .prepare(
        `INSERT INTO negotiation_tenants
         (id, negotiation_id, name, email, token_hash, approved_revision, wallet,
          is_funding_tenant, deposit_share_bps, created_at, accepted_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, NULL)`,
      )
      .bind(
        tenantId,
        id,
        name || null,
        email,
        tenantHash,
        equalBase + (existingTenants.length < equalRemainder ? 1 : 0),
        now,
      ),
    env.DB
      .prepare(
        `UPDATE negotiation_tenants
         SET approved_revision = NULL, accepted_at = NULL
         WHERE negotiation_id = ?`,
      )
      .bind(id),
    env.DB
      .prepare(
        `UPDATE agreement_negotiations
         SET revision = ?, status = 'draft', tenant_approved_revision = NULL,
             arbiter_approved_revision = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(nextRevision, now, id),
    eventStatement(
      env.DB,
      id,
      now,
      "landlord",
      "tenant_added",
      `Added ${email} as a tenant reviewer. Revision ${nextRevision} now requires fresh approval from every tenant and the optional arbiter.`,
      nextRevision,
      { tenantId, name, email, isFundingTenant: false, splitResetEqually: true },
    ),
  ]);
  return json({
    record: await serialize(env.DB, await rowFor(env.DB, id)),
    invite: {
      id: tenantId,
      name: name || null,
      email,
      token: tenantToken,
      isFundingTenant: false,
      depositShareBps:
        equalBase + (existingTenants.length < equalRemainder ? 1 : 0),
    },
  });
}

async function updateTenant(request, env, id, tenantId) {
  const body = await request.json();
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may edit a tenant." }, 403);
  }
  if (row.status === "finalized" || row.status === "cancelled" || row.status === "superseded") {
    return json(
      { error: "Tenant parties cannot be changed after onchain finalization." },
      409,
    );
  }

  const target = await env.DB
    .prepare("SELECT * FROM negotiation_tenants WHERE negotiation_id = ? AND id = ?")
    .bind(id, tenantId)
    .first();
  if (!target) return json({ error: "That tenant is not part of this proposal." }, 404);

  const name = cleanText(body.name, 120);
  const email = normalizeEmail(body.email);
  if (!EMAIL_PATTERN.test(email)) {
    return json({ error: "Enter a valid tenant email." }, 400);
  }
  if (!hasFirstAndLastName(name)) {
    return json({ error: "Enter the tenant’s legal first and last name." }, 400);
  }
  const existingTenants = await tenantsFor(env.DB, id);
  const reservedEmails = new Set(
    [
      row.landlord_email,
      row.arbiter_email,
      ...existingTenants
        .filter((tenant) => tenant.id !== tenantId)
        .map((tenant) => tenant.email),
    ].filter(Boolean),
  );
  if (reservedEmails.has(email)) {
    return json({ error: "Each agreement party must use a different email." }, 400);
  }
  if ((target.name || "") === name && target.email === email) {
    return json({ error: "Change the tenant name or email before saving." }, 400);
  }

  const emailChanged = target.email !== email;
  const replacementToken = emailChanged ? randomToken() : null;
  const replacementHash = replacementToken
    ? await hashToken(replacementToken)
    : target.token_hash;
  const nextRevision = Number(row.revision) + 1;
  const now = new Date().toISOString();
  const statements = [];
  if (emailChanged) {
    statements.push(
      env.DB
        .prepare(
          `DELETE FROM negotiation_account_access
           WHERE token_hash IN (
             SELECT token_hash FROM negotiation_account_access_context WHERE tenant_id = ?
           )`,
        )
        .bind(tenantId),
    );
  }
  statements.push(
    env.DB
      .prepare(
        `UPDATE negotiation_tenants
         SET name = ?, email = ?, token_hash = ?, approved_revision = NULL,
             wallet = CASE WHEN ? THEN NULL ELSE wallet END, accepted_at = NULL
         WHERE negotiation_id = ? AND id = ?`,
      )
      .bind(name || null, email, replacementHash, emailChanged ? 1 : 0, id, tenantId),
    env.DB
      .prepare(
        `UPDATE negotiation_tenants
         SET approved_revision = NULL, accepted_at = NULL
         WHERE negotiation_id = ?`,
      )
      .bind(id),
    env.DB
      .prepare(
        `UPDATE agreement_negotiations
         SET revision = ?, status = 'draft', tenant_approved_revision = NULL,
             arbiter_approved_revision = NULL, updated_at = ?,
             tenant_email = CASE WHEN ? THEN ? ELSE tenant_email END,
             tenant_token_hash = CASE WHEN ? THEN ? ELSE tenant_token_hash END,
             tenant_wallet = CASE WHEN ? THEN NULL ELSE tenant_wallet END
         WHERE id = ?`,
      )
      .bind(
        nextRevision,
        now,
        target.is_funding_tenant === 1 ? 1 : 0,
        email,
        target.is_funding_tenant === 1 ? 1 : 0,
        replacementHash,
        target.is_funding_tenant === 1 && emailChanged ? 1 : 0,
        id,
      ),
    eventStatement(
      env.DB,
      id,
      now,
      "landlord",
      "tenant_updated",
      `Updated tenant ${target.email} to ${name ? `${name} · ` : ""}${email}. Revision ${nextRevision} now requires fresh approval from every tenant and the optional arbiter.`,
      nextRevision,
      {
        tenantId,
        previousName: target.name || null,
        previousEmail: target.email,
        name: name || null,
        email,
        emailChanged,
        isFundingTenant: target.is_funding_tenant === 1,
      },
    ),
  );
  await env.DB.batch(statements);

  return json({
    record: await serialize(env.DB, await rowFor(env.DB, id)),
    invite: replacementToken
      ? {
          id: tenantId,
          name: name || null,
          email,
          token: replacementToken,
          isFundingTenant: target.is_funding_tenant === 1,
          depositShareBps: Number(target.deposit_share_bps),
        }
      : null,
  });
}

async function rotateTenantInvite(request, env, id, tenantId) {
  const body = await request.json();
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may reset a tenant invitation link." }, 403);
  }

  const target = await env.DB
    .prepare("SELECT * FROM negotiation_tenants WHERE negotiation_id = ? AND id = ?")
    .bind(id, tenantId)
    .first();
  if (!target) return json({ error: "That tenant is not part of this proposal." }, 404);

  const replacementToken = randomToken();
  const replacementHash = await hashToken(replacementToken);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare(
        `DELETE FROM negotiation_account_access
         WHERE token_hash IN (
           SELECT token_hash FROM negotiation_account_access_context WHERE tenant_id = ?
         )`,
      )
      .bind(tenantId),
    env.DB
      .prepare(
        `UPDATE negotiation_tenants
         SET token_hash = ?
         WHERE negotiation_id = ? AND id = ?`,
      )
      .bind(replacementHash, id, tenantId),
    env.DB
      .prepare(
        `UPDATE agreement_negotiations
         SET tenant_token_hash = CASE WHEN ? THEN ? ELSE tenant_token_hash END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(target.is_funding_tenant === 1 ? 1 : 0, replacementHash, now, id),
    eventStatement(
      env.DB,
      id,
      now,
      "landlord",
      "tenant_invite_reset",
      `Reset the invitation link for ${target.email}. Prior bearer links and active tenant record sessions were invalidated.`,
      Number(row.revision),
      {
        tenantId,
        email: target.email,
        isFundingTenant: target.is_funding_tenant === 1,
      },
    ),
  ]);

  return json({
    record: await serialize(env.DB, await rowFor(env.DB, id)),
    invite: {
      id: tenantId,
      name: target.name || null,
      email: target.email,
      token: replacementToken,
      isFundingTenant: target.is_funding_tenant === 1,
      depositShareBps: Number(target.deposit_share_bps),
    },
  });
}

async function rotateArbiterInvite(request, env, id) {
  const body = await request.json();
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may reset an arbiter invitation link." }, 403);
  }
  if (!row.arbiter_email || !row.arbiter_token_hash) {
    return json({ error: "This proposal does not have an optional arbiter." }, 404);
  }

  const replacementToken = randomToken();
  const replacementHash = await hashToken(replacementToken);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare(
        `DELETE FROM negotiation_account_access
         WHERE negotiation_id = ? AND role = 'arbiter'`,
      )
      .bind(id),
    env.DB
      .prepare(
        "DELETE FROM arbiter_replacement_account_access WHERE negotiation_id = ?",
      )
      .bind(id),
    env.DB
      .prepare(
        `UPDATE agreement_negotiations
         SET arbiter_token_hash = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(replacementHash, now, id),
    eventStatement(
      env.DB,
      id,
      now,
      "landlord",
      "arbiter_invite_reset",
      `Reset the invitation link for ${row.arbiter_email}. Prior bearer links and active arbiter record sessions were invalidated.`,
      Number(row.revision),
      { email: row.arbiter_email },
    ),
  ]);

  return json({
    record: await serialize(env.DB, await rowFor(env.DB, id)),
    invite: {
      email: row.arbiter_email,
      token: replacementToken,
    },
  });
}

async function removeTenant(request, env, id, tenantId) {
  const body = await request.json();
  const row = await rowFor(env.DB, id);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may remove a tenant." }, 403);
  }
  if (row.status === "finalized" || row.status === "cancelled" || row.status === "superseded") {
    return json(
      { error: "Tenant parties cannot be changed after onchain finalization." },
      409,
    );
  }

  const tenantRows = await env.DB
    .prepare(
      `SELECT * FROM negotiation_tenants
       WHERE negotiation_id = ?
       ORDER BY is_funding_tenant DESC, created_at ASC`,
    )
    .bind(id)
    .all();
  const tenants = tenantRows.results || [];
  const target = tenants.find((tenant) => tenant.id === tenantId);
  if (!target) return json({ error: "That tenant is not part of this proposal." }, 404);
  if (tenants.length === 1) {
    return json(
      { error: "Add a replacement tenant before removing the only tenant." },
      409,
    );
  }

  const promoted =
    target.is_funding_tenant === 1
      ? tenants.find((tenant) => tenant.id !== tenantId) || null
      : null;
  const nextRevision = Number(row.revision) + 1;
  const now = new Date().toISOString();
  const remaining = tenants.filter((tenant) => tenant.id !== tenantId);
  const equalBase = Math.floor(10000 / remaining.length);
  const equalRemainder = 10000 - equalBase * remaining.length;
  const statements = [
    env.DB
      .prepare(
        `DELETE FROM negotiation_account_access
         WHERE token_hash IN (
           SELECT token_hash FROM negotiation_account_access_context WHERE tenant_id = ?
         )`,
      )
      .bind(tenantId),
  ];
  if (promoted) {
    statements.push(
      env.DB
        .prepare(
          "UPDATE negotiation_tenants SET is_funding_tenant = 1 WHERE negotiation_id = ? AND id = ?",
        )
        .bind(id, promoted.id),
    );
  }
  statements.push(
    env.DB
      .prepare("DELETE FROM negotiation_tenants WHERE negotiation_id = ? AND id = ?")
      .bind(id, tenantId),
    ...remaining.map((tenant, index) =>
      env.DB
        .prepare(
          "UPDATE negotiation_tenants SET deposit_share_bps = ? WHERE negotiation_id = ? AND id = ?",
        )
        .bind(equalBase + (index < equalRemainder ? 1 : 0), id, tenant.id),
    ),
    env.DB
      .prepare(
        `UPDATE negotiation_tenants
         SET approved_revision = NULL, accepted_at = NULL
         WHERE negotiation_id = ?`,
      )
      .bind(id),
    env.DB
      .prepare(
        `UPDATE agreement_negotiations
         SET revision = ?, status = 'draft', tenant_approved_revision = NULL,
             arbiter_approved_revision = NULL, updated_at = ?,
             tenant_email = CASE WHEN ? THEN ? ELSE tenant_email END,
             tenant_token_hash = CASE WHEN ? THEN ? ELSE tenant_token_hash END,
             tenant_wallet = CASE WHEN ? THEN ? ELSE tenant_wallet END
         WHERE id = ?`,
      )
      .bind(
        nextRevision,
        now,
        promoted ? 1 : 0,
        promoted?.email || row.tenant_email,
        promoted ? 1 : 0,
        promoted?.token_hash || row.tenant_token_hash,
        promoted ? 1 : 0,
        promoted?.wallet || null,
        id,
      ),
    eventStatement(
      env.DB,
      id,
      now,
      "landlord",
      "tenant_removed",
      `Removed ${target.email} from the proposal.${promoted ? ` ${promoted.email} is now the designated funding tenant.` : ""} Revision ${nextRevision} now requires fresh approval from every remaining tenant and the optional arbiter.`,
      nextRevision,
      {
        tenantId,
        name: target.name || null,
        email: target.email,
        wasFundingTenant: target.is_funding_tenant === 1,
        promotedTenantId: promoted?.id || null,
        promotedTenantEmail: promoted?.email || null,
      },
    ),
  );
  await env.DB.batch(statements);

  return json({
    record: await serialize(env.DB, await rowFor(env.DB, id)),
    removedTenantId: tenantId,
    promotedTenantId: promoted?.id || null,
  });
}

async function sendLandlordReadyNotification(request, env, row) {
  if (!emailProvider(env)) return null;
  const workspaceUrl = publicAppOriginForRequest(request, env);
  const subject = `OpenEscrow proposal ${row.id} is approved and ready to finalize`;
  const text = [
    `Every tenant${row.arbiter_email ? " and the optional arbiter have" : " has"} approved revision ${row.revision} of OpenEscrow proposal ${row.id}.`,
    "The proposal is still saved offchain and has not been finalized.",
    `Sign in as the landlord, choose Agreements & deductions, and select Find my proposals & agreements: ${workspaceUrl}`,
    "Open the approval-ready proposal and submit the finalized terms onchain.",
  ].join("\n\n");
  const delivered = await deliverTrackedEmail(env, {
    negotiationId: row.id,
    recipientEmail: row.landlord_email,
    notificationType: "proposal_ready",
    subject,
    text,
    idempotencyKey: `proposal-ready-${row.id}-${row.revision}`,
  });
  return delivered?.id || null;
}

async function sendOptedInAgreementActivityEmails(
  request,
  env,
  row,
  eventType,
  activity = {},
  strictDelivery = false,
) {
  if (!emailProvider(env)) return [];
  const tenantRecipients = (await tenantsFor(env.DB, row.id)).map((tenant) => [
    "tenant",
    tenant.email,
  ]);
  const allAgreementRecipients = [
    ["landlord", row.landlord_email],
    ...tenantRecipients,
    ["arbiter", row.arbiter_email],
  ];
  const claimResponseCopy =
    {
      approve: {
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} deduction approved`,
        text: "The tenant approved the documented deduction claim. Review the recorded decision and resulting allocation in OpenEscrow.",
      },
      partial: {
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} deduction partially disputed`,
        text: "The tenant approved part of the documented deduction and disputed the remainder. Review the recorded decision and next step in OpenEscrow.",
      },
      dispute: {
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} deduction disputed`,
        text: "The tenant disputed the documented deduction claim. Review the recorded explanation and resolution status in OpenEscrow.",
      },
    }[activity.decision] || {
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} claim response`,
      text: "The tenant responded to the deduction claim. Review the recorded decision and next step in OpenEscrow.",
    };
  const notification = {
    finalize: {
      recipients: [
        ...tenantRecipients,
        ["arbiter", row.arbiter_email],
      ],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} finalized`,
      text: "The approved proposal was finalized on Base Sepolia.",
    },
    agreement_funded: {
      recipients: [["landlord", row.landlord_email]],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} funded`,
      text: "The tenant accepted the finalized terms and funded the refundable deposit.",
    },
    tenant_share_funded: {
      recipients: [
        ["landlord", row.landlord_email],
        ...tenantRecipients,
      ],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} received a tenant contribution`,
      text: "A tenant funded their approved portion of the refundable deposit. The agreement becomes active only after every tenant contribution is received.",
    },
    claim_submitted: {
      recipients: [
        ["landlord", row.landlord_email],
        ...tenantRecipients,
      ],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} deduction claim submitted`,
      text: "A documented deduction claim was recorded. Review the private agreement workspace for the itemization and next action.",
    },
    claim_amended: {
      recipients: [
        ["landlord", row.landlord_email],
        ...tenantRecipients,
      ],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} claim amended`,
      text: "The landlord amended the deduction claim. Review the updated line items and documentation in OpenEscrow.",
    },
    claim_response: {
      recipients: [
        ["landlord", row.landlord_email],
        ...tenantRecipients,
        ["arbiter", row.arbiter_email],
      ],
      ...claimResponseCopy,
    },
    arbiter_ruling: {
      recipients: [
        ["landlord", row.landlord_email],
        ...tenantRecipients,
      ],
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} ruling recorded`,
      text: "The appointed arbiter recorded a ruling. Review the allocation and transaction receipt in OpenEscrow.",
    },
    cancel_proposal: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow proposal ${row.id} cancelled`,
      text: "The landlord cancelled this saved proposal. Its timestamped history remains available in the Record.",
    },
    onchain_proposal_cancelled: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} cancelled`,
      text: "The unfunded onchain agreement was cancelled on Base Sepolia. Review the recorded transaction in OpenEscrow.",
    },
    claim_retracted: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} claim withdrawn`,
      text: "The landlord withdrew the deduction claim. Review the resulting refund allocation in OpenEscrow.",
    },
    withdrawal_completed: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} withdrawal completed`,
      text: "An agreement party completed an available withdrawal. Review the participant-controlled record and transaction receipt in OpenEscrow.",
    },
    no_claim_refund_available: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} full refund recorded`,
      text: "The no-claim period ended and the full tenant refund was recorded on Base Sepolia. Review the resulting allocation in OpenEscrow.",
    },
    response_timeout_escalated: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} response period ended`,
      text: "A claim response deadline passed without every tenant response, so the contract escalated the disputed amount for resolution. Review the current status in OpenEscrow.",
    },
    arbiter_timeout_allocation: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} timeout allocation recorded`,
      text: "The arbiter ruling period ended and the contract recorded the tenant allocation. Review the resulting balances in OpenEscrow.",
    },
    arbiter_replacement_proposed: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} arbiter change proposed`,
      text: "An agreement party proposed replacing the optional arbiter. Review and confirm or decline the pending change in OpenEscrow.",
    },
    arbiter_replacement_confirmed: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} arbiter change confirmed`,
      text: "Both agreement sides confirmed the optional-arbiter replacement. The nominee must still accept before access changes.",
    },
    arbiter_replacement_cancelled: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} arbiter change cancelled`,
      text: "The pending optional-arbiter replacement was cancelled. Existing agreement access remains unchanged.",
    },
    arbiter_replacement_accepted: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} arbiter changed`,
      text: "The mutually approved replacement arbiter accepted the role. Review the updated participant access in OpenEscrow.",
    },
    arbiter_resigned: {
      recipients: allAgreementRecipients,
      subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""} arbiter resigned`,
      text: "The optional arbiter resigned from this agreement. The landlord and tenants should review whether a mutually approved replacement is needed.",
    },
  }[eventType];
  if (!notification) return [];

  const appUrl = publicAppOriginForRequest(request, env);
  const results = [];
  const seenEmails = new Set();
  for (const [recipientRole, email] of notification.recipients) {
    if (!email) continue;
    const normalizedRecipient = normalizeEmail(email);
    if (!normalizedRecipient || seenEmails.has(normalizedRecipient)) continue;
    seenEmails.add(normalizedRecipient);
    const preferences = await env.DB
      .prepare(
        "SELECT agreement_activity FROM notification_preferences WHERE lower(email) = lower(?) AND consented_at IS NOT NULL",
      )
      .bind(email)
      .first();
    if (Number(preferences?.agreement_activity) !== 1) continue;
    try {
      const unsubscribeUrl = await unsubscribeUrlFor(env.DB, appUrl, email);
      const recipientKey = (await hashToken(email)).slice(0, 16);
      const transactionHash = cleanText(activity.transactionHash, 100).toLowerCase();
      const stableDeliveryKey =
        cleanText(activity.deliveryKey, 200) ||
        (/^0x[0-9a-f]{64}$/.test(transactionHash)
          ? transactionHash.slice(2)
          : row.updated_at);
      const delivered = await deliverTrackedEmail(env, {
        negotiationId: row.id,
        recipientEmail: email,
        notificationType: `agreement_activity_${eventType}`,
        subject: notification.subject,
        text: `${notification.text}\n\nOpen your signed-in dashboard: ${appUrl}\n\nThis email intentionally omits evidence, tenancy details, and private notes.${unsubscribeUrl ? `\n\nTurn off optional OpenEscrow emails: ${unsubscribeUrl}` : ""}`,
        idempotencyKey:
          `agreement-${row.id}-${eventType}-${recipientRole}-${recipientKey}-` +
          stableDeliveryKey,
      });
      if (delivered?.id) {
        results.push({
          recipientRole,
          email,
          messageId: delivered.id,
          duplicate: Boolean(delivered.duplicate),
        });
      } else if (strictDelivery) {
        const suppressed = await isNotificationSuppressed(env.DB, email);
        if (!suppressed) {
          throw new Error("The agreement activity email could not be delivered.");
        }
      }
    } catch (error) {
      if (strictDelivery) throw error;
      // Continue delivering to other opted-in parties when one provider request fails.
    }
  }
  return results;
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

function latestEvent(events, action) {
  return [...events].reverse().find((event) => event.action === action) || null;
}

function claimResponseState(events, tenantRows) {
  const responseEvents = events.filter(
    (event) => event.action === "claim_response_submitted",
  );
  const responsesByTenant = new Map();
  const legacyResponses = [];
  for (const event of responseEvents) {
    const tenantId = cleanText(event.metadata?.tenantId, 80);
    if (tenantId) responsesByTenant.set(tenantId, event);
    else legacyResponses.push(event);
  }
  if (legacyResponses.length && tenantRows.length) {
    const primaryTenant =
      tenantRows.find((tenant) => tenant.is_funding_tenant === 1) || tenantRows[0];
    if (!responsesByTenant.has(primaryTenant.id)) {
      responsesByTenant.set(primaryTenant.id, legacyResponses.at(-1));
    }
  }
  const pendingTenants = tenantRows.filter(
    (tenant) => !responsesByTenant.has(tenant.id),
  );
  const responses = tenantRows.length
    ? tenantRows
        .map((tenant) => responsesByTenant.get(tenant.id))
        .filter(Boolean)
    : responseEvents;
  return {
    responses,
    pendingTenants,
    allResponded: tenantRows.length
      ? pendingTenants.length === 0
      : responseEvents.length > 0,
  };
}

function latestClaimEvent(events) {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.action === "deduction_claim_submitted" ||
        event.action === "deduction_claim_amended",
    );
}

function eventBelongsToTenant(event, tenant, tenantRows) {
  const tenantId = cleanText(event.metadata?.tenantId, 80);
  if (tenantId) return tenantId === tenant.id;
  const primaryTenant =
    tenantRows.find((candidate) => candidate.is_funding_tenant === 1) ||
    tenantRows[0];
  return event.actorRole === "tenant" && primaryTenant?.id === tenant.id;
}

function tenantHasEvent(events, actions, tenant, tenantRows) {
  return events.some(
    (event) =>
      actions.includes(event.action) &&
      eventBelongsToTenant(event, tenant, tenantRows),
  );
}

function claimDisputeState(events, tenantRows) {
  const claim = latestClaimEvent(events);
  const claimMicros = tokenMicros(claim?.metadata?.amount);
  if (!claim || claimMicros === null || claimMicros <= 0n) {
    return {
      claim,
      claimMicros,
      responses: claimResponseState(events, tenantRows),
      disputedMicros: 0n,
      disputeOpened: false,
    };
  }
  const responses = claimResponseState(events, tenantRows);
  const noResponseDispute = events.some(
    (event) =>
      event.action === "timeout_executed" &&
      event.metadata?.timeout === "no_response_dispute",
  );
  if (noResponseDispute) {
    return {
      claim,
      claimMicros,
      responses,
      disputedMicros: claimMicros,
      disputeOpened: true,
    };
  }
  if (!responses.allResponded || responses.responses.length === 0) {
    return {
      claim,
      claimMicros,
      responses,
      disputedMicros: 0n,
      disputeOpened: false,
    };
  }
  const acceptedAmounts = responses.responses.map((event) =>
    tokenMicros(event.metadata?.acceptedAmount),
  );
  if (acceptedAmounts.some((amount) => amount === null)) {
    return {
      claim,
      claimMicros,
      responses,
      disputedMicros: 0n,
      disputeOpened: false,
    };
  }
  const minimumAccepted = acceptedAmounts.reduce(
    (minimum, amount) => (amount < minimum ? amount : minimum),
    claimMicros,
  );
  const disputedMicros =
    minimumAccepted < claimMicros ? claimMicros - minimumAccepted : 0n;
  return {
    claim,
    claimMicros,
    responses,
    disputedMicros,
    disputeOpened: disputedMicros > 0n,
  };
}

function resolutionEvent(events, tenantRows) {
  const ruling = latestEvent(events, "arbiter_ruling_submitted");
  if (ruling) return ruling;
  const refundTimeout = [...events]
    .reverse()
    .find(
      (event) =>
        event.action === "timeout_executed" &&
        (event.metadata?.timeout === "no_claim_refund" ||
          event.metadata?.timeout === "arbiter_timeout_refund"),
    );
  if (refundTimeout) return refundTimeout;
  const claim = latestClaimEvent(events);
  if (
    claim?.action === "deduction_claim_amended" &&
    tokenMicros(claim.metadata?.amount) === 0n
  ) {
    return claim;
  }
  const dispute = claimDisputeState(events, tenantRows);
  if (
    dispute.claim &&
    dispute.responses.allResponded &&
    !dispute.disputeOpened
  ) {
    return [...dispute.responses.responses].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    ).at(-1);
  }
  return null;
}

async function sendScheduledNotification(env, row, notification, appUrl) {
  const preferenceColumn =
    notification.preference === "deadline" ? "deadline_reminders" : "agreement_activity";
  const preference = await env.DB
    .prepare(
      `SELECT ${preferenceColumn} AS enabled
       FROM notification_preferences
       WHERE lower(email) = lower(?) AND consented_at IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .bind(notification.email)
    .first();
  if (Number(preference?.enabled) !== 1) return false;

  const idempotencyKey = [
    row.id,
    notification.type,
    notification.role,
    notification.scheduledFor.toISOString(),
  ].join(":");
  const unsubscribeUrl = await unsubscribeUrlFor(env.DB, appUrl, notification.email);
  const delivered = await deliverTrackedEmail(env, {
    negotiationId: row.id,
    recipientEmail: notification.email,
    notificationType: notification.type,
    scheduledFor: notification.scheduledFor.toISOString(),
    subject: notification.subject,
    text: `${notification.text}\n\nOpen your signed-in dashboard: ${appUrl}\n\nThis reminder intentionally omits addresses, amounts, evidence, and private notes.${unsubscribeUrl ? `\n\nTurn off optional OpenEscrow emails: ${unsubscribeUrl}` : ""}`,
    idempotencyKey,
  });
  if (!delivered?.id || delivered.duplicate) return false;

  const createdAt = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
      .bind(createdAt, row.id),
    eventStatement(
      env.DB,
      row.id,
      createdAt,
      "system",
      "scheduled_notification_sent",
      `Sent the ${notification.type.replaceAll("_", " ")} notice to the ${notification.role}.`,
      row.revision,
      {
        notificationType: notification.type,
        recipientRole: notification.role,
        scheduledFor: notification.scheduledFor.toISOString(),
        messageId: delivered.id,
      },
    ),
  ]);
  return true;
}

async function recordScheduledInAppNotification(env, row, notification) {
  const scheduledFor = notification.scheduledFor.toISOString();
  const idempotencyKey = [
    row.id,
    notification.type,
    notification.role,
    scheduledFor,
  ].join(":");
  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO negotiation_events
       (negotiation_id, created_at, actor_role, action, summary, revision, metadata_json)
       VALUES (?, ?, 'system', 'scheduled_notification_due', ?, ?, ?)`,
    )
    .bind(
      row.id,
      new Date().toISOString(),
      notification.text,
      Number(row.revision),
      JSON.stringify({
        idempotencyKey,
        notificationType: notification.type,
        recipientRole: notification.role,
        scheduledFor,
      }),
    )
    .run();
}

function deadlineCandidates(row, events, now, tenantRows = []) {
  const terms = JSON.parse(row.terms_json);
  const candidates = [];
  const claimWindowStart = new Date(terms.claimWindowStart);
  const claimDeadline = addDays(claimWindowStart, terms.claimDays);
  const lifecycleTenants = tenantRows.length
    ? tenantRows
    : [
        {
          id: "legacy-primary",
          email: row.tenant_email,
          is_funding_tenant: 1,
        },
      ];
  const lifecycleRecipients = [
    ["landlord", row.landlord_email],
    ...lifecycleTenants.map((tenant) => [`tenant-${tenant.id}`, tenant.email]),
  ];
  for (const [role, email] of lifecycleRecipients) {
    if (now < claimWindowStart) {
      const possessionReminder = [
        {
          type: "possession_return_7_days",
          scheduledFor: addDays(claimWindowStart, -7),
          text: "The agreement's expected possession-return date is in seven days. Review the shared timeline and prepare any move-out documentation in OpenEscrow.",
        },
        {
          type: "possession_return_1_day",
          scheduledFor: addDays(claimWindowStart, -1),
          text: "The agreement's expected possession-return date is tomorrow. Review the shared timeline and preserve any move-out documentation in OpenEscrow.",
        },
      ]
        .filter((candidate) => candidate.scheduledFor <= now)
        .at(-1);
      if (possessionReminder) {
        candidates.push({
          ...possessionReminder,
          role,
          email,
          preference: "deadline",
          subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""}: possession-return reminder`,
        });
      }
    }
    if (claimDeadline <= now) {
      candidates.push({
        type: "claim_period_ended",
        role,
        email,
        preference: "deadline",
        scheduledFor: claimDeadline,
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""}: claim period ended`,
        text: "The deduction claim period has ended. Open the signed-in agreement workspace to see whether a claim was recorded and what happens next.",
      });
    } else if (claimWindowStart <= now) {
      candidates.push({
        type: "claim_period_started",
        role,
        email,
        preference: "deadline",
        scheduledFor: claimWindowStart,
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""}: claim period started`,
        text: "The deduction claim period has started. Open the signed-in agreement workspace to review the current status and any required action.",
      });
    }
  }
  const claimSubmitted = events.find(
    (event) => event.action === "deduction_claim_submitted",
  );
  if (!claimSubmitted) {
    const reminder = [
      {
        type: "claim_deadline_3_days",
        scheduledFor: addDays(claimDeadline, -3),
        text: "The landlord deduction-claim deadline is approaching. Submit any itemized claim and supporting documentation in OpenEscrow.",
      },
      {
        type: "claim_deadline_1_day",
        scheduledFor: addDays(claimDeadline, -1),
        text: "The landlord deduction-claim deadline is tomorrow. No timely claim means the tenant can recover the full deposit.",
      },
    ].filter((candidate) => candidate.scheduledFor <= now && now < claimDeadline).at(-1);
    if (reminder) {
      candidates.push({
        ...reminder,
        role: "landlord",
        email: row.landlord_email,
        preference: "deadline",
        subject: `OpenEscrow proposal ${row.id}: deduction deadline reminder`,
      });
    }
  } else {
    const responseState = claimResponseState(events, lifecycleTenants);
    if (!responseState.allResponded) {
      const responseDeadline = addDays(
        new Date(claimSubmitted.createdAt),
        terms.responseDays,
      );
      for (const tenant of responseState.pendingTenants) {
        const reminder = [
          {
            type: "response_deadline_3_days",
            scheduledFor: addDays(responseDeadline, -3),
            text: "A documented deduction claim is awaiting your response. Approve, partially accept, or dispute it before the response deadline.",
          },
          {
            type: "response_deadline_1_day",
            scheduledFor: addDays(responseDeadline, -1),
            text: "Your deduction-claim response deadline is tomorrow. Silence escalates the claim to a dispute; it never automatically pays the landlord.",
          },
        ].filter((candidate) => candidate.scheduledFor <= now && now < responseDeadline).at(-1);
        if (reminder) {
          candidates.push({
            ...reminder,
            role: `tenant-${tenant.id}`,
            email: tenant.email,
            preference: "deadline",
            subject: `OpenEscrow proposal ${row.id}: response deadline reminder`,
          });
        }
      }
    } else {
      const disputeOpened = responseState.responses.some(
        (event) =>
          event.metadata?.decision === "partial" ||
          event.metadata?.decision === "dispute",
      );
      const arbiterRuling = latestEvent(events, "arbiter_ruling_submitted");
      if (
        row.arbiter_email &&
        !arbiterRuling &&
        disputeOpened
      ) {
        const lastTenantResponse = [...responseState.responses].sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        ).at(-1);
        const rulingDeadline = addDays(
          new Date(lastTenantResponse.createdAt),
          terms.arbiterDays,
        );
        const reminder = [
          {
            type: "arbiter_deadline_3_days",
            scheduledFor: addDays(rulingDeadline, -3),
            text: "An OpenEscrow deduction dispute is awaiting your ruling. Review the private record and submit an allocation before the deadline.",
          },
          {
            type: "arbiter_deadline_1_day",
            scheduledFor: addDays(rulingDeadline, -1),
            text: "The OpenEscrow ruling deadline is tomorrow. If no ruling is submitted, the disputed balance defaults to the tenant.",
          },
        ].filter((candidate) => candidate.scheduledFor <= now && now < rulingDeadline).at(-1);
        if (reminder) {
          candidates.push({
            ...reminder,
            role: "arbiter",
            email: row.arbiter_email,
            preference: "deadline",
            subject: `OpenEscrow proposal ${row.id}: ruling deadline reminder`,
          });
        }
      }
    }
  }
  return candidates;
}

function complianceDeadlineCandidates(row, events, now, tenantRows = []) {
  let terms;
  try {
    terms = JSON.parse(row.terms_json);
  } catch {
    return [];
  }
  if (!isVersionedComplianceSnapshot(terms.complianceSnapshot)) {
    return [];
  }
  const confirmedEvents = Object.fromEntries(
    events
      .filter((event) => event.action === "compliance_event_confirmed")
      .map((event) => [
        cleanText(event.metadata?.eventName, 80),
        cleanText(event.metadata?.occurredAt, 40),
      ])
      .filter(([eventName, occurredAt]) => eventName && occurredAt),
  );
  const confirmedFacts = Object.fromEntries(
    events
      .filter(
        (event) =>
          event.action === "compliance_fact_confirmed" &&
          typeof event.metadata?.value === "boolean",
      )
      .map((event) => [
        cleanText(event.metadata?.factName, 80),
        event.metadata.value,
      ])
      .filter(([factName]) => factName),
  );
  const evaluation = evaluateComplianceSnapshot(terms.complianceSnapshot, {
    facts: {
      ...(terms.complianceFacts || {}),
      ...confirmedFacts,
      monthlyRent: terms.monthlyRent,
      deposit: terms.deposit,
    },
    events: confirmedEvents,
  });
  if (!evaluation) return [];
  const stateDeadlines = evaluation.deadlines
    .filter((deadline) => !deadline.comparison)
    .map((deadline) => ({ ...deadline, key: `state:${deadline.id}` }));
  const combinedDeadlines = (evaluation.combinedDeadlines || []).map(
    (deadline) => ({ ...deadline, key: `state:${deadline.id}` }),
  );
  const overlayDeadlines = evaluation.overlays.flatMap((overlay) =>
    overlay.applicability === "applies"
      ? overlay.deadlines.map((deadline) => ({
          ...deadline,
          key: `${overlay.id}:${deadline.id}`,
        }))
      : [],
  );
  const recipients = [
    ["landlord", row.landlord_email],
    ...(tenantRows.length
      ? tenantRows.map((tenant) => [`tenant-${tenant.id}`, tenant.email])
      : [["tenant", row.tenant_email]]),
  ];
  const candidates = [];
  for (const deadline of [
    ...stateDeadlines,
    ...combinedDeadlines,
    ...overlayDeadlines,
  ]) {
    if (deadline.status !== "scheduled" || !deadline.dueAt) continue;
    const dueAt = new Date(deadline.dueAt);
    const stage =
      dueAt <= now
        ? {
            type: `compliance_${deadline.key}_due`,
            scheduledFor: dueAt,
            text: `${deadline.label} is due under the recorded compliance snapshot. Review the confirmed event, governing source, and required delivery record now.`,
          }
        : [
            {
              type: `compliance_${deadline.key}_3_days`,
              scheduledFor: addDays(dueAt, -3),
              text: `${deadline.label} is approaching in three days under the recorded compliance snapshot. Review the required accounting, documents, and delivery method.`,
            },
            {
              type: `compliance_${deadline.key}_1_day`,
              scheduledFor: addDays(dueAt, -1),
              text: `${deadline.label} is tomorrow under the recorded compliance snapshot. Complete and preserve the required action and proof of delivery.`,
            },
          ]
            .filter((candidate) => candidate.scheduledFor <= now && now < dueAt)
            .at(-1);
    if (!stage) continue;
    for (const [role, email] of recipients) {
      candidates.push({
        ...stage,
        role,
        email,
        preference: "deadline",
        subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""}: compliance deadline`,
      });
    }
  }
  return candidates;
}

async function recordClaimPeriodTransitions(env, row, events, now) {
  const terms = JSON.parse(row.terms_json);
  const claimWindowStart = new Date(terms.claimWindowStart);
  const claimDeadline = addDays(claimWindowStart, terms.claimDays);
  const revision = Number(row.revision);
  const statements = [];
  if (
    claimWindowStart <= now &&
    !events.some((event) => event.action === "claim_period_started")
  ) {
    statements.push(
      eventStatement(
        env.DB,
        row.id,
        now.toISOString(),
        "system",
        "claim_period_started",
        "The deduction claim period started. The landlord may submit an itemized claim with supporting documentation.",
        revision,
        { scheduledFor: claimWindowStart.toISOString() },
      ),
    );
  }
  if (
    claimDeadline <= now &&
    !events.some((event) => event.action === "claim_period_ended")
  ) {
    const claimMade = events.some(
      (event) => event.action === "deduction_claim_submitted",
    );
    statements.push(
      eventStatement(
        env.DB,
        row.id,
        now.toISOString(),
        "system",
        "claim_period_ended",
        claimMade
          ? "The deduction claim period ended. A claim was submitted and remains subject to the recorded response and resolution process."
          : "The deduction claim period ended without a claim. The tenant may proceed with the applicable full-refund action.",
        revision,
        { scheduledFor: claimDeadline.toISOString(), claimMade },
      ),
    );
  }
  if (statements.length) await env.DB.batch(statements);
}

function withdrawalCandidates(row, events, now, tenantRows = []) {
  const lifecycleTenants = tenantRows.length
    ? tenantRows
    : [
        {
          id: "legacy-primary",
          email: row.tenant_email,
          is_funding_tenant: 1,
        },
      ];
  const resolution = resolutionEvent(events, lifecycleTenants);
  if (!resolution) return [];
  return [
    ["landlord", row.landlord_email],
    ...lifecycleTenants.map((tenant) => [
      `tenant-${tenant.id}`,
      tenant.email,
    ]),
  ].map(([role, email]) => ({
    type: "allocation_ready",
    role,
    email,
    preference: "activity",
    scheduledFor: new Date(resolution.createdAt),
    subject: `OpenEscrow agreement #${row.onchain_agreement_id || ""}: allocation ready`,
    text:
      "A deduction decision has been recorded. Open the agreement dashboard to review any balance available to withdraw.",
  })).filter((candidate) => candidate.scheduledFor <= now);
}

async function runScheduledNotifications(env, now = new Date()) {
  if (!env.DB) return;
  await initialize(env.DB);
  const result = await env.DB
    .prepare(
      "SELECT * FROM agreement_negotiations WHERE status = 'finalized' ORDER BY updated_at ASC LIMIT 250",
    )
    .all();
  const appUrl = publicAppOrigin(
    env,
    "https://openescrow.io/",
  );
  for (const row of result.results || []) {
    let events = await eventsFor(env.DB, row.id);
    await recordClaimPeriodTransitions(env, row, events, now);
    events = await eventsFor(env.DB, row.id);
    const tenantRows = await tenantsFor(env.DB, row.id);
    const candidates = [
      ...deadlineCandidates(row, events, now, tenantRows),
      ...complianceDeadlineCandidates(row, events, now, tenantRows),
      ...withdrawalCandidates(row, events, now, tenantRows),
    ];
    for (const candidate of candidates) {
      await recordScheduledInAppNotification(env, row, candidate);
      if (!emailProvider(env)) continue;
      await sendScheduledNotification(env, row, candidate, appUrl);
    }
  }
}

async function seedComplianceSources(db) {
  const statements = COMPLIANCE_SOURCE_REGISTRY.map((item) =>
    db
      .prepare(
        `INSERT INTO compliance_source_checks
          (source_key, scope, jurisdiction, profile_version, citation, url,
           baseline_signature, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
         ON CONFLICT(source_key) DO UPDATE SET
           scope = excluded.scope,
           jurisdiction = excluded.jurisdiction,
           citation = excluded.citation,
           baseline_signature = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN excluded.baseline_signature
             ELSE compliance_source_checks.baseline_signature END,
           current_signature = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.current_signature END,
           http_status = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.http_status END,
           status = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN 'pending' ELSE compliance_source_checks.status END,
           last_checked_at = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.last_checked_at END,
           last_verified_at = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.last_verified_at END,
           last_changed_at = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.last_changed_at END,
           error = CASE
             WHEN compliance_source_checks.profile_version <> excluded.profile_version
               OR compliance_source_checks.url <> excluded.url
             THEN NULL ELSE compliance_source_checks.error END,
           profile_version = excluded.profile_version,
           url = excluded.url`,
      )
      .bind(
        item.key,
        item.scope,
        item.jurisdiction,
        item.version,
        item.citation,
        item.url,
        item.externalMonitor?.expectedBodySha256 || null,
      ),
  );
  for (let index = 0; index < statements.length; index += 20) {
    await db.batch(statements.slice(index, index + 20));
  }
}

async function digestSourceResponse(response) {
  const chunks = [];
  let total = 0;
  const maximum = 256 * 1024;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    while (total < maximum) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maximum - total;
      const chunk = value.slice(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < value.byteLength || total >= maximum) {
        await reader.cancel();
        break;
      }
    }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    chunks.push(bytes.slice(0, maximum));
    total = Math.min(bytes.byteLength, maximum);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const metadata = encoder.encode(
    JSON.stringify({
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      contentLength: response.headers.get("content-length") || "",
      contentType: response.headers.get("content-type") || "",
      sampledBytes: total,
    }),
  );
  const signatureBytes = new Uint8Array(metadata.byteLength + body.byteLength);
  signatureBytes.set(metadata);
  signatureBytes.set(body, metadata.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", signatureBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasComplianceSourceValidators(response) {
  return ["etag", "last-modified"].some((header) =>
    cleanText(response?.headers?.get(header), 500),
  );
}

function validateComplianceSourceDestination(response) {
  const finalUrlText = cleanText(response?.url, 2_000);
  if (!finalUrlText) return;

  let finalUrl;
  try {
    finalUrl = new URL(finalUrlText);
  } catch {
    throw new Error("Official source resolved to an invalid destination.");
  }
  if (finalUrl.protocol !== "https:") {
    throw new Error("Official source redirected outside HTTPS.");
  }

  const hostname = finalUrl.hostname.toLowerCase();
  const pathname = finalUrl.pathname.toLowerCase();
  const isKnownChallenge =
    hostname === "unblock.federalregister.gov" ||
    hostname === "challenges.cloudflare.com" ||
    pathname.includes("/cdn-cgi/challenge-platform/");
  const isKnownErrorPage =
    (hostname === "govinfo.gov" || hostname === "www.govinfo.gov") &&
    (pathname === "/error" || pathname.startsWith("/error/"));
  if (isKnownChallenge || isKnownErrorPage) {
    throw new Error(
      "Official source resolved to a challenge or error page instead of the cited requirements.",
    );
  }
}

async function checkComplianceSource(db, sourceRow, now) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const checkedAt = now.toISOString();
  try {
    const sourceItem = COMPLIANCE_SOURCE_REGISTRY.find(
      (item) =>
        item.key === sourceRow.source_key &&
        item.version === sourceRow.profile_version &&
        item.url === sourceRow.url,
    );
    if (sourceItem?.externalMonitor) {
      const monitor = validateExternalComplianceMonitor(sourceItem);
      const response = await fetch(monitor.url, {
        headers: {
          accept: "application/json",
          "user-agent": "OpenEscrow compliance source monitor/1.0",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `External compliance-source attestation returned HTTP ${response.status}.`,
        );
      }
      const finalMonitorUrl = cleanText(response.url, 2_000);
      if (finalMonitorUrl && finalMonitorUrl !== monitor.url) {
        throw new Error(
          "External compliance-source attestation resolved to an unexpected destination.",
        );
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > 32_768) {
        throw new Error("External compliance-source attestation is too large.");
      }
      const rawPayload = await response.text();
      if (new TextEncoder().encode(rawPayload).byteLength > 32_768) {
        throw new Error("External compliance-source attestation is too large.");
      }
      let payload;
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        throw new Error("External compliance-source attestation is not valid JSON.");
      }
      const observation = validateExternalComplianceAttestation(
        payload,
        sourceItem,
        now,
      );
      await db
        .prepare(
          `UPDATE compliance_source_checks
           SET baseline_signature = ?, current_signature = ?, http_status = ?,
               status = ?, last_checked_at = ?,
               last_verified_at = CASE
                 WHEN ? = 'unchanged' THEN ? ELSE last_verified_at END,
               last_changed_at = CASE
                 WHEN ? = 'changed' THEN ? ELSE last_changed_at END,
               error = NULL
           WHERE source_key = ? AND profile_version = ? AND url = ?
             AND (last_checked_at IS NULL OR last_checked_at <= ?)`,
        )
        .bind(
          monitor.expectedBodySha256,
          observation.bodySha256,
          observation.httpStatus,
          observation.status,
          checkedAt,
          observation.status,
          observation.checkedAt,
          observation.status,
          checkedAt,
          sourceRow.source_key,
          sourceRow.profile_version,
          sourceRow.url,
          checkedAt,
        )
        .run();
      return;
    }
    const sourceUrl = new URL(sourceRow.url);
    if (sourceUrl.protocol !== "https:") throw new Error("HTTPS is required.");
    const requestHeaders = {
      accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5",
      range: "bytes=0-262143",
      "user-agent": "OpenEscrow compliance source monitor/1.0",
    };
    let response = await fetch(sourceUrl.toString(), {
      headers: requestHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.status === 520) {
      await response.body?.cancel().catch(() => {});
      response = await fetch(sourceUrl.toString(), {
        headers: { accept: requestHeaders.accept },
        redirect: "follow",
        signal: controller.signal,
      });
    }
    if (response.status === 520) {
      await response.body?.cancel().catch(() => {});
      response = await fetch(sourceUrl.toString(), {
        method: "HEAD",
        headers: { accept: requestHeaders.accept },
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.ok && !hasComplianceSourceValidators(response)) {
        throw new Error(
          "Official source HEAD response did not include an ETag or Last-Modified validator.",
        );
      }
    }
    if (!response.ok) {
      throw new Error(`Official source returned HTTP ${response.status}.`);
    }
    validateComplianceSourceDestination(response);
    const signature = await digestSourceResponse(response);
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET baseline_signature = COALESCE(baseline_signature, ?),
             current_signature = ?, http_status = ?,
             status = CASE
               WHEN COALESCE(baseline_signature, ?) = ? THEN 'unchanged'
               ELSE 'changed'
             END,
             last_checked_at = ?,
             last_verified_at = CASE
               WHEN COALESCE(baseline_signature, ?) = ? THEN ?
               ELSE last_verified_at
             END,
             last_changed_at = CASE
               WHEN COALESCE(baseline_signature, ?) <> ? THEN ?
               ELSE last_changed_at
             END,
             error = NULL
         WHERE source_key = ? AND profile_version = ? AND url = ?
           AND (last_checked_at IS NULL OR last_checked_at <= ?)`,
      )
      .bind(
        signature,
        signature,
        response.status,
        signature,
        signature,
        checkedAt,
        signature,
        signature,
        checkedAt,
        signature,
        signature,
        checkedAt,
        sourceRow.source_key,
        sourceRow.profile_version,
        sourceRow.url,
        checkedAt,
      )
      .run();
  } catch (error) {
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET status = 'unreachable', last_checked_at = ?, error = ?
         WHERE source_key = ? AND profile_version = ? AND url = ?
           AND (last_checked_at IS NULL OR last_checked_at <= ?)`,
      )
      .bind(
        checkedAt,
        cleanText(error instanceof Error ? error.message : "Source check failed.", 300),
        sourceRow.source_key,
        sourceRow.profile_version,
        sourceRow.url,
        checkedAt,
      )
      .run();
  } finally {
    clearTimeout(timeout);
  }
}

function checkComplianceSourceOnce(db, sourceRow, now) {
  let checksForDatabase = complianceSourceChecksInFlight.get(db);
  if (!checksForDatabase) {
    checksForDatabase = new Map();
    complianceSourceChecksInFlight.set(db, checksForDatabase);
  }
  const checkKey = JSON.stringify([
    sourceRow.source_key,
    sourceRow.profile_version,
    sourceRow.url,
  ]);
  const existing = checksForDatabase.get(checkKey);
  if (existing) return existing;

  const pending = checkComplianceSource(db, sourceRow, now).finally(() => {
    if (checksForDatabase.get(checkKey) === pending) {
      checksForDatabase.delete(checkKey);
    }
  });
  checksForDatabase.set(checkKey, pending);
  return pending;
}

async function runComplianceSourceAudit(env, now = new Date()) {
  if (!env.DB || env.COMPLIANCE_SOURCE_MONITOR_ENABLED !== "true") return;
  await initialize(env.DB);
  await seedComplianceSources(env.DB);
  const sourceProgress = await env.DB
    .prepare(
      `SELECT COUNT(*) AS tracked,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM compliance_source_checks`,
    )
    .first();
  const bootstrapInProgress =
    Number(sourceProgress?.tracked || 0) < COMPLIANCE_SOURCE_REGISTRY.length ||
    Number(sourceProgress?.pending || 0) > 0;
  const minimumInterval = bootstrapInProgress
    ? COMPLIANCE_SOURCE_BOOTSTRAP_INTERVAL_MS
    : COMPLIANCE_SOURCE_MONITOR_INTERVAL_MS;
  const prior = await env.DB
    .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
    .bind("compliance-source-monitor")
    .first();
  const lastStarted = prior?.last_started_at
    ? new Date(prior.last_started_at).getTime()
    : 0;
  if (now.getTime() - lastStarted < minimumInterval) return;
  await env.DB
    .prepare(
      `INSERT INTO scheduled_job_runs (name, last_started_at)
       VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at`,
    )
    .bind("compliance-source-monitor", now.toISOString())
    .run();
  const pending = await env.DB
    .prepare(
      `SELECT * FROM compliance_source_checks
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
                COALESCE(last_checked_at, '') ASC, source_key ASC
       LIMIT 4`,
    )
    .all();
  for (const row of pending.results || []) {
    await checkComplianceSourceOnce(env.DB, row, now);
  }
}

async function runNotificationJob(env, now = new Date()) {
  if (!env.DB) return;
  await initialize(env.DB);
  const prior = await env.DB
    .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
    .bind("notification-reminders")
    .first();
  const lastStarted = prior?.last_started_at
    ? new Date(prior.last_started_at).getTime()
    : 0;
  if (now.getTime() - lastStarted < 10 * 60 * 1000) return;
  await env.DB
    .prepare(
      `INSERT INTO scheduled_job_runs (name, last_started_at)
       VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at`,
    )
    .bind("notification-reminders", now.toISOString())
    .run();
  await runScheduledNotifications(env, now);
}

async function runApiRateLimitCleanup(env, now = new Date()) {
  if (!env.DB) return;
  await initialize(env.DB);
  const prior = await env.DB
    .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
    .bind("api-rate-limit-cleanup")
    .first();
  const lastStarted = prior?.last_started_at
    ? new Date(prior.last_started_at).getTime()
    : 0;
  if (now.getTime() - lastStarted < 24 * 60 * 60 * 1000) return;
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO scheduled_job_runs (name, last_started_at)
         VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at`,
      )
      .bind("api-rate-limit-cleanup", now.toISOString()),
    env.DB
      .prepare("DELETE FROM api_rate_limits WHERE updated_at < ?")
      .bind(new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()),
  ]);
}

async function finalizationReceiptAssignedElsewhere(
  db,
  negotiationId,
  transactionHash,
) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) return false;
  const assigned = await db
    .prepare(
      `SELECT negotiation_id
       FROM negotiation_receipt_guards
       WHERE action = 'posted_onchain'
         AND transaction_hash = ?
         AND negotiation_id <> ?
       LIMIT 1`,
    )
    .bind(transactionHash.toLowerCase(), negotiationId)
    .first();
  return Boolean(assigned?.negotiation_id);
}

async function authorizedReceiptReplay({
  db,
  id,
  row,
  role,
  token,
  actionType,
  expectedEvent,
  transactionHash,
  events,
}) {
  if (!expectedEvent || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    return false;
  }
  if (
    actionType === "finalize" &&
    row.onchain_tx_hash?.toLowerCase() === transactionHash.toLowerCase()
  ) {
    return role === "landlord";
  }
  const recorded = events.find(
    (event) =>
      event.action === expectedEvent &&
      event.metadata?.transactionHash?.toLowerCase() ===
        transactionHash.toLowerCase(),
  );
  if (!recorded || recorded.actorRole !== role) return false;
  const tenantBoundReplay =
    role === "tenant" && TENANT_BOUND_RECEIPT_REPLAY_ACTIONS.has(actionType);
  if (!tenantBoundReplay) return true;
  const tenant = await tenantForToken(db, id, token);
  if (!tenant) return false;
  if (!Object.prototype.hasOwnProperty.call(recorded.metadata || {}, "tenantId")) {
    // Historical single-tenant receipts predate participant metadata. Preserve
    // only that legacy shape; multi-tenant records fail closed when the actor
    // cannot be attributed to an exact participant.
    const tenantRows = await tenantsFor(db, id);
    return tenantRows.length === 1 && tenantRows[0]?.id === tenant.id;
  }

  return recorded.metadata?.tenantId === tenant.id;
}

async function applyAction(request, env, id) {
  const db = env.DB;
  const body = await request.json();
  const row = await rowFor(db, id);
  const role = await authorize(db, row, body.token);
  if (!role) return json({ error: "This proposal link is invalid or no longer available." }, 403);
  const receiptRequiredActions = new Set([
    "arbiter_replacement_proposed",
    "arbiter_replacement_confirmed",
    "arbiter_replacement_cancelled",
    "arbiter_replacement_accepted",
    "onchain_proposal_cancelled",
  ]);
  if (
    receiptRequiredActions.has(body.type) &&
    !receiptVerificationEnabled(env)
  ) {
    return json(
      {
        error:
          body.type === "onchain_proposal_cancelled"
            ? "Onchain cancellation requires Base Sepolia receipt verification and cannot change the private Record while verification is disabled."
            : "Arbiter access changes require Base Sepolia receipt verification and cannot be recorded while it is disabled.",
      },
      503,
    );
  }
  if (
    (row.status === "cancelled" || row.status === "superseded") &&
    body.type !== "cancel_proposal" &&
    body.type !== "onchain_proposal_cancelled"
  ) {
    return json({ error: "This proposal is no longer active." }, 409);
  }

  const transactionEventByAction = {
    finalize: "posted_onchain",
    operations_reserve_paid: "operations_reserve_paid",
    tenant_share_funded: "tenant_share_funded",
    agreement_funded: "agreement_funded",
    record_snapshot_anchored: "record_snapshot_anchored",
    activity_hash_published: "activity_hash_published",
    claim_submitted: "deduction_claim_submitted",
    claim_amended: "deduction_claim_amended",
    claim_response: "claim_response_submitted",
    arbiter_ruling: "arbiter_ruling_submitted",
    withdrawal_completed: "withdrawal_completed",
    timeout_executed: "timeout_executed",
    arbiter_replacement_proposed: "arbiter_replacement_proposed",
    arbiter_replacement_confirmed: "arbiter_replacement_confirmed",
    arbiter_replacement_cancelled: "arbiter_replacement_cancelled",
    arbiter_replacement_accepted: "arbiter_replacement_accepted",
    onchain_proposal_cancelled: "onchain_proposal_cancelled",
  };
  const expectedEvent = transactionEventByAction[body.type];
  const incomingTransactionHash = cleanText(body.transactionHash, 100);
  const recordedEvents = await eventsFor(db, id);
  if (expectedEvent && /^0x[a-fA-F0-9]{64}$/.test(incomingTransactionHash)) {
    const replayIsAuthorized = await authorizedReceiptReplay({
      db,
      id,
      row,
      role,
      token: body.token,
      actionType: body.type,
      expectedEvent,
      transactionHash: incomingTransactionHash,
      events: recordedEvents,
    });
    if (replayIsAuthorized) return json(await serialize(db, row));
  }

  const now = new Date().toISOString();
  const revision = Number(row.revision);
  const statements = [];
  let replacementInvite = null;
  let clearsPendingArbiterOnchain = false;

  if (body.type === "preflight_finalize") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may validate finalization readiness." }, 403);
    }
    if (row.status !== "ready") {
      return json(
        { error: "The current revision must be approved before it can be finalized." },
        409,
      );
    }
    let approvedTerms;
    try {
      approvedTerms = JSON.parse(row.terms_json);
    } catch {
      approvedTerms = null;
    }
    if (!(await validTerms(approvedTerms, env))) {
      return json(
        {
          error:
            "This approved revision does not match a current jurisdiction policy. Publish a new revision and collect fresh approvals before finalizing.",
        },
        409,
      );
    }
    const sourceGate = await complianceSourceGate(approvedTerms, env);
    if (!sourceGate.allowed) {
      return complianceSourceGateResponse(sourceGate);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "finalization_preflight_passed",
        `Validated revision ${revision} for onchain finalization.`,
        revision,
        {
          policyVersion: approvedTerms.policyVersion,
          sourceGateEnforced: sourceGate.enforced,
          sourceKeys: sourceGate.sources.map((sourceItem) => sourceItem.key),
        },
      ),
    );
  } else if (body.type === "cancel_proposal") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may cancel a proposal." }, 403);
    }
    if (row.status === "finalized") {
      return json(
        { error: "A finalized onchain agreement cannot be cancelled from the saved-proposal record." },
        409,
      );
    }
    if (row.status === "cancelled" || row.status === "superseded") {
      return json(await serialize(db, row));
    }
    statements.push(
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET status = 'cancelled', updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "proposal_cancelled",
        "Cancelled and removed this proposal from every party's active workspace. The timestamped record remains available for audit.",
        revision,
      ),
    );
  } else if (body.type === "onchain_proposal_cancelled") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may save an onchain proposal cancellation." }, 403);
    }
    if (row.status !== "finalized" || !row.onchain_agreement_id) {
      return json(
        { error: "Only a finalized, unfunded onchain agreement can save this cancellation." },
        409,
      );
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The cancellation transaction is invalid." }, 400);
    }
    clearsPendingArbiterOnchain = true;
    statements.push(
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET status = 'cancelled', updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "onchain_proposal_cancelled",
        "Cancelled the unfunded testnet agreement. It was removed from active deposits, and its timestamped Record remains available.",
        revision,
        { transactionHash },
      ),
    );
  } else if (body.type === "update_tenant_shares") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may update tenant deposit shares." }, 403);
    }
    if (row.status === "finalized") {
      return json({ error: "Tenant deposit shares cannot change after onchain finalization." }, 409);
    }
    const tenantRows = await tenantsFor(db, id);
    const requestedShares = Array.isArray(body.shares) ? body.shares : [];
    const shareMap = new Map(
      requestedShares.map((item) => [
        cleanText(item?.tenantId, 80),
        Number(item?.depositShareBps),
      ]),
    );
    const sharesAreValid =
      requestedShares.length === tenantRows.length &&
      shareMap.size === tenantRows.length &&
      tenantRows.every(
        (tenant) =>
          shareMap.has(tenant.id) &&
          Number.isInteger(shareMap.get(tenant.id)) &&
          shareMap.get(tenant.id) > 0 &&
          shareMap.get(tenant.id) <= 10000,
      ) &&
      [...shareMap.values()].reduce((total, value) => total + value, 0) === 10000;
    if (!sharesAreValid) {
      return json(
        { error: "Every tenant needs a positive deposit share and the shares must total exactly 100%." },
        400,
      );
    }
    const unchanged = tenantRows.every(
      (tenant) => Number(tenant.deposit_share_bps) === shareMap.get(tenant.id),
    );
    if (unchanged) {
      return json({ error: "Change at least one tenant share before saving." }, 400);
    }
    const nextRevision = revision + 1;
    statements.push(
      ...tenantRows.map((tenant) =>
        db
          .prepare(
            `UPDATE negotiation_tenants
             SET deposit_share_bps = ?, approved_revision = NULL, accepted_at = NULL
             WHERE negotiation_id = ? AND id = ?`,
          )
          .bind(shareMap.get(tenant.id), id, tenant.id),
      ),
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET revision = ?, status = 'draft', tenant_approved_revision = NULL,
               arbiter_approved_revision = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(nextRevision, now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "tenant_deposit_shares_updated",
        `Updated the tenant deposit ownership split. Revision ${nextRevision} now requires fresh approval from every tenant and the optional arbiter.`,
        nextRevision,
        {
          shares: tenantRows.map((tenant) => ({
            tenantId: tenant.id,
            email: tenant.email,
            depositShareBps: shareMap.get(tenant.id),
          })),
        },
      ),
    );
  } else if (body.type === "propose_change") {
    if (row.status === "finalized") {
      return json({ error: "Agreement terms can no longer be changed after onchain finalization." }, 409);
    }
    if (role !== "tenant" && role !== "arbiter") {
      return json({ error: "Only the invited tenant or arbiter may propose changes." }, 403);
    }
    const summary = cleanText(body.summary, 1000);
    if (summary.length < 8) return json({ error: "Describe the proposed change in more detail." }, 400);
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(db, id, now, role, "change_proposed", summary, revision),
    );
  } else if (body.type === "approve") {
    if (row.status === "finalized") {
      return json({ error: "This proposal has already been finalized onchain." }, 409);
    }
    if (role !== "tenant" && role !== "arbiter") {
      return json({ error: "Only the invited tenant or arbiter may approve." }, 403);
    }
    let approvalTerms;
    try {
      approvalTerms = JSON.parse(row.terms_json);
    } catch {
      approvalTerms = null;
    }
    const approvalAsset = approvalTerms?.depositAssetId
      ? getDepositAssetForTerms(approvalTerms)
      : null;
    if (approvalAsset?.consentRequired && body.assetConsent !== true) {
      return json(
        {
          error: `Affirmatively confirm the ${approvalAsset.displayName} disclosures before approving this revision.`,
        },
        400,
      );
    }
    if (!WALLET_PATTERN.test(body.wallet || "")) {
      return json({ error: "Connect a valid EVM wallet before approving." }, 400);
    }
    const participantName = cleanText(body.name, 120);
    if (role === "tenant") {
      const tenant = await tenantForToken(db, id, body.token);
      if (!tenant) {
        return json({ error: "This tenant invitation is no longer associated with the proposal." }, 403);
      }
      statements.push(
        db
          .prepare(
            `UPDATE negotiation_tenants
             SET approved_revision = ?, wallet = ?, accepted_at = ?
             WHERE id = ?`,
          )
          .bind(revision, body.wallet, now, tenant.id),
      );
      if (tenant.is_funding_tenant === 1) {
        statements.push(
          db
            .prepare(
              `UPDATE agreement_negotiations
               SET tenant_approved_revision = ?, tenant_wallet = ?, updated_at = ?
               WHERE id = ?`,
            )
            .bind(revision, body.wallet, now, id),
        );
      } else {
        statements.push(
          db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
        );
      }
      statements.push(
        eventStatement(
          db,
          id,
          now,
          role,
          "revision_approved",
          `Approved revision ${revision}${participantName ? ` as ${participantName}` : ""} and confirmed wallet ${body.wallet}.`,
          revision,
          {
            wallet: body.wallet,
            name: participantName,
            tenantId: tenant.id,
            isFundingTenant: tenant.is_funding_tenant === 1,
            assetConsent: approvalAsset?.consentRequired ? true : null,
            depositAssetId: approvalAsset?.id || null,
          },
        ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `UPDATE agreement_negotiations
             SET arbiter_approved_revision = ?, arbiter_wallet = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(revision, body.wallet, now, id),
        eventStatement(
          db,
          id,
          now,
          role,
          "revision_approved",
          `Approved revision ${revision}${participantName ? ` as ${participantName}` : ""} and confirmed wallet ${body.wallet}.`,
          revision,
          {
            wallet: body.wallet,
            name: participantName,
            assetConsent: approvalAsset?.consentRequired ? true : null,
            depositAssetId: approvalAsset?.id || null,
          },
        ),
      );
    }
  } else if (body.type === "revise") {
    if (row.status === "finalized") {
      return json({ error: "Agreement terms can no longer be revised after onchain finalization." }, 409);
    }
    if (role !== "landlord") return json({ error: "Only the landlord may revise the proposal." }, 403);
    if (!(await validTerms(body.terms, env))) {
      return json({ error: "The revised agreement terms are invalid." }, 400);
    }
    const sourceGate = await complianceSourceGate(body.terms, env);
    if (!sourceGate.allowed) {
      return complianceSourceGateResponse(sourceGate);
    }
    const summary = cleanText(body.summary, 1000);
    if (summary.length < 8) return json({ error: "Describe what changed in this revision." }, 400);
    const participants = {
      landlordName: cleanText(body.participants?.landlordName, 120),
      tenantName: cleanText(body.participants?.tenantName, 120),
      arbiterName: cleanText(body.participants?.arbiterName, 120),
    };
    const nextRevision = revision + 1;
    statements.push(
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET terms_json = ?, revision = ?, status = 'draft',
               tenant_approved_revision = NULL, arbiter_approved_revision = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(JSON.stringify(body.terms), nextRevision, now, id),
      db
        .prepare(
          "UPDATE negotiation_tenants SET approved_revision = NULL, accepted_at = NULL WHERE negotiation_id = ?",
        )
        .bind(id),
      eventStatement(
        db,
        id,
        now,
        role,
        "proposal_revised",
        `Published revision ${nextRevision}: ${summary}`,
        nextRevision,
        { terms: body.terms, participants },
      ),
    );
  } else if (body.type === "invitation_prepared") {
    if (row.status === "finalized") {
      return json({ error: "Use the claim-notice action after onchain finalization." }, 409);
    }
    if (role !== "landlord") return json({ error: "Only the landlord may prepare invitations." }, 403);
    if (body.invitedRole !== "tenant" && body.invitedRole !== "arbiter") {
      return json({ error: "The invited role is invalid." }, 400);
    }
    if (body.invitedRole === "arbiter" && !row.arbiter_email) {
      return json({ error: "This proposal does not include an arbiter." }, 400);
    }
    let invitedTenant = null;
    if (body.invitedRole === "tenant") {
      const tenantRows = await tenantsFor(db, id);
      invitedTenant =
        tenantRows.find((tenant) => tenant.id === body.invitedTenantId) ||
        tenantRows.find((tenant) => tenant.is_funding_tenant === 1) ||
        null;
      if (!invitedTenant) {
        return json({ error: "Choose a tenant invitation to prepare." }, 400);
      }
    }
    const method = body.method === "gmail" ? "Gmail" : "copied invitation";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "invitation_prepared",
        `Prepared the ${body.invitedRole} invitation${invitedTenant ? ` for ${invitedTenant.email}` : ""} using ${method}.`,
        revision,
        invitedTenant ? { tenantId: invitedTenant.id, email: invitedTenant.email } : null,
      ),
    );
  } else if (body.type === "finalize") {
    if (role !== "landlord") return json({ error: "Only the landlord may finalize the proposal." }, 403);
    if (row.status !== "ready") {
      return json({ error: "The current revision must be approved before it can be finalized." }, 409);
    }
    let approvedTerms;
    try {
      approvedTerms = JSON.parse(row.terms_json);
    } catch {
      approvedTerms = null;
    }
    if (!(await validTerms(approvedTerms, env))) {
      return json(
        {
          error:
            "This approved revision does not match a current jurisdiction policy. Publish a new revision and collect fresh approvals before finalizing.",
        },
        409,
      );
    }
    const sourceGate = await complianceSourceGate(approvedTerms, env);
    if (!sourceGate.allowed) {
      return complianceSourceGateResponse(sourceGate);
    }
    const agreementId = cleanText(body.agreementId, 80);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!agreementId || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The onchain agreement details are invalid." }, 400);
    }
    if (
      await finalizationReceiptAssignedElsewhere(
        db,
        id,
        transactionHash,
      )
    ) {
      return json(
        {
          error:
            "This finalization receipt is already assigned to another proposal record.",
        },
        409,
      );
    }
    statements.push(
      db
        .prepare(
          "UPDATE agreement_negotiations SET status = 'finalized', onchain_agreement_id = ?, onchain_tx_hash = ?, updated_at = ? WHERE id = ?",
        )
        .bind(agreementId, transactionHash, now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "posted_onchain",
        `Finalized as onchain agreement #${agreementId} in transaction ${transactionHash}.`,
        revision,
        { agreementId, transactionHash },
      ),
    );
  } else if (body.type === "propose_compliance_event") {
    if (row.status !== "finalized") {
      return json(
        { error: "Lifecycle events can be recorded only after onchain finalization." },
        409,
      );
    }
    if (role !== "landlord" && role !== "tenant") {
      return json(
        { error: "Only a landlord or tenant may propose a lifecycle event." },
        403,
      );
    }
    const eventName = cleanText(body.eventName, 80);
    const occurredAt = cleanText(body.occurredAt, 40);
    const normalizedOccurredAt = normalizeComplianceEventInstant(occurredAt);
    const occurredTime = normalizedOccurredAt
      ? new Date(normalizedOccurredAt).getTime()
      : Number.NaN;
    const note = cleanText(body.note, 500);
    let agreementTerms;
    try {
      agreementTerms = JSON.parse(row.terms_json);
    } catch {
      agreementTerms = null;
    }
    if (
      !complianceEventKeysForSnapshot(
        agreementTerms?.complianceSnapshot,
      ).has(eventName)
    ) {
      return json({ error: "That lifecycle event is not used by this compliance profile." }, 400);
    }
    if (!normalizedOccurredAt) {
      return json(
        {
          error:
            "Enter a complete, possible event date and time with its timezone.",
        },
        400,
      );
    }
    if (
      occurredTime > Date.now() + 5 * 60 * 1000 ||
      occurredTime < new Date(row.created_at).getTime()
    ) {
      return json(
        { error: "Enter the actual event time after proposal creation and not in the future." },
        400,
      );
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "compliance_event_proposed",
        `Proposed ${eventName} at ${normalizedOccurredAt} for confirmation by the other party.`,
        revision,
        {
          eventName,
          occurredAt: normalizedOccurredAt,
          note: note || null,
        },
      ),
    );
  } else if (body.type === "confirm_compliance_event") {
    if (row.status !== "finalized") {
      return json(
        { error: "Lifecycle events can be confirmed only after onchain finalization." },
        409,
      );
    }
    if (role !== "landlord" && role !== "tenant") {
      return json(
        { error: "Only a landlord or tenant may confirm a lifecycle event." },
        403,
      );
    }
    const proposalEventId = Number(body.proposalEventId);
    const proposal = recordedEvents.find(
      (event) =>
        Number(event.id) === proposalEventId &&
        event.action === "compliance_event_proposed",
    );
    if (!proposal) {
      return json({ error: "The proposed lifecycle event could not be found." }, 404);
    }
    if (proposal.actorRole === role) {
      return json(
        { error: "The other party must confirm this lifecycle event." },
        409,
      );
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "compliance_event_confirmed" &&
          Number(event.metadata?.proposalEventId) === proposalEventId,
      )
    ) {
      return json({ error: "This lifecycle event is already confirmed." }, 409);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "compliance_event_confirmed",
        `Confirmed ${proposal.metadata.eventName} at ${proposal.metadata.occurredAt}; compliance deadlines can now use this event.`,
        revision,
        {
          proposalEventId,
          eventName: proposal.metadata.eventName,
          occurredAt: proposal.metadata.occurredAt,
          proposedBy: proposal.actorRole,
          confirmedBy: role,
        },
      ),
    );
  } else if (body.type === "propose_compliance_fact") {
    if (row.status !== "finalized") {
      return json(
        { error: "Conditional compliance facts can be recorded only after onchain finalization." },
        409,
      );
    }
    if (role !== "landlord" && role !== "tenant") {
      return json(
        { error: "Only a landlord or tenant may propose a conditional compliance fact." },
        403,
      );
    }
    let agreementTerms;
    try {
      agreementTerms = JSON.parse(row.terms_json);
    } catch {
      agreementTerms = null;
    }
    const factName = cleanText(body.factName, 80);
    const definition = dynamicComplianceFactForProfile(
      agreementTerms?.complianceSnapshot,
      factName,
    );
    if (!definition || typeof body.value !== "boolean") {
      return json(
        { error: "That conditional fact is not used by this agreement's compliance profile." },
        400,
      );
    }
    const resolvedProposalIds = new Set(
      recordedEvents
        .filter(
          (event) =>
            event.action === "compliance_fact_confirmed" ||
            event.action === "compliance_fact_rejected",
        )
        .map((event) => Number(event.metadata?.proposalEventId)),
    );
    if (
      recordedEvents.some(
        (event) =>
          event.action === "compliance_fact_confirmed" &&
          event.metadata?.factName === factName,
      ) ||
      recordedEvents.some(
        (event) =>
          event.action === "compliance_fact_proposed" &&
          event.metadata?.factName === factName &&
          !resolvedProposalIds.has(Number(event.id)),
      )
    ) {
      return json(
        { error: "This conditional fact is already confirmed or awaiting confirmation." },
        409,
      );
    }
    const note = cleanText(body.note, 500);
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "compliance_fact_proposed",
        `Proposed ${definition.label}: ${body.value ? definition.trueLabel : definition.falseLabel}; awaiting confirmation by the other party.`,
        revision,
        {
          factName,
          label: definition.label,
          value: body.value,
          note: note || null,
        },
      ),
    );
  } else if (body.type === "confirm_compliance_fact") {
    if (row.status !== "finalized") {
      return json(
        { error: "Conditional compliance facts can be confirmed only after onchain finalization." },
        409,
      );
    }
    if (role !== "landlord" && role !== "tenant") {
      return json(
        { error: "Only a landlord or tenant may confirm a conditional compliance fact." },
        403,
      );
    }
    const proposalEventId = Number(body.proposalEventId);
    const proposal = recordedEvents.find(
      (event) =>
        Number(event.id) === proposalEventId &&
        event.action === "compliance_fact_proposed",
    );
    if (!proposal) {
      return json(
        { error: "The proposed conditional fact could not be found." },
        404,
      );
    }
    if (proposal.actorRole === role) {
      return json(
        { error: "The other party must confirm this conditional fact." },
        409,
      );
    }
    let agreementTerms;
    try {
      agreementTerms = JSON.parse(row.terms_json);
    } catch {
      agreementTerms = null;
    }
    const factName = cleanText(proposal.metadata?.factName, 80);
    const definition = dynamicComplianceFactForProfile(
      agreementTerms?.complianceSnapshot,
      factName,
    );
    if (
      !definition ||
      typeof proposal.metadata?.value !== "boolean"
    ) {
      return json(
        { error: "That conditional fact is no longer valid for this agreement." },
        409,
      );
    }
    if (recordedEvents.some(
      (event) =>
        (event.action === "compliance_fact_confirmed" ||
          event.action === "compliance_fact_rejected") &&
        Number(event.metadata?.proposalEventId) === proposalEventId,
    )) {
      return json(
        { error: "This conditional fact proposal is already resolved." },
        409,
      );
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "compliance_fact_confirmed",
        `Confirmed ${definition.label}: ${proposal.metadata.value ? definition.trueLabel : definition.falseLabel}; conditional deadline branches can now use this fact.`,
        revision,
        {
          proposalEventId,
          factName,
          label: definition.label,
          value: proposal.metadata.value,
          proposedBy: proposal.actorRole,
          confirmedBy: role,
        },
      ),
    );
  } else if (body.type === "reject_compliance_fact") {
    if (row.status !== "finalized") {
      return json(
        { error: "Conditional compliance facts can be rejected only after onchain finalization." },
        409,
      );
    }
    if (role !== "landlord" && role !== "tenant") {
      return json(
        { error: "Only a landlord or tenant may reject a conditional compliance fact." },
        403,
      );
    }
    const proposalEventId = Number(body.proposalEventId);
    const proposal = recordedEvents.find(
      (event) =>
        Number(event.id) === proposalEventId &&
        event.action === "compliance_fact_proposed",
    );
    if (!proposal) {
      return json(
        { error: "The proposed conditional fact could not be found." },
        404,
      );
    }
    if (proposal.actorRole === role) {
      return json(
        { error: "The other party must respond to this conditional fact." },
        409,
      );
    }
    if (recordedEvents.some(
      (event) =>
        (event.action === "compliance_fact_confirmed" ||
          event.action === "compliance_fact_rejected") &&
        Number(event.metadata?.proposalEventId) === proposalEventId,
    )) {
      return json(
        { error: "This conditional fact proposal is already resolved." },
        409,
      );
    }
    const note = cleanText(body.note, 500);
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "compliance_fact_rejected",
        `Did not confirm ${cleanText(proposal.metadata?.label, 120) || "the proposed conditional fact"}; a corrected proposal may now be recorded.`,
        revision,
        {
          proposalEventId,
          factName: cleanText(proposal.metadata?.factName, 80),
          value: proposal.metadata?.value,
          proposedBy: proposal.actorRole,
          rejectedBy: role,
          note: note || null,
        },
      ),
    );
  } else if (body.type === "arbiter_replacement_proposed") {
    if (role !== "landlord" && role !== "tenant") {
      return json({ error: "Only a landlord or tenant may propose a replacement arbiter." }, 403);
    }
    if (row.status !== "finalized" || !row.onchain_agreement_id) {
      return json({ error: "The agreement must be finalized before replacing its arbiter." }, 409);
    }
    if (await arbiterReplacementFor(db, id)) {
      return json({ error: "An arbiter replacement is already pending for this agreement." }, 409);
    }
    const email = normalizeEmail(body.newArbiterEmail);
    const wallet = cleanText(body.newArbiterWallet, 80).toLowerCase();
    const transactionHash = cleanText(body.transactionHash, 100);
    const tenantRows = await tenantsFor(db, id);
    const reservedEmails = new Set(
      [row.landlord_email, ...tenantRows.map((tenant) => tenant.email), row.arbiter_email]
        .filter(Boolean)
        .map(normalizeEmail),
    );
    const reservedWallets = new Set(
      [
        latestVerifiedLandlordWallet(recordedEvents),
        ...tenantRows.map((tenant) => cleanText(tenant.wallet, 80).toLowerCase()),
        cleanText(row.arbiter_wallet, 80).toLowerCase(),
      ].filter((walletValue) => WALLET_PATTERN.test(walletValue)),
    );
    if (!EMAIL_PATTERN.test(email)) {
      return json({ error: "Enter the replacement arbiter's valid email address." }, 400);
    }
    if (!WALLET_PATTERN.test(wallet)) {
      return json({ error: "Enter the replacement arbiter's valid EVM wallet." }, 400);
    }
    if (reservedEmails.has(email) || reservedWallets.has(wallet)) {
      return json(
        { error: "The replacement arbiter must use an email and wallet distinct from every current party." },
        400,
      );
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The replacement proposal transaction is invalid." }, 400);
    }
    const replacementToken = randomToken();
    const replacementHash = await hashToken(replacementToken);
    statements.push(
      db
        .prepare(
          `INSERT INTO arbiter_replacement_access
           (negotiation_id, email, wallet, token_hash, proposed_by_role, status,
            proposed_tx_hash, confirmed_tx_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'proposed', ?, NULL, ?, ?)`,
        )
        .bind(
          id,
          email,
          wallet,
          replacementHash,
          role,
          transactionHash,
          now,
          now,
        ),
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_replacement_proposed",
        `Proposed ${email} (${wallet}) as the replacement arbiter. The other agreement party must confirm before the invitation can open the private record.`,
        revision,
        {
          email,
          wallet,
          proposedByRole: role,
          transactionHash,
        },
      ),
    );
    replacementInvite = {
      email,
      wallet,
      token: replacementToken,
      availableAfterConfirmation: true,
    };
  } else if (body.type === "arbiter_replacement_confirmed") {
    if (role !== "landlord" && role !== "tenant") {
      return json({ error: "Only a landlord or tenant may confirm a replacement arbiter." }, 403);
    }
    const replacement = await arbiterReplacementFor(db, id);
    if (!replacement || replacement.status !== "proposed") {
      return json({ error: "There is no unconfirmed replacement-arbiter proposal." }, 409);
    }
    if (replacement.proposed_by_role === role) {
      return json({ error: "The other agreement party must confirm the replacement." }, 409);
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The replacement confirmation transaction is invalid." }, 400);
    }
    statements.push(
      db
        .prepare(
          `UPDATE arbiter_replacement_access
           SET status = 'confirmed', confirmed_tx_hash = ?, updated_at = ?
           WHERE negotiation_id = ? AND status = 'proposed'`,
        )
        .bind(transactionHash, now, id),
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_replacement_confirmed",
        `Confirmed ${replacement.email} (${replacement.wallet}) as the replacement arbiter. Their private-record invitation is now active.`,
        revision,
        {
          email: replacement.email,
          wallet: replacement.wallet,
          proposedByRole: replacement.proposed_by_role,
          confirmedByRole: role,
          transactionHash,
        },
      ),
    );
  } else if (body.type === "arbiter_replacement_cancelled") {
    const replacement = await arbiterReplacementFor(db, id);
    if (!replacement) {
      return json({ error: "There is no pending replacement-arbiter proposal." }, 409);
    }
    if (replacement.proposed_by_role !== role) {
      return json({ error: "Only the party who proposed this replacement may cancel it." }, 403);
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The replacement cancellation transaction is invalid." }, 400);
    }
    statements.push(
      db
        .prepare(
          `DELETE FROM negotiation_account_access
           WHERE token_hash IN (
             SELECT token_hash
             FROM arbiter_replacement_account_access
             WHERE negotiation_id = ?
           )`,
        )
        .bind(id),
      db
        .prepare(
          "DELETE FROM arbiter_replacement_account_access WHERE negotiation_id = ?",
        )
        .bind(id),
      db.prepare("DELETE FROM arbiter_replacement_access WHERE negotiation_id = ?").bind(id),
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_replacement_cancelled",
        `Cancelled the pending replacement of the arbiter. The nominee's private-record invitation was revoked.`,
        revision,
        {
          email: replacement.email,
          wallet: replacement.wallet,
          transactionHash,
        },
      ),
    );
  } else if (body.type === "arbiter_replacement_accepted") {
    const replacement = await arbiterReplacementFor(db, id);
    if (
      !replacement ||
      replacement.status !== "confirmed" ||
      (role !== "arbiter" && role !== "landlord" && role !== "tenant")
    ) {
      return json(
        { error: "Only an authorized agreement participant may save the verified acceptance." },
        403,
      );
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The replacement acceptance transaction is invalid." }, 400);
    }
    statements.push(
      db
        .prepare(
          "DELETE FROM negotiation_account_access WHERE negotiation_id = ? AND role = 'arbiter'",
        )
        .bind(id),
      db
        .prepare(
          "DELETE FROM arbiter_replacement_account_access WHERE negotiation_id = ?",
        )
        .bind(id),
      db
        .prepare(
          `UPDATE agreement_negotiations
           SET arbiter_email = ?, arbiter_wallet = ?, arbiter_token_hash = ?,
               arbiter_approved_revision = revision, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          replacement.email,
          replacement.wallet,
          replacement.token_hash,
          now,
          id,
        ),
      db.prepare("DELETE FROM arbiter_replacement_access WHERE negotiation_id = ?").bind(id),
      eventStatement(
        db,
        id,
        now,
        "arbiter",
        "arbiter_replacement_accepted",
        `Activated ${replacement.email} (${replacement.wallet}) as the current arbiter and revoked the former arbiter's private-record access.`,
        revision,
        {
          email: replacement.email,
          wallet: replacement.wallet,
          previousEmail: row.arbiter_email || null,
          previousWallet: row.arbiter_wallet || null,
          transactionHash,
        },
      ),
    );
  } else if (body.type === "arbiter_replacement_invite_reset") {
    if (role !== "landlord" && role !== "tenant") {
      return json({ error: "Only a landlord or tenant may reset the nominee's invitation." }, 403);
    }
    const replacement = await arbiterReplacementFor(db, id);
    if (!replacement) {
      return json({ error: "There is no pending replacement-arbiter invitation." }, 409);
    }
    const replacementToken = randomToken();
    const replacementHash = await hashToken(replacementToken);
    statements.push(
      db
        .prepare(
          `DELETE FROM negotiation_account_access
           WHERE token_hash IN (
             SELECT token_hash
             FROM arbiter_replacement_account_access
             WHERE negotiation_id = ?
           )`,
        )
        .bind(id),
      db
        .prepare(
          "DELETE FROM arbiter_replacement_account_access WHERE negotiation_id = ?",
        )
        .bind(id),
      db
        .prepare(
          `UPDATE arbiter_replacement_access
           SET token_hash = ?, updated_at = ?
           WHERE negotiation_id = ?`,
        )
        .bind(replacementHash, now, id),
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_replacement_invite_reset",
        `Reset the replacement-arbiter invitation for ${replacement.email}. Any prior nominee link was invalidated.`,
        revision,
        {
          email: replacement.email,
          wallet: replacement.wallet,
          status: replacement.status,
        },
      ),
    );
    replacementInvite = {
      email: replacement.email,
      wallet: replacement.wallet,
      token: replacementToken,
      availableAfterConfirmation: true,
    };
  } else if (body.type === "operations_reserve_paid") {
    if (role !== "tenant") {
      return json({ error: "Only the tenant may record the operations reserve payment." }, 403);
    }
    const tenant = await tenantForToken(db, id, body.token);
    if (!tenant) {
      return json({ error: "Only an approved tenant may pay a reserve share." }, 403);
    }
    if (row.status !== "finalized") {
      return json({ error: "The agreement must be finalized before the reserve is paid." }, 409);
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The operations reserve transaction is invalid." }, 400);
    }
    const tenantRows = await tenantsFor(db, id);
    if (
      tenantHasEvent(
        recordedEvents,
        ["operations_reserve_paid"],
        tenant,
        tenantRows,
      )
    ) {
      return json(
        { error: "This tenant's operations-reserve payment is already recorded." },
        409,
      );
    }
    const tenantIndex = tenantRows.findIndex((candidate) => candidate.id === tenant.id);
    const baseReserveMicros = 5_000_000n / BigInt(tenantRows.length);
    const expectedReserveMicros =
      tenantIndex === tenantRows.length - 1
        ? 5_000_000n - baseReserveMicros * BigInt(tenantRows.length - 1)
        : baseReserveMicros;
    const incomingReserveMicros =
      body.amount === undefined ? expectedReserveMicros : tokenMicros(body.amount);
    if (incomingReserveMicros !== expectedReserveMicros) {
      return json({ error: "This reserve payment does not match the tenant's equal share." }, 400);
    }
    const reserveAmount = Number(expectedReserveMicros) / 1_000_000;
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "operations_reserve_paid",
        `${tenant.email} paid ${reserveAmount} testUSDC toward the separate $5 testUSDC network and document-storage reserve in transaction ${transactionHash}.`,
        revision,
        { amount: String(reserveAmount), tenantId: tenant.id, token: "testUSDC", transactionHash },
      ),
    );
  } else if (body.type === "tenant_share_funded" || body.type === "agreement_funded") {
    if (role !== "tenant") {
      return json({ error: "Only the tenant may record the deposit funding transaction." }, 403);
    }
    const tenant = await tenantForToken(db, id, body.token);
    if (!tenant) {
      return json({ error: "Only an approved tenant may fund a deposit share." }, 403);
    }
    if (row.status !== "finalized") {
      return json({ error: "The agreement must be finalized before its deposit is funded." }, 409);
    }
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The deposit funding transaction is invalid." }, 400);
    }
    const tenantRows = await tenantsFor(db, id);
    if (
      tenantHasEvent(
        recordedEvents,
        ["tenant_share_funded", "agreement_funded"],
        tenant,
        tenantRows,
      )
    ) {
      return json(
        { error: "This tenant's approved deposit share is already recorded as funded." },
        409,
      );
    }
    const tenantIndex = tenantRows.findIndex((candidate) => candidate.id === tenant.id);
    const depositMicros = tokenMicros(JSON.parse(row.terms_json).deposit);
    if (depositMicros === null) {
      return json({ error: "The approved deposit amount is invalid." }, 409);
    }
    let allocatedMicros = 0n;
    for (let index = 0; index < tenantRows.length - 1; index += 1) {
      allocatedMicros +=
        (depositMicros * BigInt(tenantRows[index].deposit_share_bps)) / 10_000n;
    }
    const expectedContributionMicros =
      tenantIndex === tenantRows.length - 1
        ? depositMicros - allocatedMicros
        : (depositMicros * BigInt(tenant.deposit_share_bps)) / 10_000n;
    const incomingContributionMicros =
      body.amount === undefined ? expectedContributionMicros : tokenMicros(body.amount);
    if (incomingContributionMicros !== expectedContributionMicros) {
      return json({ error: "This funding receipt does not match the tenant's approved share." }, 400);
    }
    const contributionAmount = Number(expectedContributionMicros) / 1_000_000;
    const eventAction =
      body.type === "tenant_share_funded" ? "tenant_share_funded" : "agreement_funded";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        eventAction,
        `${tenant.email} accepted the finalized agreement and funded ${contributionAmount} of the refundable security deposit in transaction ${transactionHash}.`,
        revision,
        {
          amount: String(contributionAmount),
          depositShareBps: tenant.deposit_share_bps,
          tenantId: tenant.id,
          transactionHash,
        },
      ),
    );
  } else if (body.type === "record_snapshot_anchored") {
    if (row.status !== "finalized") {
      return json({ error: "Finalize the agreement before anchoring its record." }, 409);
    }
    const snapshotHash = cleanText(body.snapshotHash, 100);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (
      !/^0x[a-fA-F0-9]{64}$/.test(snapshotHash) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The record-anchor receipt is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "record_snapshot_anchored",
        `Anchored agreement record snapshot ${snapshotHash} onchain in transaction ${transactionHash}.`,
        revision,
        { snapshotHash, transactionHash },
      ),
    );
  } else if (body.type === "activity_hash_published") {
    if (row.status !== "finalized") {
      return json({ error: "Finalize the agreement before publishing activity receipts." }, 409);
    }
    const activityType = Number(body.activityType);
    const contentHash = cleanText(body.contentHash, 100);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (
      ![1, 2, 3, 4].includes(activityType) ||
      !/^0x[a-fA-F0-9]{64}$/.test(contentHash) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The activity receipt is incomplete." }, 400);
    }
    const labels = {
      1: "private note",
      2: "document",
      3: "formal notice",
      4: "decision",
    };
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "activity_hash_published",
        `Published a privacy-safe ${labels[activityType]} hash onchain in transaction ${transactionHash}.`,
        revision,
        { activityType, contentHash, transactionHash },
      ),
    );
  } else if (body.type === "claim_submitted") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may submit a deduction claim." }, 403);
    }
    if (row.status !== "finalized") {
      return json({ error: "The agreement must be finalized onchain before a deduction claim." }, 409);
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "deduction_claim_submitted" ||
          (event.action === "timeout_executed" &&
            event.metadata?.timeout === "no_claim_refund"),
      )
    ) {
      return json(
        { error: "A deduction claim or no-claim refund is already recorded for this agreement." },
        409,
      );
    }
    const amount = cleanText(body.amount, 80);
    const category = cleanText(body.category, 120);
    const items = cleanDeductionItems(body.items);
    const note = cleanText(body.note, 1000);
    const evidenceUri = cleanText(body.evidenceUri, 500);
    const evidenceHash = cleanText(body.evidenceHash, 100);
    const claimConfirmations =
      body.claimConfirmations || body.californiaConfirmations;
    const transactionHash = cleanText(body.transactionHash, 100);
    const agreementTerms = JSON.parse(row.terms_json);
    const amountMicros = tokenMicros(amount);
    const depositMicros = tokenMicros(agreementTerms.deposit);
    if (
      !amount ||
      amountMicros === null ||
      amountMicros <= 0n ||
      depositMicros === null ||
      amountMicros > depositMicros ||
      !category ||
      !items ||
      !deductionItemsMatchAmount(items, amount) ||
      items.some((item) => tokenMicros(item.amount) === 0n) ||
      !validClaimForTerms(
        items,
        claimConfirmations,
        evidenceUri,
        evidenceHash,
        agreementTerms,
      ) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The recorded deduction claim is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "deduction_claim_submitted",
        `Submitted an itemized ${amount}-share deduction claim with ${items.length} line item${items.length === 1 ? "" : "s"} (${category})${note ? `: ${note}` : "."}${evidenceUri ? " Supporting documentation attached." : ""}`,
        revision,
        {
          amount,
          category,
          items,
          note,
          evidenceUri,
          evidenceHash,
          claimConfirmations,
          transactionHash,
          policyVersion: agreementTerms.policyVersion,
        },
      ),
    );
  } else if (body.type === "claim_notification_prepared") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may prepare the tenant claim notice." }, 403);
    }
    if (!latestClaimEvent(recordedEvents)) {
      return json({ error: "Submit the deduction claim before preparing its notice." }, 409);
    }
    const method = body.method === "copy" ? "copied email" : "Gmail";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "claim_notification_prepared",
        `Prepared the tenant deduction-claim notice using ${method}.`,
        revision,
      ),
    );
  } else if (body.type === "claim_amended") {
    if (role !== "landlord") {
      return json({ error: "Only the landlord may amend a deduction claim." }, 403);
    }
    const priorClaim = latestClaimEvent(recordedEvents);
    if (!priorClaim || priorClaim.action !== "deduction_claim_submitted") {
      return json(
        { error: "A submitted deduction claim is required before recording an amendment." },
        409,
      );
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "claim_response_submitted" ||
          event.action === "arbiter_ruling_submitted" ||
          event.action === "deduction_claim_amended" ||
          (event.action === "timeout_executed" &&
            event.metadata?.timeout !== "no_claim_refund"),
      )
    ) {
      return json(
        { error: "The deduction claim can no longer be amended after a response, timeout, ruling, or prior amendment." },
        409,
      );
    }
    const amount = cleanText(body.amount, 80);
    const items = cleanDeductionItems(body.items);
    const note = cleanText(body.note, 1000);
    const evidenceUri = cleanText(body.evidenceUri, 500);
    const evidenceHash = cleanText(body.evidenceHash, 100);
    const claimConfirmations =
      body.claimConfirmations || body.californiaConfirmations;
    const transactionHash = cleanText(body.transactionHash, 100);
    const agreementTerms = JSON.parse(row.terms_json);
    const amendedMicros = tokenMicros(amount);
    const priorClaimMicros = tokenMicros(priorClaim.metadata?.amount);
    if (
      !amount ||
      amendedMicros === null ||
      priorClaimMicros === null ||
      amendedMicros > priorClaimMicros ||
      !items ||
      !deductionItemsMatchAmount(items, amount) ||
      !validClaimForTerms(
        items,
        claimConfirmations,
        evidenceUri,
        evidenceHash,
        agreementTerms,
      ) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The recorded claim amendment is incomplete." }, 400);
    }
    clearsPendingArbiterOnchain = amendedMicros === 0n;
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "deduction_claim_amended",
        `Amended the itemized deduction claim to ${amount} shares across ${items.length} line item${items.length === 1 ? "" : "s"}${note ? `: ${note}` : "."}${evidenceUri ? " Supporting documentation attached." : ""}`,
        revision,
        {
          amount,
          items,
          note,
          evidenceUri,
          evidenceHash,
          claimConfirmations,
          transactionHash,
          policyVersion: agreementTerms.policyVersion,
        },
      ),
    );
  } else if (body.type === "claim_response") {
    if (role !== "tenant") {
      return json({ error: "Only the tenant may approve or dispute a deduction claim." }, 403);
    }
    const tenant = await tenantForToken(db, id, body.token);
    if (!tenant) {
      return json({ error: "Only an invited tenant may answer the deduction claim." }, 403);
    }
    const tenantRows = await tenantsFor(db, id);
    const claim = latestClaimEvent(recordedEvents);
    const claimMicros = tokenMicros(claim?.metadata?.amount);
    if (!claim || claimMicros === null || claimMicros <= 0n) {
      return json({ error: "A positive deduction claim must be recorded before a tenant response." }, 409);
    }
    if (
      tenantHasEvent(
        recordedEvents,
        ["claim_response_submitted"],
        tenant,
        tenantRows,
      )
    ) {
      return json({ error: "This tenant has already responded to the deduction claim." }, 409);
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "arbiter_ruling_submitted" ||
          (event.action === "timeout_executed" &&
            (event.metadata?.timeout === "no_response_dispute" ||
              event.metadata?.timeout === "arbiter_timeout_refund")),
      )
    ) {
      return json({ error: "The claim response period has already been resolved onchain." }, 409);
    }
    if (!["approve", "partial", "dispute"].includes(body.decision)) {
      return json({ error: "The tenant response is invalid." }, 400);
    }
    const acceptedAmount = cleanText(body.acceptedAmount, 80);
    const acceptedMicros = tokenMicros(acceptedAmount);
    const note = cleanText(body.note, 1000);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (
      acceptedMicros === null ||
      acceptedMicros > claimMicros ||
      (body.decision === "approve" && acceptedMicros !== claimMicros) ||
      (body.decision === "partial" &&
        (acceptedMicros === 0n || acceptedMicros >= claimMicros)) ||
      (body.decision === "dispute" && acceptedMicros !== 0n) ||
      (body.decision !== "dispute" && acceptedMicros === 0n) ||
      ((body.decision === "partial" || body.decision === "dispute") && !note) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The tenant response record is incomplete." }, 400);
    }
    const decisionLabel =
      body.decision === "approve"
        ? "approved the deduction in full"
        : body.decision === "dispute"
          ? "disputed the deduction in full"
          : `accepted ${acceptedAmount} shares and disputed the remainder`;
    const stateAfterResponse = claimDisputeState(
      [
        ...recordedEvents,
        {
          actorRole: "tenant",
          action: "claim_response_submitted",
          metadata: {
            tenantId: tenant.id,
            acceptedAmount,
          },
        },
      ],
      tenantRows,
    );
    clearsPendingArbiterOnchain =
      stateAfterResponse.responses.allResponded &&
      stateAfterResponse.disputedMicros === 0n;
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "claim_response_submitted",
        `${cleanText(tenant.name, 160) || cleanText(tenant.email, 320) || "Tenant"} ${decisionLabel}${note ? `: ${note}` : "."}`,
        revision,
        {
          tenantId: tenant.id,
          decision: body.decision,
          acceptedAmount,
          note,
          transactionHash,
        },
      ),
    );
  } else if (body.type === "claim_response_notification_prepared") {
    if (role !== "tenant") {
      return json({ error: "Only a tenant may prepare the landlord response notice." }, 403);
    }
    const tenant = await tenantForToken(db, id, body.token);
    if (!tenant) {
      return json({ error: "Only an invited tenant may prepare the landlord response notice." }, 403);
    }
    const tenantRows = await tenantsFor(db, id);
    if (
      !tenantHasEvent(
        recordedEvents,
        ["claim_response_submitted"],
        tenant,
        tenantRows,
      )
    ) {
      return json(
        { error: "Record this tenant's claim response before preparing its email notice." },
        409,
      );
    }
    const method = body.method === "copy" ? "copied email" : "Gmail";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "claim_response_notification_prepared",
        `${cleanText(tenant.name, 160) || cleanText(tenant.email, 320) || "Tenant"} prepared the landlord claim-response notice using ${method}.`,
        revision,
        { tenantId: tenant.id, method: body.method === "copy" ? "copy" : "gmail" },
      ),
    );
  } else if (body.type === "arbiter_ruling") {
    if (role !== "arbiter") {
      return json({ error: "Only the appointed arbiter may record a ruling." }, 403);
    }
    if (recordedEvents.some((event) => event.action === "arbiter_ruling_submitted")) {
      return json({ error: "The arbiter ruling is already recorded." }, 409);
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "timeout_executed" &&
          event.metadata?.timeout === "arbiter_timeout_refund",
      )
    ) {
      return json({ error: "The arbiter ruling deadline has already been resolved onchain." }, 409);
    }
    const tenantRows = await tenantsFor(db, id);
    const dispute = claimDisputeState(recordedEvents, tenantRows);
    if (!dispute.disputeOpened || dispute.disputedMicros <= 0n) {
      return json(
        { error: "A recorded deduction dispute is required before an arbiter ruling." },
        409,
      );
    }
    const award = cleanText(body.awardToLandlord, 80);
    const awardMicros = tokenMicros(award);
    const note = cleanText(body.note, 1000);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (
      awardMicros === null ||
      awardMicros > dispute.disputedMicros ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The arbiter ruling record is incomplete." }, 400);
    }
    clearsPendingArbiterOnchain = true;
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "arbiter_ruling_submitted",
        `Awarded ${award} disputed shares to the landlord${note ? `: ${note}` : "."}`,
        revision,
        { awardToLandlord: award, note, transactionHash },
      ),
    );
  } else if (body.type === "withdrawal_completed") {
    if (role !== "landlord" && role !== "tenant") {
      return json({ error: "Only the withdrawing landlord or tenant may record a withdrawal." }, 403);
    }
    if (row.status !== "finalized") {
      return json({ error: "The agreement must be finalized before a withdrawal." }, 409);
    }
    const tenantRows = await tenantsFor(db, id);
    if (!resolutionEvent(recordedEvents, tenantRows)) {
      return json(
        { error: "A claim decision, ruling, or refund must be resolved before recording a withdrawal." },
        409,
      );
    }
    const withdrawingTenant =
      role === "tenant" ? await tenantForToken(db, id, body.token) : null;
    if (role === "tenant" && !withdrawingTenant) {
      return json({ error: "Only an invited tenant may record this withdrawal." }, 403);
    }
    const withdrawalAlreadyRecorded =
      role === "landlord"
        ? recordedEvents.some(
            (event) =>
              event.action === "withdrawal_completed" &&
              event.actorRole === "landlord",
          )
        : tenantHasEvent(
            recordedEvents,
            ["withdrawal_completed"],
            withdrawingTenant,
            tenantRows,
          );
    if (withdrawalAlreadyRecorded) {
      return json({ error: "This party's withdrawal is already recorded." }, 409);
    }
    const amount = cleanText(body.amount, 80);
    const amountMicros = tokenMicros(amount);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (
      amountMicros === null ||
      amountMicros <= 0n ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The withdrawal receipt is incomplete." }, 400);
    }
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "withdrawal_completed",
        `${role === "landlord" ? "Landlord" : cleanText(withdrawingTenant?.name, 160) || "Tenant"} withdrew ${amount} shares in transaction ${transactionHash}.`,
        revision,
        {
          amount,
          transactionHash,
          tenantId: withdrawingTenant?.id || null,
        },
      ),
    );
  } else if (body.type === "timeout_executed") {
    const timeoutLabels = {
      no_claim_refund: "Executed the no-claim full tenant refund",
      no_response_dispute: "Escalated the unanswered deduction claim to a dispute",
      arbiter_timeout_refund: "Executed the arbiter-timeout tenant refund",
    };
    const timeout = cleanText(body.timeout, 80);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!timeoutLabels[timeout] || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The deadline-action receipt is incomplete." }, 400);
    }
    if (
      recordedEvents.some(
        (event) =>
          event.action === "timeout_executed" &&
          event.metadata?.timeout === timeout,
      )
    ) {
      return json({ error: "This deadline action is already recorded." }, 409);
    }
    const tenantRows = await tenantsFor(db, id);
    const actingTenant =
      role === "tenant" ? await tenantForToken(db, id, body.token) : null;
    if (role === "tenant" && !actingTenant) {
      return json(
        { error: "Only an invited tenant may record this deadline action." },
        403,
      );
    }
    const dispute = claimDisputeState(recordedEvents, tenantRows);
    if (timeout === "no_claim_refund") {
      if (role !== "tenant") {
        return json({ error: "Only a tenant may record the no-claim refund." }, 403);
      }
      if (latestClaimEvent(recordedEvents)) {
        return json(
          { error: "A deduction claim is already recorded, so the no-claim refund does not apply." },
          409,
        );
      }
    }
    if (timeout === "no_response_dispute") {
      if (!dispute.claim || dispute.claimMicros === null || dispute.claimMicros <= 0n) {
        return json(
          { error: "A positive deduction claim is required before recording a no-response dispute." },
          409,
        );
      }
      if (dispute.responses.allResponded) {
        return json(
          { error: "Every tenant already responded, so the no-response action does not apply." },
          409,
        );
      }
    }
    if (timeout === "arbiter_timeout_refund") {
      if (!dispute.disputeOpened || dispute.disputedMicros <= 0n) {
        return json(
          { error: "A recorded deduction dispute is required before an arbiter-timeout refund." },
          409,
        );
      }
      if (recordedEvents.some((event) => event.action === "arbiter_ruling_submitted")) {
        return json(
          { error: "The arbiter already ruled, so the timeout refund does not apply." },
          409,
        );
      }
    }
    clearsPendingArbiterOnchain =
      timeout === "no_claim_refund" || timeout === "arbiter_timeout_refund";
    statements.push(
      db.prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?").bind(now, id),
      eventStatement(
        db,
        id,
        now,
        role,
        "timeout_executed",
        `${timeoutLabels[timeout]} in transaction ${transactionHash}.`,
        revision,
        {
          timeout,
          transactionHash,
          tenantId: actingTenant?.id || null,
        },
      ),
    );
  } else {
    return json({ error: "Unsupported agreement action." }, 400);
  }

  if (clearsPendingArbiterOnchain) {
    const expiringReplacement = await arbiterReplacementFor(db, id);
    if (expiringReplacement) {
      statements.push(
        db
          .prepare(
            `DELETE FROM negotiation_account_access
             WHERE token_hash IN (
               SELECT token_hash
               FROM arbiter_replacement_account_access
               WHERE negotiation_id = ?
             )`,
          )
          .bind(id),
        db
          .prepare(
            "DELETE FROM arbiter_replacement_account_access WHERE negotiation_id = ?",
          )
          .bind(id),
        db.prepare("DELETE FROM arbiter_replacement_access WHERE negotiation_id = ?").bind(id),
        eventStatement(
          db,
          id,
          now,
          "system",
          "arbiter_replacement_expired",
          "Revoked the unaccepted replacement-arbiter invitation because the verified onchain lifecycle action closed the agreement.",
          revision,
          {
            email: expiringReplacement.email,
            wallet: expiringReplacement.wallet,
            closedByAction: body.type,
            transactionHash: incomingTransactionHash,
          },
        ),
      );
    }
  }

  if (
    expectedEvent &&
    receiptVerificationEnabled(env) &&
    /^0x[a-fA-F0-9]{64}$/.test(incomingTransactionHash)
  ) {
    const verification = await verifiedBaseSepoliaReceipt(
      env,
      db,
      body,
      row,
      role,
      recordedEvents,
      incomingTransactionHash,
    );
    if (!verification.ok) {
      return json({ error: verification.error }, verification.status);
    }
    if (verification.recoveredLegacyLandlord) {
      statements.push(
        eventStatement(
          db,
          id,
          now,
          "system",
          "transaction_receipt_verified",
          `Recovered and verified the original agreement creator on Base Sepolia in block ${verification.recoveredLegacyLandlord.blockNumber}.`,
          revision,
          {
            eventType: "posted_onchain",
            transactionHash:
              verification.recoveredLegacyLandlord.transactionHash,
            blockNumber: verification.recoveredLegacyLandlord.blockNumber,
            chainId: 84532,
            actorAddress:
              verification.recoveredLegacyLandlord.actorAddress,
            recoveredForLegacyRecord: true,
          },
        ),
      );
    }
    statements.push(
      eventStatement(
        db,
        id,
        now,
        "system",
        "transaction_receipt_verified",
        `Verified the ${expectedEvent.replaceAll("_", " ")} receipt on Base Sepolia in block ${verification.blockNumber}.`,
        revision,
        {
          eventType: expectedEvent,
          transactionHash: incomingTransactionHash,
          blockNumber: verification.blockNumber,
          chainId: 84532,
          actorAddress: verification.actorAddress,
        },
      ),
    );
  }

  try {
    await db.batch(statements);
  } catch (cause) {
    if (expectedEvent && /^0x[a-fA-F0-9]{64}$/.test(incomingTransactionHash)) {
      if (
        body.type === "finalize" &&
        (await finalizationReceiptAssignedElsewhere(
          db,
          id,
          incomingTransactionHash,
        ))
      ) {
        return json(
          {
            error:
              "This finalization receipt is already assigned to another proposal record.",
          },
          409,
        );
      }
      const latestRow = await rowFor(db, id);
      const latestEvents = await eventsFor(db, id);
      const replayIsAuthorized = await authorizedReceiptReplay({
        db,
        id,
        row: latestRow,
        role,
        token: body.token,
        actionType: body.type,
        expectedEvent,
        transactionHash: incomingTransactionHash,
        events: latestEvents,
      });
      if (replayIsAuthorized) {
        return json(await serialize(db, latestRow));
      }
      const receiptIsAlreadyAssigned = latestEvents.some(
        (event) =>
          event.action === expectedEvent &&
          event.metadata?.transactionHash?.toLowerCase() ===
            incomingTransactionHash.toLowerCase(),
      );
      if (receiptIsAlreadyAssigned) {
        return json(
          {
            error:
              "This transaction receipt is already assigned to another participant action.",
          },
          409,
        );
      }
    }
    throw cause;
  }
  let updated = await rowFor(db, id);
  if (body.type === "approve") {
    const tenantRows = await tenantsFor(db, id);
    const tenantApproved =
      tenantRows.length > 0 &&
      tenantRows.every(
        (tenant) => Number(tenant.approved_revision) === Number(updated.revision),
      );
    const arbiterApproved = !updated.arbiter_email || updated.arbiter_approved_revision === updated.revision;
    if (tenantApproved && arbiterApproved && updated.status !== "ready") {
      const readyAt = new Date().toISOString();
      await db.batch([
        db
          .prepare("UPDATE agreement_negotiations SET status = 'ready', updated_at = ? WHERE id = ?")
          .bind(readyAt, id),
        eventStatement(
          db,
          id,
          readyAt,
          "system",
          "proposal_ready",
          `All required parties approved revision ${updated.revision}; it is ready for onchain finalization.`,
          updated.revision,
        ),
      ]);
      updated = await rowFor(db, id);
      try {
        const messageId = await sendLandlordReadyNotification(request, env, updated);
        if (messageId) {
          const notifiedAt = new Date().toISOString();
          await db.batch([
            db
              .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
              .bind(notifiedAt, id),
            eventStatement(
              db,
              id,
              notifiedAt,
              "system",
              "landlord_ready_notification_sent",
              `Notified ${updated.landlord_email} that revision ${updated.revision} is approved and ready for onchain finalization.`,
              updated.revision,
              { messageId },
            ),
          ]);
          updated = await rowFor(db, id);
        }
      } catch {
        // Approval must still succeed if the optional email provider is unavailable.
      }
    }
  }
  if (
    body.type === "finalize" ||
    body.type === "cancel_proposal" ||
    body.type === "onchain_proposal_cancelled" ||
    body.type === "tenant_share_funded" ||
    body.type === "agreement_funded" ||
    body.type === "claim_submitted" ||
    body.type === "claim_amended" ||
    body.type === "claim_response" ||
    body.type === "arbiter_ruling" ||
    body.type === "withdrawal_completed" ||
    body.type === "timeout_executed" ||
    body.type === "arbiter_replacement_proposed" ||
    body.type === "arbiter_replacement_confirmed" ||
    body.type === "arbiter_replacement_cancelled" ||
    body.type === "arbiter_replacement_accepted"
  ) {
    try {
      const notificationEventType =
        body.type === "claim_amended" && tokenMicros(body.amount) === 0n
          ? "claim_retracted"
          : body.type === "timeout_executed"
            ? {
                no_claim_refund: "no_claim_refund_available",
                no_response_dispute: "response_timeout_escalated",
                arbiter_timeout_refund: "arbiter_timeout_allocation",
              }[body.timeout]
            : body.type;
      const deliveries = await sendOptedInAgreementActivityEmails(
        request,
        env,
        updated,
        notificationEventType,
        body,
      );
      if (deliveries.length) {
        const notifiedAt = new Date().toISOString();
        await db.batch([
          db
            .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
            .bind(notifiedAt, id),
          ...deliveries.map((delivery) =>
            eventStatement(
              db,
              id,
              notifiedAt,
              "system",
              "agreement_activity_notification_sent",
              `Sent the ${notificationEventType.replaceAll("_", " ")} notice to the opted-in ${delivery.recipientRole}.`,
              updated.revision,
              {
                eventType: notificationEventType,
                recipientRole: delivery.recipientRole,
                messageId: delivery.messageId,
              },
            ),
          ),
        ]);
        updated = await rowFor(db, id);
      }
    } catch {
      // The recorded agreement action must not fail if optional email delivery is unavailable.
    }
  }
  const serialized = await serialize(db, updated);
  return replacementInvite
    ? json({ record: serialized, invite: replacementInvite })
    : json(serialized);
}

async function uploadEvidence(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  if (!env.EVIDENCE && !env.PINATA_JWT) {
    return json(
      {
        error:
          "Secure evidence storage is not configured yet. Configure the OpenEscrow evidence vault before attaching a supporting file.",
      },
      503,
    );
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Choose a valid supporting file upload." }, 400);
  }
  const proposalId = cleanText(form.get("proposalId"), 80);
  const token = cleanText(form.get("token"), 200);
  const file = form.get("file");
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(env.DB, row, token);
  if (!role || (role !== "landlord" && role !== "tenant")) {
    return json({ error: "Only an agreement party may upload claim evidence." }, 403);
  }
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "Choose an invoice or supporting document to upload." }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return json({ error: "Evidence files are limited to 10 MB in this MVP." }, 413);
  }
  const allowedTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!allowedTypes.has(file.type)) {
    return json({ error: "Upload a PDF, JPEG, PNG, or WebP evidence file." }, 415);
  }

  const bytes = await file.arrayBuffer();
  const contentType = detectedEvidenceContentType(bytes);
  if (!contentType || contentType !== file.type) {
    return json(
      {
        error:
          "The selected file contents do not match a supported PDF, JPEG, PNG, or WebP document.",
      },
      415,
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = `0x${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  const now = new Date().toISOString();
  const evidenceId = crypto.randomUUID();
  const requestedMode = cleanText(env.EVIDENCE_STORAGE_MODE, 40);
  const storeOnIpfs =
    requestedMode === "encrypted-ipfs" ||
    (!env.EVIDENCE && Boolean(env.PINATA_JWT));
  if (storeOnIpfs && (!env.PINATA_JWT || !env.EVIDENCE_ENCRYPTION_KEY)) {
    return json(
      {
        error:
          "Decentralized evidence storage requires both PINATA_JWT and EVIDENCE_ENCRYPTION_KEY so no private document is published as plaintext.",
      },
      503,
    );
  }

  let storedBytes = bytes;
  let encryptionVersion = null;
  let encryptionIv = null;
  let encryptionKeyId = null;
  let encryptionKeyFingerprint = null;
  if (env.EVIDENCE_ENCRYPTION_KEY) {
    try {
      const encrypted = await encryptEvidenceBytes(env, evidenceId, bytes);
      storedBytes = encrypted.bytes;
      encryptionVersion = encrypted.version;
      encryptionIv = encrypted.iv;
      encryptionKeyId = encrypted.keyId;
      encryptionKeyFingerprint = encrypted.keyFingerprint;
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Evidence encryption could not be initialized.",
        },
        503,
      );
    }
  }

  if (!storeOnIpfs && env.EVIDENCE) {
    const objectKey = `agreements/${proposalId}/${evidenceId}`;
    try {
      await env.EVIDENCE.put(objectKey, storedBytes, {
        httpMetadata: {
          contentType: encryptionVersion ? "application/octet-stream" : contentType,
        },
        customMetadata: {
          negotiationId: proposalId,
          uploaderRole: role,
          sha256,
          encrypted: encryptionVersion ? "true" : "false",
          ...(encryptionKeyId ? { encryptionKeyId } : {}),
        },
      });
    } catch {
      return json(
        {
          error:
            "Private evidence storage is temporarily unavailable. Try the upload again before submitting the claim.",
        },
        503,
      );
    }
    const uri = `openescrow://evidence/${evidenceId}`;
    const storageKind = encryptionVersion ? "encrypted-r2" : "private-r2";
    try {
      await env.DB.batch([
        env.DB
          .prepare(
            `INSERT INTO evidence_files
             (id, negotiation_id, uploader_role, storage_kind, object_key, cid,
               original_name, content_type, size_bytes, sha256, encryption_version,
               encryption_iv, encryption_key_id, encryption_key_fingerprint, created_at)
              VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            evidenceId,
            proposalId,
            role,
            storageKind,
            objectKey,
            cleanText(file.name, 240) || "evidence",
            contentType,
            file.size,
            sha256,
            encryptionVersion,
            encryptionIv,
            encryptionKeyId,
            encryptionKeyFingerprint,
            now,
          ),
        env.DB
          .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
          .bind(now, proposalId),
        eventStatement(
          env.DB,
          proposalId,
          now,
          role,
          "evidence_uploaded",
          `Uploaded a private ${contentType} supporting file${encryptionVersion ? " encrypted at rest" : ""}. OpenEscrow verified its integrity.`,
          row.revision,
          {
            evidenceId,
            uri,
            sha256,
            size: file.size,
            type: contentType,
            storageKind,
            encrypted: Boolean(encryptionVersion),
            encryptionKeyId,
          },
        ),
      ]);
    } catch {
      try {
        await env.EVIDENCE.delete(objectKey);
      } catch {
        // The request still fails closed. Operators can reconcile an
        // incomplete object from the negotiation and evidence identifiers.
      }
      return json(
        {
          error:
            "OpenEscrow could not finish recording this supporting file. Do not submit the claim; try the upload again.",
        },
        503,
      );
    }
    return json({
      cid: evidenceId,
      uri,
      sha256,
      storageKind: encryptionVersion ? "encrypted-private" : "private",
      gatewayUrl: `/api/evidence/${encodeURIComponent(evidenceId)}`,
    });
  }

  if (!storeOnIpfs) {
    return json({ error: "Private evidence storage is not configured." }, 503);
  }

  const pinataForm = new FormData();
  pinataForm.set(
    "file",
    new File([storedBytes], `${evidenceId}.openescrow-encrypted`, {
      type: "application/octet-stream",
    }),
  );
  pinataForm.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  pinataForm.set(
    "pinataMetadata",
    JSON.stringify({
      name: `openescrow-encrypted-${proposalId}-${crypto.randomUUID()}`,
      keyvalues: {
        encrypted: "true",
        format: "aes-256-gcm-hkdf-v1",
        encryptionKeyId,
      },
    }),
  );
  let upload;
  let result;
  try {
    upload = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { authorization: `Bearer ${env.PINATA_JWT}` },
      body: pinataForm,
    });
    result = await upload.json();
  } catch {
    return json({ error: "The IPFS pinning service is temporarily unavailable." }, 502);
  }
  const cid = cleanText(result?.IpfsHash, 200);
  if (!upload.ok || !cid) {
    return json({ error: "The IPFS pinning service rejected the upload." }, 502);
  }

  const uri = `openescrow+ipfs://${cid}/${evidenceId}`;
  try {
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO evidence_files
           (id, negotiation_id, uploader_role, storage_kind, object_key, cid,
             original_name, content_type, size_bytes, sha256, encryption_version,
             encryption_iv, encryption_key_id, encryption_key_fingerprint, created_at)
            VALUES (?, ?, ?, 'encrypted-ipfs', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          evidenceId,
          proposalId,
          role,
          cid,
          cleanText(file.name, 240) || "evidence",
          contentType,
          file.size,
          sha256,
          encryptionVersion,
          encryptionIv,
          encryptionKeyId,
          encryptionKeyFingerprint,
          now,
        ),
      env.DB
        .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
        .bind(now, proposalId),
      eventStatement(
        env.DB,
        proposalId,
        now,
        role,
        "evidence_uploaded",
        `Encrypted a ${contentType} supporting file and stored it in decentralized evidence storage. OpenEscrow verified its integrity.`,
        row.revision,
        {
          evidenceId,
          cid,
          uri,
          sha256,
          size: file.size,
          type: contentType,
          storageKind: "encrypted-ipfs",
          encrypted: true,
          encryptionKeyId,
        },
      ),
    ]);
  } catch {
    try {
      const unpin = await fetch(
        `https://api.pinata.cloud/pinning/unpin/${encodeURIComponent(cid)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${env.PINATA_JWT}` },
        },
      );
      if (!unpin.ok) throw new Error("The IPFS pinning service rejected the cleanup.");
    } catch {
      // The encrypted bytes remain confidential. Operators can reconcile an
      // incomplete pin from the negotiation and evidence identifiers.
    }
    return json(
      {
        error:
          "OpenEscrow could not finish recording this supporting file. Do not submit the claim; try the upload again.",
      },
      503,
    );
  }
  return json({
    cid,
    uri,
    sha256,
    storageKind: "encrypted-decentralized",
    gatewayUrl: `/api/evidence/${encodeURIComponent(evidenceId)}`,
  });
}

async function downloadEvidence(request, env, evidenceId) {
  if (!env.DB) {
    return json({ error: "Secure evidence storage is not available." }, 503);
  }
  const metadata = await env.DB
    .prepare("SELECT * FROM evidence_files WHERE id = ?")
    .bind(evidenceId)
    .first();
  if (!metadata) {
    return json({ error: "This private evidence file was not found." }, 404);
  }
  const row = await rowFor(env.DB, metadata.negotiation_id);
  let token;
  try {
    const form = await request.formData();
    token = cleanText(form.get("token"), 200);
  } catch {
    return json({ error: "The evidence access request is invalid." }, 400);
  }
  const role = await authorize(env.DB, row, token);
  if (!role) return json({ error: "This evidence link is invalid or no longer available." }, 403);

  let storedBytes;
  if (
    (metadata.storage_kind === "private-r2" ||
      metadata.storage_kind === "encrypted-r2") &&
    metadata.object_key
  ) {
    if (!env.EVIDENCE) {
      return json({ error: "The private evidence bucket is unavailable." }, 503);
    }
    try {
      const object = await env.EVIDENCE.get(metadata.object_key);
      if (!object) return json({ error: "This private evidence file is unavailable." }, 404);
      storedBytes = await object.arrayBuffer();
    } catch {
      return json(
        {
          error:
            "The private evidence file is temporarily unavailable. Try again before repeating any agreement action.",
        },
        503,
      );
    }
  } else if (metadata.storage_kind === "encrypted-ipfs" && metadata.cid) {
    const gatewayBase =
      cleanText(env.IPFS_GATEWAY_URL, 500) ||
      "https://gateway.pinata.cloud/ipfs";
    const gatewayUrl = `${gatewayBase.replace(/\/+$/, "")}/${encodeURIComponent(metadata.cid)}`;
    let response;
    try {
      response = await fetch(gatewayUrl, {
        headers: { "user-agent": "OpenEscrow/1.0" },
      });
      if (response.ok) storedBytes = await response.arrayBuffer();
    } catch {
      response = null;
    }
    if (!response?.ok || !storedBytes) {
      return json({ error: "The encrypted IPFS evidence file is unavailable." }, 502);
    }
  } else {
    return json({ error: "This evidence storage format is not supported." }, 404);
  }

  let plaintext = storedBytes;
  if (metadata.encryption_version) {
    if (!metadata.encryption_iv) {
      return json({ error: "The evidence decryption key is not configured." }, 503);
    }
    try {
      plaintext = await decryptEvidenceBytes(
        env,
        evidenceId,
        storedBytes,
        metadata.encryption_iv,
        metadata.encryption_key_id,
      );
    } catch (error) {
      if (error instanceof EvidenceKeyConfigurationError) {
        return json({ error: error.message }, 503);
      }
      return json({ error: "The evidence file could not be decrypted or was altered." }, 422);
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", plaintext);
  const sha256 = `0x${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  if (sha256.toLowerCase() !== String(metadata.sha256).toLowerCase()) {
    return json({ error: "The evidence file failed its integrity check." }, 422);
  }
  if (
    metadata.encryption_version &&
    !cleanText(metadata.encryption_key_fingerprint, 80)
  ) {
    try {
      const rawKey = evidenceMasterKeyForId(env, metadata.encryption_key_id);
      const fingerprint = await evidenceMasterKeyFingerprint(rawKey);
      await env.DB
        .prepare(
          `UPDATE evidence_files
           SET encryption_key_fingerprint = ?
           WHERE id = ?
             AND (
               encryption_key_fingerprint IS NULL
               OR encryption_key_fingerprint = ''
             )`,
        )
        .bind(fingerprint, evidenceId)
        .run();
    } catch {
      // The authorized evidence remains readable. Readiness stays fail-closed
      // until a later verified download can persist the legacy fingerprint.
    }
  }

  const safeName = cleanText(metadata.original_name, 240).replaceAll(/[^a-zA-Z0-9._ -]/g, "_");
  const headers = new Headers();
  headers.set("content-type", metadata.content_type || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeName || "evidence"}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-security-policy", "sandbox");
  headers.set("x-frame-options", "DENY");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-openescrow-sha256", metadata.sha256);
  headers.set(
    "x-openescrow-storage",
    metadata.storage_kind || "unknown",
  );
  return new Response(plaintext, { headers });
}

async function sendClaimNotification(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  const body = await request.json();
  const proposalId = cleanText(body.proposalId, 80);
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may send a deduction-claim notice." }, 403);
  }
  if (row.status !== "finalized" || !row.onchain_agreement_id) {
    return json({ error: "The agreement must be finalized before a claim notice." }, 409);
  }
  const existingRecord = await serialize(env.DB, row);
  const amountUnit = depositAssetAmountUnit(JSON.parse(row.terms_json));
  const claimEvent = latestClaimEvent(existingRecord.events);
  const agreementId = cleanText(row.onchain_agreement_id, 80);
  const amount = cleanText(claimEvent?.metadata?.amount, 80);
  const items = cleanDeductionItems(claimEvent?.metadata?.items);
  const note = cleanText(claimEvent?.metadata?.note, 1000);
  const evidenceUri = cleanText(claimEvent?.metadata?.evidenceUri, 500);
  const claimTransactionHash = cleanText(
    claimEvent?.metadata?.transactionHash,
    100,
  );
  if (
    !claimEvent ||
    !agreementId ||
    !amount ||
    !items ||
    !deductionItemsMatchAmount(items, amount) ||
    !/^0x[a-fA-F0-9]{64}$/.test(claimTransactionHash)
  ) {
    return json({ error: "Record the complete deduction claim before sending its notice." }, 409);
  }
  if (!emailProvider(env)) {
    return json(
      {
        error:
          "Automatic email delivery is not configured yet. Use the Gmail or copy-email fallback.",
      },
      503,
    );
  }
  const requestOrigin = new URL(request.url).origin;
  const appOrigin = publicAppOriginForRequest(request, env);
  const tenantResult = await env.DB
    .prepare(
      `SELECT id, name, email, token_hash
       FROM negotiation_tenants
       WHERE negotiation_id = ?
       ORDER BY is_funding_tenant DESC, created_at ASC`,
    )
    .bind(proposalId)
    .all();
  const tenantRows = tenantResult.results || [];
  const submittedLinks = Array.isArray(body.reviewLinks) ? body.reviewLinks : [];
  if (tenantRows.length === 0 || submittedLinks.length !== tenantRows.length) {
    return json({ error: "Each tenant needs their own private review link." }, 400);
  }
  const reviewLinks = [];
  const seenTenantIds = new Set();
  for (const submitted of submittedLinks) {
    const tenantId = cleanText(submitted?.tenantId, 100);
    const email = normalizeEmail(submitted?.email);
    const tenant = tenantRows.find((candidate) => candidate.id === tenantId);
    if (
      !tenant ||
      seenTenantIds.has(tenantId) ||
      email !== normalizeEmail(tenant.email)
    ) {
      return json({ error: "Each tenant needs their own private review link." }, 400);
    }
    let reviewUrl;
    try {
      reviewUrl = new URL(submitted?.reviewUrl);
    } catch {
      return json({ error: "A tenant review link is invalid." }, 400);
    }
    const reviewToken = invitationTokenFromFragment(reviewUrl);
    const reviewTokenHash = reviewToken ? await hashToken(reviewToken) : null;
    if (
      reviewUrl.origin !== requestOrigin ||
      reviewUrl.searchParams.get("invite") !== "tenant" ||
      reviewUrl.searchParams.get("proposal") !== proposalId ||
      !reviewToken ||
      reviewTokenHash !== tenant.token_hash
    ) {
      return json({ error: "A tenant review link is invalid." }, 400);
    }
    seenTenantIds.add(tenantId);
    const deliveryUrl = new URL(
      `${reviewUrl.pathname}${reviewUrl.search}${reviewUrl.hash}`,
      `${appOrigin}/`,
    );
    reviewLinks.push({
      tenantId,
      name: cleanText(tenant.name, 160),
      email,
      url: deliveryUrl.toString(),
      credentialHash: reviewTokenHash,
    });
  }
  const subject = `OpenEscrow deduction claim for agreement #${agreementId}`;
  const itemSummary = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.category}: ${item.description} (${item.amount} ${amountUnit})`,
    )
    .join("\n");
  const deliveryKey = (
    await hashToken(
      JSON.stringify({
        proposalId,
        agreementId,
        amount,
        items,
        note,
        evidenceUri,
        claimTransactionHash,
        reviewCredentials: reviewLinks.map((link) => ({
          tenantId: link.tenantId,
          credentialHash: link.credentialHash,
        })),
      }),
    )
  ).slice(0, 32);
  const existingDelivery = existingRecord.events.find(
    (event) =>
      event.action === "claim_notification_sent" &&
      event.metadata?.deliveryKey === deliveryKey,
  );
  if (existingDelivery) {
    return json({
      messageId: existingDelivery.metadata.messageId,
      messageIds: existingDelivery.metadata.messageIds || [
        existingDelivery.metadata.messageId,
      ],
      duplicate: true,
    });
  }
  const deliveries = [];
  for (const reviewLink of reviewLinks) {
    const text = [
      reviewLink.name ? `Hello ${reviewLink.name},` : "Hello,",
      `A deduction claim of ${amount} ${amountUnit} has been submitted for OpenEscrow agreement #${agreementId}.`,
      `Itemized deductions:\n${itemSummary}`,
      note ? `Landlord note: ${note}` : "",
      evidenceUri
        ? evidenceUri.startsWith("openescrow://evidence/") ||
          evidenceUri.startsWith("openescrow+ipfs://")
          ? "Invoice / evidence: available privately after opening the agreement"
          : `Invoice / evidence: ${evidenceUri}`
        : "",
      `Review the documentation and approve or dispute the claim: ${reviewLink.url}`,
      "This private invitation is only for you. Do not forward it.",
      "Your decision and all related actions will be included in the timestamped agreement record.",
    ].filter(Boolean).join("\n\n");
    const delivered = await deliverTrackedEmail(env, {
      negotiationId: proposalId,
      recipientEmail: reviewLink.email,
      notificationType: "deduction_claim_notice",
      subject,
      text,
      idempotencyKey:
        `claim-${proposalId}-${reviewLink.tenantId}-${deliveryKey}-` +
        reviewLink.credentialHash.slice(0, 12),
    });
    if (!delivered?.id) {
      return json({ error: "The email provider could not send every tenant claim notice." }, 502);
    }
    deliveries.push(delivered);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
      .bind(now, proposalId),
    eventStatement(
      env.DB,
      proposalId,
      now,
      role,
      "claim_notification_sent",
      `Sent separate deduction-claim notices to ${reviewLinks.map((link) => link.email).join(", ")}.`,
      row.revision,
      {
        messageId: deliveries[0].id,
        messageIds: deliveries.map((delivery) => delivery.id),
        deliveryKey,
        recipientCount: reviewLinks.length,
        claimTransactionHash,
      },
    ),
  ]);
  return json({
    messageId: deliveries[0].id,
    messageIds: deliveries.map((delivery) => delivery.id),
    duplicate: false,
  });
}

async function sendClaimResponseNotification(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  const body = await request.json();
  const proposalId = cleanText(body.proposalId, 80);
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(env.DB, row, body.token);
  const tenant = role === "tenant"
    ? await tenantForToken(env.DB, proposalId, body.token)
    : null;
  if (!tenant) {
    return json({ error: "Only an invited tenant may notify the landlord." }, 403);
  }
  if (row.status !== "finalized" || !row.onchain_agreement_id) {
    return json({ error: "The agreement must be finalized before a claim response." }, 409);
  }

  const agreementId = cleanText(row.onchain_agreement_id, 80);
  const transactionHash = cleanText(body.transactionHash, 100);
  if (!agreementId || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    return json({ error: "The claim response notice is incomplete." }, 400);
  }
  const tenantRows = await tenantsFor(env.DB, proposalId);
  const existingRecord = await serialize(env.DB, row, tenant.id);
  const amountUnit = depositAssetAmountUnit(JSON.parse(row.terms_json));
  const responseEvent = [...existingRecord.events]
    .reverse()
    .find(
      (event) =>
        event.action === "claim_response_submitted" &&
        eventBelongsToTenant(event, tenant, tenantRows) &&
        cleanText(event.metadata?.transactionHash, 100).toLowerCase() ===
          transactionHash.toLowerCase(),
    );
  const decision = cleanText(responseEvent?.metadata?.decision, 20);
  const acceptedAmount = cleanText(responseEvent?.metadata?.acceptedAmount, 80);
  const note = cleanText(responseEvent?.metadata?.note, 1000);
  if (
    !responseEvent ||
    !["approve", "partial", "dispute"].includes(decision) ||
    tokenMicros(acceptedAmount) === null ||
    (decision === "dispute" && tokenMicros(acceptedAmount) !== 0n) ||
    (decision !== "dispute" && tokenMicros(acceptedAmount) === 0n) ||
    ((decision === "partial" || decision === "dispute") && !note)
  ) {
    return json(
      { error: "Record this tenant's exact claim response before sending its notice." },
      409,
    );
  }
  if (!emailProvider(env)) {
    return json(
      {
        error:
          "Automatic email delivery is not configured yet. Use the Gmail or copy-email fallback.",
      },
      503,
    );
  }
  const reviewUrl = new URL(publicAppOriginForRequest(request, env));
  reviewUrl.searchParams.set("id", agreementId);

  const decisionSummary =
    decision === "approve"
      ? `approved the full deduction (${acceptedAmount} ${amountUnit})`
      : decision === "dispute"
        ? "disputed the full deduction"
        : `approved ${acceptedAmount} ${amountUnit} and disputed the remainder`;
  const tenantLabel =
    cleanText(tenant.name, 160) || cleanText(tenant.email, 320) || "A tenant";
  const deliveryKey = (
    await hashToken(
      JSON.stringify({
        proposalId,
        tenantId: tenant.id,
        agreementId,
        decision,
        acceptedAmount,
        note,
        transactionHash,
      }),
    )
  ).slice(0, 32);
  const existingDelivery = existingRecord.events.find(
    (event) =>
      event.action === "claim_response_notification_sent" &&
      event.metadata?.deliveryKey === deliveryKey,
  );
  if (existingDelivery) {
    return json({
      messageId: existingDelivery.metadata.messageId,
      duplicate: true,
    });
  }

  const subject = `OpenEscrow tenant response for agreement #${agreementId}`;
  const text = [
    `${tenantLabel} ${decisionSummary} for OpenEscrow agreement #${agreementId}.`,
    note ? `Tenant explanation: ${note}` : "",
    `Review the signed-in agreement dashboard: ${reviewUrl.toString()}`,
    `Onchain transaction: https://sepolia.basescan.org/tx/${transactionHash}`,
    "The deposit remains in escrow until the claim and any dispute are fully resolved.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const delivered = await deliverTrackedEmail(env, {
    negotiationId: proposalId,
    recipientEmail: normalizeEmail(row.landlord_email),
    notificationType: "claim_response_notice",
    subject,
    text,
    idempotencyKey: `claim-response-${proposalId}-${deliveryKey}`,
  });
  if (!delivered?.id) {
    return json({ error: "The email provider could not send this claim response." }, 502);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB
      .prepare("UPDATE agreement_negotiations SET updated_at = ? WHERE id = ?")
      .bind(now, proposalId),
    eventStatement(
      env.DB,
      proposalId,
      now,
      role,
      "claim_response_notification_sent",
      `${tenantLabel} sent the claim response notice to ${normalizeEmail(row.landlord_email)}.`,
      row.revision,
      {
        tenantId: tenant.id,
        messageId: delivered.id,
        deliveryKey,
        responseTransactionHash: transactionHash,
      },
    ),
  ]);
  return json({ messageId: delivered.id, duplicate: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

async function snapshot(db, id, token, env) {
  const row = await rowFor(db, id);
  const role = await authorize(db, row, token);
  if (!role) return json({ error: "Invalid snapshot link." }, 403);
  const record = await serialize(db, row);
  const snapshotRecord = {
    schema: "openescrow.agreement-record.v3",
    proposalId: record.id,
    status: record.status,
    revision: record.revision,
    createdAt: record.createdAt,
    parties: {
      landlord: {
        name: record.landlordName,
        email: record.landlordEmail,
      },
      tenants: record.tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        wallet: tenant.wallet,
        isFundingTenant: tenant.isFundingTenant,
      })),
      arbiter: record.arbiterEmail
        ? {
            name: record.arbiterName,
            email: record.arbiterEmail,
            wallet: record.arbiterWallet,
          }
        : null,
    },
    terms: record.terms,
    approvals: {
      tenants: record.tenants.map((tenant) => ({
        id: tenant.id,
        approved: tenant.approved,
        acceptedAt: tenant.acceptedAt,
      })),
      arbiter: record.arbiterApproved,
    },
    onchain: {
      chainId: 84532,
      escrowAddress: cleanText(
        env.OPEN_ESCROW_ADDRESS || DEFAULT_OPEN_ESCROW_ADDRESS,
        80,
      ),
      activityRegistryAddress: cleanText(
        env.ACTIVITY_REGISTRY_ADDRESS || DEFAULT_ACTIVITY_REGISTRY_ADDRESS,
        80,
      ),
      agreementId: record.onchainAgreementId,
      finalizationTransactionHash: record.onchainTxHash,
    },
    events: record.events
      .filter((event) => event.action !== "record_snapshot_anchored")
      .map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        actorRole: event.actorRole,
        action: event.action,
        summary: event.summary,
        revision: event.revision,
        metadata: event.metadata,
      })),
  };
  const canonical = stableJson(snapshotRecord);
  const hash = `0x${await hashToken(canonical)}`;
  return json({
    algorithm: "SHA-256",
    hash,
    canonical,
    snapshot: snapshotRecord,
  });
}

async function report(db, id, token, download = false) {
  const row = await rowFor(db, id);
  const role = await authorize(db, row, token);
  if (!role) return new Response("Invalid report link.", { status: 403 });
  const record = await serialize(db, row);
  const terms = record.terms;
  const policyRows = (candidate) => {
    const isCalifornia =
      candidate.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
      candidate.policyVersion === CALIFORNIA_POLICY.version;
    const jurisdictionProfile =
      US_JURISDICTION_PROFILE_BY_CODE[candidate.jurisdiction];
    const storedComplianceSnapshot = candidate.complianceSnapshot;
    const complianceSnapshot =
      storedComplianceSnapshot?.schema ===
        "openescrow.us-compliance-profile.v2" ||
      isVersionedComplianceSnapshot(storedComplianceSnapshot)
        ? storedComplianceSnapshot
        : null;
    const complianceSnapshotInvalid = Boolean(
      storedComplianceSnapshot && !complianceSnapshot,
    );
    const researchProfile = storedComplianceSnapshot
      ? null
      : jurisdictionProfile;
    const jurisdiction =
      jurisdictionProfile?.label ||
      (isCalifornia
        ? "California residential tenancy"
        : "Non-specific jurisdiction (testing only)");
    const overlaySnapshots = complianceSnapshot?.overlays || [];
    const deadlineRules = [
      ...(complianceSnapshot?.deadlines || researchProfile?.deadlines || []),
      ...overlaySnapshots.flatMap((overlay) =>
        overlay.applicability === "applies" ? overlay.deadlines || [] : [],
      ),
    ];
    const recordedRequirements =
      complianceSnapshot?.requirements || researchProfile?.requirements || [];
    const claimPolicy = complianceSnapshot?.claimPolicy;
    const claimPacket =
      claimPolicy?.schema === "openescrow.claim-policy.v1"
        ? `<p><strong>${escapeHtml(claimPolicy.version)}</strong></p><ul>${[
            ...(claimPolicy.commonAttestations || []),
            ...(claimPolicy.stateAttestations || []),
          ]
            .map(
              (attestation) =>
                `<li>${escapeHtml(attestation.label)} <small>(${escapeHtml(attestation.basis)})</small></li>`,
            )
            .join("")}</ul>`
        : "";
    const deadlinePaths = deadlineRules.length
      ? deadlineRules
          .map(
            (deadlineRule) =>
              `${escapeHtml(deadlineRule.label)}: ${escapeHtml(deadlineRule.days)} ${escapeHtml(deadlineRule.dayType)} days after ${escapeHtml(deadlineRule.triggerDescription)}${deadlineRule.statutory ? "" : " (OpenEscrow safeguard, not a statutory deadline)"}`,
          )
          .join("<br>")
      : "";
    const requirements = recordedRequirements.length
      ? `<ol>${recordedRequirements.map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join("")}</ol>`
      : "";
    const overlayRequirements = overlaySnapshots
      .map(
        (overlay) =>
          `<p><strong>${escapeHtml(overlay.label)}</strong> — ${escapeHtml(
            overlay.applicability === "applies"
              ? "applied"
              : "awaiting a property or program fact",
          )}</p><ul>${(overlay.requirements || [])
            .map((requirement) => `<li>${escapeHtml(requirement)}</li>`)
            .join("")}</ul>`,
      )
      .join("");
    const resolvedLocation = normalizeAddressResolution(
      complianceSnapshot?.address || candidate.addressResolution,
    );
    return `
${isCalifornia ? `<tr><th>Monthly rent used for cap</th><td>${escapeHtml(candidate.monthlyRent || "Not recorded")}</td></tr>` : ""}
<tr><th>${isCalifornia ? "California accounting/refund period" : researchProfile ? "Statewide onchain safeguard window" : "Test deduction window"}</th><td>${escapeHtml(candidate.claimDays)} calendar days (${isCalifornia || researchProfile ? "profile default" : "agreed test value"})</td></tr>
<tr><th>OpenEscrow response period</th><td>${escapeHtml(candidate.responseDays)} days (${isCalifornia || researchProfile ? "test rule" : "agreed test value"})</td></tr>
${record.arbiterEmail ? `<tr><th>OpenEscrow arbiter period</th><td>${escapeHtml(candidate.arbiterDays)} days (${isCalifornia || researchProfile ? "test rule" : "agreed test value"})</td></tr>` : ""}
<tr><th>Jurisdiction</th><td>${escapeHtml(jurisdiction)}</td></tr>
<tr><th>Policy profile</th><td>${escapeHtml(candidate.policyVersion || "Legacy proposal")}</td></tr>
${resolvedLocation ? `<tr><th>Validated location</th><td>${escapeHtml([resolvedLocation.city, resolvedLocation.county, resolvedLocation.stateCode, resolvedLocation.postalCode].filter(Boolean).join(", "))}<br><small>Photon/OpenStreetMap feature ${escapeHtml(resolvedLocation.providerFeatureId)}</small></td></tr>` : ""}
${complianceSnapshotInvalid ? `<tr><th>Compliance requirements</th><td><strong>Recorded compliance details need review.</strong><br>OpenEscrow did not substitute today's rules for the agreement's saved version. Preserve the record and reconcile the saved snapshot before relying on its checklist or deadlines.</td></tr>` : ""}
${claimPacket ? `<tr><th>Versioned claim packet</th><td>${claimPacket}</td></tr>` : ""}
${deadlineRules.length ? `<tr><th>Compliance deadline paths</th><td>${deadlinePaths}</td></tr><tr><th>Applied statewide requirements</th><td>${requirements}</td></tr>${overlayRequirements ? `<tr><th>Federal and program overlays</th><td>${overlayRequirements}</td></tr>` : ""}<tr><th>Unresolved coverage</th><td>${(complianceSnapshot?.unresolvedOverlays || ["Confirm local, federal, housing-program, and fact-specific overlays."]).map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}<small>Software output is not legal advice.</small></td></tr>` : ""}
${isCalifornia ? `<tr><th>Deposit-cap facts</th><td>${candidate.smallLandlordException ? "Qualifying small-landlord exception asserted" : "Standard one-month cap"}${candidate.tenantIsServiceMember ? " · tenant is a service member" : ""}</td></tr>` : ""}`;
  };
  const timeline = record.events
    .map(
      (event) => `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.actorRole)}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
  const reportComplianceSnapshot = isVersionedComplianceSnapshot(
    terms.complianceSnapshot,
  )
    ? terms.complianceSnapshot
    : null;
  const claimAttestationLabels = new Map(
    [
      ...(reportComplianceSnapshot?.claimPolicy?.commonAttestations || []),
      ...(reportComplianceSnapshot?.claimPolicy?.stateAttestations || []),
    ].map((attestation) => [attestation.id, attestation.label]),
  );
  const claimBreakdowns = record.events
    .filter(
      (event) =>
        (event.action === "deduction_claim_submitted" ||
          event.action === "deduction_claim_amended") &&
        Array.isArray(event.metadata?.items),
    )
    .map((event) => {
      const rows = event.metadata.items
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.amount)} shares</td></tr>`,
        )
        .join("");
      const evidenceStatus = event.metadata.evidenceUri
        ? event.metadata.evidenceUri.startsWith("openescrow://evidence/") ||
          event.metadata.evidenceUri.startsWith("openescrow+ipfs://")
          ? "Stored privately in OpenEscrow"
          : "External supporting documentation recorded"
        : "No supporting file recorded";
      const recordedAttestations = Object.entries(
        event.metadata.claimConfirmations?.attestations || {},
      )
        .filter(([, confirmed]) => confirmed === true)
        .map(
          ([attestationId]) =>
            claimAttestationLabels.get(attestationId) || attestationId,
        );
      return `<h3>${event.action === "deduction_claim_amended" ? "Amended claim" : "Original claim"} · ${escapeHtml(event.createdAt)}</h3>
<table><thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="2">Total</th><th>${escapeHtml(event.metadata.amount)} shares</th></tr></tfoot></table>
${recordedAttestations.length ? `<p><strong>Recorded claim attestations</strong></p><ul>${recordedAttestations.map((attestation) => `<li>${escapeHtml(attestation)}</li>`).join("")}</ul>` : ""}
<p class="meta">Supporting file: ${escapeHtml(evidenceStatus)} · Transaction: ${escapeHtml(event.metadata.transactionHash || "Not recorded")}</p>`;
    })
    .join("");
  const revisionSnapshots = record.events
    .filter((event) => event.metadata?.terms)
    .map((event) => {
      const snapshot = event.metadata.terms;
      return `<h3>Revision ${event.revision}</h3><p class="meta">${escapeHtml(event.createdAt)}</p><table>
<tr><th>Rental property</th><td>${escapeHtml(snapshot.propertyAddress || "Legacy proposal: not recorded")}</td></tr>
<tr><th>Refundable deposit</th><td>${escapeHtml(snapshot.deposit)} ${escapeHtml(depositAssetTestnetLabel(snapshot))}${snapshot.depositAssetSnapshot ? ` · ${escapeHtml(snapshot.depositAssetSnapshot.displayName)}` : ""}</td></tr>
<tr><th>Tenant-paid platform fee</th><td>$0</td></tr>
<tr><th>Expected possession returned</th><td>${escapeHtml(snapshot.claimWindowStart)}</td></tr>
${policyRows(snapshot)}
</table>`;
    })
    .join("");
  const onchainEvidence = record.events
    .filter(
      (event) =>
        event.action === "record_snapshot_anchored" ||
        event.action === "activity_hash_published",
    )
    .map((event) => {
      const metadata = event.metadata || {};
      const hash =
        event.action === "record_snapshot_anchored"
          ? metadata.snapshotHash
          : metadata.contentHash;
      const label =
        event.action === "record_snapshot_anchored"
          ? "Agreement snapshot"
          : `Activity type ${escapeHtml(metadata.activityType || "unknown")}`;
      const transactionHash = metadata.transactionHash || "";
      const receipt = /^0x[a-fA-F0-9]{64}$/.test(transactionHash)
        ? `<a href="https://sepolia.basescan.org/tx/${escapeHtml(transactionHash)}">BaseScan receipt</a>`
        : "Not recorded";
      return `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.actorRole)}</td><td>${label}</td><td class="hash">${escapeHtml(hash || "Not recorded")}</td><td>${receipt}</td></tr>`;
    })
    .join("");
  const transactionReceipts = record.events
    .filter((event) => /^0x[a-fA-F0-9]{64}$/.test(event.metadata?.transactionHash || ""))
    .map((event) => {
      const transactionHash = event.metadata.transactionHash;
      const action = event.action
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      return `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.actorRole)}</td><td>${escapeHtml(action)}</td><td class="hash">${escapeHtml(transactionHash)}</td><td><a href="https://sepolia.basescan.org/tx/${escapeHtml(transactionHash)}">BaseScan receipt</a></td></tr>`;
    })
    .join("");
  const tenantPartyRows = record.tenants
    .map(
      (tenant) =>
        `<tr><th>Tenant (${escapeHtml((tenant.depositShareBps / 100).toFixed(2).replace(/\.?0+$/, ""))}% share)</th><td>${escapeHtml(tenant.name || "Not provided")}</td><td>${escapeHtml(tenant.email)}</td><td class="hash">${escapeHtml(tenant.wallet || "Not yet approved")}</td></tr>`,
    )
    .join("");
  const tenantApprovalState = record.tenants
    .map(
      (tenant) =>
        `${escapeHtml(tenant.name || tenant.email)}: ${tenant.approved ? "approved" : "not approved"}`,
    )
    .join(" · ");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>OpenEscrow proposal ${escapeHtml(record.id)} record</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#191826;max-width:900px;margin:40px auto;padding:0 24px}h1{margin-bottom:0}.meta{color:#666}.hash{font:12px/1.45 ui-monospace,monospace;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;vertical-align:top;border:1px solid #ddd;padding:9px}th{background:#f5f3fb}a{color:#5637a8}@media print{button{display:none}body{margin:0}}</style>
</head><body>
<button onclick="window.print()">Print or save as PDF</button>
<h1>OpenEscrow agreement record</h1>
<p class="meta">Proposal ${escapeHtml(record.id)} · revision ${record.revision} · status ${escapeHtml(record.status)}<br>Generated ${escapeHtml(new Date().toISOString())}</p>
<h2>Parties</h2><table>
<thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Approval wallet</th></tr></thead><tbody>
<tr><th>Landlord</th><td>${escapeHtml(record.landlordName || "Not provided")}</td><td>${escapeHtml(record.landlordEmail)}</td><td>${record.onchainAgreementId ? `See onchain agreement #${escapeHtml(record.onchainAgreementId)}` : "Recorded at finalization"}</td></tr>
${tenantPartyRows}
<tr><th>Arbiter</th><td>${escapeHtml(record.arbiterName || (record.arbiterEmail ? "Not provided" : "Not appointed"))}</td><td>${escapeHtml(record.arbiterEmail || "Not appointed")}</td><td class="hash">${escapeHtml(record.arbiterWallet || (record.arbiterEmail ? "Not yet approved" : "Not appointed"))}</td></tr>
</tbody></table>
<h2>Current terms</h2><table>
<tr><th>Rental property</th><td>${escapeHtml(terms.propertyAddress || "Legacy proposal: not recorded")}</td></tr>
<tr><th>Refundable deposit</th><td>${escapeHtml(terms.deposit)} ${escapeHtml(depositAssetTestnetLabel(terms))}${terms.depositAssetSnapshot ? ` · ${escapeHtml(terms.depositAssetSnapshot.displayName)}` : ""}</td></tr>
<tr><th>Tenant-paid platform fee</th><td>$0</td></tr>
<tr><th>Expected possession returned</th><td>${escapeHtml(terms.claimWindowStart)}</td></tr>
${policyRows(terms)}
<tr><th>Electronic record and return consent</th><td>${terms.electronicDeliveryConsent ? "Included in the approved proposal" : "Not recorded"}</td></tr>
</table>
<h2>Approval state</h2>
<p>${tenantApprovalState} · Arbiter: ${record.arbiterEmail ? (record.arbiterApproved ? "approved" : "not approved") : "not appointed"}</p>
<h2>Revision snapshots</h2>${revisionSnapshots}
${claimBreakdowns ? `<h2>Itemized deduction claims</h2>${claimBreakdowns}` : ""}
${transactionReceipts ? `<h2>Recorded transaction receipts</h2><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Transaction hash</th><th>Explorer</th></tr></thead><tbody>${transactionReceipts}</tbody></table>` : ""}
${onchainEvidence ? `<h2>Onchain evidence receipts</h2><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Evidence</th><th>Hash</th><th>Transaction</th></tr></thead><tbody>${onchainEvidence}</tbody></table>` : ""}
<h2>Timestamped activity</h2><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th></tr></thead><tbody>${timeline}</tbody></table>
<p class="meta">The readable record is platform-stored. Transaction hashes recorded by the app should be checked using their BaseScan links. The onchain evidence table lists snapshot or activity hashes separately anchored to Base Sepolia; a hash proves integrity only when checked against the corresponding private source material.</p>
</body></html>`;
  const headers = {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
  };
  if (download) {
    headers["content-disposition"] =
      `attachment; filename="openescrow-${record.id.replace(/[^a-zA-Z0-9-]/g, "-")}-complete-record.html"`;
  }
  return new Response(html, {
    headers,
  });
}

function sameOriginPost(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    (!origin || origin === new URL(request.url).origin) &&
    fetchSite !== "cross-site"
  );
}

function sameOriginGet(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    (!origin || origin === new URL(request.url).origin) &&
    fetchSite !== "cross-site"
  );
}

const CANONICAL_HOSTED_APP_ORIGIN = "https://openescrow.io";
const HISTORICAL_SITES_HOSTNAMES = new Set([
  "openescrow-demo.omrigross.chatgpt.site",
  "www.openescrow-demo.omrigross.chatgpt.site",
]);

function canonicalHostedAppResponse(request) {
  const url = new URL(request.url);
  if (!HISTORICAL_SITES_HOSTNAMES.has(url.hostname.toLowerCase())) return null;

  // Keep a local, exact-build readiness endpoint so release verification can
  // prove which source is deployed to the retained Sites rollback. All user
  // traffic is otherwise sent to the sole writable Cloudflare application.
  if (request.method === "GET" && url.pathname === "/api/system/readiness") {
    return null;
  }

  const canonicalUrl = new URL(`${url.pathname}${url.search}`, CANONICAL_HOSTED_APP_ORIGIN);
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(null, {
      status: 307,
      headers: {
        location: canonicalUrl.toString(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-openescrow-canonical-host": "openescrow.io",
      },
    });
  }

  return json(
    {
      error: "This historical OpenEscrow host is read-only. Continue on openescrow.io.",
      code: "canonical-host-required",
      canonicalUrl: canonicalUrl.toString(),
    },
    409,
  );
}

function negotiationReadToken(request) {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return "";
  const bearer = authorization.match(/^Bearer[\t ]+([a-zA-Z0-9_-]{1,200})$/i);
  return bearer?.[1] || "";
}

async function addressSuggestionResponse(
  suggestions,
  env,
  cacheStatus = "MISS",
) {
  const attestationReady = addressAttestationConfigured(
    env.ADDRESS_ATTESTATION_SECRET,
  );
  const signedSuggestions = await Promise.all(
    suggestions.map(async (suggestion) => {
      const resolved = {
        provider: "photon-openstreetmap",
        providerFeatureId: suggestion.id,
        ...suggestion,
      };
      return {
        ...suggestion,
        attestation:
          attestationReady && normalizeAddressResolution(resolved)
            ? await createAddressAttestation(
                resolved,
                env.ADDRESS_ATTESTATION_SECRET,
              )
            : null,
      };
    }),
  );
  return new Response(JSON.stringify({
    suggestions: signedSuggestions,
    attribution: ADDRESS_ATTRIBUTION,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, max-age=300",
      "x-openescrow-cache": cacheStatus,
    },
  });
}

function normalizeAddressSuggestions(value) {
  if (!Array.isArray(value?.features)) return [];
  const suggestions = [];
  const labels = new Set();
  const providerIds = new Set();
  for (const candidate of value.features) {
    const properties = candidate?.properties;
    const coordinates = candidate?.geometry?.coordinates;
    if (!properties || !Array.isArray(coordinates)) continue;
    const houseNumber = cleanText(properties.housenumber, 40);
    const street = cleanText(properties.street, 120);
    const locality = cleanText(
      properties.city || properties.town || properties.village || properties.hamlet,
      120,
    );
    const postalCode = cleanText(properties.postcode, 20);
    const countryName = cleanText(properties.country, 120);
    const providedCountryCode = cleanText(properties.countrycode, 8).toUpperCase();
    const countryNameIsUs = /^(united states|united states of america|usa)$/i.test(
      countryName,
    );
    const countryCode =
      providedCountryCode || (countryNameIsUs ? "US" : "");
    const stateName = cleanText(properties.state, 120);
    const photonStateCode = cleanText(
      properties.statecode || properties.state_code,
      12,
    ).toUpperCase();
    const stateCodeFromProvider =
      US_JURISDICTION_PROFILE_BY_CODE[`us-${photonStateCode.toLowerCase()}`]
        ?.postalCode || "";
    const stateCodeFromName =
      US_STATE_POSTAL_CODE_BY_NAME[stateName.toLowerCase()] || "";
    const stateCode =
      countryCode === "US" ? stateCodeFromProvider || stateCodeFromName : "";
    if (
      !houseNumber ||
      !street ||
      !locality ||
      !postalCode ||
      countryCode !== "US" ||
      (providedCountryCode && countryName && !countryNameIsUs) ||
      !stateCode ||
      (stateCodeFromProvider &&
        stateCodeFromName &&
        stateCodeFromProvider !== stateCodeFromName)
    ) {
      continue;
    }
    const label = [
      `${houseNumber} ${street}`,
      properties.name,
      locality,
      properties.state,
      properties.postcode,
      properties.country,
    ]
      .map((part) => cleanText(part, 120))
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(", ")
      .slice(0, 300);
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (
      !label ||
      labels.has(label.toLowerCase()) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }
    labels.add(label.toLowerCase());
    const osmType = cleanText(properties.osm_type, 20);
    const osmId = cleanText(String(properties.osm_id ?? ""), 80);
    const suggestionId = osmId
      ? `${osmType || "osm"}:${osmId}`
      : `${latitude},${longitude}`;
    if (providerIds.has(suggestionId)) continue;
    providerIds.add(suggestionId);
    suggestions.push({
      id: suggestionId,
      label,
      latitude,
      longitude,
      countryCode: countryCode || null,
      stateCode: stateCode || null,
      city: locality,
      county: cleanText(properties.county, 120) || null,
      postalCode,
    });
    if (suggestions.length === 5) break;
  }
  return suggestions;
}

async function addressSuggestions(request, env) {
  if (!sameOriginGet(request)) {
    return json({ error: "Cross-origin address searches are not allowed." }, 403);
  }
  const requestUrl = new URL(request.url);
  const query = cleanText(requestUrl.searchParams.get("q"), 121).replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 120) {
    return json({ error: "Enter between 3 and 120 characters to search for an address." }, 400);
  }

  let geocoderUrl;
  try {
    const geocoderBaseUrl = new URL(
      cleanText(env.GEOCODER_BASE_URL, 1000) || DEFAULT_GEOCODER_BASE_URL,
    );
    if (geocoderBaseUrl.protocol !== "https:" && geocoderBaseUrl.protocol !== "http:") {
      throw new Error("Unsupported geocoder protocol.");
    }
    const basePath = geocoderBaseUrl.pathname.replace(/\/+$/, "");
    geocoderUrl = new URL(
      basePath.endsWith("/api") ? `${basePath}/` : `${basePath}/api/`,
      geocoderBaseUrl.origin,
    );
  } catch {
    return addressSuggestionResponse([], env);
  }

  const cacheKey = `${geocoderUrl.origin}${geocoderUrl.pathname}|${query.toLowerCase()}`;
  const cached = addressSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return addressSuggestionResponse(cached.suggestions, env, "HIT");
  }
  if (cached) addressSuggestionCache.delete(cacheKey);

  geocoderUrl.searchParams.set("q", query);
  geocoderUrl.searchParams.set("limit", "5");
  geocoderUrl.searchParams.set("lang", "en");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADDRESS_GEOCODER_TIMEOUT_MS);
  try {
    const upstream = await fetch(geocoderUrl.toString(), {
      headers: {
        accept: "application/json",
        "accept-language": "en",
        "user-agent": "OpenEscrow address lookup (open-source testnet app)",
      },
      signal: controller.signal,
    });
    if (!upstream.ok) return addressSuggestionResponse([], env);
    const suggestions = normalizeAddressSuggestions(await upstream.json());
    if (addressSuggestionCache.size >= ADDRESS_SUGGESTION_CACHE_LIMIT) {
      addressSuggestionCache.delete(addressSuggestionCache.keys().next().value);
    }
    addressSuggestionCache.set(cacheKey, {
      expiresAt: Date.now() + ADDRESS_SUGGESTION_CACHE_TTL_MS,
      suggestions,
    });
    return addressSuggestionResponse(suggestions, env);
  } catch {
    return addressSuggestionResponse([], env);
  } finally {
    clearTimeout(timeout);
  }
}

const worker = {
  async fetch(request, env, context) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      const canonicalHostResponse = canonicalHostedAppResponse(request);
      if (canonicalHostResponse) return canonicalHostResponse;
      const abuseResponse = await applyApiAbuseControls(request, env, url);
      if (abuseResponse) return abuseResponse;
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html") &&
      context?.waitUntil
    ) {
      context.waitUntil(
        Promise.all([
          runNotificationJob(env),
          runComplianceSourceAudit(env),
          runApiRateLimitCleanup(env),
        ]),
      );
    }
    if (url.pathname === "/api/address-suggestions" && request.method === "GET") {
      return addressSuggestions(request, env);
    }
    if (
      url.pathname === "/api/compliance/source-status" &&
      request.method === "POST"
    ) {
      return complianceSourceStatus(request, env);
    }
    if (url.pathname === "/api/system/readiness" && request.method === "GET") {
      return serviceReadiness(env);
    }
    if (url.pathname === "/api/profile/test-email" && request.method === "POST") {
      if (!sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      if (env.DB) await initialize(env.DB);
      return sendTestEmail(request, env);
    }
    if (url.pathname === "/api/profile/landlord-invite" && request.method === "POST") {
      if (!sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      if (env.DB) await initialize(env.DB);
      return sendLandlordIntroduction(request, env);
    }
    if (
      url.pathname === "/api/notifications/provider/resend" &&
      request.method === "POST"
    ) {
      if (env.DB) await initialize(env.DB);
      return resendDeliveryWebhook(request, env);
    }
    if (
      url.pathname === "/api/notifications/unsubscribe" &&
      (request.method === "GET" || request.method === "POST")
    ) {
      if (!env.DB) return json({ error: "Account preference storage is not available." }, 503);
      await initialize(env.DB);
      return unsubscribe(request, env);
    }
    if (
      url.pathname === "/api/profile/notification-preferences" &&
      (request.method === "GET" || request.method === "PUT")
    ) {
      if (!env.DB) return json({ error: "Account preference storage is not available." }, 503);
      if (request.method === "GET" && !sameOriginGet(request)) {
        return json({ error: "Cross-origin reads are not allowed." }, 403);
      }
      if (request.method === "PUT" && !sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);
      return notificationPreferences(request, env);
    }
    if (
      url.pathname === "/api/profile/record-archives" &&
      request.method === "PUT"
    ) {
      if (!env.DB) return json({ error: "Account preference storage is not available." }, 503);
      if (!sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);
      return recordArchivePreference(request, env);
    }
    if (
      url.pathname === "/api/profile/account-sessions/revoke" &&
      request.method === "POST"
    ) {
      if (!env.DB) return json({ error: "Account session storage is not available." }, 503);
      if (!sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);
      return revokeAccountSessions(request, env);
    }
    if (
      url.pathname === "/api/profile/data-inventory" &&
      request.method === "GET"
    ) {
      if (!env.DB) return json({ error: "Account data inventory is not available." }, 503);
      if (!sameOriginGet(request)) {
        return json({ error: "Cross-origin reads are not allowed." }, 403);
      }
      await initialize(env.DB);
      return accountDataInventory(request, env);
    }
    if (url.pathname === "/api/notifications/claim" && request.method === "POST") {
      if (!sameOriginPost(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
      if (env.DB) await initialize(env.DB);
      return sendClaimNotification(request, env);
    }
    if (
      url.pathname === "/api/notifications/claim-response" &&
      request.method === "POST"
    ) {
      if (!sameOriginPost(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
      if (env.DB) await initialize(env.DB);
      return sendClaimResponseNotification(request, env);
    }
    if (url.pathname === "/api/evidence" && request.method === "POST") {
      if (!sameOriginPost(request)) return json({ error: "Cross-origin writes are not allowed." }, 403);
      if (env.DB) await initialize(env.DB);
      return uploadEvidence(request, env);
    }
    const evidenceMatch = url.pathname.match(/^\/api\/evidence\/([a-fA-F0-9-]+)$/);
    if (evidenceMatch && request.method !== "POST") {
      return json(
        {
          error:
            "Open this supporting file from its agreement. Private file access is not accepted in a URL.",
        },
        405,
      );
    }
    if (evidenceMatch && request.method === "POST") {
      if (!sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      if (env.DB) await initialize(env.DB);
      return downloadEvidence(request, env, evidenceMatch[1]);
    }
    if (url.pathname.startsWith("/api/negotiations")) {
      if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
      if (request.method === "GET" && !sameOriginGet(request)) {
        return json({ error: "Cross-origin reads are not allowed." }, 403);
      }
      if (request.method !== "GET" && !sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);

      if (url.pathname === "/api/negotiations" && request.method === "POST") {
        return createNegotiation(request, env);
      }
      if (url.pathname === "/api/negotiations/discover" && request.method === "POST") {
        return discoverNegotiations(request, env);
      }

      const invitationMatch = url.pathname.match(
        /^\/api\/negotiations\/([a-zA-Z0-9-]+)\/invitations$/,
      );
      if (invitationMatch && request.method === "POST") {
        return await sendProposalInvitation(request, env, invitationMatch[1]);
      }

      const fundingCheckoutEventMatch = url.pathname.match(
        /^\/api\/negotiations\/([a-zA-Z0-9-]+)\/funding-checkouts\/([a-zA-Z0-9._:-]+)\/events$/,
      );
      if (fundingCheckoutEventMatch && request.method === "POST") {
        return appendSandboxFundingCheckoutEvent(
          request,
          env,
          fundingCheckoutEventMatch[1],
          fundingCheckoutEventMatch[2],
        );
      }
      const fundingCheckoutMatch = url.pathname.match(
        /^\/api\/negotiations\/([a-zA-Z0-9-]+)\/funding-checkouts(?:\/(recover))?$/,
      );
      if (fundingCheckoutMatch && request.method === "POST") {
        return fundingCheckoutMatch[2] === "recover"
          ? recoverSandboxFundingCheckout(request, env, fundingCheckoutMatch[1])
          : createSandboxFundingCheckout(request, env, fundingCheckoutMatch[1]);
      }

      const match = url.pathname.match(
        /^\/api\/negotiations\/([a-zA-Z0-9-]+)(?:\/(actions|report|snapshot|tenants|arbiter)(?:\/([a-zA-Z0-9-]+))?)?$/,
      );
      if (!match) return json({ error: "Agreement record endpoint not found." }, 404);
      const [, id, action, resourceId] = match;
      if (!action && request.method === "GET") {
        return getNegotiation(env.DB, id, negotiationReadToken(request));
      }
      if (action === "actions" && request.method === "POST") {
        return applyAction(request, env, id);
      }
      if (action === "tenants" && !resourceId && request.method === "POST") {
        return addTenant(request, env, id);
      }
      if (action === "tenants" && resourceId && request.method === "PATCH") {
        return updateTenant(request, env, id, resourceId);
      }
      if (action === "tenants" && resourceId && request.method === "POST") {
        return rotateTenantInvite(request, env, id, resourceId);
      }
      if (action === "arbiter" && !resourceId && request.method === "POST") {
        return rotateArbiterInvite(request, env, id);
      }
      if (action === "tenants" && resourceId && request.method === "DELETE") {
        return removeTenant(request, env, id, resourceId);
      }
      if (action === "report" && request.method === "GET") {
        return report(
          env.DB,
          id,
          negotiationReadToken(request),
          url.searchParams.get("download") === "1",
        );
      }
      if (action === "snapshot" && request.method === "GET") {
        return snapshot(env.DB, id, negotiationReadToken(request), env);
      }
      return json({ error: "Method not allowed." }, 405);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return secureResponse(response, request.url);
    }
    const fallback = new URL(request.url);
    fallback.pathname = "/index.html";
    fallback.search = "";
      return secureResponse(
        await env.ASSETS.fetch(new Request(fallback, request)),
        request.url,
        true,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId,
          method: request.method,
          path: url.pathname,
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      const response = json(
        {
          error: "OpenEscrow could not complete this request. Try again shortly.",
          code: "request-failed",
          requestId,
        },
        500,
      );
      response.headers.set("x-openescrow-request-id", requestId);
      return response;
    }
  },
  async scheduled(controller, env, context) {
    const scheduledAt = new Date(controller?.scheduledTime || Date.now());
    context.waitUntil(
      Promise.all([
        runNotificationJob(env, scheduledAt),
        runOnchainActivityIndexer(env, scheduledAt),
        runComplianceSourceAudit(env, scheduledAt),
        runApiRateLimitCleanup(env, scheduledAt),
      ]),
    );
  },
};

export default worker;
