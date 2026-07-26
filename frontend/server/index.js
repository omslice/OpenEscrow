import {
  US_JURISDICTION_PROFILE_BY_CODE,
  US_STATE_POSTAL_CODE_BY_NAME,
} from "../shared/us-jurisdiction-profiles.js";
import {
  addressResolutionMatchesProfile,
  complianceSnapshotMatchesProfile,
  evaluateCompliance,
  normalizeAddressResolution,
} from "../shared/us-compliance-engine.js";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";
import {
  getDepositAssetForTerms,
  validateDepositAssetTerms,
} from "../shared/deposit-assets.js";

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

const ACCOUNT_ACCESS_CONTEXT_SCHEMA = `
CREATE TABLE IF NOT EXISTS negotiation_account_access_context (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT,
  FOREIGN KEY (token_hash) REFERENCES negotiation_account_access(token_hash) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES negotiation_tenants(id) ON DELETE CASCADE
)`;

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
  last_changed_at TEXT,
  error TEXT
)`;

const COMPLIANCE_SOURCE_CHECKS_INDEX = `
CREATE INDEX IF NOT EXISTS compliance_source_checks_status_idx
ON compliance_source_checks (status, last_checked_at)`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const DEDUCTION_CATEGORY_LABEL = {
  "10": "Unpaid rent",
  "11": "Damage beyond ordinary wear",
  "12": "Cleaning needed to restore move-in cleanliness",
  "13": "Lease-authorized restoration or replacement of landlord property",
  "14": "Other documented test deduction",
};
const PRIVY_APP_ID = "cmrzdp7ss00670cju098baqsr";
const ACCOUNT_ACCESS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_GEOCODER_BASE_URL = "https://photon.komoot.io";
const ADDRESS_SUGGESTION_CACHE_TTL_MS = 10 * 60 * 1000;
const ADDRESS_SUGGESTION_CACHE_LIMIT = 200;
const ADDRESS_GEOCODER_TIMEOUT_MS = 3_000;
const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const FALLBACK_BASE_SEPOLIA_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
const DEFAULT_OPEN_ESCROW_ADDRESS = "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99";
const DEFAULT_OPERATIONS_RESERVE_ADDRESS =
  "0x5d2E9c429F9d117c7b028c8f0f67d37252aDceC0";
const DEFAULT_ACTIVITY_REGISTRY_ADDRESS =
  "0xC004dF4C43146FE55e5761EA1BB3C14f01161951";
const ACTIVITY_REGISTRY_ESCROW_SELECTOR = "0xe681c4aa";
const ACTIVITY_REGISTRY_READINESS_TTL_MS = 60_000;
const RECEIPT_EVENT_TOPICS = Object.freeze({
  agreementProposed:
    "0x664e4c94d146ccef3e51a2b7665242fbd89c9e268a28a1807fc660bfc39327f6",
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
  recordSnapshotAnchored:
    "0x4012b6d2c58584f354b2ad24151a4b24d5e18ea9aff9ced4667a2ffe01305ab6",
  activityPublished:
    "0x2aca0841f18e301ab87df30a3dd50b022d848e0b1ee373dcbe9f914886b2eea7",
});
const ADDRESS_ATTRIBUTION = Object.freeze({
  label: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
});
const addressSuggestionCache = new Map();
const activityRegistryReadinessCache = new Map();
const encoder = new TextEncoder();

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

function secureResponse(response) {
  const headers = new Headers(response.headers);
  if (!headers.has("referrer-policy")) {
    headers.set("referrer-policy", "no-referrer");
  }
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
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
  for (const rpcUrl of rpcUrls) {
    let parsedRpcUrl;
    try {
      parsedRpcUrl = new URL(rpcUrl);
      if (parsedRpcUrl.protocol !== "https:") continue;
    } catch {
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(parsedRpcUrl.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            { to: registryAddress, data: ACTIVITY_REGISTRY_ESCROW_SELECTOR },
            "latest",
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.error) continue;
      rpcResponded = true;
      if (/^0x[a-fA-F0-9]{64}$/.test(payload?.result || "")) {
        boundEscrowAddress = `0x${payload.result.slice(-40)}`.toLowerCase();
        break;
      }
    } catch {
      // Try the next approved Base Sepolia endpoint.
    } finally {
      clearTimeout(timeout);
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
    return `0x${encoded.padStart(64, "0")}`;
  } catch {
    return null;
  }
}

function receiptExpectation(body, row, env) {
  const agreementId = cleanText(
    body.type === "finalize" ? body.agreementId : row.onchain_agreement_id,
    80,
  );
  const agreementTopic = uint256Topic(agreementId);
  if (!agreementTopic) return null;
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

  const expectation = {
    addresses: [openEscrowAddress],
    topics: [],
    agreementTopic,
    agreementTopicIndex: 1,
  };
  if (body.type === "finalize") {
    expectation.topics = [RECEIPT_EVENT_TOPICS.agreementProposed];
  } else if (body.type === "operations_reserve_paid") {
    expectation.addresses = [reserveAddress];
    expectation.topics = [RECEIPT_EVENT_TOPICS.operationsReservePaid];
    expectation.agreementTopicIndex = 2;
  } else if (
    body.type === "tenant_share_funded" ||
    body.type === "agreement_funded"
  ) {
    expectation.topics = [
      RECEIPT_EVENT_TOPICS.tenantShareFunded,
      RECEIPT_EVENT_TOPICS.agreementFunded,
    ];
  } else if (body.type === "claim_submitted") {
    expectation.topics = [RECEIPT_EVENT_TOPICS.claimSubmitted];
  } else if (body.type === "claim_amended") {
    expectation.topics = [
      tokenMicros(body.amount) === 0n
        ? RECEIPT_EVENT_TOPICS.claimRetracted
        : RECEIPT_EVENT_TOPICS.claimAmended,
    ];
  } else if (body.type === "claim_response") {
    expectation.topics = [
      RECEIPT_EVENT_TOPICS.tenantClaimResponse,
      RECEIPT_EVENT_TOPICS.legacyClaimResponse,
    ];
  } else if (body.type === "arbiter_ruling") {
    expectation.topics = [RECEIPT_EVENT_TOPICS.disputeResolved];
  } else if (body.type === "withdrawal_completed") {
    expectation.topics = [RECEIPT_EVENT_TOPICS.withdrawn];
  } else if (body.type === "timeout_executed") {
    expectation.topics = [
      body.timeout === "no_claim_refund"
        ? RECEIPT_EVENT_TOPICS.noClaimWithdrawal
        : body.timeout === "no_response_dispute"
          ? RECEIPT_EVENT_TOPICS.responseTimedOut
          : RECEIPT_EVENT_TOPICS.arbiterTimedOut,
    ];
  } else if (body.type === "record_snapshot_anchored") {
    expectation.addresses = [registryAddress];
    expectation.topics = [RECEIPT_EVENT_TOPICS.recordSnapshotAnchored];
  } else if (body.type === "activity_hash_published") {
    expectation.addresses = [registryAddress];
    expectation.topics = [RECEIPT_EVENT_TOPICS.activityPublished];
  } else {
    return null;
  }
  return expectation;
}

async function verifiedBaseSepoliaReceipt(env, body, row, transactionHash) {
  const expectation = receiptExpectation(body, row, env);
  if (!expectation) {
    return {
      ok: false,
      status: 409,
      error: "The agreement id required to verify this transaction is unavailable.",
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

  let receipt;
  let rpcResponded = false;
  for (const parsedRpcUrl of parsedRpcUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_500);
    try {
      const response = await fetch(parsedRpcUrl.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [transactionHash],
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const result = await response.json();
      if (result?.error) continue;
      rpcResponded = true;
      if (result?.result) {
        receipt = result.result;
        break;
      }
    } catch {
      // Try the next approved Base Sepolia endpoint.
    } finally {
      clearTimeout(timeout);
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
  const matchingLog = (Array.isArray(receipt.logs) ? receipt.logs : []).find(
    (log) =>
      expectation.addresses.includes(cleanText(log?.address, 80).toLowerCase()) &&
      expectation.topics.includes(cleanText(log?.topics?.[0], 80).toLowerCase()) &&
      cleanText(
        log?.topics?.[expectation.agreementTopicIndex],
        80,
      ).toLowerCase() === expectation.agreementTopic,
  );
  if (!matchingLog) {
    return {
      ok: false,
      status: 400,
      error:
        "This transaction does not contain the expected event for the current OpenEscrow agreement.",
    };
  }
  return {
    ok: true,
    blockNumber: cleanText(receipt.blockNumber, 80),
    transactionHash,
  };
}

function emailProvider(env) {
  if (!env.NOTIFICATION_FROM_EMAIL) return null;
  if (env.RESEND_API_KEY) return "resend";
  if (env.EMAIL_WEBHOOK_URL) return "webhook";
  return null;
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
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

function validClaimForTerms(items, confirmations, evidenceUri, evidenceHash, terms) {
  return terms?.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
    terms?.policyVersion === CALIFORNIA_POLICY.version
    ? validCaliforniaClaim(items, confirmations, evidenceUri, evidenceHash)
    : validGenericTestClaim(items, confirmations, evidenceUri, evidenceHash);
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

const COMPLIANCE_EVENT_KEYS = new Set([
  ...Object.values(US_JURISDICTION_PROFILE_BY_CODE).flatMap((profile) =>
    profile.deadlines.map((deadlineRule) => deadlineRule.trigger),
  ),
  "scraTerminationEffectiveAt",
]);

function validPeriodDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 365;
}

function depositAssetTestnetLabel(terms) {
  return (
    terms?.depositAssetSnapshot?.testnetSymbol ||
    getDepositAssetForTerms(terms)?.testnetSymbol ||
    (terms?.tokenChoice === "yield" ? "ytUSDC" : "testUSDC")
  );
}

function validTerms(terms) {
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
  return Boolean(
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
      ) &&
      terms.responseDays === "7" &&
      (terms.arbiterDays === undefined ||
        terms.arbiterDays === null ||
        terms.arbiterDays === "" ||
        terms.arbiterDays === "7"),
  );
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

async function evidenceEncryptionKey(env, evidenceId) {
  const rawKey = decodeBase64(env.EVIDENCE_ENCRYPTION_KEY);
  if (rawKey.length !== 32) {
    throw new Error("EVIDENCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
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
  const key = await evidenceEncryptionKey(env, evidenceId);
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
  };
}

async function decryptEvidenceBytes(env, evidenceId, bytes, iv) {
  const key = await evidenceEncryptionKey(env, evidenceId);
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
    !header.kid ||
    payload.iss !== "privy.io" ||
    !audienceMatches ||
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= now
  ) {
    throw new Error("The signed-in account could not be verified.");
  }

  const jwksResponse = await fetch(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`, {
    headers: { accept: "application/json", "user-agent": "OpenEscrow/1.0" },
  });
  if (!jwksResponse.ok) throw new Error("Account verification is temporarily unavailable.");
  const jwks = await jwksResponse.json();
  const jwk = Array.isArray(jwks.keys)
    ? jwks.keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "EC")
    : null;
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
  await db.batch([
    db.prepare(AGREEMENTS_SCHEMA),
    db.prepare(EVENTS_SCHEMA),
    db.prepare(EVENTS_INDEX),
    db.prepare(ACCOUNT_ACCESS_SCHEMA),
    db.prepare(ACCOUNT_ACCESS_INDEX),
    db.prepare(ACCOUNT_RECORD_ARCHIVES_SCHEMA),
    db.prepare(ACCOUNT_RECORD_ARCHIVES_INDEX),
    db.prepare(NOTIFICATION_PREFERENCES_SCHEMA),
    db.prepare(EVIDENCE_FILES_SCHEMA),
    db.prepare(EVIDENCE_FILES_INDEX),
    db.prepare(NOTIFICATION_UNSUBSCRIBE_SCHEMA),
    db.prepare(NOTIFICATION_DELIVERIES_SCHEMA),
    db.prepare(NOTIFICATION_DELIVERIES_INDEX),
    db.prepare(NEGOTIATION_TENANTS_SCHEMA),
    db.prepare(NEGOTIATION_TENANTS_INDEX),
    db.prepare(ACCOUNT_ACCESS_CONTEXT_SCHEMA),
    db.prepare(BACKFILL_PRIMARY_TENANTS),
    db.prepare(SCHEDULED_JOB_RUNS_SCHEMA),
    db.prepare(COMPLIANCE_SOURCE_CHECKS_SCHEMA),
    db.prepare(COMPLIANCE_SOURCE_CHECKS_INDEX),
  ]);
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

  const existing = await env.DB
    .prepare("SELECT * FROM notification_preferences WHERE user_id = ?")
    .bind(identity.userId)
    .first();
  if (request.method === "GET") {
    return json({
      agreementActivity: existing?.agreement_activity === 1,
      deadlineReminders: existing?.deadline_reminders === 1,
      consentedAt: existing?.consented_at || null,
      updatedAt: existing?.updated_at || null,
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
  let complianceSourceLastRunAt = null;
  let complianceSourceStats = {
    tracked: 0,
    changed: 0,
    unreachable: 0,
  };
  if (env.DB) {
    await initialize(env.DB);
    const scheduledRun = await env.DB
      .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
      .bind("notification-reminders")
      .first();
    schedulerLastRunAt = scheduledRun?.last_started_at || null;
    const sourceRun = await env.DB
      .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
      .bind("compliance-source-monitor")
      .first();
    complianceSourceLastRunAt = sourceRun?.last_started_at || null;
    const sourceStats = await env.DB
      .prepare(
        `SELECT COUNT(*) AS tracked,
                SUM(CASE WHEN status = 'changed' THEN 1 ELSE 0 END) AS changed,
                SUM(CASE WHEN status = 'unreachable' THEN 1 ELSE 0 END) AS unreachable
         FROM compliance_source_checks`,
      )
      .first();
    complianceSourceStats = {
      tracked: Number(sourceStats?.tracked || 0),
      changed: Number(sourceStats?.changed || 0),
      unreachable: Number(sourceStats?.unreachable || 0),
    };
  }
  const provider = emailProvider(env);
  const decentralizedReady = Boolean(
    env.PINATA_JWT && env.EVIDENCE_ENCRYPTION_KEY,
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
  return json({
    email: {
      configured: Boolean(provider),
      provider,
      schedulerConfigured: Boolean(env.DB),
      schedulerLastRunAt,
    },
    evidence: {
      configured: Boolean(env.EVIDENCE || decentralizedReady),
      mode: evidenceMode,
      encryptedAtRest: Boolean(env.EVIDENCE_ENCRYPTION_KEY),
      decentralizedReady,
      contentTypeValidation: true,
    },
    recordIntegrity: {
      lifecycleStateGuards: true,
      transactionReceiptVerification: receiptVerificationEnabled(env),
      chain: "Base Sepolia",
      activityRegistry: registryReadiness,
    },
    complianceSources: {
      configured: env.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true",
      total: COMPLIANCE_SOURCE_REGISTRY.length,
      ...complianceSourceStats,
      lastRunAt: complianceSourceLastRunAt,
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
  const prior = await env.DB
    .prepare("SELECT status, provider_message_id FROM notification_deliveries WHERE idempotency_key = ?")
    .bind(idempotencyKey)
    .first();
  if (prior?.status === "sent") {
    return json({
      sent: true,
      duplicate: true,
      provider: emailProvider(env),
      messageId: prior.provider_message_id,
    });
  }

  const delivered = await deliverEmail(env, {
    to: [email],
    subject: "Your OpenEscrow email notifications are ready",
    text: [
      "This test confirms that OpenEscrow can deliver automatic agreement and deadline notifications to this verified account.",
      "Private agreement details, addresses, amounts, evidence, and notes are intentionally omitted from notification emails.",
      "You can change your notification preferences from the signed-in OpenEscrow account panel.",
    ].join("\n\n"),
    idempotencyKey,
  });
  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `INSERT INTO notification_deliveries
       (idempotency_key, negotiation_id, recipient_email, notification_type,
        scheduled_for, status, provider_message_id, created_at, sent_at)
       VALUES (?, NULL, ?, 'email_configuration_test', NULL, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         status = excluded.status,
         provider_message_id = excluded.provider_message_id,
         sent_at = excluded.sent_at`,
    )
    .bind(
      idempotencyKey,
      email,
      delivered?.id ? "sent" : "failed",
      delivered?.id || null,
      now,
      delivered?.id ? now : null,
    )
    .run();
  if (!delivered?.id) {
    return json({ error: "The email provider rejected the test message." }, 502);
  }
  return json({
    sent: true,
    duplicate: false,
    provider: delivered.provider,
    messageId: delivered.id,
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
  } else {
    const emailColumn =
      role === "landlord"
        ? "landlord_email"
        : role === "arbiter"
          ? "arbiter_email"
          : null;
    if (!emailColumn) {
      return json({ error: "Choose a valid account role before searching." }, 400);
    }
    result = await env.DB
      .prepare(
        `SELECT * FROM agreement_negotiations
         WHERE lower(${emailColumn}) IN (${placeholders})
         ORDER BY updated_at DESC`,
      )
      .bind(...identity.emails)
      .all();
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
  for (const row of rows) {
    const token = randomToken();
    const tokenHash = await hashToken(token);
    await env.DB
      .prepare(
        "INSERT INTO negotiation_account_access (negotiation_id, user_id, role, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(row.id, identity.userId, role, tokenHash, now.toISOString(), expiresAt)
      .run();
    if (role === "tenant" && row.participant_id) {
      await env.DB
        .prepare(
          "INSERT INTO negotiation_account_access_context (token_hash, tenant_id) VALUES (?, ?)",
        )
        .bind(tokenHash, row.participant_id)
        .run();
    }
    accesses.push({
      proposalId: row.id,
      role,
      token,
      archived: archivedNegotiationIds.has(row.id),
    });
  }

  return json({ accesses });
}

async function identityCanAccessRecord(db, identity, row, role) {
  if (role === "landlord") {
    return identity.emails.includes(normalizeEmail(row.landlord_email));
  }
  if (role === "arbiter") {
    return identity.emails.includes(normalizeEmail(row.arbiter_email));
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

async function rowFor(db, id) {
  return db
    .prepare("SELECT * FROM agreement_negotiations WHERE id = ?")
    .bind(id)
    .first();
}

async function authorize(db, row, token) {
  if (!row || !token) return null;
  const hash = await hashToken(token);
  if (hash === row.landlord_token_hash) return "landlord";
  if (hash === row.tenant_token_hash) return "tenant";
  if (row.arbiter_token_hash && hash === row.arbiter_token_hash) return "arbiter";
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

async function createNegotiation(request, db) {
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
  if (!validTerms(body.terms)) {
    return json({ error: "The agreement terms are incomplete or invalid." }, 400);
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
  const workspaceUrl = new URL(request.url).origin;
  const subject = `OpenEscrow proposal ${row.id} is approved and ready to finalize`;
  const text = [
    `Every tenant${row.arbiter_email ? " and the optional arbiter have" : " has"} approved revision ${row.revision} of OpenEscrow proposal ${row.id}.`,
    "The proposal is still saved offchain and has not been finalized.",
    `Sign in as the landlord, choose Agreements & deductions, and select Find my proposals & agreements: ${workspaceUrl}`,
    "Open the approval-ready proposal and submit the finalized terms onchain.",
  ].join("\n\n");
  const delivered = await deliverEmail(env, {
    to: [row.landlord_email],
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
) {
  if (!emailProvider(env)) return [];
  const tenantRecipients = (await tenantsFor(env.DB, row.id)).map((tenant) => [
    "tenant",
    tenant.email,
  ]);
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
  }[eventType];
  if (!notification) return [];

  const appUrl = new URL(request.url).origin;
  const results = [];
  for (const [recipientRole, email] of notification.recipients) {
    if (!email) continue;
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
      const delivered = await deliverEmail(env, {
        to: [email],
        subject: notification.subject,
        text: `${notification.text}\n\nOpen your signed-in dashboard: ${appUrl}\n\nThis email intentionally omits evidence, tenancy details, and private notes.${unsubscribeUrl ? `\n\nTurn off optional OpenEscrow emails: ${unsubscribeUrl}` : ""}`,
        idempotencyKey: `agreement-${row.id}-${eventType}-${recipientRole}-${recipientKey}-${row.updated_at}`,
      });
      if (delivered?.id) {
        results.push({ recipientRole, email, messageId: delivered.id });
      }
    } catch {
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
  const prior = await env.DB
    .prepare("SELECT status FROM notification_deliveries WHERE idempotency_key = ?")
    .bind(idempotencyKey)
    .first();
  if (prior?.status === "sent") return false;

  const unsubscribeUrl = await unsubscribeUrlFor(env.DB, appUrl, notification.email);
  const createdAt = new Date().toISOString();
  let messageId = null;
  try {
    const delivered = await deliverEmail(env, {
      to: [notification.email],
      subject: notification.subject,
      text: `${notification.text}\n\nOpen your signed-in dashboard: ${appUrl}\n\nThis reminder intentionally omits addresses, amounts, evidence, and private notes.${unsubscribeUrl ? `\n\nTurn off optional OpenEscrow emails: ${unsubscribeUrl}` : ""}`,
      idempotencyKey,
    });
    if (delivered?.id) messageId = delivered.id;
  } catch {
    // The durable failed-delivery record allows the next scheduled run to retry.
  }

  await env.DB
    .prepare(
      `INSERT INTO notification_deliveries
       (idempotency_key, negotiation_id, recipient_email, notification_type,
        scheduled_for, status, provider_message_id, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         status = excluded.status,
         provider_message_id = excluded.provider_message_id,
         sent_at = excluded.sent_at`,
    )
    .bind(
      idempotencyKey,
      row.id,
      notification.email,
      notification.type,
      notification.scheduledFor.toISOString(),
      messageId ? "sent" : "failed",
      messageId,
      createdAt,
      messageId ? createdAt : null,
    )
    .run();
  if (!messageId) return false;

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
        messageId,
      },
    ),
  ]);
  return true;
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
  if (terms.complianceSnapshot?.schema !== "openescrow.us-compliance-profile.v3") {
    return [];
  }
  const profile = US_JURISDICTION_PROFILE_BY_CODE[terms.jurisdiction];
  if (!profile) return [];
  const confirmedEvents = Object.fromEntries(
    events
      .filter((event) => event.action === "compliance_event_confirmed")
      .map((event) => [
        cleanText(event.metadata?.eventName, 80),
        cleanText(event.metadata?.occurredAt, 40),
      ])
      .filter(([eventName, occurredAt]) => eventName && occurredAt),
  );
  const evaluation = evaluateCompliance(profile, {
    address: terms.addressResolution,
    facts: {
      ...(terms.complianceFacts || {}),
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
  const appUrl =
    cleanText(env.PUBLIC_APP_URL, 500) ||
    "https://openescrow-demo.omrigross.chatgpt.site/";
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
          (source_key, scope, jurisdiction, profile_version, citation, url, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')
         ON CONFLICT(source_key) DO UPDATE SET
           scope = excluded.scope,
           jurisdiction = excluded.jurisdiction,
           profile_version = excluded.profile_version,
           citation = excluded.citation,
           url = excluded.url`,
      )
      .bind(
        item.key,
        item.scope,
        item.jurisdiction,
        item.version,
        item.citation,
        item.url,
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

async function checkComplianceSource(db, sourceRow, now) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const sourceUrl = new URL(sourceRow.url);
    if (sourceUrl.protocol !== "https:") throw new Error("HTTPS is required.");
    const response = await fetch(sourceUrl.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5",
        range: "bytes=0-262143",
        "user-agent": "OpenEscrow compliance source monitor/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Official source returned HTTP ${response.status}.`);
    }
    const signature = await digestSourceResponse(response);
    const baseline = sourceRow.baseline_signature || signature;
    const changed = Boolean(
      sourceRow.baseline_signature && sourceRow.baseline_signature !== signature,
    );
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET baseline_signature = ?, current_signature = ?, http_status = ?,
             status = ?, last_checked_at = ?,
             last_changed_at = CASE WHEN ? THEN ? ELSE last_changed_at END,
             error = NULL
         WHERE source_key = ?`,
      )
      .bind(
        baseline,
        signature,
        response.status,
        changed ? "changed" : "unchanged",
        now.toISOString(),
        changed ? 1 : 0,
        now.toISOString(),
        sourceRow.source_key,
      )
      .run();
  } catch (error) {
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET status = 'unreachable', last_checked_at = ?, error = ?
         WHERE source_key = ?`,
      )
      .bind(
        now.toISOString(),
        cleanText(error instanceof Error ? error.message : "Source check failed.", 300),
        sourceRow.source_key,
      )
      .run();
  } finally {
    clearTimeout(timeout);
  }
}

async function runComplianceSourceAudit(env, now = new Date()) {
  if (!env.DB || env.COMPLIANCE_SOURCE_MONITOR_ENABLED !== "true") return;
  await initialize(env.DB);
  const prior = await env.DB
    .prepare("SELECT last_started_at FROM scheduled_job_runs WHERE name = ?")
    .bind("compliance-source-monitor")
    .first();
  const lastStarted = prior?.last_started_at
    ? new Date(prior.last_started_at).getTime()
    : 0;
  if (now.getTime() - lastStarted < 24 * 60 * 60 * 1000) return;
  await seedComplianceSources(env.DB);
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
    await checkComplianceSource(env.DB, row, now);
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

async function applyAction(request, env, id) {
  const db = env.DB;
  const body = await request.json();
  const row = await rowFor(db, id);
  const role = await authorize(db, row, body.token);
  if (!role) return json({ error: "This proposal link is invalid or no longer available." }, 403);
  if (
    (row.status === "cancelled" || row.status === "superseded") &&
    body.type !== "cancel_proposal"
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
  };
  const expectedEvent = transactionEventByAction[body.type];
  const incomingTransactionHash = cleanText(body.transactionHash, 100);
  if (expectedEvent && /^0x[a-fA-F0-9]{64}$/.test(incomingTransactionHash)) {
    const currentRecord = await serialize(db, row);
    const alreadyRecorded =
      (body.type === "finalize" && row.onchain_tx_hash === incomingTransactionHash) ||
      currentRecord.events.some(
        (event) =>
          event.action === expectedEvent &&
          event.metadata?.transactionHash === incomingTransactionHash,
      );
    if (alreadyRecorded) return json(currentRecord);
  }

  const recordedEvents = await eventsFor(db, id);
  const now = new Date().toISOString();
  const revision = Number(row.revision);
  const statements = [];

  if (body.type === "cancel_proposal") {
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
    if (!validTerms(body.terms)) return json({ error: "The revised agreement terms are invalid." }, 400);
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
    if (!validTerms(approvedTerms)) {
      return json(
        {
          error:
            "This approved revision does not match a current jurisdiction policy. Publish a new revision and collect fresh approvals before finalizing.",
        },
        409,
      );
    }
    const agreementId = cleanText(body.agreementId, 80);
    const transactionHash = cleanText(body.transactionHash, 100);
    if (!agreementId || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return json({ error: "The onchain agreement details are invalid." }, 400);
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
    const occurredTime = new Date(occurredAt).getTime();
    const note = cleanText(body.note, 500);
    if (!COMPLIANCE_EVENT_KEYS.has(eventName)) {
      return json({ error: "That lifecycle event is not used by this compliance profile." }, 400);
    }
    if (
      !occurredAt ||
      Number.isNaN(occurredTime) ||
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
        `Proposed ${eventName} at ${new Date(occurredTime).toISOString()} for confirmation by the other party.`,
        revision,
        {
          eventName,
          occurredAt: new Date(occurredTime).toISOString(),
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
    const californiaConfirmations = body.californiaConfirmations;
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
        californiaConfirmations,
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
          californiaConfirmations,
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
    const californiaConfirmations = body.californiaConfirmations;
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
        californiaConfirmations,
        evidenceUri,
        evidenceHash,
        agreementTerms,
      ) ||
      !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
    ) {
      return json({ error: "The recorded claim amendment is incomplete." }, 400);
    }
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
          californiaConfirmations,
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
        { timeout, transactionHash },
      ),
    );
  } else {
    return json({ error: "Unsupported agreement action." }, 400);
  }

  if (
    expectedEvent &&
    receiptVerificationEnabled(env) &&
    /^0x[a-fA-F0-9]{64}$/.test(incomingTransactionHash)
  ) {
    const verification = await verifiedBaseSepoliaReceipt(
      env,
      body,
      row,
      incomingTransactionHash,
    );
    if (!verification.ok) {
      return json({ error: verification.error }, verification.status);
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
        },
      ),
    );
  }

  await db.batch(statements);
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
    body.type === "tenant_share_funded" ||
    body.type === "agreement_funded" ||
    body.type === "claim_submitted" ||
    body.type === "claim_amended" ||
    body.type === "claim_response" ||
    body.type === "arbiter_ruling"
  ) {
    try {
      const deliveries = await sendOptedInAgreementActivityEmails(
        request,
        env,
        updated,
        body.type,
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
              `Sent the ${body.type.replaceAll("_", " ")} notice to the opted-in ${delivery.recipientRole}.`,
              updated.revision,
              {
                eventType: body.type,
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
  return json(await serialize(db, updated));
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
  const form = await request.formData();
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
  if (env.EVIDENCE_ENCRYPTION_KEY) {
    try {
      const encrypted = await encryptEvidenceBytes(env, evidenceId, bytes);
      storedBytes = encrypted.bytes;
      encryptionVersion = encrypted.version;
      encryptionIv = encrypted.iv;
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
    await env.EVIDENCE.put(objectKey, storedBytes, {
      httpMetadata: {
        contentType: encryptionVersion ? "application/octet-stream" : contentType,
      },
      customMetadata: {
        negotiationId: proposalId,
        uploaderRole: role,
        sha256,
        encrypted: encryptionVersion ? "true" : "false",
      },
    });
    const uri = `openescrow://evidence/${evidenceId}`;
    const storageKind = encryptionVersion ? "encrypted-r2" : "private-r2";
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO evidence_files
           (id, negotiation_id, uploader_role, storage_kind, object_key, cid,
             original_name, content_type, size_bytes, sha256, encryption_version,
             encryption_iv, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
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
        },
      ),
    ]);
    return json({
      cid: evidenceId,
      uri,
      sha256,
      storageKind: encryptionVersion ? "encrypted-private" : "private",
      gatewayUrl: `/api/evidence/${encodeURIComponent(evidenceId)}?token=${encodeURIComponent(token)}`,
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
      keyvalues: { encrypted: "true", format: "aes-256-gcm-hkdf-v1" },
    }),
  );
  const upload = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { authorization: `Bearer ${env.PINATA_JWT}` },
    body: pinataForm,
  });
  const result = await upload.json();
  if (!upload.ok || !result.IpfsHash) {
    return json({ error: "The IPFS pinning service rejected the upload." }, 502);
  }

  const uri = `openescrow+ipfs://${result.IpfsHash}/${evidenceId}`;
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO evidence_files
         (id, negotiation_id, uploader_role, storage_kind, object_key, cid,
           original_name, content_type, size_bytes, sha256, encryption_version,
           encryption_iv, created_at)
         VALUES (?, ?, ?, 'encrypted-ipfs', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        evidenceId,
        proposalId,
        role,
        result.IpfsHash,
        cleanText(file.name, 240) || "evidence",
        contentType,
        file.size,
        sha256,
        encryptionVersion,
        encryptionIv,
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
        cid: result.IpfsHash,
        uri,
        sha256,
        size: file.size,
        type: contentType,
        storageKind: "encrypted-ipfs",
        encrypted: true,
      },
    ),
  ]);
  return json({
    cid: result.IpfsHash,
    uri,
    sha256,
    storageKind: "encrypted-decentralized",
    gatewayUrl: `/api/evidence/${encodeURIComponent(evidenceId)}?token=${encodeURIComponent(token)}`,
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
  const token = new URL(request.url).searchParams.get("token");
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
    const object = await env.EVIDENCE.get(metadata.object_key);
    if (!object) return json({ error: "This private evidence file is unavailable." }, 404);
    storedBytes = await object.arrayBuffer();
  } else if (metadata.storage_kind === "encrypted-ipfs" && metadata.cid) {
    const gatewayBase =
      cleanText(env.IPFS_GATEWAY_URL, 500) ||
      "https://gateway.pinata.cloud/ipfs";
    const gatewayUrl = `${gatewayBase.replace(/\/+$/, "")}/${encodeURIComponent(metadata.cid)}`;
    const response = await fetch(gatewayUrl, {
      headers: { "user-agent": "OpenEscrow/1.0" },
    });
    if (!response.ok) {
      return json({ error: "The encrypted IPFS evidence file is unavailable." }, 502);
    }
    storedBytes = await response.arrayBuffer();
  } else {
    return json({ error: "This evidence storage format is not supported." }, 404);
  }

  let plaintext = storedBytes;
  if (metadata.encryption_version) {
    if (!env.EVIDENCE_ENCRYPTION_KEY || !metadata.encryption_iv) {
      return json({ error: "The evidence decryption key is not configured." }, 503);
    }
    try {
      plaintext = await decryptEvidenceBytes(
        env,
        evidenceId,
        storedBytes,
        metadata.encryption_iv,
      );
    } catch {
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

  const safeName = cleanText(metadata.original_name, 240).replaceAll(/[^a-zA-Z0-9._ -]/g, "_");
  const headers = new Headers();
  headers.set("content-type", metadata.content_type || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${safeName || "evidence"}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-security-policy", "sandbox");
  headers.set("x-frame-options", "DENY");
  headers.set("x-openescrow-sha256", metadata.sha256);
  headers.set(
    "x-openescrow-storage",
    metadata.storage_kind || "unknown",
  );
  return new Response(plaintext, { headers });
}

async function sendClaimNotification(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  if (!emailProvider(env)) {
    return json(
      {
        error:
          "Automatic email delivery is not configured yet. Use the Gmail or copy-email fallback.",
      },
      503,
    );
  }
  const body = await request.json();
  const proposalId = cleanText(body.proposalId, 80);
  const row = await rowFor(env.DB, proposalId);
  const role = await authorize(env.DB, row, body.token);
  if (role !== "landlord") {
    return json({ error: "Only the landlord may send a deduction-claim notice." }, 403);
  }
  let reviewUrl;
  try {
    reviewUrl = new URL(body.reviewUrl);
  } catch {
    return json({ error: "The tenant review link is invalid." }, 400);
  }
  const requestOrigin = new URL(request.url).origin;
  if (
    reviewUrl.origin !== requestOrigin ||
    reviewUrl.searchParams.get("invite") !== "tenant" ||
    reviewUrl.searchParams.get("proposal") !== proposalId
  ) {
    return json({ error: "The tenant review link is invalid." }, 400);
  }
  const agreementId = cleanText(body.agreementId, 80);
  const amount = cleanText(body.amount, 80);
  const items = cleanDeductionItems(body.items);
  const note = cleanText(body.note, 1000);
  const evidenceUri = cleanText(body.evidenceUri, 500);
  if (!agreementId || !amount || !items || !deductionItemsMatchAmount(items, amount)) {
    return json({ error: "The claim notice is incomplete." }, 400);
  }

  const subject = `OpenEscrow deduction claim for agreement #${agreementId}`;
  const itemSummary = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.category}: ${item.description} (${item.amount} shares)`,
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
      }),
    )
  ).slice(0, 32);
  const existingRecord = await serialize(env.DB, row);
  const recipientEmails = [
    ...new Set(
      [row.tenant_email, ...existingRecord.tenants.map((tenant) => tenant.email)]
        .map((email) => normalizeEmail(email))
        .filter(Boolean),
    ),
  ];
  const existingDelivery = existingRecord.events.find(
    (event) =>
      event.action === "claim_notification_sent" &&
      event.metadata?.deliveryKey === deliveryKey,
  );
  if (existingDelivery) {
    return json({
      messageId: existingDelivery.metadata.messageId,
      duplicate: true,
    });
  }
  const text = [
    `A deduction claim of ${amount} shares has been submitted for OpenEscrow agreement #${agreementId}.`,
    `Itemized deductions:\n${itemSummary}`,
    note ? `Landlord note: ${note}` : "",
    evidenceUri
      ? evidenceUri.startsWith("openescrow://evidence/") ||
        evidenceUri.startsWith("openescrow+ipfs://")
        ? "Invoice / evidence: available privately after opening the agreement"
        : `Invoice / evidence: ${evidenceUri}`
      : "",
    `Review the documentation and approve or dispute the claim: ${reviewUrl.toString()}`,
    "Your decision and all related actions will be included in the timestamped agreement record.",
  ].filter(Boolean).join("\n\n");
  const delivered = await deliverEmail(env, {
    to: recipientEmails,
    subject,
    text,
    idempotencyKey: `claim-${proposalId}-${deliveryKey}`,
  });
  if (!delivered?.id) {
    return json({ error: "The email provider could not send this claim notice." }, 502);
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
      `Sent the deduction-claim notice to ${recipientEmails.join(", ")}.`,
      row.revision,
      { messageId: delivered.id, deliveryKey },
    ),
  ]);
  return json({ messageId: delivered.id, duplicate: false });
}

async function sendClaimResponseNotification(request, env) {
  if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
  if (!emailProvider(env)) {
    return json(
      {
        error:
          "Automatic email delivery is not configured yet. Use the Gmail or copy-email fallback.",
      },
      503,
    );
  }
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
  if (row.status !== "finalized") {
    return json({ error: "The agreement must be finalized before a claim response." }, 409);
  }

  const agreementId = cleanText(body.agreementId, 80);
  const decision = cleanText(body.decision, 20);
  const acceptedAmount = cleanText(body.acceptedAmount, 80);
  const note = cleanText(body.note, 1000);
  const transactionHash = cleanText(body.transactionHash, 100);
  let reviewUrl;
  try {
    reviewUrl = new URL(body.reviewUrl);
  } catch {
    return json({ error: "The landlord review link is invalid." }, 400);
  }
  const requestOrigin = new URL(request.url).origin;
  if (
    reviewUrl.origin !== requestOrigin ||
    reviewUrl.searchParams.get("id") !== agreementId
  ) {
    return json({ error: "The landlord review link is invalid." }, 400);
  }
  if (
    !agreementId ||
    !["approve", "partial", "dispute"].includes(decision) ||
    tokenMicros(acceptedAmount) === null ||
    (decision === "dispute" && tokenMicros(acceptedAmount) !== 0n) ||
    (decision !== "dispute" && tokenMicros(acceptedAmount) === 0n) ||
    ((decision === "partial" || decision === "dispute") && !note) ||
    !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
  ) {
    return json({ error: "The claim response notice is incomplete." }, 400);
  }

  const decisionSummary =
    decision === "approve"
      ? `approved the full deduction (${acceptedAmount} shares)`
      : decision === "dispute"
        ? "disputed the full deduction"
        : `approved ${acceptedAmount} shares and disputed the remainder`;
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
  const existingRecord = await serialize(env.DB, row, tenant.id);
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
  const delivered = await deliverEmail(env, {
    to: [normalizeEmail(row.landlord_email)],
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
      { tenantId: tenant.id, messageId: delivered.id, deliveryKey },
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
    const researchProfile = US_JURISDICTION_PROFILE_BY_CODE[candidate.jurisdiction];
    const complianceSnapshot =
      (candidate.complianceSnapshot?.schema === "openescrow.us-compliance-profile.v2" ||
        candidate.complianceSnapshot?.schema === "openescrow.us-compliance-profile.v3")
        ? candidate.complianceSnapshot
        : null;
    const jurisdiction =
      researchProfile?.label ||
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
${deadlineRules.length ? `<tr><th>Compliance deadline paths</th><td>${deadlinePaths}</td></tr><tr><th>Applied statewide requirements</th><td>${requirements}</td></tr>${overlayRequirements ? `<tr><th>Federal and program overlays</th><td>${overlayRequirements}</td></tr>` : ""}<tr><th>Unresolved coverage</th><td>${(complianceSnapshot?.unresolvedOverlays || ["Confirm local, federal, housing-program, and fact-specific overlays."]).map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}<small>Software output is not legal advice.</small></td></tr>` : ""}
${isCalifornia ? `<tr><th>Deposit-cap facts</th><td>${candidate.smallLandlordException ? "Qualifying small-landlord exception asserted" : "Standard one-month cap"}${candidate.tenantIsServiceMember ? " · tenant is a service member" : ""}</td></tr>` : ""}`;
  };
  const timeline = record.events
    .map(
      (event) => `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.actorRole)}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
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
      return `<h3>${event.action === "deduction_claim_amended" ? "Amended claim" : "Original claim"} · ${escapeHtml(event.createdAt)}</h3>
<table><thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="2">Total</th><th>${escapeHtml(event.metadata.amount)} shares</th></tr></tfoot></table>
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
  return !origin || origin === new URL(request.url).origin;
}

function sameOriginGet(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    (!origin || origin === new URL(request.url).origin) &&
    fetchSite !== "cross-site"
  );
}

function addressSuggestionResponse(suggestions, cacheStatus = "MISS") {
  return new Response(JSON.stringify({ suggestions, attribution: ADDRESS_ATTRIBUTION }), {
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
  for (const candidate of value.features) {
    const properties = candidate?.properties;
    const coordinates = candidate?.geometry?.coordinates;
    if (!properties || !Array.isArray(coordinates)) continue;
    const label = [
      [properties.housenumber, properties.street].filter(Boolean).join(" "),
      properties.name,
      properties.city || properties.town || properties.village,
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
    const countryName = cleanText(properties.country, 120);
    const countryCode =
      cleanText(properties.countrycode, 8).toUpperCase() ||
      (/^(united states|united states of america|usa)$/i.test(countryName) ? "US" : "");
    const stateName = cleanText(properties.state, 120);
    const photonStateCode = cleanText(
      properties.statecode || properties.state_code,
      12,
    ).toUpperCase();
    const stateCode =
      countryCode === "US"
        ? (/^[A-Z]{2}$/.test(photonStateCode)
            ? photonStateCode
            : US_STATE_POSTAL_CODE_BY_NAME[stateName.toLowerCase()] || "")
        : "";
    suggestions.push({
      id: osmId ? `${osmType || "osm"}:${osmId}` : `${latitude},${longitude}`,
      label,
      latitude,
      longitude,
      countryCode: countryCode || null,
      stateCode: stateCode || null,
      city:
        cleanText(
          properties.city || properties.town || properties.village || properties.hamlet,
          120,
        ) || null,
      county: cleanText(properties.county, 120) || null,
      postalCode: cleanText(properties.postcode, 20) || null,
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
    return addressSuggestionResponse([]);
  }

  const cacheKey = `${geocoderUrl.origin}${geocoderUrl.pathname}|${query.toLowerCase()}`;
  const cached = addressSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return addressSuggestionResponse(cached.suggestions, "HIT");
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
    if (!upstream.ok) return addressSuggestionResponse([]);
    const suggestions = normalizeAddressSuggestions(await upstream.json());
    if (addressSuggestionCache.size >= ADDRESS_SUGGESTION_CACHE_LIMIT) {
      addressSuggestionCache.delete(addressSuggestionCache.keys().next().value);
    }
    addressSuggestionCache.set(cacheKey, {
      expiresAt: Date.now() + ADDRESS_SUGGESTION_CACHE_TTL_MS,
      suggestions,
    });
    return addressSuggestionResponse(suggestions);
  } catch {
    return addressSuggestionResponse([]);
  } finally {
    clearTimeout(timeout);
  }
}

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html") &&
      context?.waitUntil
    ) {
      context.waitUntil(runNotificationJob(env));
    }
    if (url.pathname === "/api/address-suggestions" && request.method === "GET") {
      return addressSuggestions(request, env);
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
    if (evidenceMatch && request.method === "GET") {
      if (env.DB) await initialize(env.DB);
      return downloadEvidence(request, env, evidenceMatch[1]);
    }
    if (url.pathname.startsWith("/api/negotiations")) {
      if (!env.DB) return json({ error: "Agreement record storage is not available." }, 503);
      if (request.method !== "GET" && !sameOriginPost(request)) {
        return json({ error: "Cross-origin writes are not allowed." }, 403);
      }
      await initialize(env.DB);

      if (url.pathname === "/api/negotiations" && request.method === "POST") {
        return createNegotiation(request, env.DB);
      }
      if (url.pathname === "/api/negotiations/discover" && request.method === "POST") {
        return discoverNegotiations(request, env);
      }

      const match = url.pathname.match(
        /^\/api\/negotiations\/([a-zA-Z0-9-]+)(?:\/(actions|report|snapshot|tenants)(?:\/([a-zA-Z0-9-]+))?)?$/,
      );
      if (!match) return json({ error: "Agreement record endpoint not found." }, 404);
      const [, id, action, resourceId] = match;
      if (!action && request.method === "GET") {
        return getNegotiation(env.DB, id, url.searchParams.get("token"));
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
      if (action === "tenants" && resourceId && request.method === "DELETE") {
        return removeTenant(request, env, id, resourceId);
      }
      if (action === "report" && request.method === "GET") {
        return report(
          env.DB,
          id,
          url.searchParams.get("token"),
          url.searchParams.get("download") === "1",
        );
      }
      if (action === "snapshot" && request.method === "GET") {
        return snapshot(env.DB, id, url.searchParams.get("token"), env);
      }
      return json({ error: "Method not allowed." }, 405);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return secureResponse(response);
    }
    const fallback = new URL(request.url);
    fallback.pathname = "/index.html";
    fallback.search = "";
    return secureResponse(await env.ASSETS.fetch(new Request(fallback, request)));
  },
  async scheduled(controller, env, context) {
    const scheduledAt = new Date(controller?.scheduledTime || Date.now());
    context.waitUntil(
      Promise.all([
        runNotificationJob(env, scheduledAt),
        runComplianceSourceAudit(env, scheduledAt),
      ]),
    );
  },
};

export default worker;
