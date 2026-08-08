import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker, {
  apiRateLimitPolicy,
  applyApiAbuseControls,
  requestBodyLimitResponse,
} from "./index.js";
import { US_JURISDICTION_PROFILES } from "../shared/us-jurisdiction-profiles.js";
import {
  buildComplianceSnapshot,
  calculateDeadline,
  evaluateCompliance,
  evaluateComplianceSnapshot,
  isVersionedComplianceSnapshot,
  normalizeComplianceEventInstant,
  normalizeAddressResolution,
} from "../shared/us-compliance-engine.js";
import {
  DEPOSIT_ASSETS,
  createDepositAssetSnapshot,
  depositAssetAvailability,
  validateDepositAssetTerms,
} from "../shared/deposit-assets.js";
import {
  createAddressAttestation,
  verifyAddressAttestation,
} from "./address-attestation.js";
import {
  DYNAMIC_COMPLIANCE_FACTS,
  STATIC_COMPLIANCE_FACT_KEYS,
} from "../shared/us-compliance-facts.js";
import {
  FEDERAL_COMPLIANCE_OVERLAYS,
  LOCAL_COMPLIANCE_OVERLAYS,
} from "../shared/us-compliance-overlays.js";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";
import { createFundingIntent } from "../shared/funding-routes.js";

const TEST_ADDRESS_ATTESTATION_SECRET =
  "openescrow-test-address-attestation-secret-2026";

test("the packaged D1 migration applies cleanly", () => {
  const database = new DatabaseSync(":memory:");
  const applyMigration = (migrationName) => {
    const migration = readFileSync(
      new URL(`../../drizzle/${migrationName}`, import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  };
  for (const migrationName of [
    "0000_agreement_negotiations.sql",
    "0001_negotiation_account_access.sql",
    "0002_notification_preferences.sql",
    "0003_private_evidence_and_notifications.sql",
    "0004_tenant_deposit_shares.sql",
    "0005_encrypted_evidence.sql",
    "0006_compliance_source_monitor.sql",
    "0007_account_record_archives.sql",
    "0008_compliance_source_release_gate.sql",
    "0009_evidence_key_rotation.sql",
    "0010_sandbox_funding_checkouts.sql",
    "0011_evidence_key_fingerprints.sql",
    "0012_funding_event_provenance.sql",
    "0013_funding_reconciliation_identity.sql",
    "0014_funding_event_provenance_guards.sql",
    "0015_arbiter_replacement_access.sql",
    "0016_transaction_receipt_guards.sql",
    "0017_onchain_cancellation_receipt_guard.sql",
    "0018_finalization_receipt_assignment_guard.sql",
    "0019_api_rate_limits.sql",
    "0020_query_path_indexes.sql",
  ]) {
    applyMigration(migrationName);
  }
  applyMigration("0001_negotiation_account_access.sql");
  applyMigration("0020_query_path_indexes.sql");
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.ok(tables.includes("agreement_negotiations"));
  assert.ok(tables.includes("negotiation_account_access"));
  assert.ok(tables.includes("negotiation_events"));
  assert.ok(tables.includes("notification_preferences"));
  assert.ok(tables.includes("evidence_files"));
  assert.ok(tables.includes("notification_deliveries"));
  assert.ok(tables.includes("notification_unsubscribe_tokens"));
  assert.ok(tables.includes("scheduled_job_runs"));
  assert.ok(tables.includes("compliance_source_checks"));
  assert.ok(tables.includes("account_record_archives"));
  assert.ok(tables.includes("funding_checkout_attempts"));
  assert.ok(tables.includes("funding_checkout_events"));
  assert.ok(tables.includes("arbiter_replacement_access"));
  assert.ok(tables.includes("arbiter_replacement_account_access"));
  assert.ok(tables.includes("negotiation_receipt_guards"));
  assert.ok(tables.includes("api_rate_limits"));
  const rateLimitIndexes = database
    .prepare("PRAGMA index_list(api_rate_limits)")
    .all()
    .map((row) => row.name);
  assert.equal(rateLimitIndexes.includes("api_rate_limits_updated_idx"), true);
  const cleanupPlan = database
    .prepare("EXPLAIN QUERY PLAN DELETE FROM api_rate_limits WHERE updated_at < ?")
    .all("2026-08-01T00:00:00.000Z")
    .map((row) => row.detail)
    .join(" ");
  assert.match(cleanupPlan, /USING INDEX api_rate_limits_updated_idx/);
  const queryPlan = (sql, ...params) =>
    database
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params)
      .map((row) => row.detail)
      .join(" ");
  assert.match(
    queryPlan(
      `SELECT * FROM agreement_negotiations
       WHERE lower(landlord_email) = ?
       ORDER BY updated_at DESC`,
      "landlord@example.com",
    ),
    /USING INDEX agreement_negotiations_landlord_discovery_idx/,
  );
  assert.match(
    queryPlan(
      `SELECT negotiation.id
       FROM agreement_negotiations negotiation
       JOIN negotiation_tenants tenant ON tenant.negotiation_id = negotiation.id
       WHERE lower(tenant.email) = ?
       ORDER BY negotiation.updated_at DESC`,
      "tenant@example.com",
    ),
    /USING (?:COVERING )?INDEX negotiation_tenants_email_discovery_idx/,
  );
  const arbiterDiscoveryPlan = queryPlan(
    `WITH matching_negotiations AS (
       SELECT id
       FROM agreement_negotiations
       WHERE lower(arbiter_email) = ?
       UNION
       SELECT negotiation_id
       FROM arbiter_replacement_access
       WHERE status = 'confirmed' AND lower(email) = ?
     )
     SELECT negotiation.id
     FROM matching_negotiations matching
     JOIN agreement_negotiations negotiation ON negotiation.id = matching.id
     LEFT JOIN arbiter_replacement_access replacement
       ON replacement.negotiation_id = negotiation.id
      AND replacement.status = 'confirmed'
     ORDER BY negotiation.updated_at DESC`,
    "arbiter@example.com",
    "arbiter@example.com",
  );
  assert.match(
    arbiterDiscoveryPlan,
    /USING INDEX agreement_negotiations_arbiter_discovery_idx/,
  );
  assert.match(
    arbiterDiscoveryPlan,
    /USING INDEX arbiter_replacement_access_email_discovery_idx/,
  );
  assert.match(
    queryPlan(
      "DELETE FROM negotiation_account_access WHERE expires_at <= ?",
      "2026-08-01T00:00:00.000Z",
    ),
    /USING (?:COVERING )?INDEX negotiation_account_access_expires_idx/,
  );
  assert.match(
    queryPlan(
      `SELECT id
       FROM negotiation_account_access
       WHERE negotiation_id = ? AND user_id = ? AND role = ?
       ORDER BY created_at DESC, id DESC
       LIMIT -1 OFFSET 5`,
      "proposal-1",
      "user-1",
      "landlord",
    ),
    /USING (?:COVERING )?INDEX negotiation_account_access_session_idx/,
  );
  assert.match(
    queryPlan(
      "DELETE FROM negotiation_account_access WHERE user_id = ?",
      "user-1",
    ),
    /USING (?:COVERING )?INDEX negotiation_account_access_user_idx/,
  );
  assert.match(
    queryPlan(
      `SELECT * FROM agreement_negotiations
       WHERE status = 'finalized'
       ORDER BY updated_at ASC
       LIMIT 250`,
    ),
    /USING (?:COVERING )?INDEX agreement_negotiations_status_updated_idx/,
  );
  assert.match(
    queryPlan(
      `SELECT agreement_activity
       FROM notification_preferences
       WHERE lower(email) = lower(?) AND consented_at IS NOT NULL`,
      "tenant@example.com",
    ),
    /USING (?:COVERING )?INDEX notification_preferences_email_consent_idx/,
  );
  const fundingEventColumns = database
    .prepare("PRAGMA table_info(funding_checkout_events)")
    .all()
    .map((row) => row.name);
  assert.equal(fundingEventColumns.includes("source"), true);
  assert.equal(fundingEventColumns.includes("verification"), true);
  assert.equal(fundingEventColumns.includes("reconciliation_key"), true);
  assert.equal(fundingEventColumns.includes("payload_digest"), true);
  const reconciliationIndexes = database
    .prepare("PRAGMA index_list(funding_checkout_events)")
    .all()
    .map((row) => row.name);
  assert.equal(
    reconciliationIndexes.includes("funding_checkout_events_reconciliation_idx"),
    true,
  );
  const fundingEventTriggers = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'trigger' AND tbl_name = 'funding_checkout_events'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(fundingEventTriggers, [
    "funding_checkout_events_provenance_insert_guard",
    "funding_checkout_events_provenance_update_guard",
  ]);
  const receiptGuardTriggers = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'trigger' AND tbl_name = 'negotiation_events'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(receiptGuardTriggers, [
    "negotiation_events_receipt_guard",
  ]);
  const reconciliationKey = `sha256:${"a".repeat(64)}`;
  const payloadDigest = `sha256:${"b".repeat(64)}`;
  database.exec("PRAGMA foreign_keys = OFF");
  const insertFundingEvent = database.prepare(
    `INSERT INTO funding_checkout_events
     (attempt_id, event_id, status, provider_status, source, verification,
      reconciliation_key, payload_digest, occurred_at)
     VALUES (?, ?, 'confirmed', 'completed', ?, ?, ?, ?,
             '2026-07-30T00:00:00.000Z')`,
  );
  insertFundingEvent.run(
    "migration-attempt-1",
    "migration-event-1",
    "provider_webhook",
    "provider_signed",
    reconciliationKey,
    payloadDigest,
  );
  assert.throws(
    () =>
      insertFundingEvent.run(
        "migration-attempt-2",
        "migration-event-2",
        "provider_webhook",
        "provider_signed",
        reconciliationKey,
        payloadDigest,
      ),
    /unique/i,
  );
  insertFundingEvent.run(
    "migration-attempt-browser",
    "migration-event-browser",
    "browser_callback",
    "unverified",
    null,
    null,
  );
  assert.throws(
    () =>
      insertFundingEvent.run(
        "migration-attempt-browser-key",
        "migration-event-browser-key",
        "browser_callback",
        "unverified",
        `sha256:${"c".repeat(64)}`,
        `sha256:${"d".repeat(64)}`,
      ),
    /invalid funding checkout event provenance/i,
  );
  assert.throws(
    () =>
      insertFundingEvent.run(
        "migration-attempt-missing-digest",
        "migration-event-missing-digest",
        "provider_webhook",
        "provider_signed",
        `sha256:${"e".repeat(64)}`,
        null,
      ),
    /invalid funding checkout event provenance/i,
  );
  assert.throws(
    () =>
      insertFundingEvent.run(
        "migration-attempt-uppercase",
        "migration-event-uppercase",
        "operator_reconciliation",
        "operator_verified",
        `sha256:${"F".repeat(64)}`,
        `sha256:${"f".repeat(64)}`,
      ),
    /invalid funding checkout event provenance/i,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `UPDATE funding_checkout_events
           SET verification = 'unverified'
           WHERE event_id = 'migration-event-1'`,
        )
        .run(),
    /invalid funding checkout event provenance/i,
  );
  database.exec("PRAGMA foreign_keys = ON");
});

test("the receipt guard migration preserves and backfills historical duplicate events", () => {
  const database = new DatabaseSync(":memory:");
  const applyMigration = (migrationName) => {
    const migration = readFileSync(
      new URL(`../../drizzle/${migrationName}`, import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  };
  applyMigration("0000_agreement_negotiations.sql");
  database
    .prepare(
      `INSERT INTO agreement_negotiations
       (id, created_at, updated_at, status, revision, terms_json,
        landlord_email, tenant_email, landlord_token_hash, tenant_token_hash)
       VALUES ('OE-P-HISTORY', ?, ?, 'finalized', 1, '{}',
               'landlord@example.test', 'tenant@example.test', 'landlord-hash',
               'tenant-hash')`,
    )
    .run(
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );
  const historicalReceipt = JSON.stringify({
    transactionHash: `0x${"a".repeat(64)}`,
  });
  const insertHistoricalEvent = database.prepare(
    `INSERT INTO negotiation_events
     (negotiation_id, created_at, actor_role, action, summary, revision,
      metadata_json)
     VALUES ('OE-P-HISTORY', ?, 'tenant', 'claim_response_submitted',
             'Historical response.', 1, ?)`,
  );
  insertHistoricalEvent.run("2026-08-01T00:01:00.000Z", historicalReceipt);
  insertHistoricalEvent.run("2026-08-01T00:02:00.000Z", historicalReceipt);

  applyMigration("0016_transaction_receipt_guards.sql");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE negotiation_id = 'OE-P-HISTORY'",
      )
      .get().count,
    2,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_receipt_guards WHERE negotiation_id = 'OE-P-HISTORY'",
      )
      .get().count,
    1,
  );
  assert.throws(
    () =>
      insertHistoricalEvent.run(
        "2026-08-01T00:03:00.000Z",
        historicalReceipt,
      ),
    /unique/i,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE negotiation_id = 'OE-P-HISTORY'",
      )
      .get().count,
    2,
  );

  const cancellationReceipt = JSON.stringify({
    transactionHash: `0x${"b".repeat(64)}`,
  });
  const insertCancellationEvent = database.prepare(
    `INSERT INTO negotiation_events
     (negotiation_id, created_at, actor_role, action, summary, revision,
      metadata_json)
     VALUES ('OE-P-HISTORY', ?, 'landlord', 'onchain_proposal_cancelled',
             'Historical cancellation.', 1, ?)`,
  );
  insertCancellationEvent.run(
    "2026-08-01T00:04:00.000Z",
    cancellationReceipt,
  );
  insertCancellationEvent.run(
    "2026-08-01T00:05:00.000Z",
    cancellationReceipt,
  );
  applyMigration("0017_onchain_cancellation_receipt_guard.sql");
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_receipt_guards WHERE negotiation_id = 'OE-P-HISTORY'",
      )
      .get().count,
    2,
  );
  assert.throws(
    () =>
      insertCancellationEvent.run(
        "2026-08-01T00:06:00.000Z",
        cancellationReceipt,
      ),
    /unique/i,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE negotiation_id = 'OE-P-HISTORY'",
      )
      .get().count,
    4,
  );

  const insertNegotiation = database.prepare(
    `INSERT INTO agreement_negotiations
     (id, created_at, updated_at, status, revision, terms_json,
      landlord_email, tenant_email, landlord_token_hash, tenant_token_hash)
     VALUES (?, ?, ?, 'ready', 1, '{}', ?, ?, ?, ?)`,
  );
  for (const suffix of ["TWO", "THREE"]) {
    insertNegotiation.run(
      `OE-P-HISTORY-${suffix}`,
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      `landlord-${suffix.toLowerCase()}@example.test`,
      `tenant-${suffix.toLowerCase()}@example.test`,
      `landlord-hash-${suffix.toLowerCase()}`,
      `tenant-hash-${suffix.toLowerCase()}`,
    );
  }
  const finalizationReceipt = JSON.stringify({
    agreementId: "42",
    transactionHash: `0x${"c".repeat(64)}`,
  });
  const insertFinalizationEvent = database.prepare(
    `INSERT INTO negotiation_events
     (negotiation_id, created_at, actor_role, action, summary, revision,
      metadata_json)
     VALUES (?, ?, 'landlord', 'posted_onchain', 'Historical finalization.',
             1, ?)`,
  );
  insertFinalizationEvent.run(
    "OE-P-HISTORY",
    "2026-08-01T00:07:00.000Z",
    finalizationReceipt,
  );
  insertFinalizationEvent.run(
    "OE-P-HISTORY-TWO",
    "2026-08-01T00:08:00.000Z",
    finalizationReceipt,
  );
  applyMigration("0018_finalization_receipt_assignment_guard.sql");
  assert.equal(
    database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM negotiation_receipt_guards
         WHERE action = 'posted_onchain'
           AND transaction_hash = ?`,
      )
      .get(`0x${"c".repeat(64)}`).count,
    2,
  );
  assert.throws(
    () =>
      insertFinalizationEvent.run(
        "OE-P-HISTORY-THREE",
        "2026-08-01T00:09:00.000Z",
        finalizationReceipt,
      ),
    /finalization receipt already assigned/i,
  );
});

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new Statement(this.database, this.sql, values);
  }

  run() {
    return this.database.prepare(this.sql).run(...this.values);
  }

  first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }
}

class TestD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new Statement(this.database, sql);
  }

  async batch(statements) {
    return statements.map((statement) => statement.run());
  }
}

class CountingTestD1 extends TestD1 {
  constructor() {
    super();
    this.batchCalls = 0;
    this.maximumBatchSize = 0;
  }

  async batch(statements) {
    this.batchCalls += 1;
    this.maximumBatchSize = Math.max(this.maximumBatchSize, statements.length);
    return super.batch(statements);
  }

  resetBatchMetrics() {
    this.batchCalls = 0;
    this.maximumBatchSize = 0;
  }
}

function failEvidenceMetadataBatch(db) {
  let batchCalls = 0;
  return {
    prepare(sql) {
      return db.prepare(sql);
    },
    async batch(statements) {
      batchCalls += 1;
      if (batchCalls === 2) {
        throw new Error("simulated evidence metadata outage");
      }
      return db.batch(statements);
    },
  };
}

class TestR2 {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    this.objects.set(key, {
      bytes: new Uint8Array(value),
      contentType: options.httpMetadata?.contentType || "application/octet-stream",
    });
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: object.bytes,
      async arrayBuffer() {
        return object.bytes.buffer.slice(
          object.bytes.byteOffset,
          object.bytes.byteOffset + object.bytes.byteLength,
        );
      },
      writeHttpMetadata(headers) {
        headers.set("content-type", object.contentType);
      },
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

const legacyCaliforniaTerms = {
  jurisdiction: "us-ca",
  policyVersion: "ca-civ-1950.5-2026.1",
  propertyAddress: "123 Main Street, Los Angeles, CA 90001",
  tokenChoice: "plain",
  deposit: "1200",
  operationsReserve: "5",
  monthlyRent: "1200",
  smallLandlordException: false,
  tenantIsServiceMember: false,
  electronicDeliveryConsent: true,
  claimWindowStart: "2027-07-01T12:00",
  claimDays: "21",
  responseDays: "7",
  arbiterDays: "7",
};

const terms = {
  ...legacyCaliforniaTerms,
  jurisdiction: "testnet-generic",
  policyVersion: "generic-test-v1",
  claimDays: "30",
};

const genericTerms = {
  ...terms,
  claimDays: "45",
  responseDays: "10",
  arbiterDays: "14",
};

test("deposit asset catalog keeps safe defaults and jurisdiction gates", () => {
  assert.deepEqual(
    DEPOSIT_ASSETS.map((asset) => asset.id),
    ["usdc", "aave-usdc", "frnt", "usdy"],
  );
  assert.equal(DEPOSIT_ASSETS[0].enabled, true);
  assert.equal(DEPOSIT_ASSETS[0].yieldType, "none");
  assert.equal(DEPOSIT_ASSETS[1].implementationStatus, "simulated");
  assert.equal(depositAssetAvailability("usdy", { countryCode: "US" }).available, false);
  assert.equal(depositAssetAvailability("usdy", { countryCode: "CA" }).available, false);
  assert.equal(depositAssetAvailability("frnt", { countryCode: "US" }).available, false);

  const selected = {
    ...terms,
    tokenChoice: "yield",
    depositAssetId: "aave-usdc",
    depositAssetSnapshot: createDepositAssetSnapshot("aave-usdc"),
    yieldConsent: true,
  };
  assert.equal(validateDepositAssetTerms(selected), true);
  assert.equal(
    validateDepositAssetTerms({
      ...selected,
      depositAssetSnapshot: {
        ...selected.depositAssetSnapshot,
        settlementAsset: "aUSDC",
      },
    }),
    false,
  );
});

const unsignedNewYorkAddressResolution = {
  provider: "photon-openstreetmap",
  providerFeatureId: "W:987",
  label: "11 Broadway, New York, NY 10004",
  countryCode: "US",
  stateCode: "NY",
  city: "New York",
  county: "New York County",
  postalCode: "10004",
  latitude: 40.7047,
  longitude: -74.0137,
};
const newYorkAddressResolution = {
  ...unsignedNewYorkAddressResolution,
  attestation: await createAddressAttestation(
    unsignedNewYorkAddressResolution,
    TEST_ADDRESS_ATTESTATION_SECRET,
  ),
};
const newYorkProfile = US_JURISDICTION_PROFILES.find(
  (profile) => profile.postalCode === "NY",
);
const newYorkComplianceFacts = {
  housingProgram: "housing-choice-voucher",
  propertyType: "standard-residential",
  tenancyType: "fixed-term",
  unitCount: 12,
  ownerOccupied: false,
  furnished: false,
  assistanceAnimalAccommodation: false,
  scraQualifiedTermination: false,
};
const newYorkResearchTerms = {
  ...terms,
  jurisdiction: "us-ny",
  policyVersion: newYorkProfile.version,
  propertyAddress: newYorkAddressResolution.label,
  addressResolution: newYorkAddressResolution,
  complianceFacts: newYorkComplianceFacts,
  complianceSnapshot: buildComplianceSnapshot(
    newYorkProfile,
    newYorkAddressResolution,
    { facts: newYorkComplianceFacts },
  ),
  claimDays: "14",
};

test("the implemented registry covers every state and the District of Columbia", () => {
  assert.equal(US_JURISDICTION_PROFILES.length, 51);
  assert.equal(new Set(US_JURISDICTION_PROFILES.map((profile) => profile.code)).size, 51);
  assert.ok(US_JURISDICTION_PROFILES.every((profile) => profile.deadlines.length >= 1));
  assert.ok(US_JURISDICTION_PROFILES.every((profile) => profile.requirements.length >= 6));
  assert.ok(
    US_JURISDICTION_PROFILES.every(
      (profile) => profile.researchStatus === "implemented-research",
    ),
  );
  assert.ok(
    US_JURISDICTION_PROFILES.every(
      (profile) =>
        profile.statuteUrl.startsWith("https://") &&
        profile.statuteCitation.length >= 8 &&
        profile.version.endsWith("rules-2026-07-26.v4"),
    ),
  );
  assert.ok(US_JURISDICTION_PROFILES.every((profile) => profile.legalReviewRequired));
  for (const profile of US_JURISDICTION_PROFILES) {
    const snapshot = buildComplianceSnapshot(profile, {
      provider: "photon-openstreetmap",
      providerFeatureId: `R:${profile.postalCode}:snapshot-schema`,
      label: `1 Main Street, Test City, ${profile.postalCode} 00000`,
      countryCode: "US",
      stateCode: profile.postalCode,
      city: "Test City",
      county: "Test County",
      postalCode: "00000",
      latitude: 38,
      longitude: -97,
    });
    assert.equal(
      isVersionedComplianceSnapshot(snapshot),
      true,
      `Invalid generated snapshot for ${profile.code}.`,
    );
  }
  const recognizedConditionFacts = new Set([
    ...STATIC_COMPLIANCE_FACT_KEYS,
    ...Object.keys(DYNAMIC_COMPLIANCE_FACTS),
  ]);
  assert.ok(
    US_JURISDICTION_PROFILES.every((profile) =>
      profile.deadlines.every(
        (deadlineRule) =>
          !deadlineRule.condition ||
          recognizedConditionFacts.has(deadlineRule.condition.fact),
      ),
    ),
  );
  assert.ok(
    US_JURISDICTION_PROFILES.every(
      (profile) => profile.depositCap.summary === profile.depositCapSummary,
    ),
  );
  assert.equal(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "CO")
      .depositCap.months,
    2,
  );
  assert.equal(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "MN")
      .depositCap.kind,
    "manual",
  );
  assert.equal(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "SD")
      .defaultClaimDays,
    "21",
  );
  assert.equal(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "VT")
      .deadlines.find((deadlineRule) => deadlineRule.id === "seasonal-return").days,
    60,
  );
  assert.equal(newYorkResearchTerms.complianceSnapshot.schema, "openescrow.us-compliance-profile.v4");
  assert.ok(
    US_JURISDICTION_PROFILES.every(
      (profile) =>
        profile.claimPolicy.schema === "openescrow.claim-policy.v1" &&
        profile.claimPolicy.commonAttestations.length >= 3 &&
        profile.claimPolicy.stateInstructions.length >= 1,
    ),
  );
  assert.ok(
    US_JURISDICTION_PROFILES.find(
      (profile) => profile.postalCode === "CA",
    ).claimPolicy.stateAttestations.some(
      (attestation) => attestation.id === "ca-pre-repair-photos",
    ),
  );
  assert.ok(
    newYorkResearchTerms.complianceSnapshot.overlays.some(
      (overlay) =>
        overlay.id === "federal-hcv-security-deposit" &&
        overlay.applicability === "applies",
    ),
  );
  assert.equal(
    newYorkResearchTerms.complianceSnapshot.overlays.some(
      (overlay) => overlay.id === "federal-scra-lease-termination",
    ),
    false,
  );
  const illinoisProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "IL",
  );
  const chicagoSnapshot = buildComplianceSnapshot(
    illinoisProfile,
    {
      ...newYorkAddressResolution,
      providerFeatureId: "R:chicago",
      label: "121 North LaSalle Street, Chicago, IL 60602",
      stateCode: "IL",
      city: "Chicago",
      county: "Cook County",
      postalCode: "60602",
      latitude: 41.8838,
      longitude: -87.6317,
    },
    {
      facts: {
        ...newYorkComplianceFacts,
        housingProgram: "conventional",
      },
    },
  );
  assert.equal(chicagoSnapshot.localCoverage, "reviewed-overlay-applied");
  assert.ok(
    chicagoSnapshot.overlays.some(
      (overlay) => overlay.id === "local-il-chicago-rlto",
    ),
  );
});

test("the compliance source registry maps every versioned profile and overlay source", () => {
  assert.equal(Object.isFrozen(COMPLIANCE_SOURCE_REGISTRY), true);
  assert.ok(
    COMPLIANCE_SOURCE_REGISTRY.every(
      (sourceItem) =>
        Object.isFrozen(sourceItem) &&
        sourceItem.citation.trim().length > 0,
    ),
  );
  assert.equal(
    new Set(COMPLIANCE_SOURCE_REGISTRY.map((sourceItem) => sourceItem.key)).size,
    COMPLIANCE_SOURCE_REGISTRY.length,
  );
  assert.ok(
    COMPLIANCE_SOURCE_REGISTRY.every((sourceItem) =>
      sourceItem.url.startsWith("https://"),
    ),
  );
  for (const profile of US_JURISDICTION_PROFILES) {
    const sourceItem = COMPLIANCE_SOURCE_REGISTRY.find(
      (candidate) =>
        candidate.key === `state:${profile.postalCode.toLowerCase()}`,
    );
    assert.ok(sourceItem, `Missing source registry entry for ${profile.code}.`);
    assert.equal(sourceItem.jurisdiction, profile.code);
    assert.equal(sourceItem.version, profile.version);
    assert.equal(sourceItem.url, profile.statuteUrl);
  }
  for (const overlay of [
    ...FEDERAL_COMPLIANCE_OVERLAYS,
    ...LOCAL_COMPLIANCE_OVERLAYS,
  ]) {
    overlay.sources.forEach((source, index) => {
      const sourceItem = COMPLIANCE_SOURCE_REGISTRY.find(
        (candidate) =>
          candidate.key === `overlay:${overlay.id}:${index + 1}`,
      );
      assert.ok(sourceItem, `Missing source registry entry for ${overlay.id}.`);
      assert.equal(sourceItem.jurisdiction, overlay.id);
      assert.equal(sourceItem.version, overlay.version);
      assert.equal(sourceItem.url, source.url);
    });
  }
  const reviewedReplacements = [
    {
      key: "overlay:federal-fha-assistance-animal:1",
      version: "fha-assistance-animal-2026-08-08.v2",
      url: "https://www.hud.gov/sites/documents/huddojstatement.pdf",
    },
    {
      key: "overlay:federal-scra-lease-termination:1",
      version: "scra-50-usc-3955-2026-08-08.v2",
      url: "https://www.govinfo.gov/link/uscode/50/3955?link-type=html&year=mostrecent",
    },
    {
      key: "overlay:federal-usda-rural:1",
      version: "7-cfr-3560.204-2026-08-08.v2",
      url: "https://www.govinfo.gov/link/cfr/7/3560?link-type=pdf&year=mostrecent",
    },
    {
      key: "overlay:local-il-chicago-rlto:1",
      version: "chicago-rlto-5-12-080-2026-08-08.v2",
      url: "https://www.chicago.gov/city/en/depts/doh/provdrs/landlords/svcs/residential-landlord-and-tenant-ordinance.html",
    },
  ];
  for (const replacement of reviewedReplacements) {
    const sourceItem = COMPLIANCE_SOURCE_REGISTRY.find(
      (candidate) => candidate.key === replacement.key,
    );
    assert.ok(sourceItem, `Missing reviewed source ${replacement.key}.`);
    assert.equal(sourceItem.version, replacement.version);
    assert.equal(sourceItem.url, replacement.url);
  }
});

test("the compliance evaluator schedules all statewide profiles deterministically", () => {
  for (const profile of US_JURISDICTION_PROFILES) {
    const evaluated = evaluateCompliance(profile, {
      address: {
        provider: "photon-openstreetmap",
        providerFeatureId: `R:${profile.postalCode}`,
        label: `1 Main Street, Test City, ${profile.postalCode} 00000`,
        countryCode: "US",
        stateCode: profile.postalCode,
        city: "Test City",
        county: "Test County",
        postalCode: "00000",
        latitude: 38,
        longitude: -97,
      },
      facts: {
        landlordClaimsDeposit: false,
        qualifyingCondemnation: false,
        qualifyingDisplacement: false,
      },
      events: {
        possessionReturnedAt: "2027-01-02T12:00:00Z",
        tenancyTerminatedAt: "2027-01-02T12:00:00Z",
        statutoryClockStartedAt: "2027-01-02T12:00:00Z",
      },
    });
    assert.equal(evaluated.jurisdiction, profile.code);
    assert.equal(evaluated.profileVersion, profile.version);
    assert.equal(evaluated.address.stateCode, profile.postalCode);
    assert.ok(evaluated.deadlines.length >= 1);
  }
  const maineProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "ME",
  );
  const maineAddress = {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:maine",
    label: "1 Main Street, Portland, ME 04101",
    countryCode: "US",
    stateCode: "ME",
    city: "Portland",
    county: "Cumberland County",
    postalCode: "04101",
    latitude: 43.6591,
    longitude: -70.2568,
  };
  const maineWritten = evaluateCompliance(maineProfile, {
    address: maineAddress,
    facts: { writtenRentalAgreement: true },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    maineWritten.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).status,
    "scheduled",
  );
  assert.equal(
    maineWritten.deadlines.find(
      (deadlineRule) => deadlineRule.id === "at-will-return",
    ).applicability,
    "not-applicable",
  );
  const maineAtWill = evaluateCompliance(maineProfile, {
    address: maineAddress,
    facts: { writtenRentalAgreement: false },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    maineAtWill.deadlines.find(
      (deadlineRule) => deadlineRule.id === "at-will-return",
    ).status,
    "scheduled",
  );
  assert.equal(
    maineAtWill.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).applicability,
    "not-applicable",
  );
  assert.equal(
    calculateDeadline("2027-01-08T12:00:00Z", 1, "business"),
    "2027-01-11T12:00:00.000Z",
  );
  assert.equal(
    calculateDeadline(
      "2027-01-08T12:00:00Z",
      1,
      "business",
      ["2027-01-11"],
    ),
    "2027-01-12T12:00:00.000Z",
  );
  const arizonaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "AZ",
  );
  const arizonaAddress = {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:arizona",
    label: "1 Main Street, Phoenix, AZ 85001",
    countryCode: "US",
    stateCode: "AZ",
    city: "Phoenix",
    county: "Maricopa County",
    postalCode: "85001",
    latitude: 33.4484,
    longitude: -112.074,
  };
  const arizona = evaluateCompliance(arizonaProfile, {
    address: arizonaAddress,
    events: { statutoryClockStartedAt: "2027-01-08T12:00:00Z" },
    holidayDates: ["2027-01-11"],
  });
  assert.equal(arizona.deadlines[0].dayType, "business");
  assert.equal(arizona.deadlines[0].dueAt, "2027-01-29T12:00:00.000Z");
  const profileAddress = (postalCode) => ({
    provider: "photon-openstreetmap",
    providerFeatureId: `R:${postalCode}:combined`,
    label: `1 Main Street, Test City, ${postalCode} 00000`,
    countryCode: "US",
    stateCode: postalCode,
    city: "Test City",
    county: "Test County",
    postalCode: "00000",
    latitude: 38,
    longitude: -97,
  });
  const connecticut = evaluateCompliance(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "CT"),
    {
      address: profileAddress("CT"),
      events: {
        tenancyTerminatedAt: "2027-01-01T12:00:00Z",
        forwardingAddressReceivedAt: "2027-01-10T12:00:00Z",
      },
    },
  );
  assert.equal(
    connecticut.combinedDeadlines[0].dueAt,
    "2027-01-25T12:00:00.000Z",
  );
  const westVirginia = evaluateCompliance(
    US_JURISDICTION_PROFILES.find((profile) => profile.postalCode === "WV"),
    {
      address: profileAddress("WV"),
      events: {
        tenancyTerminatedAt: "2027-01-01T12:00:00Z",
        replacementTenantPossessionAt: "2027-01-10T12:00:00Z",
      },
    },
  );
  assert.equal(
    westVirginia.combinedDeadlines[0].dueAt,
    "2027-02-24T12:00:00.000Z",
  );

  const maineSnapshot = buildComplianceSnapshot(
    maineProfile,
    maineAddress,
    {
      facts: {
        ...newYorkComplianceFacts,
        writtenRentalAgreement: true,
      },
    },
  );
  const snapshotEvaluation = evaluateComplianceSnapshot(maineSnapshot, {
    facts: {
      monthlyRent: "1600",
      deposit: "1600",
      writtenRentalAgreement: true,
    },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  const { claimPolicy: _claimPolicy, ...legacySnapshotFields } =
    maineSnapshot;
  const legacySnapshotEvaluation = evaluateComplianceSnapshot(
    {
      ...legacySnapshotFields,
      schema: "openescrow.us-compliance-profile.v3",
    },
    {
      facts: { writtenRentalAgreement: true },
      events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
    },
  );
  const changedCurrentProfile = {
    ...maineProfile,
    deadlines: maineProfile.deadlines.map((deadlineRule) =>
      deadlineRule.id === "written-lease-return"
        ? { ...deadlineRule, days: 90 }
        : deadlineRule,
    ),
  };
  const changedCurrentEvaluation = evaluateCompliance(changedCurrentProfile, {
    address: maineAddress,
    facts: { writtenRentalAgreement: true },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    snapshotEvaluation.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).dueAt,
    "2027-02-01T12:00:00.000Z",
  );
  assert.equal(
    legacySnapshotEvaluation.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).dueAt,
    "2027-02-01T12:00:00.000Z",
  );
  assert.equal(
    changedCurrentEvaluation.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).dueAt,
    "2027-04-02T12:00:00.000Z",
  );
});

test("versioned compliance snapshots detach conditional rules from the live registry", () => {
  const mutableProfile = structuredClone(
    US_JURISDICTION_PROFILES.find(
      (profile) => profile.postalCode === "ME",
    ),
  );
  const mutableAddress = {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:maine:immutable",
    label: "1 Main Street, Portland, ME 04101",
    countryCode: "US",
    stateCode: "ME",
    city: "Portland",
    county: "Cumberland County",
    postalCode: "04101",
    latitude: 43.6591,
    longitude: -70.2568,
  };
  const snapshot = buildComplianceSnapshot(mutableProfile, mutableAddress, {
    facts: { writtenRentalAgreement: "unknown" },
  });
  const originalSnapshot = JSON.stringify(snapshot);

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.deadlines));
  assert.ok(Object.isFrozen(snapshot.deadlines[0].condition));
  assert.ok(Object.isFrozen(snapshot.claimPolicy.commonAttestations[0]));
  assert.ok(Object.isFrozen(snapshot.overlays[0].sources[0]));
  assert.notEqual(snapshot.deadlines, mutableProfile.deadlines);
  assert.notEqual(snapshot.requirements, mutableProfile.requirements);

  mutableProfile.deadlines.find(
    (deadlineRule) => deadlineRule.id === "written-lease-return",
  ).days = 90;
  mutableProfile.requirements[0] = "A later registry requirement.";
  mutableProfile.claimPolicy.commonAttestations[0].label =
    "A later registry attestation.";
  mutableAddress.city = "A later address edit";

  assert.equal(JSON.stringify(snapshot), originalSnapshot);
  assert.throws(() => {
    snapshot.deadlines[0].condition.equals = true;
  }, TypeError);

  const unresolved = evaluateComplianceSnapshot(snapshot, {
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    unresolved.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).status,
    "needs-fact",
  );

  const atWill = evaluateComplianceSnapshot(snapshot, {
    facts: { writtenRentalAgreement: false },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    atWill.deadlines.find(
      (deadlineRule) => deadlineRule.id === "at-will-return",
    ).dueAt,
    "2027-01-23T12:00:00.000Z",
  );
  assert.equal(
    atWill.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).status,
    "not-applicable",
  );

  const written = evaluateComplianceSnapshot(snapshot, {
    facts: { writtenRentalAgreement: true },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.equal(
    written.deadlines.find(
      (deadlineRule) => deadlineRule.id === "written-lease-return",
    ).dueAt,
    "2027-02-01T12:00:00.000Z",
  );
});

test("versioned compliance snapshots reject malformed stored shapes and detach evaluations", () => {
  const maineProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "ME",
  );
  const snapshot = buildComplianceSnapshot(maineProfile, {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:maine:stored-shape",
    label: "1 Main Street, Portland, ME 04101",
    countryCode: "US",
    stateCode: "ME",
    city: "Portland",
    county: "Cumberland County",
    postalCode: "04101",
    latitude: 43.6591,
    longitude: -70.2568,
  });
  assert.equal(isVersionedComplianceSnapshot(snapshot), true);

  const legacySnapshot = structuredClone(snapshot);
  delete legacySnapshot.claimPolicy;
  legacySnapshot.schema = "openescrow.us-compliance-profile.v3";
  assert.equal(isVersionedComplianceSnapshot(legacySnapshot), true);

  const malformedSnapshots = [
    ["requirements are not a list", (candidate) => { candidate.requirements = "not-a-list"; }],
    ["exceptions are not a list", (candidate) => { candidate.exceptions = null; }],
    ["locality keys are not a list", (candidate) => { candidate.localityKeys = {}; }],
    ["missing facts are not a list", (candidate) => { candidate.missingFacts = "unknown"; }],
    ["unresolved overlays are not a list", (candidate) => { candidate.unresolvedOverlays = {}; }],
    ["an overlay is null", (candidate) => { candidate.overlays = [null]; }],
    ["overlay requirements are not a list", (candidate) => { candidate.overlays[0].requirements = "not-a-list"; }],
    ["overlay sources are not a list", (candidate) => { candidate.overlays[0].sources = {}; }],
    ["overlay deadlines are not a list", (candidate) => { candidate.overlays[0].deadlines = "not-a-list"; }],
    ["claim attestations are not a list", (candidate) => { candidate.claimPolicy.commonAttestations = {}; }],
    ["a recorded source is not HTTPS", (candidate) => { candidate.source.url = "http://example.test/rule"; }],
    ["recorded facts contain a nested value", (candidate) => { candidate.facts.ownerOccupied = { forged: true }; }],
    ["the address conflicts with the jurisdiction", (candidate) => { candidate.jurisdiction = "us-nv"; }],
    ["the address provider is missing", (candidate) => { delete candidate.address.provider; }],
    ["the address provider is spoofed", (candidate) => { candidate.address.provider = "manual-entry"; }],
    ["the address state is not canonical", (candidate) => { candidate.address.stateCode = "me"; }],
    ["the address locality is not canonical", (candidate) => { candidate.address.city = " Portland "; }],
    ["local coverage is unknown", (candidate) => { candidate.localCoverage = "assumed-covered"; }],
    ["the deposit cap is malformed", (candidate) => { candidate.depositCap.months = -1; }],
  ];
  for (const [label, mutate] of malformedSnapshots) {
    const candidate = structuredClone(snapshot);
    mutate(candidate);
    assert.equal(
      isVersionedComplianceSnapshot(candidate),
      false,
      label,
    );
    assert.equal(evaluateComplianceSnapshot(candidate), null, label);
  }

  const parsedSnapshot = structuredClone(snapshot);
  const evaluation = evaluateComplianceSnapshot(parsedSnapshot, {
    facts: { writtenRentalAgreement: true },
    events: { possessionReturnedAt: "2027-01-02T12:00:00Z" },
  });
  assert.ok(evaluation);
  assert.ok(Object.isFrozen(evaluation));
  assert.ok(Object.isFrozen(evaluation.deadlines[0].condition));
  assert.ok(Object.isFrozen(evaluation.overlays[0].sources[0]));
  assert.notEqual(evaluation.deadlines[0].condition, parsedSnapshot.deadlines[0].condition);
  assert.notEqual(evaluation.overlays[0].sources, parsedSnapshot.overlays[0].sources);
  const evaluatedCitation = evaluation.overlays[0].sources[0].citation;
  parsedSnapshot.overlays[0].sources[0].citation = "A later parsed-record mutation";
  assert.equal(evaluation.overlays[0].sources[0].citation, evaluatedCitation);
  assert.throws(() => {
    evaluation.overlays[0].sources[0].citation = "A consumer mutation";
  }, TypeError);
});

test("versioned business-day deadlines fail closed on unsupported rule metadata", () => {
  const arizonaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "AZ",
  );
  const snapshot = buildComplianceSnapshot(arizonaProfile, {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:arizona:snapshot",
    label: "1 Main Street, Phoenix, AZ 85001",
    countryCode: "US",
    stateCode: "AZ",
    city: "Phoenix",
    county: "Maricopa County",
    postalCode: "85001",
    latitude: 33.4484,
    longitude: -112.074,
  });
  const evaluated = evaluateComplianceSnapshot(snapshot, {
    events: { statutoryClockStartedAt: "2027-01-08T12:00:00Z" },
    holidayDates: ["2027-01-11"],
  });
  assert.equal(evaluated.deadlines[0].dayType, "business");
  assert.equal(evaluated.deadlines[0].dueAt, "2027-01-29T12:00:00.000Z");

  const corruptedSnapshot = structuredClone(snapshot);
  corruptedSnapshot.deadlines[0].dayType = "unsupported-day-type";
  const rejectedRule = evaluateComplianceSnapshot(corruptedSnapshot, {
    events: { statutoryClockStartedAt: "2027-01-08T12:00:00Z" },
  });
  assert.equal(rejectedRule.deadlines[0].status, "invalid-rule");
  assert.equal(rejectedRule.deadlines[0].dueAt, null);
  assert.equal(
    calculateDeadline(
      "2027-01-08T12:00:00Z",
      14,
      "unsupported-day-type",
    ),
    null,
  );

  const invalidBeforeEvent = structuredClone(snapshot);
  invalidBeforeEvent.deadlines[0].dayType = "unsupported-day-type";
  const rejectedBeforeEvent = evaluateComplianceSnapshot(invalidBeforeEvent);
  assert.equal(rejectedBeforeEvent.deadlines[0].status, "invalid-rule");
  assert.equal(rejectedBeforeEvent.deadlines[0].dueAt, null);

  const invalidCondition = structuredClone(snapshot);
  invalidCondition.deadlines[0].condition = {
    fact: "landlordClaimsDeposit",
  };
  const rejectedCondition = evaluateComplianceSnapshot(invalidCondition, {
    facts: { landlordClaimsDeposit: true },
  });
  assert.equal(rejectedCondition.deadlines[0].status, "invalid-rule");
  assert.equal(rejectedCondition.deadlines[0].dueAt, null);

  const invalidComparison = structuredClone(snapshot);
  invalidComparison.deadlines[0].comparison = "soonest";
  const rejectedComparison = evaluateComplianceSnapshot(invalidComparison);
  assert.equal(rejectedComparison.deadlines[0].status, "invalid-rule");
  assert.equal(rejectedComparison.deadlines[0].dueAt, null);

  const mismatchedJurisdiction = structuredClone(snapshot);
  mismatchedJurisdiction.jurisdiction = "us-nv";
  assert.equal(
    evaluateComplianceSnapshot(mismatchedJurisdiction, {
      events: { statutoryClockStartedAt: "2027-01-08T12:00:00Z" },
    }),
    null,
  );

  const connecticutProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "CT",
  );
  const connecticutSnapshot = buildComplianceSnapshot(connecticutProfile, {
    ...snapshot.address,
    providerFeatureId: "R:connecticut:invalid-comparison",
    label: "1 Main Street, Hartford, CT 06103",
    stateCode: "CT",
    city: "Hartford",
    county: "Hartford County",
    postalCode: "06103",
    latitude: 41.7658,
    longitude: -72.6734,
  });
  const invalidCombined = structuredClone(connecticutSnapshot);
  invalidCombined.deadlines[0].dayType = "unsupported-day-type";
  const rejectedCombined = evaluateComplianceSnapshot(invalidCombined, {
    events: {
      tenancyTerminatedAt: "2027-01-01T12:00:00Z",
      forwardingAddressReceivedAt: "2027-01-10T12:00:00Z",
    },
  });
  assert.equal(rejectedCombined.deadlines[0].status, "invalid-rule");
  assert.equal(rejectedCombined.combinedDeadlines[0].status, "invalid-rule");
  assert.equal(rejectedCombined.combinedDeadlines[0].dueAt, null);
});

test("deadline dates reject impossible, timezone-ambiguous, and malformed holiday input", () => {
  assert.equal(normalizeComplianceEventInstant("2027-01-01T12:00:00"), null);
  assert.equal(normalizeComplianceEventInstant("2027-01-01"), null);
  assert.equal(
    normalizeComplianceEventInstant("2027-01-01T12:00:00-08:00"),
    "2027-01-01T20:00:00.000Z",
  );
  assert.equal(calculateDeadline("2027-02-29", 1), null);
  assert.equal(calculateDeadline("2027-13-01", 1), null);
  assert.equal(calculateDeadline("2027-01-01T24:00:00Z", 1), null);
  assert.equal(calculateDeadline("2027-01-01T12:00:00", 1), null);
  assert.equal(calculateDeadline("2027-01-01T12:00", 1), null);
  assert.equal(
    calculateDeadline("2028-02-29", 1),
    "2028-03-01T00:00:00.000Z",
  );
  assert.equal(
    calculateDeadline("2027-01-01T12:00:00-08:00", 1),
    "2027-01-02T20:00:00.000Z",
  );
  assert.equal(
    calculateDeadline("2027-01-08T12:00:00Z", 1, "business", [
      "2027-02-29",
    ]),
    null,
  );
  assert.equal(
    calculateDeadline("2027-01-08T12:00:00Z", 1, "business", [
      "2027-01-11T00:00:00Z",
    ]),
    null,
  );
  assert.equal(
    calculateDeadline("2027-01-08T12:00:00Z", 1, "calendar", [
      "not-used-by-calendar-rules",
    ]),
    "2027-01-09T12:00:00.000Z",
  );

  const arizonaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "AZ",
  );
  const snapshot = buildComplianceSnapshot(arizonaProfile, {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:arizona:strict-deadline-input",
    label: "1 Main Street, Phoenix, AZ 85001",
    countryCode: "US",
    stateCode: "AZ",
    city: "Phoenix",
    county: "Maricopa County",
    postalCode: "85001",
    latitude: 33.4484,
    longitude: -112.074,
  });

  for (const invalidEvent of [
    "2027-02-29",
    "2027-01-01T12:00:00",
    "2027-01-01T24:00:00Z",
  ]) {
    const evaluated = evaluateComplianceSnapshot(snapshot, {
      events: { statutoryClockStartedAt: invalidEvent },
    });
    assert.equal(evaluated.deadlines[0].status, "invalid-event");
    assert.equal(evaluated.deadlines[0].dueAt, null);
  }

  const invalidHolidayCalendar = evaluateComplianceSnapshot(snapshot, {
    events: { statutoryClockStartedAt: "2027-01-08T12:00:00Z" },
    holidayDates: ["2027-02-29"],
  });
  assert.equal(
    invalidHolidayCalendar.deadlines[0].status,
    "invalid-holiday-calendar",
  );
  assert.equal(invalidHolidayCalendar.deadlines[0].dueAt, null);

  const inheritedEvents = Object.create({
    statutoryClockStartedAt: "2027-01-08T12:00:00Z",
  });
  const inheritedEventEvaluation = evaluateComplianceSnapshot(snapshot, {
    events: inheritedEvents,
  });
  assert.equal(
    inheritedEventEvaluation.deadlines[0].status,
    "waiting-for-event",
  );
  assert.equal(inheritedEventEvaluation.deadlines[0].dueAt, null);
});

test("Florida conditional deadline stages remain fact-gated and event-gated", () => {
  const floridaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "FL",
  );
  const floridaAddress = {
    provider: "photon-openstreetmap",
    providerFeatureId: "R:florida:conditional-deadlines",
    label: "1 Ocean Drive, Miami Beach, FL 33139",
    countryCode: "US",
    stateCode: "FL",
    city: "Miami Beach",
    county: "Miami-Dade County",
    postalCode: "33139",
    latitude: 25.7907,
    longitude: -80.13,
  };
  const snapshot = buildComplianceSnapshot(
    floridaProfile,
    floridaAddress,
    {
      facts: {
        ...newYorkComplianceFacts,
        housingProgram: "conventional",
      },
    },
  );
  assert.ok(snapshot.missingFacts.includes("landlordClaimsDeposit"));

  const unresolved = evaluateComplianceSnapshot(snapshot, {
    events: { tenancyTerminatedAt: "2027-01-01T12:00:00Z" },
  });
  assert.ok(
    unresolved.deadlines.every(
      (deadlineRule) => deadlineRule.status === "needs-fact",
    ),
  );

  const noClaim = evaluateComplianceSnapshot(snapshot, {
    facts: { landlordClaimsDeposit: false },
    events: { tenancyTerminatedAt: "2027-01-01T12:00:00Z" },
  });
  assert.equal(
    noClaim.deadlines.find(
      (deadlineRule) => deadlineRule.id === "no-claim-return",
    ).dueAt,
    "2027-01-16T12:00:00.000Z",
  );
  assert.ok(
    noClaim.deadlines
      .filter((deadlineRule) => deadlineRule.id !== "no-claim-return")
      .every(
        (deadlineRule) =>
          deadlineRule.applicability === "not-applicable" &&
          deadlineRule.dueAt === null,
      ),
  );

  const claimStarted = evaluateComplianceSnapshot(snapshot, {
    facts: { landlordClaimsDeposit: true },
    events: { tenancyTerminatedAt: "2027-01-01T12:00:00Z" },
  });
  assert.equal(
    claimStarted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "claim-notice",
    ).dueAt,
    "2027-01-31T12:00:00.000Z",
  );
  assert.equal(
    claimStarted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "tenant-objection",
    ).status,
    "waiting-for-event",
  );
  assert.equal(
    claimStarted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "claim-balance",
    ).status,
    "waiting-for-event",
  );
  assert.equal(
    claimStarted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "no-claim-return",
    ).applicability,
    "not-applicable",
  );

  const claimCompleted = evaluateComplianceSnapshot(snapshot, {
    facts: { landlordClaimsDeposit: true },
    events: {
      tenancyTerminatedAt: "2027-01-01T12:00:00Z",
      claimNoticeReceivedAt: "2027-02-01T12:00:00Z",
      deductionNoticeSentAt: "2027-02-01T12:00:00Z",
    },
  });
  assert.equal(
    claimCompleted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "tenant-objection",
    ).dueAt,
    "2027-02-16T12:00:00.000Z",
  );
  assert.equal(
    claimCompleted.deadlines.find(
      (deadlineRule) => deadlineRule.id === "claim-balance",
    ).dueAt,
    "2027-03-03T12:00:00.000Z",
  );
});

test("address resolution rejects incomplete or non-US geocoder records", () => {
  assert.equal(normalizeAddressResolution({ stateCode: "CA" }), null);
  assert.equal(
    normalizeAddressResolution({
      providerFeatureId: "W:1",
      label: "1 Main Street, Toronto",
      countryCode: "CA",
      stateCode: "ON",
      latitude: 43.6,
      longitude: -79.3,
    }),
    null,
  );
  assert.equal(
    evaluateCompliance(newYorkProfile, {
      address: { ...newYorkAddressResolution, stateCode: "NJ" },
    }),
    null,
  );
});

function request(path, method = "GET", body) {
  const url = new URL(path, "https://openescrow.example");
  const headers = method === "GET" ? {} : { "content-type": "application/json" };
  if (
    method === "GET" &&
    /^\/api\/negotiations\/[a-zA-Z0-9-]+(?:\/(?:report|snapshot))?$/.test(
      url.pathname,
    ) &&
    url.searchParams.has("token")
  ) {
    // Older test fixtures expressed private reads as URLs. Exercise the current
    // header-only boundary without retaining bearer secrets in request targets.
    headers.authorization = `Bearer ${url.searchParams.get("token")}`;
    url.searchParams.delete("token");
  }
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function evidenceDownloadRequest(path, token, headers) {
  const form = new FormData();
  form.set("token", token);
  return new Request(`https://openescrow.example${path}`, {
    method: "POST",
    headers,
    body: form,
  });
}

test("API abuse controls bound request bodies and persist hashed edge rate limits", async () => {
  const db = new TestD1();
  const env = { DB: db, API_RATE_LIMIT_ENABLED: "true" };
  const url = new URL("https://openescrow.example/api/compliance/source-status");
  const clientRequest = (ip = "203.0.113.8", authorization) =>
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip,
        ...(authorization ? { authorization } : {}),
      },
      body: "{}",
    });

  assert.equal(apiRateLimitPolicy(clientRequest(), url), "compliance-refresh");
  const start = Date.parse("2026-08-05T12:00:00.000Z");
  for (let index = 0; index < 6; index += 1) {
    assert.equal(await applyApiAbuseControls(clientRequest(), env, url, start), null);
  }
  const blocked = await applyApiAbuseControls(clientRequest(), env, url, start);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "300");
  assert.equal((await blocked.json()).code, "rate-limited");
  const variedCredentialBlocked = await applyApiAbuseControls(
    clientRequest("203.0.113.8", "Bearer attacker-controlled-variation"),
    env,
    url,
    start,
  );
  assert.equal(variedCredentialBlocked.status, 429);
  assert.equal(
    db.database
      .prepare("SELECT COUNT(*) AS count FROM api_rate_limits WHERE subject_hash = ?")
      .get("203.0.113.8").count,
    0,
  );
  assert.equal(
    await applyApiAbuseControls(clientRequest("203.0.113.9"), env, url, start),
    null,
  );
  assert.equal(
    await applyApiAbuseControls(clientRequest(), env, url, start + 5 * 60_000),
    null,
  );

  const oversized = new Request("https://openescrow.example/api/negotiations", {
    method: "POST",
    headers: { "content-length": String(512 * 1024 + 1) },
  });
  const sizeResponse = await requestBodyLimitResponse(oversized);
  assert.equal(sizeResponse.status, 413);
  assert.equal((await sizeResponse.json()).code, "request-too-large");

  const streamedOversized = new Request("https://openescrow.example/api/negotiations", {
    method: "POST",
    body: new Uint8Array(512 * 1024 + 1),
  });
  const streamedSizeResponse = await requestBodyLimitResponse(streamedOversized);
  assert.equal(streamedSizeResponse.status, 413);
  assert.equal((await streamedSizeResponse.json()).code, "request-too-large");

  const streamedGateResponse = await applyApiAbuseControls(
    new Request("https://openescrow.example/api/negotiations", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.11" },
      body: new Uint8Array(512 * 1024 + 1),
    }),
    env,
    undefined,
    start,
  );
  assert.equal(streamedGateResponse.status, 413);
  assert.equal(
    db.database
      .prepare(
        "SELECT request_count FROM api_rate_limits WHERE bucket = 'negotiation-write'",
      )
      .get().request_count,
    1,
  );

  const failingRateDb = {
    batch(statements) {
      return db.batch(statements);
    },
    prepare(sql) {
      if (sql.includes("INSERT INTO api_rate_limits")) {
        throw new Error("simulated rate-limit storage outage");
      }
      return db.prepare(sql);
    },
  };
  const unavailable = await applyApiAbuseControls(
    clientRequest("203.0.113.10"),
    { DB: failingRateDb, API_RATE_LIMIT_ENABLED: "true" },
    url,
    start,
  );
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "rate-limit-unavailable");
});

test("unexpected API failures return a traceable response without logging credentials", async () => {
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...values) => logged.push(values.join(" "));
  const secret = "never-log-this-bearer-token";
  try {
    const response = await worker.fetch(
      new Request(
        `https://openescrow.example/api/negotiations?token=${secret}`,
        { headers: { authorization: `Bearer ${secret}` } },
      ),
      {
        DB: {
          batch() {
            throw new Error(`database failed with ${secret}`);
          },
          prepare() {
            return {};
          },
        },
      },
    );
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.code, "request-failed");
    assert.equal(payload.error.includes(secret), false);
    assert.equal(response.headers.get("x-openescrow-request-id"), payload.requestId);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].includes(secret), false);
    assert.equal(logged[0].includes("?token="), false);
    assert.equal(JSON.parse(logged[0]).path, "/api/negotiations");
  } finally {
    console.error = originalConsoleError;
  }
});

test("malformed multipart evidence uploads fail safely", async () => {
  const response = await worker.fetch(
    new Request("https://openescrow.example/api/evidence", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      body: "not-a-valid-multipart-body",
    }),
    { DB: new TestD1(), EVIDENCE: new TestR2() },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Choose a valid supporting file upload.",
  });
});

function negotiationReadRequest(path, token, headers = {}) {
  return new Request(`https://openescrow.example${path}`, {
    headers: {
      ...headers,
      authorization: `Bearer ${token}`,
    },
  });
}

async function jsonResponse(response) {
  const body = await response.json();
  assert.ok(response.ok, JSON.stringify(body));
  return body;
}

async function create(db, arbiterEmail = null) {
  return jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: arbiterEmail ? "Ari Arbiter" : "",
        arbiterEmail,
        terms,
      }),
      { DB: db },
    ),
  );
}

function claimReviewLinks(created) {
  return created.access.tenants.map((tenant) => ({
    tenantId: tenant.id,
    email: tenant.email,
    reviewUrl:
      `https://openescrow.example/?invite=tenant&proposal=${created.record.id}` +
      `#token=${tenant.token}`,
  }));
}

async function seedVerifiedComplianceSources(
  db,
  agreementTerms,
  verifiedAt = new Date().toISOString(),
) {
  const expectedVersions = new Map([
    [agreementTerms.jurisdiction, agreementTerms.policyVersion],
    ...(agreementTerms.complianceSnapshot?.overlays || []).map((overlay) => [
      overlay.id,
      overlay.version,
    ]),
  ]);
  const sourceItems = COMPLIANCE_SOURCE_REGISTRY.filter(
    (sourceItem) =>
      expectedVersions.get(sourceItem.jurisdiction) === sourceItem.version,
  );
  await db.batch(
    sourceItems.map((sourceItem) =>
      db
        .prepare(
          `INSERT INTO compliance_source_checks
           (source_key, scope, jurisdiction, profile_version, citation, url,
            baseline_signature, current_signature, http_status, status,
            last_checked_at, last_verified_at, last_changed_at, error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 200, 'unchanged', ?, ?, NULL, NULL)
           ON CONFLICT(source_key) DO UPDATE SET
             profile_version = excluded.profile_version,
             citation = excluded.citation,
             url = excluded.url,
             baseline_signature = excluded.baseline_signature,
             current_signature = excluded.current_signature,
             http_status = 200,
             status = 'unchanged',
             last_checked_at = excluded.last_checked_at,
             last_verified_at = excluded.last_verified_at,
             error = NULL`,
        )
        .bind(
          sourceItem.key,
          sourceItem.scope,
          sourceItem.jurisdiction,
          sourceItem.version,
          sourceItem.citation,
          sourceItem.url,
          `baseline:${sourceItem.key}`,
          `baseline:${sourceItem.key}`,
          verifiedAt,
          verifiedAt,
        ),
    ),
  );
  return sourceItems;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function identityTokenFor(privateKey, appId, kid, email, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlJson({ alg: "ES256", typ: "JWT", kid });
  const encodedPayload = base64UrlJson({
    sub: options.sub || "did:privy:test-landlord",
    iss: options.iss || "privy.io",
    aud: options.aud || appId,
    iat: options.iat ?? now,
    exp: options.exp ?? now + 3600,
    ...(options.nbf !== undefined ? { nbf: options.nbf } : {}),
    linked_accounts: JSON.stringify([{ type: "google_oauth", email }]),
  });
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  return `${encodedHeader}.${encodedPayload}.${Buffer.from(signature).toString("base64url")}`;
}

async function act(db, id, token, action, env = {}) {
  return worker.fetch(
    request(`/api/negotiations/${id}/actions`, "POST", { token, ...action }),
    {
      DB: db,
      VERIFY_TRANSACTION_RECEIPTS: "false",
      ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      ...env,
    },
  );
}

function transactionHash(index) {
  return `0x${BigInt(index).toString(16).padStart(64, "0")}`;
}

function receiptWord(value) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function receiptAddressWord(value) {
  return `0x${value.toLowerCase().slice(2).padStart(64, "0")}`;
}

function receiptData(...words) {
  return `0x${words.map((word) => word.slice(2)).join("")}`;
}

const RECEIPT_TEST_LANDLORD = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RECEIPT_TEST_TENANT = "0x1111111111111111111111111111111111111111";
const RECEIPT_TEST_OTHER_TENANT = "0x2222222222222222222222222222222222222222";
const RECEIPT_TEST_ARBITER = "0x3333333333333333333333333333333333333333";
const RECEIPT_TEST_USDC = "0xe129b23bd89904d363ba226ee52dec74185d7789";
const RECEIPT_TEST_YIELD_USDC = "0x2746034ff16371a65c133016470f85535992dabc";
const RECEIPT_TEST_OPEN_ESCROW =
  "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99";
const RECEIPT_TEST_OPERATIONS_RESERVE =
  "0x5d2E9c429F9d117c7b028c8f0f67d37252aDceC0";
const AGREEMENT_PROPOSED_TOPIC =
  "0x664e4c94d146ccef3e51a2b7665242fbd89c9e268a28a1807fc660bfc39327f6";
const PROPOSAL_CANCELLED_TOPIC =
  "0x416e669c63d9a3a5e36ee7cc7e2104b8db28ccd286aa18966e98fa230c73b08c";
const TENANT_PARTICIPANT_ADDED_TOPIC =
  "0x30ab399feb0ae9b4c920d576e81a8e47863afdae2efa0fc6d97a13114f5440ad";
const OPERATIONS_RESERVE_PAID_TOPIC =
  "0x8817d9a1dd298236cd746a97680a13cf2e5d0a9d970b20e26b8fa0ee32cd855b";
const TENANT_SHARE_FUNDED_TOPIC =
  "0xa59b69e1d871c72525782e2de73d8b4a83a1bf00840689625923330b4464544d";
const AGREEMENT_FUNDED_TOPIC =
  "0xce24c0ae1d73d57cf2e6d1d90b94b11b288e5cfb1c0aa6e7f8ed3391f0c0f021";
const CLAIM_SUBMITTED_TOPIC =
  "0xcf394f7701f2b1dae6f328cbc70c1f155122b124431f95bbf4a483bba6854555";
const CLAIM_AMENDED_TOPIC =
  "0x478de1b8c18ffc9b16915e850b17f80fc5fe83405310df3db31765a38a3365ff";
const CLAIM_RETRACTED_TOPIC =
  "0x78ed2810f3e800697035ce152a2c6e2d92fe189711545693db5d97ac0b9f7eb9";
const TENANT_CLAIM_RESPONSE_TOPIC =
  "0x270cfb5d0a1ef7453b09614e7321e2bc1c39e82a0642070b4247c08452dca245";
const LEGACY_CLAIM_RESPONSE_TOPIC =
  "0x0e3cd88697129d255d76bfa437dbf12aaeaef7601cf1c8d5f75ad2ba18e0cd4b";
const DISPUTE_RESOLVED_TOPIC =
  "0x959dc01840aa516bf9407cffa45326c7b6821c48feff7b91eb0c743c8f460fd6";
const WITHDRAWN_TOPIC =
  "0xcf7d23a3cbe4e8b36ff82fd1b05b1b17373dc7804b4ebbd6e2356716ef202372";
const NO_CLAIM_WITHDRAWAL_TOPIC =
  "0x845bd4e89218507974962580a9461fcb8f451ebd83d8c3b843d2c9032217d179";
const RESPONSE_TIMED_OUT_TOPIC =
  "0xfad75d47bd1a89b1c3f46dd58d38a0b9fe3c1b992a6077875a9ebb5432ba513a";
const ARBITER_TIMED_OUT_TOPIC =
  "0xab22e8614f3457bfcf1e3c2852a4c49aceafbd8c37e6a3181f13c8472f916e3d";
const ARBITER_REPLACEMENT_PROPOSED_TOPIC =
  "0xeeb50d0c2e09bed6f700dae5147fb9dc20cbf64a51ae5598ff4bf3fef65bd899";
const ARBITER_REPLACEMENT_CONFIRMED_TOPIC =
  "0x24561e96f9483b651114378fd5f5303482cb09292d94295bf12e8b08b570783e";
const ARBITER_REPLACEMENT_CANCELLED_TOPIC =
  "0xea55ed64aa907da9463ef6eb21d16b92c8672b37f1305df22c0555cd0cc175cf";
const ARBITER_REPLACED_TOPIC =
  "0x61fd94062542edfecb31f240c9ef0bab60274ed951f163e40614c3d4d02146d1";
const RECORD_SNAPSHOT_ANCHORED_TOPIC =
  "0x4012b6d2c58584f354b2ad24151a4b24d5e18ea9aff9ced4667a2ffe01305ab6";
const ACTIVITY_PUBLISHED_TOPIC =
  "0x2aca0841f18e301ab87df30a3dd50b022d848e0b1ee373dcbe9f914886b2eea7";

function finalizationReceipt(
  agreementId,
  mutation = "valid",
  arbiter = "0x0000000000000000000000000000000000000000",
) {
  const agreementTopic = receiptWord(agreementId);
  const tenant =
    mutation === "wrong-tenant"
      ? RECEIPT_TEST_OTHER_TENANT
      : RECEIPT_TEST_TENANT;
  const landlord =
    mutation === "tenant-as-landlord"
      ? RECEIPT_TEST_TENANT
      : RECEIPT_TEST_LANDLORD;
  const deposit = mutation === "wrong-amount" ? 1_199_000_000n : 1_200_000_000n;
  const claimWindowStart =
    Math.floor(new Date(terms.claimWindowStart).getTime() / 1_000) +
    (mutation === "wrong-claim-start" ? 1 : 0);
  const responsePeriod =
    Number(terms.responseDays) * 86_400 +
    (mutation === "wrong-response-period" ? 1 : 0);
  const agreementLog = {
    address: RECEIPT_TEST_OPEN_ESCROW,
    topics: [
      AGREEMENT_PROPOSED_TOPIC,
      agreementTopic,
      receiptAddressWord(landlord),
      receiptAddressWord(tenant),
    ],
    data: receiptData(
      receiptAddressWord(
        mutation === "wrong-arbiter" ? RECEIPT_TEST_ARBITER : arbiter,
      ),
      receiptWord(deposit),
      receiptWord(claimWindowStart),
      receiptWord(Number(terms.claimDays) * 86_400),
      receiptWord(responsePeriod),
      receiptWord(Number(terms.arbiterDays) * 86_400),
    ),
  };
  const participantLog = {
    address: RECEIPT_TEST_OPEN_ESCROW,
    topics: [
      TENANT_PARTICIPANT_ADDED_TOPIC,
      agreementTopic,
      receiptAddressWord(tenant),
    ],
    data: receiptData(
      receiptWord(mutation === "wrong-participant-share" ? 9_999 : 10_000),
    ),
  };
  const logs =
    mutation === "split-match"
      ? [
          {
            ...agreementLog,
            data: receiptData(
              receiptAddressWord(arbiter),
              receiptWord(1_199_000_000n),
              receiptWord(claimWindowStart),
              receiptWord(Number(terms.claimDays) * 86_400),
              receiptWord(responsePeriod),
              receiptWord(Number(terms.arbiterDays) * 86_400),
            ),
          },
          {
            ...agreementLog,
            topics: [
              AGREEMENT_PROPOSED_TOPIC,
              agreementTopic,
              receiptAddressWord(landlord),
              receiptAddressWord(RECEIPT_TEST_OTHER_TENANT),
            ],
          },
          participantLog,
        ]
      : [
          agreementLog,
          ...(mutation === "missing-participant" ? [] : [participantLog]),
        ];
  return {
    status: "0x1",
    blockNumber: "0x2a",
    blockHash: transactionHash(9_000),
    transactionHash: transactionHash(agreementId),
    from: landlord,
    logs,
  };
}

function agreementStateResult(tokenAddress = RECEIPT_TEST_USDC) {
  const words = Array.from({ length: 29 }, () => receiptWord(0));
  words[12] = receiptAddressWord(tokenAddress);
  return receiptData(...words);
}

async function finalizeWithoutArbiter(db, created) {
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  return jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "42",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
}

async function finalizeWithVerifiedReceipt(
  db,
  created,
  { agreementId = 42, arbiterWallet = null } = {},
) {
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: RECEIPT_TEST_TENANT,
    }),
  );
  if (arbiterWallet) {
    await jsonResponse(
      await act(db, created.record.id, created.access.arbiter, {
        type: "approve",
        wallet: arbiterWallet,
      }),
    );
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const rpcRequest = JSON.parse(options.body);
    return Response.json({
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result:
        rpcRequest.method === "eth_call"
          ? agreementStateResult()
          : finalizationReceipt(
              agreementId,
              "valid",
              arbiterWallet ||
                "0x0000000000000000000000000000000000000000",
            ),
    });
  };
  try {
    return await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.landlord,
        {
          type: "finalize",
          agreementId: String(agreementId),
          transactionHash: transactionHash(agreementId),
        },
        { VERIFY_TRANSACTION_RECEIPTS: "true" },
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function actWithVerifiedReceipt(db, created, token, action, receipt) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const rpcRequest = JSON.parse(options.body);
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    return Response.json({
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result: {
        blockHash: transactionHash(9_001),
        transactionHash: action.transactionHash,
        ...receipt,
      },
    });
  };
  try {
    return await act(db, created.record.id, token, action, {
      VERIFY_TRANSACTION_RECEIPTS: "true",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function serializeFundingIntent(intent) {
  return {
    ...intent,
    amountMicros: intent.amountMicros.toString(),
  };
}

function sandboxFundingIntent({
  walletAddress = "0x1111111111111111111111111111111111111111",
  amountMicros = 1_205_000_000n,
  assetId = "usdc",
} = {}) {
  return serializeFundingIntent(
    createFundingIntent({
      assetId,
      walletAddress,
      amountMicros,
      environment: "sandbox",
      onrampEnabled: true,
      productionApproved: false,
    }),
  );
}

function fundingCheckoutRequest(
  db,
  proposalId,
  path,
  body,
) {
  return worker.fetch(
    request(
      `/api/negotiations/${proposalId}/funding-checkouts${path}`,
      "POST",
      body,
    ),
    { DB: db },
  );
}

test("pilot rehearsal: sandbox checkout recovery is durable and separate from agreement funding", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const intent = sandboxFundingIntent();
  const attemptId = "sandbox-attempt-primary";

  const openedResponse = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.tenant,
      attemptId,
      intent,
    },
  );
  assert.equal(openedResponse.status, 201);
  const opened = await jsonResponse(openedResponse);
  assert.equal(opened.created, true);
  assert.equal(opened.requestedIntentMatched, true);
  assert.equal(opened.durable, true);
  assert.equal(opened.sandboxOnly, true);
  assert.equal(opened.checkout.status, "opening");
  assert.equal(opened.checkout.environment, "sandbox");
  assert.equal(opened.checkout.amountMicros, "1205000000");

  const repeated = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId,
      intent,
    }),
  );
  assert.equal(repeated.created, false);
  assert.equal(repeated.requestedIntentMatched, true);
  assert.equal(repeated.checkout.attemptId, attemptId);

  const duplicateIntent = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-attempt-duplicate-intent",
      intent,
    }),
  );
  assert.equal(duplicateIntent.created, false);
  assert.equal(duplicateIntent.requestedIntentMatched, true);
  assert.equal(duplicateIntent.checkout.attemptId, attemptId);

  const differentAmountIntent = sandboxFundingIntent({ amountMicros: 100_000_000n });
  const duplicateDifferentAmount = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-attempt-different-amount",
      intent: differentAmountIntent,
    }),
  );
  assert.equal(duplicateDifferentAmount.created, false);
  assert.equal(duplicateDifferentAmount.requestedIntentMatched, false);
  assert.equal(duplicateDifferentAmount.checkout.attemptId, attemptId);
  assert.equal(duplicateDifferentAmount.checkout.amountMicros, "1205000000");

  const recovered = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "/recover", {
      token: created.access.tenant,
      intent: differentAmountIntent,
    }),
  );
  assert.equal(recovered.checkout.attemptId, attemptId);
  assert.equal(recovered.requestedIntentMatched, false);
  assert.equal(recovered.checkout.status, "opening");

  const submitted = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:submitted-1",
        status: "submitted",
        providerStatus: "processing",
        source: "provider_webhook",
        verification: "provider_signed",
        reconciliationKey: `sha256:${"c".repeat(64)}`,
        payloadDigest: `sha256:${"d".repeat(64)}`,
      },
    ),
  );
  assert.equal(submitted.duplicate, false);
  assert.equal(submitted.checkout.status, "submitted");
  assert.equal(submitted.checkout.events[0].source, "browser_callback");
  assert.equal(submitted.checkout.events[0].verification, "unverified");
  assert.equal(submitted.checkout.events[0].reconciliationKey, null);
  assert.equal(submitted.checkout.events[0].payloadDigest, null);

  const duplicateEvent = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:submitted-1",
        status: "submitted",
        providerStatus: "processing",
      },
    ),
  );
  assert.equal(duplicateEvent.duplicate, true);
  assert.equal(duplicateEvent.checkout.events.length, 1);

  const conflictingDuplicate = await fundingCheckoutRequest(
    db,
    created.record.id,
    `/${attemptId}/events`,
    {
      token: created.access.tenant,
      eventId: "provider:submitted-1",
      status: "failed",
      providerStatus: "declined",
    },
  );
  assert.equal(conflictingDuplicate.status, 409);
  assert.match((await conflictingDuplicate.json()).error, /conflicts/);

  const contradictoryProviderResult = await fundingCheckoutRequest(
    db,
    created.record.id,
    `/${attemptId}/events`,
    {
      token: created.access.tenant,
      eventId: "provider:contradictory-1",
      status: "confirmed",
      providerStatus: "declined",
    },
  );
  assert.equal(contradictoryProviderResult.status, 409);
  assert.match(
    (await contradictoryProviderResult.json()).error,
    /does not match the provider result/i,
  );

  const confirmed = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:confirmed-1",
        status: "confirmed",
        providerStatus: "completed",
      },
    ),
  );
  assert.equal(confirmed.checkout.status, "confirmed");

  const refundPending = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:refund-pending-1",
        status: "refund_pending",
        providerStatus: "refunding",
      },
    ),
  );
  assert.equal(refundPending.checkout.status, "refund_pending");

  const refunded = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:refunded-1",
        status: "refunded",
        providerStatus: "refunded",
      },
    ),
  );
  assert.equal(refunded.checkout.status, "refunded");

  const reopened = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-attempt-after-refund",
      intent,
    }),
  );
  assert.equal(reopened.created, true);
  assert.equal(reopened.checkout.attemptId, "sandbox-attempt-after-refund");

  const agreementRecord = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(
    agreementRecord.events.some((event) =>
      ["tenant_share_funded", "agreement_funded"].includes(event.action),
    ),
    false,
  );
  assert.equal(
    db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM funding_checkout_attempts WHERE negotiation_id = ?",
      )
      .get(created.record.id).count,
    2,
  );
});

test("sandbox funding checkout endpoints enforce tenant, amount, origin, and retry boundaries", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const otherAgreement = await create(db);
  await jsonResponse(
    await act(db, otherAgreement.record.id, otherAgreement.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  await jsonResponse(
    await act(db, otherAgreement.record.id, otherAgreement.access.landlord, {
      type: "finalize",
      agreementId: "43",
      transactionHash: `0x${"b".repeat(64)}`,
    }),
  );
  const intent = sandboxFundingIntent();

  const landlordAttempt = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.landlord,
      attemptId: "sandbox-landlord-attempt",
      intent,
    },
  );
  assert.equal(landlordAttempt.status, 403);

  const otherTenantAttempt = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: otherAgreement.access.tenant,
      attemptId: "sandbox-other-tenant-attempt",
      intent,
    },
  );
  assert.equal(otherTenantAttempt.status, 403);

  const productionAttempt = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.tenant,
      attemptId: "sandbox-production-attempt",
      intent: { ...intent, environment: "production" },
    },
  );
  assert.equal(productionAttempt.status, 403);

  const wrongWalletAttempt = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.tenant,
      attemptId: "sandbox-wrong-wallet-attempt",
      intent: sandboxFundingIntent({
        walletAddress: "0x2222222222222222222222222222222222222222",
      }),
    },
  );
  assert.equal(wrongWalletAttempt.status, 400);

  const excessiveAttempt = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.tenant,
      attemptId: "sandbox-excessive-attempt",
      intent: sandboxFundingIntent({ amountMicros: 1_205_000_001n }),
    },
  );
  assert.equal(excessiveAttempt.status, 400);

  const crossSiteRequest = new Request(
    `https://openescrow.example/api/negotiations/${created.record.id}/funding-checkouts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({
        token: created.access.tenant,
        attemptId: "sandbox-cross-site-attempt",
        intent,
      }),
    },
  );
  const crossSiteAttempt = await worker.fetch(crossSiteRequest, { DB: db });
  assert.equal(crossSiteAttempt.status, 403);

  const first = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-cancelled-attempt",
      intent,
    }),
  );
  const crossAccountEvent = await fundingCheckoutRequest(
    db,
    created.record.id,
    `/${first.checkout.attemptId}/events`,
    {
      token: otherAgreement.access.tenant,
      eventId: "provider:cross-account",
      status: "cancelled",
      providerStatus: "cancelled",
    },
  );
  assert.equal(crossAccountEvent.status, 403);

  await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${first.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:cancelled-1",
        status: "cancelled",
        providerStatus: "cancelled",
      },
    ),
  );
  const afterCancellation = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-failed-attempt",
      intent,
    }),
  );
  assert.equal(afterCancellation.created, true);

  await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${afterCancellation.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:failed-1",
        status: "failed",
        providerStatus: "declined",
      },
    ),
  );
  const afterFailure = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-after-failure-attempt",
      intent,
    }),
  );
  assert.equal(afterFailure.created, true);

  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "agreement_funded",
      transactionHash: transactionHash(901),
    }),
  );
  const afterFunding = await fundingCheckoutRequest(
    db,
    created.record.id,
    "",
    {
      token: created.access.tenant,
      attemptId: "sandbox-after-agreement-funded",
      intent,
    },
  );
  assert.equal(afterFunding.status, 409);
  assert.match((await afterFunding.json()).error, /already recorded as funded/);
});

test("simultaneous sandbox provider results cannot fork a checkout lifecycle", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const attempt = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-concurrent-result-attempt",
      intent: sandboxFundingIntent(),
    }),
  );

  const responses = await Promise.all([
    fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:concurrent-cancelled",
        status: "cancelled",
        providerStatus: "cancelled",
      },
    ),
    fundingCheckoutRequest(
      db,
      created.record.id,
      `/${attempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:concurrent-failed",
        status: "failed",
        providerStatus: "declined",
      },
    ),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );

  const recovered = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "/recover", {
      token: created.access.tenant,
      intent: sandboxFundingIntent(),
    }),
  );
  assert.equal(["cancelled", "failed"].includes(recovered.checkout.status), true);
  assert.equal(recovered.checkout.events.length, 1);
});

test("an interrupted sandbox preview can be closed before a new attempt", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const intent = sandboxFundingIntent();
  const opened = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-interrupted-attempt",
      intent,
    }),
  );

  const interrupted = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${opened.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:interrupted",
        status: "unknown",
        providerStatus: "interrupted",
      },
    ),
  );
  assert.equal(interrupted.checkout.status, "unknown");

  const lockedRetry = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-locked-retry",
      intent,
    }),
  );
  assert.equal(lockedRetry.created, false);
  assert.equal(lockedRetry.checkout.attemptId, opened.checkout.attemptId);

  const closed = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${opened.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "sandbox:close-interrupted",
        status: "cancelled",
        providerStatus: "cancelled",
      },
    ),
  );
  assert.equal(closed.checkout.status, "cancelled");

  const reopened = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-after-interruption",
      intent,
    }),
  );
  assert.equal(reopened.created, true);
  assert.equal(reopened.checkout.attemptId, "sandbox-after-interruption");
});

test("sandbox rehearsal resets follow cancellation before confirmation and refund after it", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const intent = sandboxFundingIntent();

  const submittedAttempt = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-submitted-reset",
      intent,
    }),
  );
  await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${submittedAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:submitted-reset",
        status: "submitted",
        providerStatus: "processing",
      },
    ),
  );
  const cancelled = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${submittedAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "sandbox:close-submitted",
        status: "cancelled",
        providerStatus: "cancelled",
      },
    ),
  );
  assert.equal(cancelled.checkout.status, "cancelled");

  const confirmedAttempt = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-confirmed-reset",
      intent,
    }),
  );
  const confirmed = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${confirmedAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:confirmed-reset",
        status: "confirmed",
        providerStatus: "completed",
      },
    ),
  );
  assert.equal(confirmed.checkout.status, "confirmed");
  const refunded = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${confirmedAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "sandbox:refund-confirmed",
        status: "refunded",
        providerStatus: "refunded",
      },
    ),
  );
  assert.equal(refunded.checkout.status, "refunded");

  const refundPendingAttempt = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-refund-pending-reset",
      intent,
    }),
  );
  await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${refundPendingAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:confirmed-before-refund",
        status: "confirmed",
        providerStatus: "completed",
      },
    ),
  );
  const refundPending = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${refundPendingAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "provider:refund-pending-reset",
        status: "refund_pending",
        providerStatus: "refunding",
      },
    ),
  );
  assert.equal(refundPending.checkout.status, "refund_pending");
  const refundCompleted = await jsonResponse(
    await fundingCheckoutRequest(
      db,
      created.record.id,
      `/${refundPendingAttempt.checkout.attemptId}/events`,
      {
        token: created.access.tenant,
        eventId: "sandbox:complete-pending-refund",
        status: "refunded",
        providerStatus: "refunded",
      },
    ),
  );
  assert.equal(refundCompleted.checkout.status, "refunded");

  const reopened = await jsonResponse(
    await fundingCheckoutRequest(db, created.record.id, "", {
      token: created.access.tenant,
      attemptId: "sandbox-after-lifecycle-resets",
      intent,
    }),
  );
  assert.equal(reopened.created, true);
  assert.equal(reopened.checkout.attemptId, "sandbox-after-lifecycle-resets");
});

async function submitStandardClaim(
  db,
  created,
  { amount = "100", transactionByte = "c" } = {},
) {
  return jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_submitted",
      amount,
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "Documented repair",
          amount,
        },
      ],
      note: "",
      evidenceUri: "openescrow://evidence/test",
      evidenceHash: `0x${"b".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: `0x${transactionByte.repeat(64)}`,
    }),
  );
}

test("tenant can request changes, approve, and make an arbiter-free proposal ready", async () => {
  const db = new TestD1();
  const created = await create(db);
  const id = created.record.id;
  assert.equal(created.record.landlordName, "Lena Landlord");
  assert.equal(created.record.tenantName, "Terry Tenant");

  const change = await jsonResponse(
    await act(db, id, created.access.tenant, {
      type: "propose_change",
      summary: "Please make the response period ten days.",
    }),
  );
  assert.equal(change.events.at(-1).action, "change_proposed");

  const approved = await jsonResponse(
    await act(db, id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
      name: "Terrence Tenant",
    }),
  );
  assert.equal(approved.status, "ready");
  assert.equal(approved.tenantApproved, true);
  assert.equal(approved.arbiterApproved, true);
  assert.equal(approved.tenantName, "Terry Tenant");

  const report = await worker.fetch(
    request(`/api/negotiations/${id}/report?token=${created.access.tenant}`),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(await report.text(), /Timestamped activity/);
  const snapshotPath =
    `/api/negotiations/${id}/snapshot?token=${created.access.tenant}`;
  const firstSnapshot = await jsonResponse(
    await worker.fetch(request(snapshotPath), { DB: db }),
  );
  const repeatedSnapshot = await jsonResponse(
    await worker.fetch(request(snapshotPath), { DB: db }),
  );
  assert.match(firstSnapshot.hash, /^0x[a-f0-9]{64}$/);
  assert.equal(firstSnapshot.hash, repeatedSnapshot.hash);
  assert.equal(firstSnapshot.canonical, repeatedSnapshot.canonical);
  assert.equal(firstSnapshot.snapshot.schema, "openescrow.agreement-record.v3");
  assert.equal(firstSnapshot.snapshot.onchain.chainId, 84532);
  assert.equal(
    firstSnapshot.snapshot.onchain.escrowAddress.toLowerCase(),
    "0xf18bfdbfd3ff84c603cbdf895d2a96ac7260ae99",
  );
  assert.equal(
    firstSnapshot.snapshot.onchain.activityRegistryAddress.toLowerCase(),
    "0xc004df4c43146fe55e5761ea1bb3c14f01161951",
  );
});

test("yield asset snapshots cannot be tampered with and require party consent", async () => {
  const db = new TestD1();
  const aaveTerms = {
    ...terms,
    tokenChoice: "yield",
    depositAssetId: "aave-usdc",
    depositAssetSnapshot: createDepositAssetSnapshot("aave-usdc"),
    yieldConsent: true,
  };
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: aaveTerms,
      }),
      { DB: db },
    ),
  );

  const missingConsent = await act(
    db,
    created.record.id,
    created.access.tenant,
    {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    },
  );
  assert.equal(missingConsent.status, 400);
  assert.match((await missingConsent.json()).error, /Affirmatively confirm/);

  const approved = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
      assetConsent: true,
    }),
  );
  assert.equal(approved.status, "ready");
  assert.equal(approved.events.at(-2).metadata.assetConsent, true);

  const tampered = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant2@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: {
        ...aaveTerms,
        depositAssetSnapshot: {
          ...aaveTerms.depositAssetSnapshot,
          settlementAsset: "aUSDC",
        },
      },
    }),
    { DB: new TestD1() },
  );
  assert.equal(tampered.status, 400);
});

test("new proposals reject California policy terms", async () => {
  const db = new TestD1();
  const response = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: legacyCaliforniaTerms,
    }),
    { DB: db },
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /incomplete or invalid/);
});

test("address-routed compliance profiles require their exact version and deadline", async () => {
  const db = new TestD1();
  const stateEnv = {
    DB: db,
    ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
  };
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: newYorkResearchTerms,
      }),
      stateEnv,
    ),
  );
  assert.equal(created.record.terms.jurisdiction, "us-ny");
  assert.equal(created.record.terms.claimDays, "14");

  const invalid = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: { ...newYorkResearchTerms, claimDays: "30" },
    }),
    stateEnv,
  );
  assert.equal(invalid.status, 400);

  const mismatchedAddress = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: {
        ...newYorkResearchTerms,
        addressResolution: {
          ...newYorkResearchTerms.addressResolution,
          stateCode: "CA",
        },
      },
    }),
    stateEnv,
  );
  assert.equal(mismatchedAddress.status, 400);

  const editedAfterSelection = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: {
        ...newYorkResearchTerms,
        propertyAddress: "A manually edited address",
      },
    }),
    stateEnv,
  );
  assert.equal(editedAfterSelection.status, 400);

  const tamperedSnapshot = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: {
        ...newYorkResearchTerms,
        complianceSnapshot: {
          ...newYorkResearchTerms.complianceSnapshot,
          deadlines: [],
        },
      },
    }),
    stateEnv,
  );
  assert.equal(tamperedSnapshot.status, 400);

  const forgedAttestation = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: {
        ...newYorkResearchTerms,
        addressResolution: {
          ...newYorkResearchTerms.addressResolution,
          city: "Buffalo",
        },
      },
    }),
    stateEnv,
  );
  assert.equal(forgedAttestation.status, 400);
});

test("reports fail closed on malformed saved compliance snapshots", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: newYorkResearchTerms,
      }),
      {
        DB: db,
        ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      },
    ),
  );
  const corruptedTerms = structuredClone(created.record.terms);
  corruptedTerms.complianceSnapshot.requirements = "forged-requirements";
  await db
    .prepare("UPDATE agreement_negotiations SET terms_json = ? WHERE id = ?")
    .bind(JSON.stringify(corruptedTerms), created.record.id)
    .run();
  const createdEvent = await db
    .prepare(
      "SELECT id, metadata_json FROM negotiation_events WHERE negotiation_id = ? AND action = 'proposal_created'",
    )
    .bind(created.record.id)
    .first();
  const corruptedEventMetadata = JSON.parse(createdEvent.metadata_json);
  corruptedEventMetadata.terms.complianceSnapshot.requirements =
    "forged-requirements";
  await db
    .prepare("UPDATE negotiation_events SET metadata_json = ? WHERE id = ?")
    .bind(JSON.stringify(corruptedEventMetadata), createdEvent.id)
    .run();

  const response = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Recorded compliance details need review/);
  assert.match(html, /did not substitute today's rules/);
  assert.doesNotMatch(html, /forged-requirements/);
  assert.equal(html.includes(newYorkProfile.requirements[0]), false);
});

test("monitored compliance sources fail closed for pending, changed, and stale profiles", async () => {
  const db = new TestD1();
  const monitoredEnv = {
    DB: db,
    ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
  };
  const proposalBody = {
    landlordName: "Lena Landlord",
    landlordEmail: "landlord@example.com",
    tenantName: "Terry Tenant",
    tenantEmail: "tenant@example.com",
    arbiterName: "",
    arbiterEmail: null,
    terms: newYorkResearchTerms,
  };

  const pending = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(pending.status, 503);
  assert.equal(
    (await pending.json()).code,
    "compliance-source-review-required",
  );

  const sourceItems = await seedVerifiedComplianceSources(
    db,
    newYorkResearchTerms,
  );
  assert.ok(sourceItems.length >= 2);
  const created = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(created.status, 201);
  const createdProposal = await created.json();
  await jsonResponse(
    await act(
      db,
      createdProposal.record.id,
      createdProposal.access.tenant,
      {
        type: "approve",
        wallet: "0x1111111111111111111111111111111111111111",
      },
      { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
    ),
  );

  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'changed',
           current_signature = 'changed:state:ny',
           last_changed_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date().toISOString())
    .run();
  const changed = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(changed.status, 503);
  assert.match((await changed.json()).error, /source changed/i);
  const blockedPreflight = await act(
    db,
    createdProposal.record.id,
    createdProposal.access.landlord,
    { type: "preflight_finalize" },
    { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
  );
  assert.equal(blockedPreflight.status, 503);

  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'unreachable',
           current_signature = baseline_signature,
           last_verified_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date().toISOString())
    .run();
  const recentOutage = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(recentOutage.status, 201);
  const disabledGateProposal = await recentOutage.json();
  await jsonResponse(
    await act(
      db,
      disabledGateProposal.record.id,
      disabledGateProposal.access.tenant,
      {
        type: "approve",
        wallet: "0x2222222222222222222222222222222222222222",
      },
      { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
    ),
  );
  const disabledGatePreflight = await jsonResponse(
    await act(
      db,
      disabledGateProposal.record.id,
      disabledGateProposal.access.landlord,
      { type: "preflight_finalize" },
    ),
  );
  assert.equal(
    disabledGatePreflight.events.at(-1).metadata.sourceGateEnforced,
    false,
  );
  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'changed',
           current_signature = 'changed-after-disabled-preflight:state:ny',
           last_changed_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date().toISOString())
    .run();
  const blockedAfterDisabledPreflight = await act(
    db,
    disabledGateProposal.record.id,
    disabledGateProposal.access.landlord,
    {
      type: "finalize",
      agreementId: "73",
      transactionHash: `0x${"6".repeat(64)}`,
    },
    { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
  );
  assert.equal(blockedAfterDisabledPreflight.status, 503);
  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'unreachable',
           current_signature = baseline_signature,
           last_verified_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date().toISOString())
    .run();

  const preflight = await jsonResponse(
    await act(
      db,
      createdProposal.record.id,
      createdProposal.access.landlord,
      { type: "preflight_finalize" },
      { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
    ),
  );
  assert.equal(
    preflight.events.at(-1).action,
    "finalization_preflight_passed",
  );
  assert.equal(
    preflight.events.at(-1).metadata.sourceGateEnforced,
    true,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      preflight.events.at(-1).metadata,
      "expiresAt",
    ),
    false,
  );

  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'changed',
           current_signature = 'changed-again:state:ny',
           last_changed_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date().toISOString())
    .run();
  const blockedAfterEnforcedPreflight = await act(
    db,
    createdProposal.record.id,
    createdProposal.access.landlord,
    {
      type: "finalize",
      agreementId: "74",
      transactionHash: `0x${"7".repeat(64)}`,
    },
    { COMPLIANCE_SOURCE_MONITOR_ENABLED: "true" },
  );
  assert.equal(blockedAfterEnforcedPreflight.status, 503);
  assert.match(
    (await blockedAfterEnforcedPreflight.json()).error,
    /source changed/i,
  );

  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'unreachable',
           current_signature = baseline_signature,
           last_verified_at = '2020-01-01T00:00:00.000Z'
       WHERE source_key = 'state:ny'`,
    )
    .run();
  const stale = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(stale.status, 503);
  assert.equal(
    (await stale.json()).sourceStatus.find(
      (sourceItem) => sourceItem.key === "state:ny",
    ).status,
    "stale",
  );

  await db
    .prepare(
      `UPDATE compliance_source_checks
       SET status = 'unreachable',
           current_signature = baseline_signature,
           last_verified_at = ?
       WHERE source_key = 'state:ny'`,
    )
    .bind(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
    .run();
  const futureDated = await worker.fetch(
    request("/api/negotiations", "POST", proposalBody),
    monitoredEnv,
  );
  assert.equal(futureDated.status, 503);
  assert.equal(
    (await futureDated.json()).sourceStatus.find(
      (sourceItem) => sourceItem.key === "state:ny",
    ).status,
    "stale",
  );
});

test("a user-triggered state source check reports provenance without rewriting a profile", async () => {
  const db = new TestD1();
  await worker.fetch(request("/api/system/readiness"), { DB: db });
  const originalFetch = globalThis.fetch;
  let sourceBody = "official requirements baseline";
  let fetchCount = 0;
  let sourceFailure = false;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (sourceFailure) throw new Error("Official source temporarily unavailable.");
    return new Response(sourceBody, {
      status: 200,
      headers: {
        "content-type": "text/html",
        etag: `"version-${fetchCount}"`,
      },
    });
  };
  const sourceRequest = () =>
    request("/api/compliance/source-status", "POST", {
      jurisdiction: newYorkProfile.code,
      profileVersion: newYorkProfile.version,
    });
  const env = {
    DB: db,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
  };

  try {
    const baseline = await jsonResponse(await worker.fetch(sourceRequest(), env));
    assert.equal(baseline.source.status, "unchanged");
    assert.equal(baseline.source.requiresReview, false);
    assert.match(baseline.source.url, /^https:/);
    assert.ok(baseline.source.lastCheckedAt);
    assert.match(baseline.immutableSnapshotNotice, /keep their recorded/i);
    assert.equal(fetchCount, 1);

    const throttled = await jsonResponse(await worker.fetch(sourceRequest(), env));
    assert.equal(throttled.source.status, "unchanged");
    assert.equal(fetchCount, 1, "A recent manual source check should be reused.");

    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET last_checked_at = '2020-01-01T00:00:00.000Z'
         WHERE source_key = 'state:ny'`,
      )
      .run();
    sourceBody = "official requirements changed";
    const changed = await jsonResponse(await worker.fetch(sourceRequest(), env));
    assert.equal(changed.source.status, "changed");
    assert.equal(changed.source.requiresReview, true);
    assert.equal(changed.profileVersion, newYorkProfile.version);
    assert.equal(fetchCount, 2);

    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET last_checked_at = '2020-01-01T00:00:00.000Z'
         WHERE source_key = 'state:ny'`,
      )
      .run();
    sourceFailure = true;
    const unreachable = await jsonResponse(await worker.fetch(sourceRequest(), env));
    assert.equal(unreachable.source.status, "unreachable");
    assert.equal(unreachable.source.requiresReview, true);
    assert.ok(unreachable.source.lastVerifiedAt);
    assert.equal(fetchCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const unknown = await worker.fetch(
    request("/api/compliance/source-status", "POST", {
      jurisdiction: newYorkProfile.code,
      profileVersion: "unreviewed-version",
    }),
    env,
  );
  assert.equal(unknown.status, 404);
});

test("compliance checks reject known challenge and error-page redirects", async () => {
  const originalFetch = globalThis.fetch;
  const rejectedDestinations = [
    "https://unblock.federalregister.gov/",
    "https://www.govinfo.gov/error",
    "https://www.example.gov/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1",
  ];

  try {
    for (const finalUrl of rejectedDestinations) {
      const db = new TestD1();
      globalThis.fetch = async () => {
        const response = new Response("This is not the cited legal source.", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
        Object.defineProperty(response, "url", { value: finalUrl });
        return response;
      };
      const checked = await jsonResponse(
        await worker.fetch(
          request("/api/compliance/source-status", "POST", {
            jurisdiction: newYorkProfile.code,
            profileVersion: newYorkProfile.version,
          }),
          {
            DB: db,
            COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
          },
        ),
      );
      assert.equal(checked.source.status, "unreachable");
      assert.equal(checked.source.requiresReview, true);
      const stored = await db
        .prepare(
          "SELECT status, baseline_signature, last_verified_at, error FROM compliance_source_checks WHERE source_key = 'state:ny'",
        )
        .first();
      assert.equal(stored.status, "unreachable");
      assert.equal(stored.baseline_signature, null);
      assert.equal(stored.last_verified_at, null);
      assert.match(stored.error, /challenge or error page/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("simultaneous state source requests share one bounded external check", async () => {
  const db = new TestD1();
  await worker.fetch(request("/api/system/readiness"), { DB: db });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let markStarted;
  let releaseSource;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const released = new Promise((resolve) => {
    releaseSource = resolve;
  });
  globalThis.fetch = async () => {
    fetchCount += 1;
    markStarted();
    await released;
    return new Response("official requirements baseline", {
      status: 200,
      headers: { "content-type": "text/html", etag: '"shared-check"' },
    });
  };
  const env = {
    DB: db,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
  };
  const sourceRequest = () =>
    request("/api/compliance/source-status", "POST", {
      jurisdiction: newYorkProfile.code,
      profileVersion: newYorkProfile.version,
    });

  try {
    const first = worker.fetch(sourceRequest(), env);
    await started;
    const second = worker.fetch(sourceRequest(), env);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(fetchCount, 1, "Concurrent requests should reuse the active source check.");
    releaseSource();
    const [firstResult, secondResult] = await Promise.all([
      jsonResponse(await first),
      jsonResponse(await second),
    ]);
    assert.equal(firstResult.source.status, "unchanged");
    assert.equal(secondResult.source.status, "unchanged");
    assert.equal(firstResult.profileVersion, newYorkProfile.version);
    assert.equal(secondResult.profileVersion, newYorkProfile.version);
    assert.equal(fetchCount, 1);
  } finally {
    releaseSource?.();
    globalThis.fetch = originalFetch;
  }
});

test("an older source failure cannot overwrite a newer successful check", async () => {
  const db = new TestD1();
  await worker.fetch(request("/api/system/readiness"), { DB: db });
  const originalFetch = globalThis.fetch;
  const env = {
    DB: db,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
  };
  const sourceRequest = () =>
    request("/api/compliance/source-status", "POST", {
      jurisdiction: newYorkProfile.code,
      profileVersion: newYorkProfile.version,
    });
  const sourceResponse = () =>
    new Response("official requirements baseline", {
      status: 200,
      headers: { "content-type": "text/html", etag: '"stable-source"' },
    });
  let releaseOlder;

  try {
    globalThis.fetch = async () => sourceResponse();
    const baseline = await jsonResponse(await worker.fetch(sourceRequest(), env));
    assert.equal(baseline.source.status, "unchanged");
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET last_checked_at = '2020-01-01T00:00:00.000Z'
         WHERE source_key = 'state:ny'`,
      )
      .run();

    let fetchCount = 0;
    let markOlderStarted;
    const olderStarted = new Promise((resolve) => {
      markOlderStarted = resolve;
    });
    const releaseOlderCheck = new Promise((resolve) => {
      releaseOlder = resolve;
    });
    globalThis.fetch = async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        markOlderStarted();
        await releaseOlderCheck;
        throw new Error("Older source request failed late.");
      }
      return sourceResponse();
    };
    const aliasedDb = {
      prepare(sql) {
        return db.prepare(sql);
      },
      batch(statements) {
        return db.batch(statements);
      },
    };

    const older = worker.fetch(sourceRequest(), env);
    await olderStarted;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await jsonResponse(
      await worker.fetch(sourceRequest(), { ...env, DB: aliasedDb }),
    );
    assert.equal(newer.source.status, "unchanged");
    releaseOlder();
    const olderResult = await jsonResponse(await older);
    assert.equal(olderResult.source.status, "unchanged");
    assert.equal(fetchCount, 2);

    const stored = await db
      .prepare(
        `SELECT status, error, last_verified_at
         FROM compliance_source_checks WHERE source_key = 'state:ny'`,
      )
      .first();
    assert.equal(stored.status, "unchanged");
    assert.equal(stored.error, null);
    assert.ok(stored.last_verified_at);
  } finally {
    releaseOlder?.();
    globalThis.fetch = originalFetch;
  }
});

test("every reviewed local overlay requires its exact monitored source", async () => {
  const db = new TestD1();
  await worker.fetch(request("/api/system/readiness"), { DB: db });
  const env = {
    DB: db,
    ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
  };
  const localCases = [
    {
      overlayId: "local-il-chicago-rlto",
      stateCode: "IL",
      city: "Chicago",
      county: "Cook County",
      postalCode: "60602",
      label: "121 North LaSalle Street, Chicago, IL 60602",
      latitude: 41.8838,
      longitude: -87.6317,
    },
    {
      overlayId: "local-wa-seattle-move-in-charges",
      stateCode: "WA",
      city: "Seattle",
      county: "King County",
      postalCode: "98104",
      label: "600 4th Avenue, Seattle, WA 98104",
      latitude: 47.6038,
      longitude: -122.3301,
    },
    {
      overlayId: "local-or-portland-security-deposit",
      stateCode: "OR",
      city: "Portland",
      county: "Multnomah County",
      postalCode: "97204",
      label: "1221 SW 4th Avenue, Portland, OR 97204",
      latitude: 45.5152,
      longitude: -122.6784,
    },
  ];

  for (const localCase of localCases) {
    const profile = US_JURISDICTION_PROFILES.find(
      (candidate) => candidate.postalCode === localCase.stateCode,
    );
    const unsignedAddress = {
      ...unsignedNewYorkAddressResolution,
      providerFeatureId: `W:${localCase.overlayId}:source-gate`,
      label: localCase.label,
      stateCode: localCase.stateCode,
      city: localCase.city,
      county: localCase.county,
      postalCode: localCase.postalCode,
      latitude: localCase.latitude,
      longitude: localCase.longitude,
    };
    const address = {
      ...unsignedAddress,
      attestation: await createAddressAttestation(
        unsignedAddress,
        TEST_ADDRESS_ATTESTATION_SECRET,
      ),
    };
    const complianceFacts = {
      ...newYorkComplianceFacts,
      housingProgram: "conventional",
    };
    const localTerms = {
      ...terms,
      jurisdiction: profile.code,
      policyVersion: profile.version,
      propertyAddress: address.label,
      addressResolution: address,
      complianceFacts,
      complianceSnapshot: buildComplianceSnapshot(profile, address, {
        facts: complianceFacts,
      }),
      claimDays: profile.defaultClaimDays,
    };
    assert.equal(
      localTerms.complianceSnapshot.localCoverage,
      "reviewed-overlay-applied",
    );
    assert.ok(
      localTerms.complianceSnapshot.overlays.some(
        (overlay) => overlay.id === localCase.overlayId,
      ),
    );

    const sourceItems = await seedVerifiedComplianceSources(db, localTerms);
    const localSources = sourceItems.filter(
      (sourceItem) => sourceItem.scope === "city",
    );
    assert.deepEqual(
      localSources.map((sourceItem) => sourceItem.jurisdiction),
      [localCase.overlayId],
    );
    const [localSource] = localSources;
    await db
      .prepare("DELETE FROM compliance_source_checks WHERE source_key = ?")
      .bind(localSource.key)
      .run();

    const proposalBody = {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms: localTerms,
    };
    const blocked = await worker.fetch(
      request("/api/negotiations", "POST", proposalBody),
      env,
    );
    assert.equal(blocked.status, 503);
    assert.equal(
      (await blocked.json()).sourceStatus.find(
        (sourceItem) => sourceItem.key === localSource.key,
      ).status,
      "pending",
    );

    await seedVerifiedComplianceSources(db, localTerms);
    const created = await worker.fetch(
      request("/api/negotiations", "POST", proposalBody),
      env,
    );
    assert.equal(created.status, 201);
  }
});

test("actual compliance events require confirmation by the other agreement side", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: newYorkResearchTerms,
      }),
      {
        DB: db,
        ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      },
    ),
  );
  await finalizeWithoutArbiter(db, created);
  const occurredAt = new Date().toISOString();
  const unrelatedEvent = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "propose_compliance_event",
      eventName: "damageListReceivedAt",
      occurredAt,
    },
  );
  assert.equal(unrelatedEvent.status, 400);

  for (const invalidOccurredAt of [
    occurredAt.slice(0, 19),
    "2026-02-29T12:00:00Z",
    "2026-07-31T24:00:00Z",
  ]) {
    const invalidEvent = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "propose_compliance_event",
        eventName: "possessionReturnedAt",
        occurredAt: invalidOccurredAt,
      },
    );
    assert.equal(invalidEvent.status, 400);
    assert.equal(
      (await invalidEvent.json()).error,
      "Enter a complete, possible event date and time with its timezone.",
    );
  }

  const proposed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "propose_compliance_event",
      eventName: "possessionReturnedAt",
      occurredAt,
      note: "Keys and possession returned.",
    }),
  );
  const proposalEvent = proposed.events.at(-1);
  assert.equal(proposalEvent.action, "compliance_event_proposed");

  const selfConfirmation = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "confirm_compliance_event",
      proposalEventId: proposalEvent.id,
    },
  );
  assert.equal(selfConfirmation.status, 409);

  const confirmed = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "confirm_compliance_event",
      proposalEventId: proposalEvent.id,
    }),
  );
  assert.equal(confirmed.events.at(-1).action, "compliance_event_confirmed");
  assert.equal(
    confirmed.events.at(-1).metadata.occurredAt,
    new Date(occurredAt).toISOString(),
  );
});

test("versioned state claim packets enforce the stored address-routed checklist", async () => {
  const db = new TestD1();
  const californiaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "CA",
  );
  const unsignedAddress = {
    ...unsignedNewYorkAddressResolution,
    providerFeatureId: "W:california-claim",
    label: "1 Market Street, San Francisco, CA 94105",
    stateCode: "CA",
    city: "San Francisco",
    county: "San Francisco County",
    postalCode: "94105",
    latitude: 37.7936,
    longitude: -122.3958,
  };
  const californiaAddress = {
    ...unsignedAddress,
    attestation: await createAddressAttestation(
      unsignedAddress,
      TEST_ADDRESS_ATTESTATION_SECRET,
    ),
  };
  const californiaFacts = {
    ...newYorkComplianceFacts,
    housingProgram: "conventional",
  };
  const californiaTerms = {
    ...terms,
    jurisdiction: californiaProfile.code,
    policyVersion: californiaProfile.version,
    propertyAddress: californiaAddress.label,
    addressResolution: californiaAddress,
    complianceFacts: californiaFacts,
    complianceSnapshot: buildComplianceSnapshot(
      californiaProfile,
      californiaAddress,
      { facts: californiaFacts },
    ),
    claimDays: californiaProfile.defaultClaimDays,
  };
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: californiaTerms,
      }),
      {
        DB: db,
        ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      },
    ),
  );
  await finalizeWithoutArbiter(db, created);
  const claimBody = {
    type: "claim_submitted",
    amount: "100",
    category: "Damage beyond ordinary wear",
    items: [
      {
        category: "11",
        description: "Documented door repair",
        amount: "100",
      },
    ],
    note: "",
    evidenceUri: "openescrow://evidence/california-packet",
    evidenceHash: `0x${"b".repeat(64)}`,
    transactionHash: `0x${"c".repeat(64)}`,
  };
  const incomplete = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      ...claimBody,
      claimConfirmations: {
        attestations: {
          "itemized-statement": true,
          "supporting-documents": true,
          "ordinary-wear-excluded": true,
        },
      },
    },
  );
  assert.equal(incomplete.status, 400);

  const requiredIds = californiaTerms.complianceSnapshot.claimPolicy
    .commonAttestations
    .concat(
      californiaTerms.complianceSnapshot.claimPolicy.stateAttestations,
    )
    .map((attestation) => attestation.id);
  const claimed = await jsonResponse(
    await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        ...claimBody,
        claimConfirmations: {
          attestations: Object.fromEntries(
            requiredIds.map((attestationId) => [attestationId, true]),
          ),
        },
      },
    ),
  );
  assert.equal(claimed.events.at(-1).action, "deduction_claim_submitted");
  assert.equal(
    claimed.events.at(-1).metadata.policyVersion,
    californiaProfile.version,
  );
  assert.equal(
    claimed.events.at(-1).metadata.claimConfirmations.attestations[
      "ca-post-repair-photos"
    ],
    true,
  );
  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  const reportHtml = await report.text();
  assert.match(reportHtml, /Versioned claim packet/);
  assert.match(reportHtml, /Recorded claim attestations/);
  assert.match(reportHtml, /pre-repair/i);
});

test("conditional state facts require confirmation by the other agreement side", async () => {
  const db = new TestD1();
  const floridaProfile = US_JURISDICTION_PROFILES.find(
    (profile) => profile.postalCode === "FL",
  );
  const unsignedAddress = {
    ...unsignedNewYorkAddressResolution,
    providerFeatureId: "W:florida",
    label: "1 Ocean Drive, Miami Beach, FL 33139",
    stateCode: "FL",
    city: "Miami Beach",
    county: "Miami-Dade County",
    postalCode: "33139",
    latitude: 25.7907,
    longitude: -80.13,
  };
  const floridaAddress = {
    ...unsignedAddress,
    attestation: await createAddressAttestation(
      unsignedAddress,
      TEST_ADDRESS_ATTESTATION_SECRET,
    ),
  };
  const floridaFacts = {
    ...newYorkComplianceFacts,
    housingProgram: "conventional",
  };
  const floridaTerms = {
    ...terms,
    jurisdiction: floridaProfile.code,
    policyVersion: floridaProfile.version,
    propertyAddress: floridaAddress.label,
    addressResolution: floridaAddress,
    complianceFacts: floridaFacts,
    complianceSnapshot: buildComplianceSnapshot(
      floridaProfile,
      floridaAddress,
      { facts: floridaFacts },
    ),
    claimDays: floridaProfile.defaultClaimDays,
  };
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: floridaTerms,
      }),
      {
        DB: db,
        ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      },
    ),
  );
  await finalizeWithoutArbiter(db, created);

  const invalid = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "propose_compliance_fact",
      factName: "qualifyingCondemnation",
      value: true,
    },
  );
  assert.equal(invalid.status, 400);

  const firstProposal = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "propose_compliance_fact",
      factName: "landlordClaimsDeposit",
      value: false,
    }),
  );
  const firstProposalEvent = firstProposal.events.at(-1);
  const rejected = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "reject_compliance_fact",
      proposalEventId: firstProposalEvent.id,
    }),
  );
  assert.equal(rejected.events.at(-1).action, "compliance_fact_rejected");

  const proposed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "propose_compliance_fact",
      factName: "landlordClaimsDeposit",
      value: true,
      note: "A documented deduction claim was submitted.",
    }),
  );
  const proposalEvent = proposed.events.at(-1);
  assert.equal(proposalEvent.action, "compliance_fact_proposed");
  assert.equal(proposalEvent.metadata.value, true);

  const selfConfirmation = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "confirm_compliance_fact",
      proposalEventId: proposalEvent.id,
    },
  );
  assert.equal(selfConfirmation.status, 409);

  const confirmed = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "confirm_compliance_fact",
      proposalEventId: proposalEvent.id,
    }),
  );
  assert.equal(confirmed.events.at(-1).action, "compliance_fact_confirmed");
  assert.equal(
    confirmed.events.at(-1).metadata.factName,
    "landlordClaimsDeposit",
  );
  const lifecycleEvent = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "propose_compliance_event",
      eventName: "tenancyTerminatedAt",
      occurredAt: new Date().toISOString(),
    }),
  );
  const confirmedLifecycleEvent = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "confirm_compliance_event",
      proposalEventId: lifecycleEvent.events.at(-1).id,
    }),
  );
  const confirmedFacts = Object.fromEntries(
    confirmedLifecycleEvent.events
      .filter((event) => event.action === "compliance_fact_confirmed")
      .map((event) => [event.metadata.factName, event.metadata.value]),
  );
  const confirmedEvents = Object.fromEntries(
    confirmedLifecycleEvent.events
      .filter((event) => event.action === "compliance_event_confirmed")
      .map((event) => [event.metadata.eventName, event.metadata.occurredAt]),
  );
  const evaluated = evaluateComplianceSnapshot(
    created.record.terms.complianceSnapshot,
    {
      facts: confirmedFacts,
      events: confirmedEvents,
    },
  );
  assert.equal(
    evaluated.deadlines.find((deadline) => deadline.id === "claim-notice")
      .status,
    "scheduled",
  );
  assert.equal(
    evaluated.deadlines.find((deadline) => deadline.id === "no-claim-return")
      .applicability,
    "not-applicable",
  );
});

test("confirmed compliance events activate privacy-minimal deadline reminders", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: newYorkResearchTerms,
      }),
      {
        DB: db,
        ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
      },
    ),
  );
  await finalizeWithoutArbiter(db, created);
  const occurredAt = new Date();
  const proposed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "propose_compliance_event",
      eventName: "possessionReturnedAt",
      occurredAt: occurredAt.toISOString(),
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "confirm_compliance_event",
      proposalEventId: proposed.events.at(-1).id,
    }),
  );
  const preferenceTime = occurredAt.toISOString();
  await db
    .prepare(
      `INSERT INTO notification_preferences
       (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
       VALUES (?, ?, 0, 1, ?, ?)`,
    )
    .bind(
      "did:privy:compliance-landlord",
      "landlord@example.com",
      preferenceTime,
      preferenceTime,
    )
    .run();

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `compliance-${deliveries.length}` });
  };
  try {
    const waits = [];
    await worker.scheduled(
      {
        scheduledTime: occurredAt.getTime() + 11 * 24 * 60 * 60 * 1000,
      },
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
        PUBLIC_APP_URL: "https://openescrow.example/",
      },
      {
        waitUntil(promise) {
          waits.push(promise);
        },
      },
    );
    await Promise.all(waits);
    const complianceDelivery = deliveries.find((delivery) =>
      /compliance deadline/i.test(delivery.subject),
    );
    assert.ok(complianceDelivery);
    assert.deepEqual(complianceDelivery.to, ["landlord@example.com"]);
    assert.doesNotMatch(complianceDelivery.text, /Broadway|1200|New York County/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy California records stay readable and exportable but cannot be finalized", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  db.database
    .prepare("UPDATE agreement_negotiations SET terms_json = ? WHERE id = ?")
    .run(
      JSON.stringify(legacyCaliforniaTerms),
      created.record.id,
    );
  const readable = await jsonResponse(
    await worker.fetch(
      request(`/api/negotiations/${created.record.id}?token=${created.access.landlord}`),
      { DB: db },
    ),
  );
  assert.equal(readable.terms.jurisdiction, "us-ca");
  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(await report.text(), /California residential tenancy/);
  const response = await act(db, created.record.id, created.access.landlord, {
    type: "finalize",
    agreementId: "42",
    transactionHash: `0x${"a".repeat(64)}`,
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /does not match a current jurisdiction policy/);
});

test("a legacy California proposal can publish a new generic test revision", async () => {
  const db = new TestD1();
  const created = await create(db);
  db.database
    .prepare("UPDATE agreement_negotiations SET terms_json = ? WHERE id = ?")
    .run(JSON.stringify(legacyCaliforniaTerms), created.record.id);

  const revised = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "revise",
      summary: "Replaced the legacy jurisdiction rules with generic test terms.",
      terms: genericTerms,
    }),
  );
  assert.equal(revised.revision, 2);
  assert.equal(revised.terms.jurisdiction, "testnet-generic");
  assert.equal(revised.terms.policyVersion, "generic-test-v1");
});

test("the non-specific test profile accepts editable lifecycle timing", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms: genericTerms,
      }),
      { DB: db },
    ),
  );
  assert.equal(created.record.terms.jurisdiction, "testnet-generic");
  assert.equal(created.record.terms.claimDays, "45");
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const finalized = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "84",
      transactionHash: `0x${"b".repeat(64)}`,
    }),
  );
  assert.equal(finalized.status, "finalized");
});

test("address suggestions validate same-origin queries, normalize Photon results, and cache", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (input, init) => {
    upstreamCalls += 1;
    const url = new URL(input);
    assert.equal(url.origin, "https://geocoder.example");
    assert.equal(url.pathname, "/photon/api/");
    assert.equal(url.searchParams.get("q"), "123 Main Street");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(init.headers.accept, "application/json");
    return Response.json({
      features: [
        {
          geometry: { coordinates: [-118.2437, 34.0522] },
          properties: {
            osm_type: "W",
            osm_id: 123,
            housenumber: "123",
            street: "Main Street",
            city: "Los Angeles",
            state: "California",
            postcode: "90001",
            country: "United States",
          },
        },
        {
          geometry: { coordinates: [-118.24, 34.05] },
          properties: {
            osm_type: "W",
            osm_id: 124,
            street: "Main Street",
            city: "Los Angeles",
            state: "California",
            country: "United States",
          },
        },
        {
          geometry: { coordinates: [-118.25, 34.06] },
          properties: {
            osm_type: "R",
            osm_id: 125,
            name: "Los Angeles",
            city: "Los Angeles",
            state: "California",
            country: "United States",
          },
        },
        {
          geometry: { coordinates: [-79.38, 43.65] },
          properties: {
            osm_type: "W",
            osm_id: 126,
            housenumber: "123",
            street: "King Street",
            city: "Toronto",
            state: "Ontario",
            postcode: "M5V 1J2",
            country: "Canada",
            countrycode: "CA",
          },
        },
        {
          geometry: { coordinates: [-118.26, 34.07] },
          properties: {
            osm_type: "W",
            osm_id: 127,
            housenumber: "123",
            street: "Unknown Street",
            city: "Los Angeles",
            state: "Unknown State",
            statecode: "ZZ",
            postcode: "90001",
            country: "United States",
            countrycode: "US",
          },
        },
        {
          geometry: { coordinates: [-118.27, 34.08] },
          properties: {
            osm_type: "W",
            osm_id: 123,
            housenumber: "125",
            street: "Main Street",
            city: "Los Angeles",
            state: "California",
            postcode: "90001",
            country: "United States",
          },
        },
        {
          geometry: { coordinates: [-118.28, 34.09] },
          properties: {
            osm_type: "W",
            osm_id: 128,
            housenumber: "123",
            street: "Missing Postal Street",
            city: "Los Angeles",
            state: "California",
            country: "United States",
          },
        },
        {
          geometry: { coordinates: [-118.29, 34.1] },
          properties: {
            osm_type: "W",
            osm_id: 129,
            housenumber: "123",
            street: "Mismatch Street",
            city: "Los Angeles",
            state: "California",
            statecode: "NV",
            postcode: "90001",
            country: "United States",
            countrycode: "US",
          },
        },
        {
          geometry: { coordinates: [-118.3, 34.11] },
          properties: {
            osm_type: "W",
            osm_id: 130,
            housenumber: "123",
            street: "Country Mismatch Street",
            city: "Los Angeles",
            state: "California",
            postcode: "90001",
            country: "Canada",
            countrycode: "US",
          },
        },
        {
          geometry: { coordinates: [999, 999] },
          properties: { name: "Invalid coordinates" },
        },
      ],
    });
  };
  try {
    const env = {
      GEOCODER_BASE_URL: "https://geocoder.example/photon",
      ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
    };
    const first = await worker.fetch(
      request("/api/address-suggestions?q=123%20Main%20Street"),
      env,
    );
    const firstBody = await jsonResponse(first);
    assert.equal(firstBody.suggestions.length, 1);
    const { attestation, ...suggestion } = firstBody.suggestions[0];
    assert.deepEqual(suggestion, {
      id: "W:123",
      label: "123 Main Street, Los Angeles, California, 90001, United States",
      latitude: 34.0522,
      longitude: -118.2437,
      countryCode: "US",
      stateCode: "CA",
      city: "Los Angeles",
      county: null,
      postalCode: "90001",
    });
    assert.match(attestation, /^oeaddr1\.\d+\.[A-Za-z0-9_-]{43}$/);
    assert.equal(
      await verifyAddressAttestation(
        {
          provider: "photon-openstreetmap",
          providerFeatureId: suggestion.id,
          ...suggestion,
          attestation,
        },
        TEST_ADDRESS_ATTESTATION_SECRET,
      ),
      true,
    );
    assert.equal(firstBody.attribution.label, "© OpenStreetMap contributors");
    assert.equal(first.headers.get("x-openescrow-cache"), "MISS");

    const cached = await worker.fetch(
      request("/api/address-suggestions?q=%20123%20%20Main%20Street%20"),
      env,
    );
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get("x-openescrow-cache"), "HIT");
    assert.equal(upstreamCalls, 1);

    const shortQuery = await worker.fetch(
      request("/api/address-suggestions?q=12"),
      env,
    );
    assert.equal(shortQuery.status, 400);

    const crossOrigin = await worker.fetch(
      new Request(
        "https://openescrow.example/api/address-suggestions?q=123%20Main%20Street",
        { headers: { origin: "https://attacker.example" } },
      ),
      env,
    );
    assert.equal(crossOrigin.status, 403);
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("address suggestion upstream failures return an empty, attribution-safe response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("geocoder unavailable");
  };
  try {
    const response = await worker.fetch(
      request("/api/address-suggestions?q=456%20Failure%20Avenue"),
      { GEOCODER_BASE_URL: "https://offline-geocoder.example" },
    );
    const body = await jsonResponse(response);
    assert.deepEqual(body.suggestions, []);
    assert.equal(body.attribution.url, "https://www.openstreetmap.org/copyright");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenant names and email addresses are validated before a proposal is saved", async () => {
  const db = new TestD1();
  const invalidEmail = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry Tenant",
      tenantEmail: "tenant-at-example",
      arbiterName: "",
      arbiterEmail: null,
      terms,
    }),
    { DB: db },
  );
  assert.equal(invalidEmail.status, 400);
  assert.match((await invalidEmail.json()).error, /valid landlord and tenant email/);

  const incompleteName = await worker.fetch(
    request("/api/negotiations", "POST", {
      landlordName: "Lena Landlord",
      landlordEmail: "landlord@example.com",
      tenantName: "Terry",
      tenantEmail: "tenant@example.com",
      arbiterName: "",
      arbiterEmail: null,
      terms,
    }),
    { DB: db },
  );
  assert.equal(incompleteName.status, 400);
  assert.match((await incompleteName.json()).error, /first and last name/);
});

test("verified Privy accounts discover finalized landlord and tenant agreements", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "0",
      transactionHash: transactionHash(12),
    }),
  );
  const appId = "test-privy-app";
  const kid = "test-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const identityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
  );
  const tenantIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
  );
  const originalFetch = globalThis.fetch;
  let jwksFetchCount = 0;
  globalThis.fetch = async (input) => {
    jwksFetchCount += 1;
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  try {
    const discovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(discovery.accesses.length, 1);
    assert.equal(discovery.accesses[0].proposalId, created.record.id);
    assert.equal(discovery.accesses[0].role, "landlord");
    assert.equal(discovery.accesses[0].archived, false);

    const archivedPreference = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "landlord",
            archived: true,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(archivedPreference.archived, true);

    const archivedDiscovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(archivedDiscovery.accesses[0].archived, true);

    let latestLandlordSession = archivedDiscovery.accesses[0];
    for (let index = 0; index < 4; index += 1) {
      const refresh = await jsonResponse(
        await worker.fetch(
          new Request("https://openescrow.example/api/negotiations/discover", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "privy-id-token": identityToken,
            },
            body: JSON.stringify({ role: "landlord" }),
          }),
          { DB: db, PRIVY_APP_ID: appId },
        ),
      );
      latestLandlordSession = refresh.accesses[0];
    }
    const staleSession = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${discovery.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(staleSession.status, 403);

    const recovered = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${latestLandlordSession.token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(recovered.landlordEmail, "landlord@example.com");
    assert.equal(recovered.status, "finalized");
    assert.equal(recovered.onchainAgreementId, "0");
    assert.equal(
      db.database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM negotiation_account_access
           WHERE negotiation_id = ? AND user_id = ? AND role = ?`,
        )
        .get(created.record.id, "did:privy:test-landlord", "landlord").count,
      5,
    );

    const tenantDiscovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": tenantIdentityToken,
          },
          body: JSON.stringify({ role: "tenant" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(tenantDiscovery.accesses.length, 1);
    assert.equal(tenantDiscovery.accesses[0].archived, false);
    let latestTenantSession = tenantDiscovery.accesses[0];
    for (let index = 0; index < 5; index += 1) {
      const refresh = await jsonResponse(
        await worker.fetch(
          new Request("https://openescrow.example/api/negotiations/discover", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "privy-id-token": tenantIdentityToken,
            },
            body: JSON.stringify({ role: "tenant" }),
          }),
          { DB: db, PRIVY_APP_ID: appId },
        ),
      );
      latestTenantSession = refresh.accesses[0];
    }
    const staleTenantSession = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${tenantDiscovery.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(staleTenantSession.status, 403);
    const tenantRecord = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${latestTenantSession.token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(tenantRecord.status, "finalized");
    assert.equal(tenantRecord.onchainAgreementId, "0");
    assert.equal(
      db.database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM negotiation_account_access access
           JOIN negotiation_account_access_context context
             ON context.token_hash = access.token_hash
           WHERE access.negotiation_id = ? AND access.user_id = ? AND access.role = ?`,
        )
        .get(created.record.id, "did:privy:test-landlord", "tenant").count,
      5,
    );

    const restoredPreference = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "landlord",
            archived: false,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(restoredPreference.archived, false);
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_record_archives WHERE negotiation_id = ?",
        )
        .get(created.record.id).count,
      0,
    );

    const savedPreferences = await jsonResponse(
      await worker.fetch(
        new Request(
          "https://openescrow.example/api/profile/notification-preferences",
          {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "privy-id-token": identityToken,
            },
            body: JSON.stringify({
              agreementActivity: true,
              deadlineReminders: true,
            }),
          },
        ),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(savedPreferences.agreementActivity, true);
    assert.ok(savedPreferences.consentedAt);

    const restoredPreferences = await jsonResponse(
      await worker.fetch(
        new Request(
          "https://openescrow.example/api/profile/notification-preferences",
          { headers: { "privy-id-token": identityToken } },
        ),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(restoredPreferences.deadlineReminders, true);
    assert.equal(restoredPreferences.consentedAt, savedPreferences.consentedAt);
    assert.equal(jwksFetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account discovery batches session writes for a larger property portfolio", async () => {
  const db = new CountingTestD1();
  const appId = "test-privy-portfolio-app";
  const kid = "test-portfolio-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const identityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "portfolio@example.com",
    { sub: "did:privy:portfolio-landlord" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });

  try {
    await worker.fetch(request("/api/system/readiness"), {
      DB: db,
      PRIVY_APP_ID: appId,
    });
    const insert = db.database.prepare(
      `INSERT INTO agreement_negotiations
       (id, created_at, updated_at, status, revision, terms_json,
        landlord_email, tenant_email, landlord_token_hash, tenant_token_hash)
       VALUES (?, ?, ?, 'finalized', 1, '{}', ?, ?, ?, ?)`,
    );
    for (let index = 0; index < 45; index += 1) {
      const suffix = String(index).padStart(2, "0");
      insert.run(
        `portfolio-${suffix}`,
        `2026-08-01T00:${suffix}:00.000Z`,
        `2026-08-01T00:${suffix}:00.000Z`,
        "portfolio@example.com",
        `tenant-${suffix}@example.com`,
        `landlord-hash-${suffix}`,
        `tenant-hash-${suffix}`,
      );
    }
    db.resetBatchMetrics();

    const discovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );

    assert.equal(discovery.accesses.length, 45);
    assert.equal(db.batchCalls, 3);
    assert.equal(db.maximumBatchSize, 40);
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE user_id = ?",
        )
        .get("did:privy:portfolio-landlord").count,
      45,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: verified arbiter discovery is isolated and survives link rotation", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "Avery Arbiter",
        arbiterEmail: "arbiter@example.com",
        terms,
      }),
      { DB: db },
    ),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "27",
      transactionHash: transactionHash(27),
    }),
  );

  const appId = "test-privy-arbiter-app";
  const kid = "test-arbiter-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const arbiterIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "arbiter@example.com",
    { sub: "did:privy:verified-arbiter" },
  );
  const unrelatedIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "unrelated@example.com",
    { sub: "did:privy:unrelated-arbiter" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  const discover = (identityToken, role = "arbiter") =>
    worker.fetch(
      new Request("https://openescrow.example/api/negotiations/discover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "privy-id-token": identityToken,
        },
        body: JSON.stringify({ role }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
  const setArchive = (identityToken, archived) =>
    worker.fetch(
      new Request("https://openescrow.example/api/profile/record-archives", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "privy-id-token": identityToken,
        },
        body: JSON.stringify({
          proposalId: created.record.id,
          role: "arbiter",
          archived,
        }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );

  try {
    const arbiterDiscovery = await jsonResponse(
      await discover(arbiterIdentityToken),
    );
    assert.equal(arbiterDiscovery.accesses.length, 1);
    assert.equal(arbiterDiscovery.accesses[0].proposalId, created.record.id);
    assert.equal(arbiterDiscovery.accesses[0].role, "arbiter");
    assert.equal(arbiterDiscovery.accesses[0].archived, false);

    const arbiterRecord = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${arbiterDiscovery.accesses[0].token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(arbiterRecord.status, "finalized");
    assert.equal(arbiterRecord.arbiterEmail, "arbiter@example.com");

    const unrelatedDiscovery = await jsonResponse(
      await discover(unrelatedIdentityToken),
    );
    assert.equal(unrelatedDiscovery.accesses.length, 0);
    const unrelatedAsLandlord = await jsonResponse(
      await discover(unrelatedIdentityToken, "landlord"),
    );
    assert.equal(unrelatedAsLandlord.accesses.length, 0);

    const unrelatedArchive = await setArchive(unrelatedIdentityToken, true);
    assert.equal(unrelatedArchive.status, 403);
    const archived = await jsonResponse(
      await setArchive(arbiterIdentityToken, true),
    );
    assert.equal(archived.archived, true);
    const archivedDiscovery = await jsonResponse(
      await discover(arbiterIdentityToken),
    );
    assert.equal(archivedDiscovery.accesses[0].archived, true);

    await jsonResponse(
      await worker.fetch(
        request(`/api/negotiations/${created.record.id}/arbiter`, "POST", {
          token: created.access.landlord,
        }),
        { DB: db },
      ),
    );
    for (const priorSession of [
      arbiterDiscovery.accesses[0].token,
      archivedDiscovery.accesses[0].token,
    ]) {
      const invalidated = await worker.fetch(
        request(`/api/negotiations/${created.record.id}?token=${priorSession}`),
        { DB: db },
      );
      assert.equal(invalidated.status, 403);
    }

    const rediscovered = await jsonResponse(
      await discover(arbiterIdentityToken),
    );
    assert.equal(rediscovered.accesses.length, 1);
    assert.equal(rediscovered.accesses[0].archived, true);
    const recovered = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${rediscovered.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(recovered.status, 200);

    const restored = await jsonResponse(
      await setArchive(arbiterIdentityToken, false),
    );
    assert.equal(restored.archived, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: a verified account can contain its record sessions without affecting other parties", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);

  const appId = "test-privy-session-containment-app";
  const kid = "test-session-containment-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const landlordIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
    { sub: "did:privy:containment-landlord" },
  );
  const tenantIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
    { sub: "did:privy:containment-tenant" },
  );
  const unrelatedIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "unrelated@example.com",
    { sub: "did:privy:containment-unrelated" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  const discover = (identityToken, role) =>
    worker.fetch(
      new Request("https://openescrow.example/api/negotiations/discover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "privy-id-token": identityToken,
        },
        body: JSON.stringify({ role }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
  const revoke = (identityToken, headers = {}) =>
    worker.fetch(
      new Request(
        "https://openescrow.example/api/profile/account-sessions/revoke",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
            ...headers,
          },
        },
      ),
      { DB: db, PRIVY_APP_ID: appId },
    );

  try {
    const firstLandlordDiscovery = await jsonResponse(
      await discover(landlordIdentityToken, "landlord"),
    );
    const secondLandlordDiscovery = await jsonResponse(
      await discover(landlordIdentityToken, "landlord"),
    );
    const tenantDiscovery = await jsonResponse(
      await discover(tenantIdentityToken, "tenant"),
    );
    assert.equal(firstLandlordDiscovery.accesses.length, 1);
    assert.equal(secondLandlordDiscovery.accesses.length, 1);
    assert.equal(tenantDiscovery.accesses.length, 1);

    const crossOrigin = await revoke(landlordIdentityToken, {
      origin: "https://attacker.example",
    });
    assert.equal(crossOrigin.status, 403);
    const crossSiteWithoutOrigin = await revoke(landlordIdentityToken, {
      "sec-fetch-site": "cross-site",
    });
    assert.equal(crossSiteWithoutOrigin.status, 403);
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE user_id = ?",
        )
        .get("did:privy:containment-landlord").count,
      2,
    );

    const unrelated = await jsonResponse(
      await revoke(unrelatedIdentityToken),
    );
    assert.equal(unrelated.revokedSessions, 0);
    const landlordStillAuthorized = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${firstLandlordDiscovery.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(landlordStillAuthorized.status, 200);

    const contained = await jsonResponse(
      await revoke(landlordIdentityToken),
    );
    assert.equal(contained.revoked, true);
    assert.equal(contained.revokedSessions, 2);
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE user_id = ?",
        )
        .get("did:privy:containment-landlord").count,
      0,
    );
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE user_id = ?",
        )
        .get("did:privy:containment-tenant").count,
      1,
    );

    for (const priorSession of [
      firstLandlordDiscovery.accesses[0].token,
      secondLandlordDiscovery.accesses[0].token,
    ]) {
      const ended = await worker.fetch(
        request(`/api/negotiations/${created.record.id}?token=${priorSession}`),
        { DB: db },
      );
      assert.equal(ended.status, 403);
    }
    const tenantUnaffected = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${tenantDiscovery.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(tenantUnaffected.status, 200);
    const landlordInvitationUnaffected = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.landlord}`,
      ),
      { DB: db },
    );
    assert.equal(landlordInvitationUnaffected.status, 200);

    const rediscovered = await jsonResponse(
      await discover(landlordIdentityToken, "landlord"),
    );
    assert.equal(rediscovered.accesses.length, 1);
    const recovered = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${rediscovered.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(recovered.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: account data inventory is role-isolated and contains no access secrets", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const pending = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Priya Pending",
        tenantEmail: "pending-tenant@example.com",
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  const evidencePlaintext = "%PDF-1.7\nprivate privacy-request invoice";
  const evidenceFilename = "privacy-request-invoice.pdf";
  const evidenceKeyId = "privacy-request-key";
  const evidenceKey = Buffer.alloc(32, 41).toString("base64");
  const evidenceForm = new FormData();
  evidenceForm.set("proposalId", created.record.id);
  evidenceForm.set("token", created.access.landlord);
  evidenceForm.set(
    "file",
    new File([evidencePlaintext], evidenceFilename, {
      type: "application/pdf",
    }),
  );
  const uploadedEvidence = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: evidenceForm,
      }),
      {
        DB: db,
        EVIDENCE: evidence,
        EVIDENCE_ENCRYPTION_KEY: evidenceKey,
        EVIDENCE_ENCRYPTION_KEY_ID: evidenceKeyId,
      },
    ),
  );
  const evidenceMetadata = await db
    .prepare(
      `SELECT object_key, original_name, sha256, encryption_key_id
       FROM evidence_files
       WHERE id = ?`,
    )
    .bind(uploadedEvidence.cid)
    .first();
  assert.equal(evidenceMetadata.original_name, evidenceFilename);
  assert.equal(evidenceMetadata.encryption_key_id, evidenceKeyId);
  const [storedEvidence] = evidence.objects.values();
  assert.equal(
    new TextDecoder().decode(storedEvidence.bytes).includes(evidencePlaintext),
    false,
  );

  const appId = "test-privy-data-inventory-app";
  const kid = "test-data-inventory-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const landlordIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
    { sub: "did:privy:inventory-landlord" },
  );
  const tenantIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
    { sub: "did:privy:inventory-tenant" },
  );
  const unrelatedIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "unrelated@example.com",
    { sub: "did:privy:inventory-unrelated" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  const discover = (identityToken, role) =>
    worker.fetch(
      new Request("https://openescrow.example/api/negotiations/discover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "privy-id-token": identityToken,
        },
        body: JSON.stringify({ role }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
  const inventory = (identityToken, headers = {}) =>
    worker.fetch(
      new Request("https://openescrow.example/api/profile/data-inventory", {
        headers: {
          "privy-id-token": identityToken,
          ...headers,
        },
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
  const revoke = (identityToken) =>
    worker.fetch(
      new Request(
        "https://openescrow.example/api/profile/account-sessions/revoke",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
        },
      ),
      { DB: db, PRIVY_APP_ID: appId },
    );

  try {
    const landlordDiscovery = await jsonResponse(
      await discover(landlordIdentityToken, "landlord"),
    );
    const tenantDiscovery = await jsonResponse(
      await discover(tenantIdentityToken, "tenant"),
    );
    assert.equal(landlordDiscovery.accesses.length, 2);
    assert.equal(tenantDiscovery.accesses.length, 1);
    await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": landlordIdentityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "landlord",
            archived: true,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    await jsonResponse(
      await worker.fetch(
        new Request(
          "https://openescrow.example/api/profile/notification-preferences",
          {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "privy-id-token": landlordIdentityToken,
            },
            body: JSON.stringify({
              agreementActivity: true,
              deadlineReminders: false,
            }),
          },
        ),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );

    const landlordInventory = await jsonResponse(
      await inventory(landlordIdentityToken),
    );
    assert.equal(landlordInventory.schema, "openescrow.account-data-inventory.v1");
    assert.equal(landlordInventory.verifiedEmailCount, 1);
    assert.equal(landlordInventory.records.length, 2);
    const landlordRecords = new Map(
      landlordInventory.records.map((record) => [record.proposalId, record]),
    );
    assert.deepEqual(
      {
        proposalId: landlordRecords.get(created.record.id).proposalId,
        role: landlordRecords.get(created.record.id).role,
        status: landlordRecords.get(created.record.id).status,
        archived: landlordRecords.get(created.record.id).archived,
      },
      {
        proposalId: created.record.id,
        role: "landlord",
        status: "finalized",
        archived: true,
      },
    );
    assert.deepEqual(
      {
        proposalId: landlordRecords.get(pending.record.id).proposalId,
        role: landlordRecords.get(pending.record.id).role,
        status: landlordRecords.get(pending.record.id).status,
        archived: landlordRecords.get(pending.record.id).archived,
      },
      {
        proposalId: pending.record.id,
        role: "landlord",
        status: "draft",
        archived: false,
      },
    );
    assert.equal(landlordInventory.accountSettings.activeRecordSessions, 2);
    assert.equal(landlordInventory.accountSettings.archivedRecordPreferences, 1);
    assert.equal(
      landlordInventory.accountSettings.notificationPreferences.agreementActivity,
      true,
    );
    assert.equal(
      landlordInventory.accountSettings.notificationPreferences.deadlineReminders,
      false,
    );
    assert.ok(
      landlordInventory.accountSettings.notificationPreferences.consentedAt,
    );
    assert.deepEqual(landlordInventory.boundaries, {
      includesPrivateEvidence: false,
      includesInvitationOrSessionTokens: false,
      includesOtherParticipantDetails: false,
      deletesOrChangesData: false,
      publicBlockchainRecordsCanBeErased: false,
    });
    const serialized = JSON.stringify(landlordInventory);
    for (const [label, privateValue] of [
      ["requesting email", "landlord@example.com"],
      ["finalized tenant email", "tenant@example.com"],
      ["draft tenant email", "pending-tenant@example.com"],
      ["finalized tenant name", "Terry Tenant"],
      ["draft tenant name", "Priya Pending"],
      ["property address", "123 Main"],
      ["agreement wallet", "0x1111111111111111111111111111111111111111"],
      ["finalized landlord invitation", created.access.landlord],
      ["finalized tenant invitation", created.access.tenant],
      ["draft landlord invitation", pending.access.landlord],
      ["draft tenant invitation", pending.access.tenant],
      ["first landlord account session", landlordDiscovery.accesses[0].token],
      ["second landlord account session", landlordDiscovery.accesses[1].token],
      ["tenant account session", tenantDiscovery.accesses[0].token],
      ["evidence identifier", uploadedEvidence.cid],
      ["evidence URI", uploadedEvidence.uri],
      ["evidence gateway URL", uploadedEvidence.gatewayUrl],
      ["evidence upload digest", uploadedEvidence.sha256],
      ["evidence object key", evidenceMetadata.object_key],
      ["evidence filename", evidenceMetadata.original_name],
      ["evidence stored digest", evidenceMetadata.sha256],
      ["evidence encryption key ID", evidenceMetadata.encryption_key_id],
      ["evidence plaintext", evidencePlaintext],
      ["evidence storage kind", "encrypted-r2"],
    ]) {
      assert.equal(
        serialized.includes(privateValue),
        false,
        `inventory exposed ${label}`,
      );
    }

    const tenantInventory = await jsonResponse(
      await inventory(tenantIdentityToken),
    );
    assert.equal(tenantInventory.records.length, 1);
    assert.equal(tenantInventory.records[0].role, "tenant");
    assert.equal(tenantInventory.records[0].archived, false);
    assert.equal(
      tenantInventory.accountSettings.notificationPreferences,
      null,
    );

    const unrelatedInventory = await jsonResponse(
      await inventory(unrelatedIdentityToken),
    );
    assert.equal(unrelatedInventory.records.length, 0);
    assert.equal(unrelatedInventory.accountSettings.activeRecordSessions, 0);

    const crossOrigin = await inventory(landlordIdentityToken, {
      origin: "https://attacker.example",
    });
    assert.equal(crossOrigin.status, 403);
    const crossSiteWithoutOrigin = await inventory(landlordIdentityToken, {
      "sec-fetch-site": "cross-site",
    });
    assert.equal(crossSiteWithoutOrigin.status, 403);
    assert.equal(
      db.database
        .prepare("SELECT COUNT(*) AS count FROM negotiation_account_access")
        .get().count,
      3,
    );

    const contained = await jsonResponse(await revoke(landlordIdentityToken));
    assert.equal(contained.revokedSessions, 2);
    const inventoryAfterContainment = await jsonResponse(
      await inventory(landlordIdentityToken),
    );
    assert.equal(
      inventoryAfterContainment.accountSettings.activeRecordSessions,
      0,
    );
    assert.equal(
      inventoryAfterContainment.accountSettings.archivedRecordPreferences,
      1,
    );
    assert.deepEqual(
      inventoryAfterContainment.accountSettings.notificationPreferences,
      landlordInventory.accountSettings.notificationPreferences,
    );
    assert.equal(inventoryAfterContainment.records.length, 2);
    assert.equal(
      inventoryAfterContainment.records.find(
        (record) => record.proposalId === created.record.id,
      ).archived,
      true,
    );

    for (const priorSession of landlordDiscovery.accesses) {
      const ended = await worker.fetch(
        request(
          `/api/negotiations/${priorSession.proposalId}?token=${priorSession.token}`,
        ),
        { DB: db },
      );
      assert.equal(ended.status, 403);
    }
    const tenantUnaffected = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${tenantDiscovery.accesses[0].token}`,
      ),
      { DB: db },
    );
    assert.equal(tenantUnaffected.status, 200);
    const invitationUnaffected = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.landlord}`,
      ),
      { DB: db },
    );
    assert.equal(invitationUnaffected.status, 200);
    const evidenceUnaffected = await worker.fetch(
      evidenceDownloadRequest(
        uploadedEvidence.gatewayUrl,
        created.access.landlord,
      ),
      {
        DB: db,
        EVIDENCE: evidence,
        EVIDENCE_ENCRYPTION_KEY: evidenceKey,
        EVIDENCE_ENCRYPTION_KEY_ID: evidenceKeyId,
      },
    );
    assert.equal(evidenceUnaffected.status, 200);
    assert.equal(await evidenceUnaffected.text(), evidencePlaintext);

    const rediscovered = await jsonResponse(
      await discover(landlordIdentityToken, "landlord"),
    );
    assert.equal(rediscovered.accesses.length, 2);
    const recoveredSession = rediscovered.accesses.find(
      (access) => access.proposalId === created.record.id,
    );
    const recoveredRecord = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${recoveredSession.token}`,
      ),
      { DB: db },
    );
    assert.equal(recoveredRecord.status, 200);
    const recoveredInventory = await jsonResponse(
      await inventory(landlordIdentityToken),
    );
    assert.equal(recoveredInventory.accountSettings.activeRecordSessions, 2);
    assert.equal(
      recoveredInventory.accountSettings.archivedRecordPreferences,
      1,
    );
    assert.deepEqual(
      recoveredInventory.accountSettings.notificationPreferences,
      landlordInventory.accountSettings.notificationPreferences,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signed-in discovery rejects expired, future-dated, overly long-lived, wrong-audience, and forged identity tokens", async () => {
  const db = new TestD1();
  const created = await create(db);
  const appId = "test-privy-rejection-app";
  const kid = "test-rejection-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const attackerKeyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const invalidTokens = [
    await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
      { exp: now - 1 },
    ),
    await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
      { aud: "another-privy-app" },
    ),
    await identityTokenFor(
      attackerKeyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
    ),
    await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
      { exp: now + 24 * 60 * 60 + 1 },
    ),
    await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
      { iat: now + 120 },
    ),
    await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "landlord@example.com",
      { nbf: now + 120 },
    ),
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  try {
    for (const identityToken of invalidTokens) {
      const response = await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      );
      assert.equal(response.status, 401);
      assert.match((await response.json()).error, /could not be verified/);
    }
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE negotiation_id = ?",
        )
        .get(created.record.id).count,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Privy key discovery rejects an oversized streamed response", async () => {
  const db = new TestD1();
  const appId = "test-privy-oversized-jwks-app";
  const kid = "test-oversized-jwks-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const identityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ keys: [], padding: "x".repeat(128 * 1024) }), {
      headers: { "content-type": "application/json" },
    });
  try {
    const response = await worker.fetch(
      new Request("https://openescrow.example/api/negotiations/discover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "privy-id-token": identityToken,
        },
        body: JSON.stringify({ role: "landlord" }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /temporarily unavailable/);
    assert.equal(
      db.database
        .prepare("SELECT COUNT(*) AS count FROM negotiation_account_access")
        .get().count,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: archive and restore permissions are isolated by signed-in account", async () => {
  const db = new TestD1();
  const created = await create(db);
  const appId = "test-privy-separate-accounts-app";
  const kid = "test-separate-accounts-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const landlordIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
    { sub: "did:privy:separate-landlord" },
  );
  const tenantIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
    { sub: "did:privy:separate-tenant" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };
  try {
    const landlordDiscovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": landlordIdentityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(landlordDiscovery.accesses.length, 1);
    assert.equal(landlordDiscovery.accesses[0].role, "landlord");

    const landlordAsTenant = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": landlordIdentityToken,
          },
          body: JSON.stringify({ role: "tenant" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(landlordAsTenant.accesses.length, 0);

    const tenantDiscovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": tenantIdentityToken,
          },
          body: JSON.stringify({ role: "tenant" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(tenantDiscovery.accesses.length, 1);
    assert.equal(tenantDiscovery.accesses[0].role, "tenant");

    const tenantDiscoveryAsLandlord = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": tenantIdentityToken,
          },
          body: JSON.stringify({ role: "landlord" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(tenantDiscoveryAsLandlord.accesses.length, 0);

    const tenantArchiveByLandlord = await worker.fetch(
      new Request("https://openescrow.example/api/profile/record-archives", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "privy-id-token": landlordIdentityToken,
        },
        body: JSON.stringify({
          proposalId: created.record.id,
          role: "tenant",
          archived: true,
        }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
    assert.equal(tenantArchiveByLandlord.status, 403);
    assert.match((await tenantArchiveByLandlord.json()).error, /cannot change that agreement/);

    const landlordArchiveByTenant = await worker.fetch(
      new Request("https://openescrow.example/api/profile/record-archives", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "privy-id-token": tenantIdentityToken,
        },
        body: JSON.stringify({
          proposalId: created.record.id,
          role: "landlord",
          archived: true,
        }),
      }),
      { DB: db, PRIVY_APP_ID: appId },
    );
    assert.equal(landlordArchiveByTenant.status, 403);
    assert.match((await landlordArchiveByTenant.json()).error, /cannot change that agreement/);

    const landlordArchive = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": landlordIdentityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "landlord",
            archived: true,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(landlordArchive.archived, true);

    const tenantArchive = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": tenantIdentityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "tenant",
            archived: true,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(tenantArchive.archived, true);

    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE negotiation_id = ? AND user_id = ? AND role = ?",
        )
        .get(created.record.id, "did:privy:separate-landlord", "landlord").count,
      1,
    );
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE negotiation_id = ? AND user_id = ? AND role = ?",
        )
        .get(created.record.id, "did:privy:separate-tenant", "tenant").count,
      1,
    );
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_record_archives WHERE user_id = ? AND negotiation_id = ? AND role = ?",
        )
        .get("did:privy:separate-landlord", created.record.id, "landlord").count,
      1,
    );
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_record_archives WHERE user_id = ? AND negotiation_id = ? AND role = ?",
        )
        .get("did:privy:separate-tenant", created.record.id, "tenant").count,
      1,
    );

    const landlordRestore = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": landlordIdentityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "landlord",
            archived: false,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(landlordRestore.archived, false);

    const tenantRestore = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/record-archives", {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "privy-id-token": tenantIdentityToken,
          },
          body: JSON.stringify({
            proposalId: created.record.id,
            role: "tenant",
            archived: false,
          }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(tenantRestore.archived, false);
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_record_archives WHERE negotiation_id = ?",
        )
        .get(created.record.id).count,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("email readiness and the signed-in self-test work with Resend and a webhook provider", async () => {
  const db = new TestD1();
  const appId = "test-privy-email-app";
  const kid = "test-email-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const identityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
  );
  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url === `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`) {
      return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
    }
    if (url === "https://rpc.example/") {
      const payload = JSON.parse(options.body);
      if (payload.method === "eth_chainId") {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: "0x14a34",
        });
      }
      assert.equal(payload.method, "eth_call");
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: `0x${"0".repeat(24)}f18bfdbfd3ff84c603cbdf895d2a96ac7260ae99`,
      });
    }
    if (url === "https://mismatched-rpc.example/") {
      const payload = JSON.parse(options.body);
      if (payload.method === "eth_chainId") {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          result: "0x14a34",
        });
      }
      assert.equal(payload.method, "eth_call");
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: `0x${"0".repeat(24)}83fabc39c4fcccb6a4e42c568e9750d1a24ff11f`,
      });
    }
    if (url === "https://wrong-chain-rpc.example/") {
      const payload = JSON.parse(options.body);
      assert.equal(payload.method, "eth_chainId");
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: "0x1",
      });
    }
    deliveries.push({
      url,
      body: JSON.parse(options.body),
      authorization: options.headers.authorization,
    });
    return Response.json({ id: `email-test-${deliveries.length}` });
  };
  try {
    const resendEnv = {
      DB: db,
      PRIVY_APP_ID: appId,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      BASE_SEPOLIA_RPC_URL: "https://rpc.example/",
      ADDRESS_ATTESTATION_SECRET: TEST_ADDRESS_ATTESTATION_SECRET,
    };
    const readiness = await jsonResponse(
      await worker.fetch(
        request("/api/system/readiness"),
        resendEnv,
      ),
    );
    assert.deepEqual(readiness.release, {
      schemaVersion: "openescrow-release/v1",
      commitSha: null,
    });
    assert.equal(readiness.email.configured, true);
    assert.equal(readiness.email.provider, "resend");
    assert.equal(readiness.evidence.contentTypeValidation, true);
    assert.equal(readiness.recordIntegrity.lifecycleStateGuards, true);
    assert.equal(readiness.recordIntegrity.activityRegistry.ready, true);
    assert.equal(readiness.addressValidation.configured, true);
    assert.equal(readiness.addressValidation.tamperResistantProfiles, true);
    assert.equal(readiness.email.schedulerConfigured, true);
    assert.equal(readiness.email.schedulerHealthy, false);
    assert.equal(readiness.email.schedulerExpectedIntervalMinutes, 15);
    assert.equal(readiness.email.schedulerAgeMinutes, null);
    assert.equal(
      readiness.recordIntegrity.activityRegistry.boundEscrowAddress,
      "0xf18bfdbfd3ff84c603cbdf895d2a96ac7260ae99",
    );
    assert.equal(readiness.complianceSources.configured, false);
    assert.ok(readiness.complianceSources.total >= 57);
    assert.equal(
      readiness.recordIntegrity.transactionReceiptVerification,
      true,
    );
    const mismatchedReadiness = await jsonResponse(
      await worker.fetch(
        request("/api/system/readiness"),
        {
          ...resendEnv,
          BASE_SEPOLIA_RPC_URL: "https://mismatched-rpc.example/",
        },
      ),
    );
    assert.equal(
      mismatchedReadiness.recordIntegrity.activityRegistry.ready,
      false,
    );
    assert.equal(
      mismatchedReadiness.recordIntegrity.activityRegistry.error,
      "The activity registry is not bound to the active OpenEscrow release.",
    );
    const wrongChainReadiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), {
        ...resendEnv,
        BASE_SEPOLIA_RPC_URL: "https://wrong-chain-rpc.example/",
      }),
    );
    assert.equal(
      wrongChainReadiness.recordIntegrity.activityRegistry.ready,
      false,
    );
    assert.equal(
      wrongChainReadiness.recordIntegrity.activityRegistry.error,
      "The configured receipt verifier does not report Base Sepolia.",
    );

    const testRequest = () =>
      new Request("https://openescrow.example/api/profile/test-email", {
        method: "POST",
        headers: { "privy-id-token": identityToken },
      });
    const first = await jsonResponse(
      await worker.fetch(testRequest(), resendEnv),
    );
    const duplicate = await jsonResponse(
      await worker.fetch(testRequest(), resendEnv),
    );
    assert.equal(first.sent, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].url, "https://api.resend.com/emails");
    assert.deepEqual(deliveries[0].body.to, ["tenant@example.com"]);

    const webhookDb = new TestD1();
    const webhookIdentity = await identityTokenFor(
      keyPair.privateKey,
      appId,
      kid,
      "webhook@example.com",
    );
    const webhookResponse = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/profile/test-email", {
          method: "POST",
          headers: { "privy-id-token": webhookIdentity },
        }),
        {
          DB: webhookDb,
          PRIVY_APP_ID: appId,
          EMAIL_WEBHOOK_URL: "https://mailer.example/send",
          EMAIL_WEBHOOK_TOKEN: "webhook-secret",
          NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
        },
      ),
    );
    assert.equal(webhookResponse.provider, "webhook");
    assert.equal(deliveries.at(-1).url, "https://mailer.example/send");
    assert.equal(deliveries.at(-1).authorization, "Bearer webhook-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("readiness tracks notification scheduler freshness against the 15-minute cadence", async () => {
  const now = Date.parse("2027-07-02T12:00:00.000Z");
  const freshDb = new TestD1();
  const staleDb = new TestD1();

  await jsonResponse(await worker.fetch(request("/api/system/readiness"), {
    DB: freshDb,
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
  }));
  await jsonResponse(await worker.fetch(request("/api/system/readiness"), {
    DB: staleDb,
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
  }));

  freshDb.prepare(
    "INSERT OR REPLACE INTO scheduled_job_runs (name, last_started_at) VALUES (?, ?)",
  ).bind("notification-reminders", new Date(now - 5 * 60 * 1000).toISOString()).run();
  staleDb.prepare(
    "INSERT OR REPLACE INTO scheduled_job_runs (name, last_started_at) VALUES (?, ?)",
  ).bind("notification-reminders", new Date(now - 45 * 60 * 1000).toISOString()).run();

  const env = {
    DB: freshDb,
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
  };

  const originalDateNow = Date.now;
  Date.now = () => now;
  try {
    const freshReadiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), env),
    );
    assert.equal(freshReadiness.email.schedulerConfigured, true);
    assert.equal(freshReadiness.email.schedulerHealthy, true);
    assert.equal(freshReadiness.email.schedulerAgeMinutes, 5);

    const staleReadiness = await jsonResponse(
      await worker.fetch(
        request("/api/system/readiness"),
        {
          ...env,
          DB: staleDb,
        },
      ),
    );
    assert.equal(staleReadiness.email.schedulerConfigured, true);
    assert.equal(staleReadiness.email.schedulerHealthy, false);
    assert.equal(staleReadiness.email.schedulerAgeMinutes, 45);
  } finally {
    Date.now = originalDateNow;
  }
});

test("readiness reports compliance monitor freshness and configuration", async () => {
  const now = Date.parse("2027-07-03T14:20:00.000Z");
  const db = new TestD1();
  const baseEnv = {
    DB: db,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
  };
  await jsonResponse(await worker.fetch(request("/api/system/readiness"), baseEnv));
  db.prepare(
    "INSERT OR REPLACE INTO scheduled_job_runs (name, last_started_at) VALUES (?, ?)",
  ).bind("compliance-source-monitor", new Date(now - 5 * 60 * 1000).toISOString())
    .run();

  const originalDateNow = Date.now;
  Date.now = () => now;
  try {
    const readiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), baseEnv),
    );
    assert.equal(readiness.complianceSources.configured, true);
    assert.equal(readiness.complianceSources.monitorHealthy, true);
    assert.equal(readiness.complianceSources.monitorExpectedIntervalMinutes, 1440);
    assert.equal(readiness.complianceSources.monitorCurrentIntervalMinutes, 15);
    assert.equal(readiness.complianceSources.bootstrapInProgress, true);
    assert.equal(readiness.complianceSources.monitorLastRunAgeMinutes, 5);
    assert.equal(readiness.complianceSources.ready, false);

    db.prepare(
      "INSERT OR REPLACE INTO scheduled_job_runs (name, last_started_at) VALUES (?, ?)",
    )
      .bind(
        "compliance-source-monitor",
        new Date(now - 65 * 60 * 1000).toISOString(),
      )
      .run();
    const staleReadiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), baseEnv),
    );
    assert.equal(staleReadiness.complianceSources.configured, true);
    assert.equal(staleReadiness.complianceSources.monitorHealthy, false);
    assert.equal(staleReadiness.complianceSources.monitorLastRunAgeMinutes, 65);
  } finally {
    Date.now = originalDateNow;
  }
});

test("the scheduled compliance monitor baselines a rotating official-source batch", async () => {
  const db = new TestD1();
  const originalFetch = globalThis.fetch;
  const checkedUrls = [];
  const officialSourceUrls = new Set(
    COMPLIANCE_SOURCE_REGISTRY.map((source) => source.url),
  );
  const complianceCheckCount = () =>
    checkedUrls.filter((url) => officialSourceUrls.has(url)).length;
  globalThis.fetch = async (input) => {
    checkedUrls.push(String(input));
    return new Response(`<html><body>${String(input)}</body></html>`, {
      status: 200,
      headers: {
        "content-type": "text/html",
        etag: `"source-${checkedUrls.length}"`,
      },
    });
  };
  try {
    const waits = [];
    await worker.scheduled(
      { scheduledTime: Date.parse("2027-07-02T12:00:00.000Z") },
      {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
        VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
      },
      {
        waitUntil(promise) {
          waits.push(promise);
        },
      },
    );
    await Promise.all(waits);
    assert.equal(complianceCheckCount(), 4);
    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'unchanged' THEN 1 ELSE 0 END) AS baselined,
                SUM(CASE WHEN last_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified
         FROM compliance_source_checks`,
      )
      .first();
    assert.ok(Number(counts.total) >= 57);
    assert.equal(Number(counts.baselined), 4);
    assert.equal(Number(counts.verified), 4);

    const readiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
      }),
    );
    assert.equal(readiness.complianceSources.configured, true);
    assert.equal(readiness.complianceSources.tracked, counts.total);
    assert.equal(readiness.complianceSources.proposalGateEnforced, true);
    assert.equal(readiness.complianceSources.ready, false);
    assert.ok(readiness.complianceSources.blocked > 0);
    assert.equal(
      readiness.complianceSources.lastRunAt,
      "2027-07-02T12:00:00.000Z",
    );

    const earliestRow = await db
      .prepare(
        `SELECT source_key FROM compliance_source_checks
         ORDER BY source_key ASC LIMIT 1`,
      )
      .first();
    const expectedSource = COMPLIANCE_SOURCE_REGISTRY.find(
      (sourceItem) => sourceItem.key === earliestRow.source_key,
    );
    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET profile_version = 'retired-version',
             url = 'https://example.com/retired-source',
             baseline_signature = 'retired-baseline',
             current_signature = 'retired-current',
             status = 'changed', error = 'retired source'
         WHERE source_key = ?`,
      )
      .bind(earliestRow.source_key)
      .run();
    const nextWaits = [];
    await worker.scheduled(
      { scheduledTime: Date.parse("2027-07-02T12:15:00.000Z") },
      {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
        VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
      },
      {
        waitUntil(promise) {
          nextWaits.push(promise);
        },
      },
    );
    await Promise.all(nextWaits);
    assert.equal(complianceCheckCount(), 8);
    const refreshed = await db
      .prepare(
        `SELECT profile_version, url, baseline_signature, current_signature,
                status, last_verified_at, error
         FROM compliance_source_checks WHERE source_key = ?`,
      )
      .bind(earliestRow.source_key)
      .first();
    assert.equal(refreshed.profile_version, expectedSource.version);
    assert.equal(refreshed.url, expectedSource.url);
    assert.notEqual(refreshed.baseline_signature, "retired-baseline");
    assert.equal(refreshed.current_signature, refreshed.baseline_signature);
    assert.equal(refreshed.status, "unchanged");
    assert.equal(refreshed.last_verified_at, "2027-07-02T12:15:00.000Z");
    assert.equal(refreshed.error, null);

    await db
      .prepare(
        `UPDATE compliance_source_checks
         SET status = 'unchanged', baseline_signature = 'stable',
             current_signature = 'stable', last_verified_at = ?`,
      )
      .bind("2027-07-02T12:15:00.000Z")
      .run();
    const steadyReadiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
      }),
    );
    assert.equal(steadyReadiness.complianceSources.bootstrapInProgress, false);
    assert.equal(steadyReadiness.complianceSources.monitorCurrentIntervalMinutes, 1440);

    const tooSoonWaits = [];
    await worker.scheduled(
      { scheduledTime: Date.parse("2027-07-02T12:30:00.000Z") },
      {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
        VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
      },
      {
        waitUntil(promise) {
          tooSoonWaits.push(promise);
        },
      },
    );
    await Promise.all(tooSoonWaits);
    assert.equal(complianceCheckCount(), 8);

    const dailyWaits = [];
    await worker.scheduled(
      { scheduledTime: Date.parse("2027-07-03T12:15:00.000Z") },
      {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
        VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
      },
      {
        waitUntil(promise) {
          dailyWaits.push(promise);
        },
      },
    );
    await Promise.all(dailyWaits);
    assert.equal(complianceCheckCount(), 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("homepage traffic safely advances an enabled compliance-source baseline", async () => {
  const db = new TestD1();
  const originalFetch = globalThis.fetch;
  const checkedUrls = [];
  globalThis.fetch = async (input) => {
    checkedUrls.push(String(input));
    return new Response(`<html><body>${String(input)}</body></html>`, {
      status: 200,
      headers: {
        "content-type": "text/html",
        etag: `"fallback-source-${checkedUrls.length}"`,
      },
    });
  };
  const env = {
    DB: db,
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
    VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    ASSETS: {
      fetch: async () => new Response("<main>OpenEscrow</main>", { status: 200 }),
    },
  };
  try {
    const waits = [];
    const response = await worker.fetch(request("/"), env, {
      waitUntil(promise) {
        waits.push(promise);
      },
    });
    assert.equal(response.status, 200);
    await Promise.all(waits);
    assert.equal(checkedUrls.length, 4);

    const monitorRun = await db
      .prepare(
        "SELECT last_started_at FROM scheduled_job_runs WHERE name = ?",
      )
      .bind("compliance-source-monitor")
      .first();
    assert.ok(monitorRun?.last_started_at);

    const repeatedWaits = [];
    await worker.fetch(request("/index.html"), env, {
      waitUntil(promise) {
        repeatedWaits.push(promise);
      },
    });
    await Promise.all(repeatedWaits);
    assert.equal(
      checkedUrls.length,
      4,
      "repeat homepage traffic must not run a second source batch inside 15 minutes",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private evidence retrieval is party-only and rejects bearer tokens in URLs", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const unrelated = await create(db);
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File([new TextEncoder().encode("%PDF-1.7\ntest invoice")], "invoice.pdf", {
      type: "application/pdf",
    }),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      { DB: db, EVIDENCE: evidence },
    ),
  );
  assert.equal(uploaded.storageKind, "private");
  assert.match(uploaded.uri, /^openescrow:\/\/evidence\//);
  assert.match(uploaded.sha256, /^0x[a-f0-9]{64}$/);
  assert.match(uploaded.gatewayUrl, /^\/api\/evidence\/[a-fA-F0-9-]+$/);
  assert.equal(uploaded.gatewayUrl.includes(created.access.landlord), false);
  assert.equal(uploaded.gatewayUrl.includes("?"), false);

  const authorized = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "%PDF-1.7\ntest invoice");
  assert.equal(authorized.headers.get("x-openescrow-sha256"), uploaded.sha256);
  assert.equal(authorized.headers.get("cache-control"), "private, no-store");
  assert.equal(authorized.headers.get("referrer-policy"), "no-referrer");
  assert.equal(authorized.headers.get("x-content-type-options"), "nosniff");
  assert.equal(authorized.headers.get("x-frame-options"), "DENY");
  assert.equal(
    authorized.headers.get("cross-origin-opener-policy"),
    "same-origin",
  );
  assert.equal(
    authorized.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  const legacyUrlDenied = await worker.fetch(
    new Request(
      `https://openescrow.example${uploaded.gatewayUrl}?token=${encodeURIComponent(created.access.landlord)}`,
    ),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(legacyUrlDenied.status, 405);
  assert.deepEqual(await legacyUrlDenied.json(), {
    error:
      "Open this supporting file from its agreement. Private file access is not accepted in a URL.",
  });
  assert.equal(legacyUrlDenied.headers.get("cache-control"), "no-store");
  assert.equal(legacyUrlDenied.headers.get("referrer-policy"), "no-referrer");
  const storageTripwire = {
    prepare() {
      throw new Error("A rejected evidence URL must not read D1.");
    },
    async get() {
      throw new Error("A rejected evidence URL must not read R2.");
    },
  };
  const rejectedBeforeStorage = await worker.fetch(
    new Request(
      `https://openescrow.example${uploaded.gatewayUrl}?token=retired-url-secret`,
    ),
    { DB: storageTripwire, EVIDENCE: storageTripwire },
  );
  assert.equal(rejectedBeforeStorage.status, 405);

  const tenantAuthorized = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.tenant),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(tenantAuthorized.status, 200);
  assert.equal(await tenantAuthorized.text(), "%PDF-1.7\ntest invoice");

  const unrelatedParty = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, unrelated.access.landlord),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(unrelatedParty.status, 403);

  const denied = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, "invalid"),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(denied.status, 403);
});

test("sensitive authorized reads reject cross-site browser requests without an Origin header", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File([new TextEncoder().encode("%PDF-1.7\ncross-site guard")], "guard.pdf", {
      type: "application/pdf",
    }),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      { DB: db, EVIDENCE: evidence },
    ),
  );
  const sensitiveRequests = [
    new Request("https://openescrow.example/api/profile/notification-preferences", {
      headers: { "sec-fetch-site": "cross-site" },
    }),
    negotiationReadRequest(
      `/api/negotiations/${created.record.id}`,
      created.access.landlord,
      { "sec-fetch-site": "cross-site" },
    ),
    negotiationReadRequest(
      `/api/negotiations/${created.record.id}/report`,
      created.access.landlord,
      { "sec-fetch-site": "cross-site" },
    ),
    negotiationReadRequest(
      `/api/negotiations/${created.record.id}/snapshot`,
      created.access.landlord,
      { "sec-fetch-site": "cross-site" },
    ),
  ];
  for (const sensitiveRequest of sensitiveRequests) {
    const response = await worker.fetch(sensitiveRequest, {
      DB: db,
      EVIDENCE: evidence,
    });
    assert.equal(response.status, 403, sensitiveRequest.url);
    assert.deepEqual(await response.json(), {
      error: "Cross-origin reads are not allowed.",
    });
  }

  const sameOriginRecord = await worker.fetch(
    negotiationReadRequest(
      `/api/negotiations/${created.record.id}`,
      created.access.landlord,
      { "sec-fetch-site": "same-origin" },
    ),
    { DB: db },
  );
  assert.equal(sameOriginRecord.status, 200);
  const evidenceGet = await worker.fetch(
    new Request(`https://openescrow.example${uploaded.gatewayUrl}`),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(evidenceGet.status, 405);
  assert.deepEqual(await evidenceGet.json(), {
    error:
      "Open this supporting file from its agreement. Private file access is not accepted in a URL.",
  });
  const crossSiteEvidencePost = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord, {
      "sec-fetch-site": "cross-site",
    }),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(crossSiteEvidencePost.status, 403);
  assert.deepEqual(await crossSiteEvidencePost.json(), {
    error: "Cross-origin writes are not allowed.",
  });
  const sameOriginEvidence = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord, {
      "sec-fetch-site": "same-origin",
    }),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(sameOriginEvidence.status, 200);

  const publicReadiness = await worker.fetch(
    new Request("https://openescrow.example/api/system/readiness", {
      headers: { "sec-fetch-site": "cross-site" },
    }),
    { DB: db },
  );
  assert.equal(publicReadiness.status, 200);
  const signedLinkEntryPoint = await worker.fetch(
    new Request(
      "https://openescrow.example/api/notifications/unsubscribe?token=invalid",
      { headers: { "sec-fetch-site": "cross-site" } },
    ),
    { DB: db },
  );
  assert.equal(signedLinkEntryPoint.status, 404);
});

test("private agreement reads require a strict bearer header and reject URL credentials", async () => {
  const db = new TestD1();
  const created = await create(db);
  const paths = [
    `/api/negotiations/${created.record.id}`,
    `/api/negotiations/${created.record.id}/report?download=1`,
    `/api/negotiations/${created.record.id}/snapshot`,
  ];

  for (const path of paths) {
    assert.equal(path.includes(created.access.tenant), false);
    const authorized = await worker.fetch(
      negotiationReadRequest(path, created.access.tenant),
      { DB: db },
    );
    assert.equal(authorized.status, 200, path);
    assert.equal(authorized.headers.get("referrer-policy"), "no-referrer");
  }

  for (const path of paths) {
    const separator = path.includes("?") ? "&" : "?";
    const queryOnly = await worker.fetch(
      new Request(
        `https://openescrow.example${path}${separator}token=${encodeURIComponent(created.access.tenant)}`,
      ),
      { DB: db },
    );
    assert.equal(queryOnly.status, 403, path);
  }

  const malformedHeader = await worker.fetch(
    new Request(
      `https://openescrow.example${paths[0]}?token=${encodeURIComponent(created.access.tenant)}`,
      { headers: { authorization: "Basic not-a-bearer-token" } },
    ),
    { DB: db },
  );
  assert.equal(malformedHeader.status, 403);

  const wrongBearer = await worker.fetch(
    new Request(
      `https://openescrow.example${paths[0]}?token=${encodeURIComponent(created.access.tenant)}`,
      { headers: { authorization: "Bearer wrong-token" } },
    ),
    { DB: db },
  );
  assert.equal(wrongBearer.status, 403);

  const validBearerWithWrongQuery = await worker.fetch(
    new Request(
      `https://openescrow.example${paths[0]}?token=wrong-query-token`,
      { headers: { authorization: `Bearer ${created.access.tenant}` } },
    ),
    { DB: db },
  );
  assert.equal(validBearerWithWrongQuery.status, 200);
});

test("pilot rehearsal: an evidence upload outage is retryable without a phantom record", async () => {
  const db = new TestD1();
  const created = await create(db);
  const evidenceFile = () =>
    new File(
      [new TextEncoder().encode("%PDF-1.7\nretryable evidence")],
      "retryable.pdf",
      { type: "application/pdf" },
    );
  const evidenceRequest = () => {
    const form = new FormData();
    form.set("proposalId", created.record.id);
    form.set("token", created.access.landlord);
    form.set("file", evidenceFile());
    return new Request("https://openescrow.example/api/evidence", {
      method: "POST",
      body: form,
    });
  };

  const unavailable = await worker.fetch(evidenceRequest(), {
    DB: db,
    EVIDENCE: {
      async put() {
        throw new Error("simulated private bucket outage");
      },
    },
  });
  assert.equal(unavailable.status, 503);
  const unavailableBody = await unavailable.json();
  assert.match(unavailableBody.error, /temporarily unavailable/);
  assert.doesNotMatch(unavailableBody.error, /simulated|bucket outage/);

  const evidenceCount = await db
    .prepare("SELECT COUNT(*) AS count FROM evidence_files")
    .first();
  const eventCount = await db
    .prepare("SELECT COUNT(*) AS count FROM negotiation_events WHERE action = 'evidence_uploaded'")
    .first();
  assert.equal(Number(evidenceCount.count), 0);
  assert.equal(Number(eventCount.count), 0);

  const recoveredEvidence = new TestR2();
  const recovered = await jsonResponse(
    await worker.fetch(evidenceRequest(), { DB: db, EVIDENCE: recoveredEvidence }),
  );
  assert.equal(recovered.storageKind, "private");
  assert.equal(recoveredEvidence.objects.size, 1);
});

test("pilot rehearsal: an evidence metadata outage deletes the incomplete R2 upload before retry", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const evidenceRequest = () => {
    const form = new FormData();
    form.set("proposalId", created.record.id);
    form.set("token", created.access.landlord);
    form.set(
      "file",
      new File(
        [new TextEncoder().encode("%PDF-1.7\nincomplete R2 evidence")],
        "incomplete-r2.pdf",
        { type: "application/pdf" },
      ),
    );
    return new Request("https://openescrow.example/api/evidence", {
      method: "POST",
      body: form,
    });
  };

  const incomplete = await worker.fetch(evidenceRequest(), {
    DB: failEvidenceMetadataBatch(db),
    EVIDENCE: evidence,
  });
  assert.equal(incomplete.status, 503);
  const incompleteBody = await incomplete.json();
  assert.match(incompleteBody.error, /could not finish recording/);
  assert.match(incompleteBody.error, /try the upload again/);
  assert.doesNotMatch(incompleteBody.error, /simulated|metadata outage/);
  assert.equal(evidence.objects.size, 0);

  const evidenceCount = await db
    .prepare("SELECT COUNT(*) AS count FROM evidence_files")
    .first();
  const eventCount = await db
    .prepare("SELECT COUNT(*) AS count FROM negotiation_events WHERE action = 'evidence_uploaded'")
    .first();
  assert.equal(Number(evidenceCount.count), 0);
  assert.equal(Number(eventCount.count), 0);

  const recovered = await jsonResponse(
    await worker.fetch(evidenceRequest(), { DB: db, EVIDENCE: evidence }),
  );
  assert.equal(recovered.storageKind, "private");
  assert.equal(evidence.objects.size, 1);
});

test("pilot rehearsal: an evidence download outage fails closed without storage details", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File(
      [new TextEncoder().encode("%PDF-1.7\ndownload outage evidence")],
      "outage.pdf",
      { type: "application/pdf" },
    ),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      { DB: db, EVIDENCE: evidence },
    ),
  );

  const unavailable = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    {
      DB: db,
      EVIDENCE: {
        async get() {
          throw new Error("simulated private bucket read outage");
        },
      },
    },
  );
  assert.equal(unavailable.status, 503);
  const unavailableBody = await unavailable.json();
  assert.match(unavailableBody.error, /temporarily unavailable/);
  assert.match(unavailableBody.error, /before repeating any agreement action/);
  assert.doesNotMatch(unavailableBody.error, /simulated|bucket read outage/);
});

test("evidence upload rejects a spoofed content type before storage", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File(["this is not a PDF"], "invoice.pdf", {
      type: "application/pdf",
    }),
  );
  const response = await worker.fetch(
    new Request("https://openescrow.example/api/evidence", {
      method: "POST",
      body: form,
    }),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /contents do not match/);
  assert.equal(evidence.objects.size, 0);
});

test("configured evidence encryption stores only ciphertext and decrypts for an agreement party", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File(["%PDF-1.7\nprivate encrypted invoice"], "invoice.pdf", {
      type: "application/pdf",
    }),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      {
        DB: db,
        EVIDENCE: evidence,
        EVIDENCE_ENCRYPTION_KEY: encryptionKey,
      },
    ),
  );
  assert.equal(uploaded.storageKind, "encrypted-private");
  const [stored] = evidence.objects.values();
  assert.equal(new TextDecoder().decode(stored.bytes).includes("private encrypted invoice"), false);

  const authorized = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    {
      DB: db,
      EVIDENCE: evidence,
      EVIDENCE_ENCRYPTION_KEY: encryptionKey,
    },
  );
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "%PDF-1.7\nprivate encrypted invoice");
  assert.equal(authorized.headers.get("x-openescrow-storage"), "encrypted-r2");
});

test("encrypted evidence fails closed when ciphertext, key material, or digest metadata is altered", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const encryptionKey = Buffer.alloc(32, 31).toString("base64");
  const encryptionEnvironment = {
    DB: db,
    EVIDENCE: evidence,
    EVIDENCE_ENCRYPTION_KEY: encryptionKey,
    EVIDENCE_ENCRYPTION_KEY_ID: "tamper-test",
  };
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File(["%PDF-1.7\nintegrity protected evidence"], "integrity.pdf", {
      type: "application/pdf",
    }),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      encryptionEnvironment,
    ),
  );
  const storedMetadata = await db
    .prepare("SELECT object_key, sha256 FROM evidence_files WHERE id = ?")
    .bind(uploaded.cid)
    .first();
  const storedObject = evidence.objects.get(storedMetadata.object_key);
  const originalCiphertext = new Uint8Array(storedObject.bytes);

  storedObject.bytes[0] ^= 0xff;
  const alteredCiphertext = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    encryptionEnvironment,
  );
  assert.equal(alteredCiphertext.status, 422);
  assert.match((await alteredCiphertext.json()).error, /decrypted or was altered/);
  storedObject.bytes = originalCiphertext;

  const wrongKey = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    {
      ...encryptionEnvironment,
      EVIDENCE_ENCRYPTION_KEY: Buffer.alloc(32, 32).toString("base64"),
    },
  );
  assert.equal(wrongKey.status, 422);
  assert.match((await wrongKey.json()).error, /decrypted or was altered/);

  await db
    .prepare("UPDATE evidence_files SET sha256 = ? WHERE id = ?")
    .bind(`0x${"0".repeat(64)}`, uploaded.cid)
    .run();
  const alteredDigest = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    encryptionEnvironment,
  );
  assert.equal(alteredDigest.status, 422);
  assert.match((await alteredDigest.json()).error, /failed its integrity check/);
  assert.notEqual(storedMetadata.sha256, `0x${"0".repeat(64)}`);
});

test("pilot rehearsal: isolated evidence backup restoration rejects missing and mismatched keys", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const originalKey = Buffer.alloc(32, 17).toString("base64");
  const rotatedKey = Buffer.alloc(32, 23).toString("base64");
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File(["%PDF-1.7\npre-rotation evidence"], "before.pdf", {
      type: "application/pdf",
    }),
  );
  const uploaded = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: form,
      }),
      {
        DB: db,
        EVIDENCE: evidence,
        EVIDENCE_ENCRYPTION_KEY: originalKey,
      },
    ),
  );
  const storedMetadata = await db
    .prepare(
      `SELECT encryption_key_id, encryption_key_fingerprint
       FROM evidence_files WHERE id = ?`,
    )
    .bind(uploaded.cid)
    .first();
  assert.equal(storedMetadata.encryption_key_id, "primary");
  assert.match(
    storedMetadata.encryption_key_fingerprint,
    /^sha256:[0-9a-f]{64}$/,
  );

  const rotatedEnvironment = {
    DB: db,
    EVIDENCE: evidence,
    EVIDENCE_ENCRYPTION_KEY: rotatedKey,
    EVIDENCE_ENCRYPTION_KEY_ID: "2026-q3",
    EVIDENCE_DECRYPTION_KEYS: JSON.stringify({ primary: originalKey }),
  };
  const authorized = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    rotatedEnvironment,
  );
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "%PDF-1.7\npre-rotation evidence");

  const rotatedForm = new FormData();
  rotatedForm.set("proposalId", created.record.id);
  rotatedForm.set("token", created.access.landlord);
  rotatedForm.set(
    "file",
    new File(["%PDF-1.7\npost-rotation evidence"], "after.pdf", {
      type: "application/pdf",
    }),
  );
  const rotatedUpload = await jsonResponse(
    await worker.fetch(
      new Request("https://openescrow.example/api/evidence", {
        method: "POST",
        body: rotatedForm,
      }),
      rotatedEnvironment,
    ),
  );
  const rotatedMetadata = await db
    .prepare(
      `SELECT encryption_key_id, encryption_key_fingerprint
       FROM evidence_files WHERE id = ?`,
    )
    .bind(rotatedUpload.cid)
    .first();
  assert.equal(rotatedMetadata.encryption_key_id, "2026-q3");
  assert.match(
    rotatedMetadata.encryption_key_fingerprint,
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.notEqual(
    rotatedMetadata.encryption_key_fingerprint,
    storedMetadata.encryption_key_fingerprint,
  );
  const rotatedDownload = await worker.fetch(
    evidenceDownloadRequest(
      rotatedUpload.gatewayUrl,
      created.access.landlord,
    ),
    rotatedEnvironment,
  );
  assert.equal(rotatedDownload.status, 200);
  assert.equal(await rotatedDownload.text(), "%PDF-1.7\npost-rotation evidence");

  const recoveryDb = new TestD1();
  recoveryDb.database.deserialize(db.database.serialize());
  const recoveryEvidence = new TestR2();
  for (const [objectKey, object] of evidence.objects) {
    recoveryEvidence.objects.set(objectKey, {
      bytes: new Uint8Array(object.bytes),
      contentType: object.contentType,
    });
  }
  assert.notEqual(recoveryDb.database, db.database);
  assert.notEqual(recoveryEvidence.objects, evidence.objects);
  assert.equal(recoveryEvidence.objects.size, evidence.objects.size);
  for (const [objectKey, restoredObject] of recoveryEvidence.objects) {
    assert.notEqual(restoredObject.bytes, evidence.objects.get(objectKey).bytes);
  }

  const recoveryEnvironment = {
    DB: recoveryDb,
    EVIDENCE: recoveryEvidence,
    EVIDENCE_ENCRYPTION_KEY: rotatedKey,
    EVIDENCE_ENCRYPTION_KEY_ID: "2026-q3",
  };
  const missingRetainedKey = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    recoveryEnvironment,
  );
  assert.equal(missingRetainedKey.status, 503);
  assert.match(
    (await missingRetainedKey.json()).error,
    /decryption key "primary" is not configured/,
  );

  const missingKeyReadiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      ...recoveryEnvironment,
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(missingKeyReadiness.evidence.encryptedAtRest, true);
  assert.equal(missingKeyReadiness.evidence.referencedEncryptionKeyCount, 2);
  assert.equal(missingKeyReadiness.evidence.missingDecryptionKeyCount, 1);
  assert.equal(missingKeyReadiness.evidence.unverifiedEncryptionKeyCount, 0);
  assert.equal(missingKeyReadiness.evidence.mismatchedDecryptionKeyCount, 0);
  assert.equal(missingKeyReadiness.evidence.keyringReady, false);

  const wrongBackupEnvironment = {
    ...recoveryEnvironment,
    EVIDENCE_DECRYPTION_KEYS: JSON.stringify({
      primary: Buffer.alloc(32, 99).toString("base64"),
    }),
  };
  const wrongBackupReadiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      ...wrongBackupEnvironment,
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(wrongBackupReadiness.evidence.missingDecryptionKeyCount, 0);
  assert.equal(wrongBackupReadiness.evidence.unverifiedEncryptionKeyCount, 0);
  assert.equal(wrongBackupReadiness.evidence.mismatchedDecryptionKeyCount, 1);
  assert.equal(wrongBackupReadiness.evidence.keyringReady, false);
  const wrongBackupDownload = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    wrongBackupEnvironment,
  );
  assert.equal(wrongBackupDownload.status, 422);
  assert.match(
    (await wrongBackupDownload.json()).error,
    /could not be decrypted or was altered/,
  );

  const restoredEnvironment = {
    ...recoveryEnvironment,
    EVIDENCE_DECRYPTION_KEYS: JSON.stringify({ primary: originalKey }),
  };
  await recoveryDb
    .prepare(
      `UPDATE evidence_files
       SET encryption_key_fingerprint = NULL
       WHERE id = ?`,
    )
    .bind(uploaded.cid)
    .run();
  const legacyReadiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      ...restoredEnvironment,
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(legacyReadiness.evidence.missingDecryptionKeyCount, 0);
  assert.equal(legacyReadiness.evidence.unverifiedEncryptionKeyCount, 1);
  assert.equal(legacyReadiness.evidence.mismatchedDecryptionKeyCount, 0);
  assert.equal(legacyReadiness.evidence.keyringReady, false);
  const legacyWrongBackupDownload = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    wrongBackupEnvironment,
  );
  assert.equal(legacyWrongBackupDownload.status, 422);
  assert.equal(
    (
      await recoveryDb
        .prepare(
          `SELECT encryption_key_fingerprint
           FROM evidence_files WHERE id = ?`,
        )
        .bind(uploaded.cid)
        .first()
    ).encryption_key_fingerprint,
    null,
  );
  const restoredDownload = await worker.fetch(
    evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
    restoredEnvironment,
  );
  assert.equal(restoredDownload.status, 200);
  assert.equal(await restoredDownload.text(), "%PDF-1.7\npre-rotation evidence");
  assert.equal(
    (
      await recoveryDb
        .prepare(
          `SELECT encryption_key_fingerprint
           FROM evidence_files WHERE id = ?`,
        )
        .bind(uploaded.cid)
        .first()
    ).encryption_key_fingerprint,
    storedMetadata.encryption_key_fingerprint,
  );
  const restoredRotatedDownload = await worker.fetch(
    evidenceDownloadRequest(
      rotatedUpload.gatewayUrl,
      created.access.landlord,
    ),
    restoredEnvironment,
  );
  assert.equal(restoredRotatedDownload.status, 200);
  assert.equal(
    await restoredRotatedDownload.text(),
    "%PDF-1.7\npost-rotation evidence",
  );

  const readiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      ...restoredEnvironment,
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(readiness.evidence.encryptedAtRest, true);
  assert.equal(readiness.evidence.activeEncryptionKeyId, "2026-q3");
  assert.equal(readiness.evidence.retainedDecryptionKeyCount, 1);
  assert.equal(readiness.evidence.referencedEncryptionKeyCount, 2);
  assert.equal(readiness.evidence.missingDecryptionKeyCount, 0);
  assert.equal(readiness.evidence.unverifiedEncryptionKeyCount, 0);
  assert.equal(readiness.evidence.mismatchedDecryptionKeyCount, 0);
  assert.equal(readiness.evidence.keyringReady, true);
  assert.equal(readiness.evidence.encryptionError, null);

  const invalidReadiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      DB: db,
      EVIDENCE: evidence,
      EVIDENCE_ENCRYPTION_KEY: "not-a-32-byte-key",
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(invalidReadiness.evidence.encryptedAtRest, false);
  assert.match(invalidReadiness.evidence.encryptionError, /base64-encoded 32-byte key/);

  const duplicateKeyIdReadiness = await jsonResponse(
    await worker.fetch(request("/api/system/readiness"), {
      ...rotatedEnvironment,
      EVIDENCE_DECRYPTION_KEYS: JSON.stringify({ "2026-q3": originalKey }),
      VERIFY_ACTIVITY_REGISTRY_BINDING: "false",
    }),
  );
  assert.equal(duplicateKeyIdReadiness.evidence.encryptedAtRest, false);
  assert.match(
    duplicateKeyIdReadiness.evidence.encryptionError,
    /must not repeat the active/,
  );
});

test("decentralized evidence mode uploads only encrypted IPFS ciphertext", async () => {
  const db = new TestD1();
  const created = await create(db);
  const encryptionKey = Buffer.alloc(32, 11).toString("base64");
  const originalFetch = globalThis.fetch;
  let encryptedBytes;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
      const encryptedFile = options.body.get("file");
      encryptedBytes = new Uint8Array(await encryptedFile.arrayBuffer());
      assert.equal(
        new TextDecoder().decode(encryptedBytes).includes("decentralized invoice"),
        false,
      );
      return Response.json({ IpfsHash: "bafy-encrypted-test" });
    }
    if (url === "https://gateway.pinata.cloud/ipfs/bafy-encrypted-test") {
      return new Response(encryptedBytes);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const form = new FormData();
    form.set("proposalId", created.record.id);
    form.set("token", created.access.landlord);
    form.set(
      "file",
      new File(["%PDF-1.7\ndecentralized invoice"], "invoice.pdf", {
        type: "application/pdf",
      }),
    );
    const uploaded = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/evidence", {
          method: "POST",
          body: form,
        }),
        {
          DB: db,
          PINATA_JWT: "test-pinata-jwt",
          EVIDENCE_STORAGE_MODE: "encrypted-ipfs",
          EVIDENCE_ENCRYPTION_KEY: encryptionKey,
        },
      ),
    );
    assert.equal(uploaded.storageKind, "encrypted-decentralized");
    assert.match(uploaded.uri, /^openescrow\+ipfs:\/\/bafy-encrypted-test\//);

    const authorized = await worker.fetch(
      evidenceDownloadRequest(uploaded.gatewayUrl, created.access.landlord),
      {
        DB: db,
        EVIDENCE_STORAGE_MODE: "encrypted-ipfs",
        EVIDENCE_ENCRYPTION_KEY: encryptionKey,
      },
    );
    assert.equal(authorized.status, 200);
    assert.equal(await authorized.text(), "%PDF-1.7\ndecentralized invoice");
    assert.equal(authorized.headers.get("x-openescrow-storage"), "encrypted-ipfs");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: an evidence metadata outage unpins incomplete encrypted IPFS before retry", async () => {
  const db = new TestD1();
  const created = await create(db);
  const encryptionKey = Buffer.alloc(32, 13).toString("base64");
  const originalFetch = globalThis.fetch;
  const operations = [];
  let pinCount = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    const method = options.method || "GET";
    const authorization = new Headers(options.headers).get("authorization");
    operations.push({ url, method, authorization });
    if (url === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
      pinCount += 1;
      return Response.json({ IpfsHash: `bafy-incomplete-${pinCount}` });
    }
    if (
      url ===
      "https://api.pinata.cloud/pinning/unpin/bafy-incomplete-1"
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const evidenceRequest = () => {
    const form = new FormData();
    form.set("proposalId", created.record.id);
    form.set("token", created.access.landlord);
    form.set(
      "file",
      new File(
        [new TextEncoder().encode("%PDF-1.7\nincomplete IPFS evidence")],
        "incomplete-ipfs.pdf",
        { type: "application/pdf" },
      ),
    );
    return new Request("https://openescrow.example/api/evidence", {
      method: "POST",
      body: form,
    });
  };
  const evidenceEnvironment = {
    PINATA_JWT: "test-pinata-jwt",
    EVIDENCE_STORAGE_MODE: "encrypted-ipfs",
    EVIDENCE_ENCRYPTION_KEY: encryptionKey,
  };

  try {
    const incomplete = await worker.fetch(evidenceRequest(), {
      DB: failEvidenceMetadataBatch(db),
      ...evidenceEnvironment,
    });
    assert.equal(incomplete.status, 503);
    const incompleteBody = await incomplete.json();
    assert.match(incompleteBody.error, /could not finish recording/);
    assert.match(incompleteBody.error, /try the upload again/);
    assert.doesNotMatch(incompleteBody.error, /simulated|metadata outage/);
    assert.deepEqual(operations, [
      {
        url: "https://api.pinata.cloud/pinning/pinFileToIPFS",
        method: "POST",
        authorization: "Bearer test-pinata-jwt",
      },
      {
        url: "https://api.pinata.cloud/pinning/unpin/bafy-incomplete-1",
        method: "DELETE",
        authorization: "Bearer test-pinata-jwt",
      },
    ]);

    const evidenceCount = await db
      .prepare("SELECT COUNT(*) AS count FROM evidence_files")
      .first();
    const eventCount = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE action = 'evidence_uploaded'",
      )
      .first();
    assert.equal(Number(evidenceCount.count), 0);
    assert.equal(Number(eventCount.count), 0);

    const recovered = await jsonResponse(
      await worker.fetch(evidenceRequest(), {
        DB: db,
        ...evidenceEnvironment,
      }),
    );
    assert.equal(recovered.storageKind, "encrypted-decentralized");
    assert.equal(recovered.cid, "bafy-incomplete-2");
    assert.equal(operations.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unsubscribe links turn off optional activity and deadline emails", async () => {
  const db = new TestD1();
  await create(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO notification_preferences
       (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
       VALUES (?, ?, 1, 1, ?, ?)`,
    )
    .bind("did:privy:unsubscribe", "tenant@example.com", now, now)
    .run();
  await db
    .prepare(
      "INSERT INTO notification_unsubscribe_tokens (user_id, token, created_at) VALUES (?, ?, ?)",
    )
    .bind("did:privy:unsubscribe", "unsubscribe-test-token", now)
    .run();

  const response = await worker.fetch(
    request("/api/notifications/unsubscribe?token=unsubscribe-test-token"),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Email notifications are off/);
  const preferences = await db
    .prepare(
      "SELECT agreement_activity, deadline_reminders, consented_at FROM notification_preferences WHERE user_id = ?",
    )
    .bind("did:privy:unsubscribe")
    .first();
  assert.equal(preferences.agreement_activity, 0);
  assert.equal(preferences.deadline_reminders, 0);
  assert.equal(preferences.consented_at, null);
});

test("scheduled claim-window reminders are opted-in and idempotent", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const preferenceTime = new Date("2027-06-01T00:00:00.000Z").toISOString();
  await db
    .prepare(
      `INSERT INTO notification_preferences
       (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
       VALUES (?, ?, 0, 1, ?, ?)`,
    )
    .bind(
      "did:privy:deadline-landlord",
      "landlord@example.com",
      preferenceTime,
      preferenceTime,
    )
    .run();

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `scheduled-${deliveries.length}` });
  };
  try {
    const waits = [];
    const env = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      PUBLIC_APP_URL: "https://openescrow.example/",
    };
    const controller = { scheduledTime: Date.parse("2027-07-02T12:00:00.000Z") };
    const context = { waitUntil(promise) { waits.push(promise); } };
    await worker.scheduled(controller, env, context);
    await Promise.all(waits);
    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0].to, ["landlord@example.com"]);
    assert.match(deliveries[0].subject, /claim period started/);
    assert.match(deliveries[0].text, /Turn off optional OpenEscrow emails/);

    const repeated = [];
    await worker.scheduled(controller, env, {
      waitUntil(promise) {
        repeated.push(promise);
      },
    });
    await Promise.all(repeated);
    assert.equal(deliveries.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a delayed scheduler sends only the current no-claim lifecycle notice", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "76",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  const preferenceTime = new Date().toISOString();
  for (const [index, email] of [
    "landlord@example.com",
    "tenant@example.com",
    "casey@example.com",
  ].entries()) {
    await db
      .prepare(
        `INSERT INTO notification_preferences
         (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
         VALUES (?, ?, 1, 1, ?, ?)`,
      )
      .bind(`did:privy:no-claim-${index}`, email, preferenceTime, preferenceTime)
      .run();
  }

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `no-claim-scheduled-${deliveries.length}` });
  };
  try {
    const env = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      PUBLIC_APP_URL: "https://openescrow.example/",
    };
    const claimDeadline =
      new Date(terms.claimWindowStart).getTime() +
      Number(terms.claimDays) * 24 * 60 * 60 * 1000;
    const deadlineWaits = [];
    await worker.scheduled(
      { scheduledTime: claimDeadline },
      env,
      { waitUntil(promise) { deadlineWaits.push(promise); } },
    );
    await Promise.all(deadlineWaits);
    assert.equal(deliveries.length, 3);
    for (const delivery of deliveries) {
      assert.match(delivery.subject, /claim period ended/);
      assert.doesNotMatch(delivery.subject, /claim period started/);
    }

    await jsonResponse(
      await act(db, created.record.id, created.access.tenant, {
        type: "timeout_executed",
        timeout: "no_claim_refund",
        transactionHash: `0x${"b".repeat(64)}`,
      }),
    );
    const refundWaits = [];
    await worker.scheduled(
      { scheduledTime: claimDeadline + 11 * 60 * 1000 },
      env,
      { waitUntil(promise) { refundWaits.push(promise); } },
    );
    await Promise.all(refundWaits);
    assert.equal(deliveries.length, 6);
    assert.deepEqual(
      deliveries.slice(3).map((delivery) => delivery.to[0]),
      ["landlord@example.com", "tenant@example.com", "casey@example.com"],
    );
    for (const delivery of deliveries.slice(3)) {
      assert.match(delivery.subject, /allocation ready/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled response and allocation notices respect every tenant", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "77",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  const claimed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_submitted",
      amount: "100",
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "Documented repair",
          amount: "100",
        },
      ],
      note: "",
      evidenceUri: "openescrow://evidence/test",
      evidenceHash: `0x${"b".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: `0x${"c".repeat(64)}`,
    }),
  );
  const claimEvent = claimed.events.find(
    (event) => event.action === "deduction_claim_submitted",
  );
  const preferenceTime = new Date().toISOString();
  for (const [index, email] of [
    "landlord@example.com",
    "tenant@example.com",
    "casey@example.com",
  ].entries()) {
    await db
      .prepare(
        `INSERT INTO notification_preferences
         (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
         VALUES (?, ?, 1, 1, ?, ?)`,
      )
      .bind(`did:privy:multi-${index}`, email, preferenceTime, preferenceTime)
      .run();
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.tenants[0].token, {
      type: "claim_response",
      decision: "approve",
      acceptedAmount: "100",
      note: "",
      transactionHash: `0x${"d".repeat(64)}`,
    }),
  );

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `multi-scheduled-${deliveries.length}` });
  };
  try {
    const env = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      PUBLIC_APP_URL: "https://openescrow.example/",
    };
    const reminderTime =
      new Date(claimEvent.createdAt).getTime() + 6 * 24 * 60 * 60 * 1000;
    const firstWaits = [];
    await worker.scheduled(
      { scheduledTime: reminderTime },
      env,
      { waitUntil(promise) { firstWaits.push(promise); } },
    );
    await Promise.all(firstWaits);
    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0].to, ["casey@example.com"]);
    assert.match(deliveries[0].subject, /response deadline reminder/);

    await jsonResponse(
      await act(db, created.record.id, created.access.tenants[1].token, {
        type: "claim_response",
        decision: "approve",
        acceptedAmount: "100",
        note: "",
        transactionHash: `0x${"e".repeat(64)}`,
      }),
    );
    const resolutionWaits = [];
    await worker.scheduled(
      { scheduledTime: reminderTime + 11 * 60 * 1000 },
      env,
      { waitUntil(promise) { resolutionWaits.push(promise); } },
    );
    await Promise.all(resolutionWaits);
    assert.equal(deliveries.length, 4);
    assert.deepEqual(
      deliveries.slice(1).map((delivery) => delivery.to[0]),
      ["landlord@example.com", "tenant@example.com", "casey@example.com"],
    );
    for (const delivery of deliveries.slice(1)) {
      assert.match(delivery.subject, /allocation ready/);
    }

    const duplicateWaits = [];
    await worker.scheduled(
      { scheduledTime: reminderTime + 22 * 60 * 1000 },
      env,
      { waitUntil(promise) { duplicateWaits.push(promise); } },
    );
    await Promise.all(duplicateWaits);
    assert.equal(deliveries.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled allocation notices wait for an arbiter to resolve a dispute", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "78",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_submitted",
      amount: "100",
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "Documented repair",
          amount: "100",
        },
      ],
      note: "",
      evidenceUri: "openescrow://evidence/test",
      evidenceHash: `0x${"b".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: `0x${"c".repeat(64)}`,
    }),
  );
  const responded = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "claim_response",
      decision: "dispute",
      acceptedAmount: "0",
      note: "The invoice does not establish tenant responsibility.",
      transactionHash: `0x${"d".repeat(64)}`,
    }),
  );
  const responseEvent = responded.events.find(
    (event) => event.action === "claim_response_submitted",
  );
  const preferenceTime = new Date().toISOString();
  for (const [index, email] of [
    "landlord@example.com",
    "tenant@example.com",
    "arbiter@example.com",
  ].entries()) {
    await db
      .prepare(
        `INSERT INTO notification_preferences
         (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
         VALUES (?, ?, 1, 1, ?, ?)`,
      )
      .bind(`did:privy:dispute-${index}`, email, preferenceTime, preferenceTime)
      .run();
  }

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `dispute-scheduled-${deliveries.length}` });
  };
  try {
    const env = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      PUBLIC_APP_URL: "https://openescrow.example/",
    };
    const reminderTime =
      new Date(responseEvent.createdAt).getTime() + 6 * 24 * 60 * 60 * 1000;
    const firstWaits = [];
    await worker.scheduled(
      { scheduledTime: reminderTime },
      env,
      { waitUntil(promise) { firstWaits.push(promise); } },
    );
    await Promise.all(firstWaits);
    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0].to, ["arbiter@example.com"]);
    assert.match(deliveries[0].subject, /ruling deadline reminder/);

    await jsonResponse(
      await act(db, created.record.id, created.access.arbiter, {
        type: "arbiter_ruling",
        awardToLandlord: "40",
        note: "The documented repair supports a partial deduction.",
        transactionHash: `0x${"e".repeat(64)}`,
      }),
    );
    const resolutionWaits = [];
    await worker.scheduled(
      { scheduledTime: reminderTime + 11 * 60 * 1000 },
      env,
      { waitUntil(promise) { resolutionWaits.push(promise); } },
    );
    await Promise.all(resolutionWaits);
    assert.equal(deliveries.length, 3);
    assert.deepEqual(
      deliveries.slice(1).map((delivery) => delivery.to[0]),
      ["landlord@example.com", "tenant@example.com"],
    );
    for (const delivery of deliveries.slice(1)) {
      assert.match(delivery.subject, /allocation ready/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("optional arbiter approval is required only when an arbiter is appointed", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  const id = created.record.id;

  const tenantApproved = await jsonResponse(
    await act(db, id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  assert.equal(tenantApproved.status, "draft");

  const arbiterApproved = await jsonResponse(
    await act(db, id, created.access.arbiter, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  assert.equal(arbiterApproved.status, "ready");
  assert.equal(arbiterApproved.events.at(-1).action, "proposal_ready");
});

test("every tenant reviewer must approve and adding a tenant resets the revision", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Co-tenant", email: "cotenant@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  assert.equal(created.record.tenants.length, 2);
  assert.equal(created.access.tenants.length, 2);
  assert.equal(created.record.tenants[0].isFundingTenant, true);

  const primaryApproved = await jsonResponse(
    await act(db, created.record.id, created.access.tenants[0].token, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  assert.equal(primaryApproved.status, "draft");
  assert.equal(primaryApproved.tenantApproved, false);

  const coTenantView = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.tenants[1].token}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(coTenantView.viewerEmail, "cotenant@example.com");
  const allApproved = await jsonResponse(
    await act(db, created.record.id, created.access.tenants[1].token, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  assert.equal(allApproved.status, "ready");
  assert.equal(allApproved.tenantApproved, true);

  const added = await jsonResponse(
    await worker.fetch(
      request(`/api/negotiations/${created.record.id}/tenants`, "POST", {
        token: created.access.landlord,
        name: "Morgan Tenant",
        email: "morgan@example.com",
      }),
      { DB: db },
    ),
  );
  assert.equal(added.record.revision, 2);
  assert.equal(added.record.status, "draft");
  assert.equal(added.record.tenants.length, 3);
  assert.equal(added.record.tenants.every((tenant) => !tenant.approved), true);
  assert.equal(added.invite.email, "morgan@example.com");

  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(await report.text(), /Tenant \(33\.3/);
});

test("pilot rehearsal: a landlord can replace one lost tenant link without disrupting a co-tenant", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Co-tenant", email: "cotenant@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  const primaryApproved = await jsonResponse(
    await act(db, created.record.id, created.access.tenants[0].token, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  assert.equal(primaryApproved.status, "draft");
  const approved = await jsonResponse(
    await act(db, created.record.id, created.access.tenants[1].token, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  assert.equal(approved.status, "ready");

  const tenantId = created.record.tenants[0].id;
  const sessionToken = "tenant-account-session-before-reset";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionToken),
  );
  const sessionHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  db.database
    .prepare(
      `INSERT INTO negotiation_account_access
       (negotiation_id, user_id, role, token_hash, created_at, expires_at)
       VALUES (?, ?, 'tenant', ?, ?, ?)`,
    )
    .run(
      created.record.id,
      "did:privy:tenant",
      sessionHash,
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
    );
  db.database
    .prepare(
      `INSERT INTO negotiation_account_access_context (token_hash, tenant_id)
       VALUES (?, ?)`,
    )
    .run(sessionHash, tenantId);

  const unauthorized = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/tenants/${tenantId}`,
      "POST",
      { token: created.access.tenants[0].token },
    ),
    { DB: db },
  );
  assert.equal(unauthorized.status, 403);

  const reset = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/tenants/${tenantId}`,
        "POST",
        { token: created.access.landlord },
      ),
      { DB: db },
    ),
  );
  assert.equal(reset.record.revision, created.record.revision);
  assert.equal(reset.record.status, "ready");
  assert.equal(reset.record.tenants.every((tenant) => tenant.approved), true);
  assert.equal(reset.record.events.at(-1).action, "tenant_invite_reset");
  assert.notEqual(reset.invite.token, created.access.tenants[0].token);
  assert.notEqual(reset.invite.token, created.access.tenants[1].token);

  for (const oldToken of [created.access.tenants[0].token, sessionToken]) {
    const oldAccess = await worker.fetch(
      request(`/api/negotiations/${created.record.id}?token=${oldToken}`),
      { DB: db },
    );
    assert.equal(oldAccess.status, 403);
  }

  const coTenantAccess = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.tenants[1].token}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(coTenantAccess.viewerTenantId, created.record.tenants[1].id);
  assert.equal(coTenantAccess.viewerEmail, "cotenant@example.com");
  assert.equal(coTenantAccess.status, "ready");

  const newAccess = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${reset.invite.token}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(newAccess.viewerTenantId, tenantId);
  assert.equal(newAccess.viewerEmail, "tenant@example.com");
  const hashes = db.database
    .prepare(
      `SELECT negotiation.tenant_token_hash, tenant.token_hash
       FROM agreement_negotiations negotiation
       JOIN negotiation_tenants tenant ON tenant.negotiation_id = negotiation.id
       WHERE negotiation.id = ? AND tenant.id = ?`,
    )
    .get(created.record.id, tenantId);
  assert.equal(hashes.tenant_token_hash, hashes.token_hash);
  assert.equal(
    db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE negotiation_id = ?",
      )
      .get(created.record.id).count,
    0,
  );
});

test("pilot rehearsal: the landlord can reset an arbiter link and invalidate prior sessions", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        arbiterName: "Avery Arbiter",
        arbiterEmail: "arbiter@example.com",
        terms,
      }),
      { DB: db },
    ),
  );
  assert.ok(created.access.arbiter);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const ready = await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "approve",
      wallet: "0x2222222222222222222222222222222222222222",
    }),
  );
  assert.equal(ready.status, "ready");
  assert.equal(ready.arbiterApproved, true);

  const sessionToken = "arbiter-account-session-before-reset";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionToken),
  );
  const sessionHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  db.database
    .prepare(
      `INSERT INTO negotiation_account_access
       (negotiation_id, user_id, role, token_hash, created_at, expires_at)
       VALUES (?, ?, 'arbiter', ?, ?, ?)`,
    )
    .run(
      created.record.id,
      "did:privy:arbiter",
      sessionHash,
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
    );

  const unauthorized = await worker.fetch(
    request(`/api/negotiations/${created.record.id}/arbiter`, "POST", {
      token: created.access.tenant,
    }),
    { DB: db },
  );
  assert.equal(unauthorized.status, 403);

  const reset = await jsonResponse(
    await worker.fetch(
      request(`/api/negotiations/${created.record.id}/arbiter`, "POST", {
        token: created.access.landlord,
      }),
      { DB: db },
    ),
  );
  assert.equal(reset.record.revision, created.record.revision);
  assert.equal(reset.record.status, "ready");
  assert.equal(reset.record.arbiterApproved, true);
  assert.equal(reset.record.events.at(-1).action, "arbiter_invite_reset");
  assert.equal(reset.invite.email, "arbiter@example.com");
  assert.notEqual(reset.invite.token, created.access.arbiter);

  for (const oldToken of [created.access.arbiter, sessionToken]) {
    const oldAccess = await worker.fetch(
      request(`/api/negotiations/${created.record.id}?token=${oldToken}`),
      { DB: db },
    );
    assert.equal(oldAccess.status, 403);
  }

  const newAccess = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${reset.invite.token}`,
    ),
    { DB: db },
  );
  assert.equal(newAccess.status, 200);
  assert.equal(
    db.database
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_account_access WHERE negotiation_id = ? AND role = 'arbiter'",
      )
      .get(created.record.id).count,
    0,
  );
});

test("the landlord can edit and remove tenants without creating duplicate proposals", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenantName: "Terry Tenant",
        tenantEmail: "tenant@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Co-tenant", email: "cotenant@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  const [fundingTenant, coTenant] = created.record.tenants;
  await jsonResponse(
    await act(db, created.record.id, created.access.tenants[0].token, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );

  const edited = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/tenants/${coTenant.id}`,
        "PATCH",
        {
          token: created.access.landlord,
          name: "Casey Updated",
          email: "casey.updated@example.com",
        },
      ),
      { DB: db },
    ),
  );
  assert.equal(edited.record.id, created.record.id);
  assert.equal(edited.record.revision, 2);
  assert.equal(edited.record.tenants.every((tenant) => !tenant.approved), true);
  assert.equal(edited.invite.email, "casey.updated@example.com");
  const oldInvite = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${created.access.tenants[1].token}`,
    ),
    { DB: db },
  );
  assert.equal(oldInvite.status, 403);
  const newInvite = await worker.fetch(
    request(`/api/negotiations/${created.record.id}?token=${edited.invite.token}`),
    { DB: db },
  );
  assert.equal(newInvite.status, 200);

  const removed = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/tenants/${fundingTenant.id}`,
        "DELETE",
        { token: created.access.landlord },
      ),
      { DB: db },
    ),
  );
  assert.equal(removed.record.id, created.record.id);
  assert.equal(removed.record.revision, 3);
  assert.equal(removed.record.tenants.length, 1);
  assert.equal(removed.record.tenants[0].isFundingTenant, true);
  assert.equal(removed.record.tenantEmail, "casey.updated@example.com");
  const removedInvite = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${created.access.tenants[0].token}`,
    ),
    { DB: db },
  );
  assert.equal(removedInvite.status, 403);

  const lastTenantRemoval = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/tenants/${coTenant.id}`,
      "DELETE",
      { token: created.access.landlord },
    ),
    { DB: db },
  );
  assert.equal(lastTenantRemoval.status, 409);
  assert.match((await lastTenantRemoval.json()).error, /replacement tenant/);
});

test("tenant deposit shares default equally and remain editable before finalization", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  assert.deepEqual(
    created.record.tenants.map((tenant) => tenant.depositShareBps),
    [5000, 5000],
  );

  const updated = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "update_tenant_shares",
      shares: [
        {
          tenantId: created.record.tenants[0].id,
          depositShareBps: 6000,
        },
        {
          tenantId: created.record.tenants[1].id,
          depositShareBps: 4000,
        },
      ],
    }),
  );
  assert.equal(updated.revision, 2);
  assert.equal(updated.status, "draft");
  assert.deepEqual(
    updated.tenants.map((tenant) => tenant.depositShareBps),
    [6000, 4000],
  );
  assert.equal(updated.events.at(-1).action, "tenant_deposit_shares_updated");

  const invalid = await act(db, created.record.id, created.access.landlord, {
    type: "update_tenant_shares",
    shares: updated.tenants.map((tenant) => ({
      tenantId: tenant.id,
      depositShareBps: 4000,
    })),
  });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /total exactly 100%/);
});

test("every tenant records only their approved deposit and equal reserve share", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          {
            name: "Terry Tenant",
            email: "tenant@example.com",
            depositShareBps: 6000,
          },
          {
            name: "Casey Tenant",
            email: "casey@example.com",
            depositShareBps: 4000,
          },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );

  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "71",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );

  for (const [index, tenant] of created.access.tenants.entries()) {
    const reserve = await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "operations_reserve_paid",
        amount: "2.5",
        transactionHash: `0x${String(index + 1).repeat(64)}`,
      }),
    );
    assert.equal(reserve.events.at(-1).metadata.amount, "2.5");

    const contribution = await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "tenant_share_funded",
        amount: index === 0 ? "720" : "480",
        transactionHash: `0x${String(index + 3).repeat(64)}`,
      }),
    );
    assert.equal(contribution.events.at(-1).action, "tenant_share_funded");
  }

  const invalid = await act(db, created.record.id, created.access.tenants[1].token, {
    type: "tenant_share_funded",
    amount: "600",
    transactionHash: `0x${"f".repeat(64)}`,
  });
  assert.equal(invalid.status, 409);
  assert.match((await invalid.json()).error, /already recorded as funded/);
});

test("cancelling a proposal removes it from active work while preserving its record", async () => {
  const db = new TestD1();
  const created = await create(db);
  const cancelled = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "cancel_proposal",
    }),
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.events.at(-1).action, "proposal_cancelled");

  const tenantAction = await act(db, created.record.id, created.access.tenant, {
    type: "approve",
    wallet: "0x1111111111111111111111111111111111111111",
  });
  assert.equal(tenantAction.status, 409);

  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(await report.text(), /status cancelled/);
});

test("onchain proposal cancellation is landlord-only, receipt-bound, idempotent, and preserves the Record", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithVerifiedReceipt(db, created);
  const agreementTopic = receiptWord(42);
  const cancellationReceipt = ({
    contract = RECEIPT_TEST_OPEN_ESCROW,
    topic = PROPOSAL_CANCELLED_TOPIC,
    agreement = agreementTopic,
    from = RECEIPT_TEST_LANDLORD,
    status = "0x1",
    data = "0x",
  } = {}) => ({
    status,
    blockNumber: "0x48",
    from,
    logs: [
      {
        address: contract,
        topics: [topic, agreement],
        data,
      },
    ],
  });
  const cancellationHash = transactionHash(230);

  const disabled = await act(db, created.record.id, created.access.landlord, {
    type: "onchain_proposal_cancelled",
    transactionHash: cancellationHash,
  });
  assert.equal(disabled.status, 503);
  assert.match((await disabled.json()).error, /receipt verification/i);

  const wrongRole = await actWithVerifiedReceipt(
    db,
    created,
    created.access.tenant,
    {
      type: "onchain_proposal_cancelled",
      transactionHash: transactionHash(231),
    },
    cancellationReceipt({ from: RECEIPT_TEST_TENANT }),
  );
  assert.equal(wrongRole.status, 403);

  for (const [label, receipt] of [
    ["contract", cancellationReceipt({ contract: RECEIPT_TEST_OPERATIONS_RESERVE })],
    ["event", cancellationReceipt({ topic: ARBITER_REPLACEMENT_CANCELLED_TOPIC })],
    ["agreement", cancellationReceipt({ agreement: receiptWord(43) })],
    ["sender", cancellationReceipt({ from: RECEIPT_TEST_TENANT })],
    ["status", cancellationReceipt({ status: "0x0" })],
    ["data", cancellationReceipt({ data: receiptData(receiptWord(1)) })],
  ]) {
    const rejected = await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "onchain_proposal_cancelled",
        transactionHash: transactionHash(232 + label.length),
      },
      receipt,
    );
    assert.equal(rejected.status, 400, `${label} mismatch must fail closed`);
  }

  const cancelled = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "onchain_proposal_cancelled",
        transactionHash: cancellationHash,
      },
      cancellationReceipt(),
    ),
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.onchainAgreementId, "42");
  const cancellationEvent = cancelled.events.find(
    (event) => event.action === "onchain_proposal_cancelled",
  );
  assert.equal(cancellationEvent.actorRole, "landlord");
  assert.equal(cancellationEvent.metadata.transactionHash, cancellationHash);
  assert.match(cancellationEvent.summary, /timestamped Record remains available/i);
  assert.equal(
    cancelled.events.filter(
      (event) =>
        event.action === "transaction_receipt_verified" &&
        event.metadata?.eventType === "onchain_proposal_cancelled",
    ).length,
    1,
  );

  const replayed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "onchain_proposal_cancelled",
        transactionHash: cancellationHash,
      },
      cancellationReceipt(),
    ),
  );
  assert.equal(replayed.status, "cancelled");
  assert.equal(
    replayed.events.filter(
      (event) => event.action === "onchain_proposal_cancelled",
    ).length,
    1,
  );

  const differentReceipt = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    {
      type: "onchain_proposal_cancelled",
      transactionHash: transactionHash(240),
    },
    cancellationReceipt(),
  );
  assert.equal(differentReceipt.status, 409);

  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  const reportHtml = await report.text();
  assert.match(reportHtml, /Cancelled the unfunded testnet agreement/);
  assert.match(reportHtml, /Recorded transaction receipts/);
});

test("the landlord is notified when all required approvals make a proposal ready", async () => {
  const db = new TestD1();
  const created = await create(db);
  const originalFetch = globalThis.fetch;
  let sentEmail = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sentEmail = JSON.parse(init.body);
    return Response.json({ id: "ready-message-1" });
  };
  try {
    const approved = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.tenant,
        {
          type: "approve",
          wallet: "0x1111111111111111111111111111111111111111",
        },
        {
          RESEND_API_KEY: "test-resend-key",
          NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
        },
      ),
    );
    assert.equal(approved.status, "ready");
    assert.equal(approved.events.at(-1).action, "landlord_ready_notification_sent");
    assert.deepEqual(sentEmail.to, ["landlord@example.com"]);
    assert.match(sentEmail.subject, /ready to finalize/);
    assert.match(sentEmail.text, /submit the finalized terms onchain/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("opted-in agreement activity email is privacy-minimal and idempotent", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  await db
    .prepare(
      `INSERT INTO notification_preferences
       (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
       VALUES (?, ?, 1, 0, ?, ?)`,
    )
    .bind(
      "did:privy:test-landlord",
      "landlord@example.com",
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push({
      headers: options.headers,
      body: JSON.parse(options.body),
    });
    return Response.json({ id: `activity-message-${deliveries.length}` });
  };
  try {
    const action = {
      type: "agreement_funded",
      transactionHash: `0x${"8".repeat(64)}`,
    };
    const funded = await jsonResponse(
      await act(db, created.record.id, created.access.tenant, action, {
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      }),
    );
    assert.equal(deliveries.length, 1);
    assert.deepEqual(deliveries[0].body.to, ["landlord@example.com"]);
    assert.match(deliveries[0].body.subject, /funded/);
    assert.doesNotMatch(deliveries[0].body.text, /1200|ipfs|invoice|tenant@example/i);
    assert.equal(
      funded.events.filter((event) => event.action === "agreement_funded").length,
      1,
    );
    assert.equal(
      funded.events.filter(
        (event) => event.action === "agreement_activity_notification_sent",
      ).length,
      1,
    );

    const retry = await jsonResponse(
      await act(db, created.record.id, created.access.tenant, action, {
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      }),
    );
    assert.equal(deliveries.length, 1);
    assert.equal(
      retry.events.filter((event) => event.action === "agreement_funded").length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("claim-response activity emails name the outcome and stay within the agreement", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "79",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  await submitStandardClaim(db, created);
  const preferenceTime = new Date().toISOString();
  for (const [index, email] of [
    "landlord@example.com",
    "tenant@example.com",
    "casey@example.com",
    "unrelated@example.com",
  ].entries()) {
    await db
      .prepare(
        `INSERT INTO notification_preferences
         (user_id, email, agreement_activity, deadline_reminders, consented_at, updated_at)
         VALUES (?, ?, 1, 0, ?, ?)`,
      )
      .bind(`did:privy:claim-outcome-${index}`, email, preferenceTime, preferenceTime)
      .run();
  }

  const originalFetch = globalThis.fetch;
  const deliveries = [];
  globalThis.fetch = async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return Response.json({ id: `claim-outcome-${deliveries.length}` });
  };
  try {
    await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.tenants[1].token,
        {
          type: "claim_response",
          decision: "dispute",
          acceptedAmount: "0",
          note: "This invoice belongs to a different unit.",
          transactionHash: `0x${"b".repeat(64)}`,
        },
        {
          RESEND_API_KEY: "test-resend-key",
          NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
        },
      ),
    );
    assert.equal(deliveries.length, 3);
    assert.deepEqual(
      deliveries.map((delivery) => delivery.to[0]).sort(),
      ["casey@example.com", "landlord@example.com", "tenant@example.com"],
    );
    for (const delivery of deliveries) {
      assert.match(delivery.subject, /deduction disputed/);
      assert.match(delivery.text, /recorded explanation and resolution status/);
      assert.doesNotMatch(delivery.text, /different unit|unrelated@example.com/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("landlord revisions reset approvals and generic timing remains editable", async () => {
  const db = new TestD1();
  const created = await create(db);
  const id = created.record.id;

  const forbidden = await act(db, id, created.access.landlord, {
    type: "propose_change",
    summary: "Landlord should not use the participant change action.",
  });
  assert.equal(forbidden.status, 403);

  await jsonResponse(
    await act(db, id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const timingRevision = await jsonResponse(
    await act(db, id, created.access.landlord, {
    type: "revise",
    summary: "Updated the agreed tenant response period.",
    terms: { ...terms, responseDays: "10" },
    }),
  );
  assert.equal(timingRevision.revision, 2);
  assert.equal(timingRevision.status, "draft");
  const californiaRevision = await act(db, id, created.access.landlord, {
    type: "revise",
    summary: "Attempted to replace the test policy with California terms.",
    terms: legacyCaliforniaTerms,
  });
  assert.equal(californiaRevision.status, 400);
  const revised = await jsonResponse(
    await act(db, id, created.access.landlord, {
      type: "revise",
      summary: "Reduced the security deposit after tenant review.",
      terms: { ...terms, deposit: "1100" },
    }),
  );
  assert.equal(revised.revision, 3);
  assert.equal(revised.status, "draft");
  assert.equal(revised.tenantApproved, false);
});

test("role-bound actions are strictly enforced by session role", async () => {
  const db = new TestD1();
  const created = await create(db);
  const id = created.record.id;

  await jsonResponse(
    await act(db, id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );

  const tenantCannotFinalize = await act(
    db,
    id,
    created.access.tenant,
    {
      type: "finalize",
      agreementId: "99",
      transactionHash: `0x${"f".repeat(64)}`,
    },
  );
  assert.equal(tenantCannotFinalize.status, 403);
  assert.match(
    (await tenantCannotFinalize.json()).error,
    /Only the landlord may finalize/,
  );

  const landlordCannotFundOperationsReserve = await act(
    db,
    id,
    created.access.landlord,
    {
      type: "operations_reserve_paid",
      amount: "2.5",
      transactionHash: `0x${"1".repeat(64)}`,
    },
  );
  assert.equal(landlordCannotFundOperationsReserve.status, 403);
  assert.match(
    (await landlordCannotFundOperationsReserve.json()).error,
    /Only the tenant may record the operations reserve payment/,
  );

  const landlordCannotProposeChange = await act(
    db,
    id,
    created.access.landlord,
    {
      type: "propose_change",
      summary: "Landlord should not be able to propose revisions as a tenant.",
    },
  );
  assert.equal(landlordCannotProposeChange.status, 403);
  assert.match(
    (await landlordCannotProposeChange.json()).error,
    /Only the invited tenant or arbiter may propose changes/,
  );
});

test("deduction claim emails isolate each tenant's private invitation", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "42",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  await submitStandardClaim(db, created);
  const originalFetch = globalThis.fetch;
  const sentEmails = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sentEmails.push({
      body: JSON.parse(init.body),
      idempotencyKey: new Headers(init.headers).get("idempotency-key"),
    });
    return Response.json({ id: `multi-tenant-claim-message-${sentEmails.length}` });
  };
  try {
    const validReviewLinks = claimReviewLinks(created);
    const notificationInput = {
      proposalId: created.record.id,
      token: created.access.landlord,
      agreementId: "999",
      amount: "999",
      note: "Injected claim text",
    };
    const unauthorizedNotice = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        ...notificationInput,
        token: created.access.tenants[0].token,
        reviewLinks: validReviewLinks,
      }),
      { DB: db },
    );
    assert.equal(unauthorizedNotice.status, 403);
    assert.equal(sentEmails.length, 0);
    const swappedLinks = validReviewLinks.map((link, index) => ({
      ...link,
      reviewUrl: validReviewLinks[(index + 1) % validReviewLinks.length].reviewUrl,
    }));
    const rejectedCrossTenantLink = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        ...notificationInput,
        reviewLinks: swappedLinks,
      }),
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      },
    );
    assert.equal(rejectedCrossTenantLink.status, 400);
    assert.match((await rejectedCrossTenantLink.json()).error, /review link/i);
    assert.equal(sentEmails.length, 0);

    const queryCredentialLinks = validReviewLinks.map((link) => {
      const reviewUrl = new URL(link.reviewUrl);
      const token = new URLSearchParams(reviewUrl.hash.slice(1)).get("token");
      reviewUrl.hash = "";
      reviewUrl.searchParams.set("token", token);
      return { ...link, reviewUrl: reviewUrl.toString() };
    });
    const rejectedQueryCredential = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        ...notificationInput,
        reviewLinks: queryCredentialLinks,
      }),
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      },
    );
    assert.equal(rejectedQueryCredential.status, 400);
    assert.match((await rejectedQueryCredential.json()).error, /review link/i);
    assert.equal(sentEmails.length, 0);

    const response = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        ...notificationInput,
        reviewLinks: validReviewLinks,
      }),
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      },
    );
    assert.equal(response.status, 200);
    assert.equal(sentEmails.length, 2);
    for (const [index, tenant] of created.access.tenants.entries()) {
      const sent = sentEmails[index];
      assert.deepEqual(sent.body.to, [tenant.email]);
      assert.match(sent.body.text, new RegExp(`#token=${tenant.token}`));
      assert.equal(sent.body.text.includes("?token="), false);
      for (const otherTenant of created.access.tenants) {
        if (otherTenant.id !== tenant.id) {
          assert.equal(sent.body.text.includes(otherTenant.token), false);
        }
      }
      assert.match(sent.idempotencyKey, new RegExp(tenant.id));
      assert.match(sent.body.subject, /agreement #42/);
      assert.match(sent.body.text, /claim of 100 shares/);
      assert.doesNotMatch(sent.body.text, /999|Injected claim text/);
    }
    const delivered = await response.json();
    assert.equal(delivered.duplicate, false);
    assert.deepEqual(delivered.messageIds, [
      "multi-tenant-claim-message-1",
      "multi-tenant-claim-message-2",
    ]);

    const duplicateResponse = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        ...notificationInput,
        reviewLinks: validReviewLinks,
      }),
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      },
    );
    assert.equal(duplicateResponse.status, 200);
    assert.deepEqual(await duplicateResponse.json(), {
      messageId: "multi-tenant-claim-message-1",
      messageIds: [
        "multi-tenant-claim-message-1",
        "multi-tenant-claim-message-2",
      ],
      duplicate: true,
    });
    assert.equal(sentEmails.length, 2);
    const recordedDelivery = await db
      .prepare(
        "SELECT metadata_json FROM negotiation_events WHERE negotiation_id = ? AND action = 'claim_notification_sent'",
      )
      .bind(created.record.id)
      .first();
    assert.equal(
      JSON.parse(recordedDelivery.metadata_json).claimTransactionHash,
      `0x${"c".repeat(64)}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pilot rehearsal: a notification outage is retryable without a phantom delivery", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  await submitStandardClaim(db, created);
  const payload = {
    proposalId: created.record.id,
    token: created.access.landlord,
    reviewLinks: claimReviewLinks(created),
  };
  const notificationEnv = {
    DB: db,
    RESEND_API_KEY: "test-resend-key",
    NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
  };
  const originalFetch = globalThis.fetch;
  let deliveryAttempts = 0;
  try {
    globalThis.fetch = async () => {
      deliveryAttempts += 1;
      throw new Error("simulated provider outage");
    };
    const unavailable = await worker.fetch(
      request("/api/notifications/claim", "POST", payload),
      notificationEnv,
    );
    assert.equal(unavailable.status, 502);
    const unavailableBody = await unavailable.json();
    assert.match(unavailableBody.error, /could not send/);
    assert.doesNotMatch(unavailableBody.error, /simulated|provider outage/);

    const failedEventCount = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE action = 'claim_notification_sent'",
      )
      .first();
    assert.equal(Number(failedEventCount.count), 0);

    globalThis.fetch = async () => {
      deliveryAttempts += 1;
      return Response.json({ id: "recovered-claim-message" });
    };
    const recovered = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim", "POST", payload),
        notificationEnv,
      ),
    );
    const duplicate = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim", "POST", payload),
        notificationEnv,
      ),
    );
    assert.equal(recovered.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(deliveryAttempts, 2);

    const sentEventCount = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM negotiation_events WHERE action = 'claim_notification_sent'",
      )
      .first();
    assert.equal(Number(sentEventCount.count), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("claim response notices bind to the exact recorded tenant decision", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          { name: "Terry Tenant", email: "tenant@example.com" },
          { name: "Casey Tenant", email: "casey@example.com" },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "77",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  await submitStandardClaim(db, created);

  const secondTenant = created.access.tenants[1];
  const incomplete = await act(db, created.record.id, secondTenant.token, {
    type: "claim_response",
    decision: "dispute",
    acceptedAmount: "0",
    note: "",
    transactionHash: `0x${"d".repeat(64)}`,
  });
  assert.equal(incomplete.status, 400);

  const responded = await jsonResponse(
    await act(db, created.record.id, secondTenant.token, {
      type: "claim_response",
      decision: "dispute",
      acceptedAmount: "0",
      note: "This charge belongs to a different unit.",
      transactionHash: `0x${"b".repeat(64)}`,
    }),
  );
  assert.equal(responded.events.at(-1).action, "claim_response_submitted");
  assert.equal(responded.events.at(-1).metadata.tenantId, secondTenant.id);
  assert.match(responded.events.at(-1).summary, /Casey Tenant/);

  const payload = {
    proposalId: created.record.id,
    token: secondTenant.token,
    agreementId: "999",
    decision: "approve",
    acceptedAmount: "999",
    note: "Injected response text",
    transactionHash: `0x${"b".repeat(64)}`,
    reviewUrl: "https://openescrow.example/?id=999&token=injected",
  };
  const unauthorized = await worker.fetch(
    request("/api/notifications/claim-response", "POST", {
      ...payload,
      token: created.access.landlord,
    }),
    { DB: db },
  );
  assert.equal(unauthorized.status, 403);
  const unavailable = await worker.fetch(
    request("/api/notifications/claim-response", "POST", payload),
    { DB: db },
  );
  assert.equal(unavailable.status, 503);

  const originalFetch = globalThis.fetch;
  let deliveryCount = 0;
  let sentEmail = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    deliveryCount += 1;
    sentEmail = JSON.parse(init.body);
    return Response.json({ id: "claim-response-message-1" });
  };
  try {
    const notificationEnv = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
    };
    const unrecordedResponse = await worker.fetch(
      request("/api/notifications/claim-response", "POST", {
        ...payload,
        transactionHash: `0x${"e".repeat(64)}`,
      }),
      notificationEnv,
    );
    assert.equal(unrecordedResponse.status, 409);
    assert.match((await unrecordedResponse.json()).error, /exact claim response/i);
    assert.equal(deliveryCount, 0);
    const first = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim-response", "POST", payload),
        notificationEnv,
      ),
    );
    const duplicate = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim-response", "POST", payload),
        notificationEnv,
      ),
    );
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(deliveryCount, 1);
    assert.deepEqual(sentEmail.to, ["landlord@example.com"]);
    assert.match(sentEmail.text, /Casey Tenant/);
    assert.match(sentEmail.text, /different unit/);
    assert.match(sentEmail.subject, /agreement #77/);
    assert.match(sentEmail.text, /\?id=77/);
    assert.doesNotMatch(sentEmail.text, /999|Injected response text|token=injected/);
    const recordedDelivery = await db
      .prepare(
        "SELECT metadata_json FROM negotiation_events WHERE negotiation_id = ? AND action = 'claim_response_notification_sent'",
      )
      .bind(created.record.id)
      .first();
    assert.equal(
      JSON.parse(recordedDelivery.metadata_json).responseTransactionHash,
      `0x${"b".repeat(64)}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one finalization receipt cannot be assigned to two proposal records", async () => {
  const db = new TestD1();
  const first = await create(db);
  const second = await create(db);
  await jsonResponse(
    await act(db, first.record.id, first.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  await jsonResponse(
    await act(db, second.record.id, second.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const transactionHash = `0x${"a".repeat(64)}`;
  await jsonResponse(
    await act(db, first.record.id, first.access.landlord, {
      type: "finalize",
      agreementId: "42",
      transactionHash,
    }),
  );

  const duplicate = await act(
    db,
    second.record.id,
    second.access.landlord,
    {
      type: "finalize",
      agreementId: "42",
      transactionHash,
    },
  );
  assert.equal(duplicate.status, 409);
  assert.match(
    (await duplicate.json()).error,
    /already assigned to another proposal record/i,
  );

  const independentlyFinalized = await jsonResponse(
    await act(db, second.record.id, second.access.landlord, {
      type: "finalize",
      agreementId: "43",
      transactionHash: `0x${"b".repeat(64)}`,
    }),
  );
  assert.equal(independentlyFinalized.onchainAgreementId, "43");
});

test("pilot rehearsal: record export and proof include claim, decision, and receipts", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const finalizedRetry = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "42",
      transactionHash: `0x${"a".repeat(64)}`,
    }),
  );
  assert.equal(
    finalizedRetry.events.filter((event) => event.action === "posted_onchain").length,
    1,
  );

  const reservePaid = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "operations_reserve_paid",
      transactionHash: `0x${"e".repeat(64)}`,
    }),
  );
  assert.equal(reservePaid.events.at(-1).action, "operations_reserve_paid");
  assert.match(reservePaid.events.at(-1).summary, /separate \$5 testUSDC/);
  const funded = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "agreement_funded",
      transactionHash: `0x${"9".repeat(64)}`,
    }),
  );
  assert.equal(funded.events.at(-1).action, "agreement_funded");
  const fundedRetry = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "agreement_funded",
      transactionHash: `0x${"9".repeat(64)}`,
    }),
  );
  assert.equal(
    fundedRetry.events.filter((event) => event.action === "agreement_funded").length,
    1,
  );

  const mismatchedClaim = await act(db, created.record.id, created.access.landlord, {
    type: "claim_submitted",
    amount: "300",
    category: "Itemized deductions",
    items: [
      {
        category: "11",
        description: "Replacement of the tenant-damaged door",
        amount: "299",
      },
    ],
    note: "",
    evidenceUri: "ipfs://bafy-test-invoice",
    evidenceHash: `0x${"b".repeat(64)}`,
    californiaConfirmations: {
      itemizedStatement: true,
      supportingDocuments: true,
      moveInPhotos: true,
      preRepairPhotos: true,
      postRepairPhotos: true,
    },
    transactionHash: `0x${"c".repeat(64)}`,
  });
  assert.equal(mismatchedClaim.status, 400);

  const claimed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_submitted",
      amount: "300",
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "Replacement of the tenant-damaged door",
          amount: "225",
        },
        {
          category: "13",
          description: "Lease-authorized replacement of a missing fixture",
          amount: "75",
        },
      ],
      note: "Invoice covers replacement of the damaged fixture.",
      evidenceUri: "ipfs://bafy-test-invoice",
      evidenceHash: `0x${"b".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
        moveInPhotos: true,
        preRepairPhotos: true,
        postRepairPhotos: true,
      },
      transactionHash: `0x${"c".repeat(64)}`,
    }),
  );
  assert.equal(claimed.events.at(-1).action, "deduction_claim_submitted");
  assert.match(claimed.events.at(-1).summary, /Supporting documentation attached/);
  assert.doesNotMatch(claimed.events.at(-1).summary, /ipfs:\/\//);
  assert.equal(
    claimed.events.at(-1).metadata.evidenceUri,
    "ipfs://bafy-test-invoice",
  );
  assert.equal(claimed.events.at(-1).metadata.items.length, 2);
  const claimReport = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.tenant}`,
    ),
    { DB: db },
  );
  assert.equal(claimReport.status, 200);
  const claimReportHtml = await claimReport.text();
  assert.match(claimReportHtml, /Replacement of the tenant-damaged door/);
  assert.match(claimReportHtml, /Lena Landlord/);
  assert.match(claimReportHtml, /Terry Tenant/);
  assert.match(claimReportHtml, /tenant@example\.com/);
  assert.match(claimReportHtml, /0x1111111111111111111111111111111111111111/);
  assert.match(claimReportHtml, /Recorded transaction receipts/);
  assert.match(claimReportHtml, /External supporting documentation recorded/);
  assert.doesNotMatch(claimReportHtml, /ipfs:\/\/bafy-test-invoice/);
  assert.match(claimReportHtml, new RegExp(`0x${"9".repeat(64)}`));
  const downloadedReport = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.tenant}&download=1`,
    ),
    { DB: db },
  );
  assert.equal(downloadedReport.status, 200);
  assert.match(
    downloadedReport.headers.get("content-disposition"),
    /attachment; filename="openescrow-.*-complete-record\.html"/,
  );
  const claimSnapshot = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.match(claimSnapshot.canonical, /Replacement of the tenant-damaged door/);

  const responded = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "claim_response",
      decision: "dispute",
      acceptedAmount: "0",
      note: "The invoice does not show tenant-caused damage.",
      transactionHash: `0x${"d".repeat(64)}`,
    }),
  );
  assert.equal(responded.events.at(-1).action, "claim_response_submitted");
  const respondedRetry = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "claim_response",
      decision: "dispute",
      acceptedAmount: "0",
      note: "The invoice does not show tenant-caused damage.",
      transactionHash: `0x${"d".repeat(64)}`,
    }),
  );
  assert.equal(
    respondedRetry.events.filter((event) => event.action === "claim_response_submitted").length,
    1,
  );
  const responseSnapshot = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.notEqual(responseSnapshot.hash, claimSnapshot.hash);
  const anchored = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "record_snapshot_anchored",
      snapshotHash: responseSnapshot.hash,
      transactionHash: `0x${"f".repeat(64)}`,
    }),
  );
  assert.equal(anchored.events.at(-1).action, "record_snapshot_anchored");
  const anchoredRetry = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "record_snapshot_anchored",
      snapshotHash: responseSnapshot.hash,
      transactionHash: `0x${"f".repeat(64)}`,
    }),
  );
  assert.equal(
    anchoredRetry.events.filter((event) => event.action === "record_snapshot_anchored").length,
    1,
  );
  const snapshotAfterAnchor = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(snapshotAfterAnchor.hash, responseSnapshot.hash);
  const activityReceipt = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "activity_hash_published",
      activityType: 3,
      contentHash: `0x${"1".repeat(64)}`,
      transactionHash: `0x${"2".repeat(64)}`,
    }),
  );
  assert.equal(activityReceipt.events.at(-1).action, "activity_hash_published");
  assert.equal(activityReceipt.events.at(-1).metadata.activityType, 3);
  const activityReceiptRetry = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "activity_hash_published",
      activityType: 3,
      contentHash: `0x${"1".repeat(64)}`,
      transactionHash: `0x${"2".repeat(64)}`,
    }),
  );
  assert.equal(
    activityReceiptRetry.events.filter(
      (event) => event.action === "activity_hash_published",
    ).length,
    1,
  );
  const snapshotAfterActivity = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.notEqual(snapshotAfterActivity.hash, snapshotAfterAnchor.hash);
  const evidenceReport = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.tenant}`,
    ),
    { DB: db },
  );
  const evidenceReportHtml = await evidenceReport.text();
  assert.equal(evidenceReport.status, 200);
  assert.match(evidenceReportHtml, /Onchain evidence receipts/);
  assert.match(evidenceReportHtml, new RegExp(`0x${"f".repeat(64)}`));
  assert.match(evidenceReportHtml, new RegExp(`0x${"1".repeat(64)}`));
  assert.match(evidenceReportHtml, new RegExp(`0x${"2".repeat(64)}`));
  assert.match(evidenceReportHtml, /BaseScan receipt/);

  const email = await worker.fetch(
    request("/api/notifications/claim", "POST", {
      proposalId: created.record.id,
      token: created.access.landlord,
      reviewLinks: claimReviewLinks(created),
      agreementId: "42",
      amount: "300",
      items: [
        {
          category: "Damage beyond ordinary wear",
          description: "Replacement of the tenant-damaged door",
          amount: "225",
        },
        {
          category: "Utilities or other unpaid charges",
          description: "Final water bill",
          amount: "75",
        },
      ],
      note: "",
      evidenceUri: "ipfs://bafy-test-invoice",
    }),
    { DB: db },
  );
  assert.equal(email.status, 503);
  assert.match((await email.json()).error, /not configured/);

  const originalFetch = globalThis.fetch;
  let deliveryCount = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://api.resend.com/emails");
    deliveryCount += 1;
    return Response.json({ id: "claim-message-1" });
  };
  try {
    const payload = {
      proposalId: created.record.id,
      token: created.access.landlord,
      reviewLinks: claimReviewLinks(created),
      agreementId: "42",
      amount: "300",
      items: [
        {
          category: "Damage beyond ordinary wear",
          description: "Replacement of the tenant-damaged door",
          amount: "225",
        },
        {
          category: "Utilities or other unpaid charges",
          description: "Final water bill",
          amount: "75",
        },
      ],
      note: "",
      evidenceUri: "ipfs://bafy-test-invoice",
    };
    const notificationEnv = {
      DB: db,
      RESEND_API_KEY: "test-resend-key",
      NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
    };
    const firstDelivery = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim", "POST", payload),
        notificationEnv,
      ),
    );
    const duplicateDelivery = await jsonResponse(
      await worker.fetch(
        request("/api/notifications/claim", "POST", payload),
        notificationEnv,
      ),
    );
    assert.equal(firstDelivery.duplicate, false);
    assert.equal(duplicateDelivery.duplicate, true);
    assert.equal(deliveryCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transaction receipt retries are atomic and remain bound to the exact participant", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          {
            name: "Terry Tenant",
            email: "tenant@example.com",
            depositShareBps: 6000,
          },
          {
            name: "Casey Co-tenant",
            email: "casey@example.com",
            depositShareBps: 4000,
          },
        ],
        arbiterName: "Ari Arbiter",
        arbiterEmail: "arbiter@example.com",
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "approve",
      wallet: "0x3333333333333333333333333333333333333333",
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "151",
      transactionHash: transactionHash(151),
    }),
  );

  const reservePayment = {
    type: "operations_reserve_paid",
    amount: "2.5",
    transactionHash: transactionHash(150),
  };
  const concurrentReservePayments = await Promise.all([
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      reservePayment,
    ),
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      reservePayment,
    ),
  ]);
  assert.deepEqual(
    concurrentReservePayments.map((response) => response.status),
    [200, 200],
  );
  const crossTenantReserveReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    reservePayment,
  );
  assert.equal(crossTenantReserveReplay.status, 409);
  assert.match(
    (await crossTenantReserveReplay.json()).error,
    /already assigned to another participant action/,
  );

  const shareFunding = {
    type: "tenant_share_funded",
    amount: "720",
    transactionHash: transactionHash(149),
  };
  const concurrentShareFunding = await Promise.all([
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      shareFunding,
    ),
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      shareFunding,
    ),
  ]);
  assert.deepEqual(
    concurrentShareFunding.map((response) => response.status),
    [200, 200],
  );
  const crossTenantShareReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    { ...shareFunding, amount: "480" },
  );
  assert.equal(crossTenantShareReplay.status, 409);
  assert.match(
    (await crossTenantShareReplay.json()).error,
    /already assigned to another participant action/,
  );
  await submitStandardClaim(db, created, {
    amount: "300",
    transactionByte: "c",
  });

  const primaryResponse = {
    type: "claim_response",
    decision: "dispute",
    acceptedAmount: "0",
    note: "The documentation does not establish tenant responsibility.",
    transactionHash: transactionHash(152),
  };
  const concurrentResponses = await Promise.all([
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      primaryResponse,
    ),
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      primaryResponse,
    ),
  ]);
  assert.deepEqual(
    concurrentResponses.map((response) => response.status),
    [200, 200],
  );
  const crossTenantReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    primaryResponse,
  );
  assert.equal(crossTenantReplay.status, 409);
  assert.match(
    (await crossTenantReplay.json()).error,
    /already recorded|already assigned to another participant action/,
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenants[1].token, {
      ...primaryResponse,
      transactionHash: transactionHash(153),
    }),
  );

  const ruling = {
    type: "arbiter_ruling",
    awardToLandlord: "75",
    note: "The documentation supports part of the requested amount.",
    transactionHash: transactionHash(154),
  };
  const concurrentRulings = await Promise.all([
    act(db, created.record.id, created.access.arbiter, ruling),
    act(db, created.record.id, created.access.arbiter, ruling),
  ]);
  assert.deepEqual(
    concurrentRulings.map((response) => response.status),
    [200, 200],
  );
  const crossRoleReplay = await act(
    db,
    created.record.id,
    created.access.tenants[0].token,
    ruling,
  );
  assert.equal(crossRoleReplay.status, 403);

  const tenantWithdrawal = {
    type: "withdrawal_completed",
    amount: "465",
    transactionHash: transactionHash(155),
  };
  const concurrentWithdrawals = await Promise.all([
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      tenantWithdrawal,
    ),
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      tenantWithdrawal,
    ),
  ]);
  assert.deepEqual(
    concurrentWithdrawals.map((response) => response.status),
    [200, 200],
  );
  const crossTenantWithdrawalReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    tenantWithdrawal,
  );
  assert.equal(crossTenantWithdrawalReplay.status, 409);
  assert.match(
    (await crossTenantWithdrawalReplay.json()).error,
    /already assigned to another participant action/,
  );

  const record = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.landlord}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(
    record.events.filter(
      (event) => event.action === "claim_response_submitted",
    ).length,
    2,
  );
  assert.equal(
    record.events.filter(
      (event) => event.action === "arbiter_ruling_submitted",
    ).length,
    1,
  );
  assert.equal(
    record.events.filter((event) => event.action === "withdrawal_completed")
      .length,
    1,
  );
  assert.equal(
    record.events.filter(
      (event) => event.action === "operations_reserve_paid",
    ).length,
    1,
  );
  assert.equal(
    record.events.filter((event) => event.action === "tenant_share_funded")
      .length,
    1,
  );
  assert.equal(
    db.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM negotiation_receipt_guards
         WHERE negotiation_id = ?
           AND action IN ('operations_reserve_paid', 'tenant_share_funded', 'claim_response_submitted', 'arbiter_ruling_submitted', 'withdrawal_completed')`,
      )
      .get(created.record.id).count,
    6,
  );
});

test("deadline receipt retries are atomic and exact-tenant bound", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          {
            name: "Terry Tenant",
            email: "tenant@example.com",
            depositShareBps: 6000,
          },
          {
            name: "Casey Co-tenant",
            email: "casey@example.com",
            depositShareBps: 4000,
          },
        ],
        arbiterName: "",
        arbiterEmail: null,
        terms,
      }),
      { DB: db },
    ),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "152",
      transactionHash: transactionHash(156),
    }),
  );

  const historicalReserveHash = transactionHash(158);
  db.database
    .prepare(
      `INSERT INTO negotiation_events
       (negotiation_id, created_at, actor_role, action, summary, revision,
        metadata_json)
       VALUES (?, ?, 'tenant', 'operations_reserve_paid', ?, 1, ?)`,
    )
    .run(
      created.record.id,
      "2026-08-04T00:00:00.000Z",
      "Historical unscoped reserve receipt.",
      JSON.stringify({
        amount: "2.5",
        token: "testUSDC",
        transactionHash: historicalReserveHash,
      }),
    );
  const unscopedCrossTenantReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    {
      type: "operations_reserve_paid",
      amount: "2.5",
      transactionHash: historicalReserveHash,
    },
  );
  assert.equal(unscopedCrossTenantReplay.status, 409);
  assert.match(
    (await unscopedCrossTenantReplay.json()).error,
    /already assigned to another participant action/,
  );

  const deadlineAction = {
    type: "timeout_executed",
    timeout: "no_claim_refund",
    transactionHash: transactionHash(157),
  };
  const concurrentActions = await Promise.all([
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      deadlineAction,
    ),
    act(
      db,
      created.record.id,
      created.access.tenants[0].token,
      deadlineAction,
    ),
  ]);
  assert.deepEqual(
    concurrentActions.map((response) => response.status),
    [200, 200],
  );
  const crossTenantReplay = await act(
    db,
    created.record.id,
    created.access.tenants[1].token,
    deadlineAction,
  );
  assert.equal(crossTenantReplay.status, 409);
  assert.match(
    (await crossTenantReplay.json()).error,
    /already recorded|already assigned to another participant action/,
  );

  const record = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.landlord}`,
      ),
      { DB: db },
    ),
  );
  const deadlineEvents = record.events.filter(
    (event) => event.action === "timeout_executed",
  );
  assert.equal(deadlineEvents.length, 1);
  assert.equal(deadlineEvents[0].metadata.tenantId, created.record.tenants[0].id);
  assert.equal(
    record.events.filter(
      (event) =>
        event.action === "operations_reserve_paid" &&
        event.metadata.transactionHash === historicalReserveHash,
    ).length,
    1,
  );
});

test("pilot rehearsal: a disputed claim completes funding, ruling, and withdrawals once", async () => {
  const db = new TestD1();
  const created = await jsonResponse(
    await worker.fetch(
      request("/api/negotiations", "POST", {
        landlordName: "Lena Landlord",
        landlordEmail: "landlord@example.com",
        tenants: [
          {
            name: "Terry Tenant",
            email: "tenant@example.com",
            depositShareBps: 6000,
          },
          {
            name: "Casey Co-tenant",
            email: "cotenant@example.com",
            depositShareBps: 4000,
          },
        ],
        arbiterName: "Ari Arbiter",
        arbiterEmail: "arbiter@example.com",
        terms: { ...terms, deposit: "1000" },
      }),
      { DB: db },
    ),
  );
  const [primary, coTenant] = created.access.tenants;

  await jsonResponse(
    await act(db, created.record.id, primary.token, {
      type: "propose_change",
      summary: "Allow ten days for every tenant to review a deduction claim.",
    }),
  );
  const revised = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "revise",
      summary: "Extended the tenant response period to ten days.",
      terms: { ...terms, deposit: "1000", responseDays: "10" },
      participants: {
        landlordName: "Lena Landlord",
        tenantName: "Terry Tenant",
        arbiterName: "Ari Arbiter",
      },
    }),
  );
  assert.equal(revised.revision, 2);

  for (const [index, tenant] of created.access.tenants.entries()) {
    const approved = await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "approve",
        name: index === 0 ? "Terry Tenant" : "Casey Co-tenant",
        wallet:
          index === 0
            ? "0x1111111111111111111111111111111111111111"
            : "0x2222222222222222222222222222222222222222",
      }),
    );
    assert.equal(approved.status, "draft");
  }
  const arbiterApproved = await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "approve",
      name: "Ari Arbiter",
      wallet: "0x3333333333333333333333333333333333333333",
    }),
  );
  assert.equal(arbiterApproved.status, "ready");

  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "finalize",
      agreementId: "101",
      transactionHash: transactionHash(1),
    }),
  );
  for (const [index, tenant] of created.access.tenants.entries()) {
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "operations_reserve_paid",
        amount: "2.5",
        transactionHash: transactionHash(2 + index),
      }),
    );
    await jsonResponse(
      await act(db, created.record.id, tenant.token, {
        type: "tenant_share_funded",
        amount: index === 0 ? "600" : "400",
        transactionHash: transactionHash(4 + index),
      }),
    );
  }

  const duplicateFunding = await act(db, created.record.id, primary.token, {
    type: "tenant_share_funded",
    amount: "600",
    transactionHash: transactionHash(6),
  });
  assert.equal(duplicateFunding.status, 409);
  assert.match((await duplicateFunding.json()).error, /already recorded as funded/);

  await submitStandardClaim(db, created, {
    amount: "300",
    transactionByte: "7",
  });
  const prematureRuling = await act(
    db,
    created.record.id,
    created.access.arbiter,
    {
      type: "arbiter_ruling",
      awardToLandlord: "50",
      note: "A ruling cannot precede the tenant responses.",
      transactionHash: transactionHash(8),
    },
  );
  assert.equal(prematureRuling.status, 409);
  assert.match((await prematureRuling.json()).error, /dispute is required/);

  await jsonResponse(
    await act(db, created.record.id, primary.token, {
      type: "claim_response",
      decision: "approve",
      acceptedAmount: "300",
      note: "",
      transactionHash: transactionHash(9),
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, coTenant.token, {
      type: "claim_response",
      decision: "partial",
      acceptedAmount: "150",
      note: "The invoice supports only part of the requested amount.",
      transactionHash: transactionHash(10),
    }),
  );

  const prematureWithdrawal = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "withdrawal_completed",
      amount: "150",
      transactionHash: transactionHash(11),
    },
  );
  assert.equal(prematureWithdrawal.status, 409);
  assert.match((await prematureWithdrawal.json()).error, /must be resolved/);

  const excessiveAward = await act(
    db,
    created.record.id,
    created.access.arbiter,
    {
      type: "arbiter_ruling",
      awardToLandlord: "151",
      note: "This exceeds the remaining disputed amount.",
      transactionHash: transactionHash(12),
    },
  );
  assert.equal(excessiveAward.status, 400);

  await jsonResponse(
    await act(db, created.record.id, created.access.arbiter, {
      type: "arbiter_ruling",
      awardToLandlord: "75",
      note: "The documentation supports half of the disputed balance.",
      transactionHash: transactionHash(13),
    }),
  );
  const withdrawalActors = [
    [created.access.landlord, "landlord", "225"],
    [primary.token, "tenant", "465"],
    [coTenant.token, "tenant", "310"],
  ];
  for (const [index, [token, , amount]] of withdrawalActors.entries()) {
    await jsonResponse(
      await act(db, created.record.id, token, {
        type: "withdrawal_completed",
        amount,
        transactionHash: transactionHash(14 + index),
      }),
    );
  }
  const duplicateWithdrawal = await act(db, created.record.id, coTenant.token, {
    type: "withdrawal_completed",
    amount: "1",
    transactionHash: transactionHash(20),
  });
  assert.equal(duplicateWithdrawal.status, 409);

  const record = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}?token=${created.access.landlord}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(record.status, "finalized");
  assert.equal(
    record.events.filter((event) => event.action === "tenant_share_funded").length,
    2,
  );
  assert.equal(
    record.events.filter((event) => event.action === "claim_response_submitted").length,
    2,
  );
  assert.equal(
    record.events.filter((event) => event.action === "withdrawal_completed").length,
    3,
  );

  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.landlord}`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.equal(report.headers.get("cache-control"), "no-store");
  assert.equal(report.headers.get("referrer-policy"), "no-referrer");
  assert.equal(report.headers.get("x-frame-options"), "DENY");
  assert.match(report.headers.get("content-security-policy"), /default-src 'none'/);
  const reportHtml = await report.text();
  assert.match(reportHtml, /Casey Co-tenant/);
  assert.match(reportHtml, /The documentation supports half/);
  assert.match(reportHtml, /withdrew 310 shares/);
});

test("pilot rehearsal: an accepted claim resolves allocations, withdrawals, and record export", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);

  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "operations_reserve_paid",
      transactionHash: transactionHash(21),
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "agreement_funded",
      transactionHash: transactionHash(22),
    }),
  );
  await submitStandardClaim(db, created, {
    amount: "300",
    transactionByte: "e",
  });

  const accepted = await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "claim_response",
      decision: "approve",
      acceptedAmount: "300",
      note: "",
      transactionHash: transactionHash(23),
    }),
  );
  assert.equal(accepted.events.at(-1).action, "claim_response_submitted");
  assert.equal(accepted.events.at(-1).metadata.decision, "approve");

  await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "withdrawal_completed",
      amount: "300",
      transactionHash: transactionHash(24),
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "withdrawal_completed",
      amount: "900",
      transactionHash: transactionHash(25),
    }),
  );
  const duplicateWithdrawal = await act(
    db,
    created.record.id,
    created.access.tenant,
    {
      type: "withdrawal_completed",
      amount: "1",
      transactionHash: transactionHash(26),
    },
  );
  assert.equal(duplicateWithdrawal.status, 409);

  const report = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}/report?token=${created.access.tenant}&download=1`,
    ),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(
    report.headers.get("content-disposition"),
    /attachment; filename="openescrow-.*-complete-record\.html"/,
  );
  const reportHtml = await report.text();
  assert.match(reportHtml, /approved the deduction in full/);
  assert.match(reportHtml, /Landlord withdrew 300 shares/);
  assert.match(reportHtml, /Terry Tenant withdrew 900 shares/);

  const firstSnapshot = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  const repeatedSnapshot = await jsonResponse(
    await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/snapshot?token=${created.access.tenant}`,
      ),
      { DB: db },
    ),
  );
  assert.equal(firstSnapshot.algorithm, "SHA-256");
  assert.equal(repeatedSnapshot.hash, firstSnapshot.hash);
  assert.equal(repeatedSnapshot.canonical, firstSnapshot.canonical);
  assert.equal(
    firstSnapshot.snapshot.events.filter(
      (event) => event.action === "withdrawal_completed",
    ).length,
    2,
  );
});

test("pilot rehearsal: a no-claim refund and withdrawal are role-safe and one-time", async () => {
  const db = new TestD1();
  const created = await create(db);
  const appId = "test-privy-no-claim-app";
  const kid = "test-no-claim-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const landlordIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "landlord@example.com",
    { sub: "did:privy:no-claim-landlord" },
  );
  const tenantIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    "tenant@example.com",
    { sub: "did:privy:no-claim-tenant" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };

  const discover = async (identityToken, role) =>
    jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": identityToken,
          },
          body: JSON.stringify({ role }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );

  try {
    const landlordDiscovery = await discover(landlordIdentityToken, "landlord");
    const tenantDiscovery = await discover(tenantIdentityToken, "tenant");
    assert.equal(landlordDiscovery.accesses.length, 1);
    assert.equal(landlordDiscovery.accesses[0].role, "landlord");
    assert.equal(tenantDiscovery.accesses.length, 1);
    assert.equal(tenantDiscovery.accesses[0].role, "tenant");
    assert.equal(
      (await discover(landlordIdentityToken, "tenant")).accesses.length,
      0,
    );
    assert.equal(
      (await discover(tenantIdentityToken, "landlord")).accesses.length,
      0,
    );

    const landlordToken = landlordDiscovery.accesses[0].token;
    const tenantToken = tenantDiscovery.accesses[0].token;
    await jsonResponse(
      await act(db, created.record.id, tenantToken, {
        type: "approve",
        wallet: "0x1111111111111111111111111111111111111111",
      }),
    );
    await jsonResponse(
      await act(db, created.record.id, landlordToken, {
        type: "finalize",
        agreementId: "42",
        transactionHash: transactionHash(30),
      }),
    );
    await jsonResponse(
      await act(db, created.record.id, tenantToken, {
        type: "operations_reserve_paid",
        transactionHash: transactionHash(31),
      }),
    );
    await jsonResponse(
      await act(db, created.record.id, tenantToken, {
        type: "agreement_funded",
        transactionHash: transactionHash(32),
      }),
    );

    const prematureWithdrawal = await act(db, created.record.id, tenantToken, {
      type: "withdrawal_completed",
      amount: "1200",
      transactionHash: transactionHash(33),
    });
    assert.equal(prematureWithdrawal.status, 409);
    assert.match((await prematureWithdrawal.json()).error, /must be resolved/);

    const landlordRefund = await act(db, created.record.id, landlordToken, {
      type: "timeout_executed",
      timeout: "no_claim_refund",
      transactionHash: transactionHash(34),
    });
    assert.equal(landlordRefund.status, 403);

    const refunded = await jsonResponse(
      await act(db, created.record.id, tenantToken, {
        type: "timeout_executed",
        timeout: "no_claim_refund",
        transactionHash: transactionHash(35),
      }),
    );
    assert.equal(refunded.events.at(-1).action, "timeout_executed");
    assert.equal(refunded.events.at(-1).metadata.timeout, "no_claim_refund");

    const duplicateRefund = await act(db, created.record.id, tenantToken, {
      type: "timeout_executed",
      timeout: "no_claim_refund",
      transactionHash: transactionHash(36),
    });
    assert.equal(duplicateRefund.status, 409);

    const claimAfterRefund = await act(db, created.record.id, landlordToken, {
      type: "claim_submitted",
      amount: "1",
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "A claim cannot be added after the no-claim refund.",
          amount: "1",
        },
      ],
      transactionHash: transactionHash(37),
    });
    assert.equal(claimAfterRefund.status, 409);
    assert.match((await claimAfterRefund.json()).error, /refund is already recorded/);

    await jsonResponse(
      await act(db, created.record.id, tenantToken, {
        type: "withdrawal_completed",
        amount: "1200",
        transactionHash: transactionHash(38),
      }),
    );
    const duplicateWithdrawal = await act(db, created.record.id, tenantToken, {
      type: "withdrawal_completed",
      amount: "1",
      transactionHash: transactionHash(39),
    });
    assert.equal(duplicateWithdrawal.status, 409);

    const record = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${landlordToken}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(
      record.events.filter((event) => event.action === "operations_reserve_paid").length,
      1,
    );
    assert.equal(
      record.events.filter((event) => event.action === "agreement_funded").length,
      1,
    );
    const refundEvents = record.events.filter(
      (event) =>
        event.action === "timeout_executed" &&
        event.metadata?.timeout === "no_claim_refund",
    );
    assert.equal(refundEvents.length, 1);
    assert.equal(refundEvents[0].metadata.transactionHash, transactionHash(35));
    const withdrawalEvents = record.events.filter(
      (event) => event.action === "withdrawal_completed",
    );
    assert.equal(withdrawalEvents.length, 1);
    assert.equal(withdrawalEvents[0].actorRole, "tenant");
    assert.equal(withdrawalEvents[0].metadata.transactionHash, transactionHash(38));
    assert.equal(
      record.events.some((event) =>
        [
          "deduction_claim_submitted",
          "claim_response_submitted",
          "arbiter_ruling_submitted",
        ].includes(event.action),
      ),
      false,
    );

    const report = await worker.fetch(
      request(
        `/api/negotiations/${created.record.id}/report?token=${tenantToken}`,
      ),
      { DB: db },
    );
    assert.equal(report.status, 200);
    const reportHtml = await report.text();
    assert.match(reportHtml, /no-claim full tenant refund/i);
    assert.match(reportHtml, /Terry Tenant withdrew 1200 shares/);
    assert.match(reportHtml, new RegExp(transactionHash(32)));
    assert.match(reportHtml, new RegExp(transactionHash(35)));
    assert.match(reportHtml, new RegExp(transactionHash(38)));

    const firstSnapshot = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}/snapshot?token=${tenantToken}`,
        ),
        { DB: db },
      ),
    );
    const repeatedSnapshot = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}/snapshot?token=${tenantToken}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(firstSnapshot.hash, repeatedSnapshot.hash);
    assert.equal(firstSnapshot.canonical, repeatedSnapshot.canonical);
    assert.equal(
      firstSnapshot.snapshot.events.filter(
        (event) => event.action === "withdrawal_completed",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a landlord can retract an unanswered claim but cannot replace or increase it", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  await submitStandardClaim(db, created, {
    amount: "100",
    transactionByte: "8",
  });

  const replacementClaim = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "claim_submitted",
      amount: "50",
      category: "Damage beyond ordinary wear",
      items: [
        {
          category: "11",
          description: "A replacement claim must not overwrite the record.",
          amount: "50",
        },
      ],
      note: "",
      evidenceUri: "openescrow://evidence/replacement",
      evidenceHash: `0x${"b".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: transactionHash(41),
    },
  );
  assert.equal(replacementClaim.status, 409);

  const increased = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "claim_amended",
      amount: "101",
      items: [
        {
          category: "11",
          description: "The amount cannot be increased.",
          amount: "101",
        },
      ],
      note: "",
      evidenceUri: "openescrow://evidence/increase",
      evidenceHash: `0x${"c".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: transactionHash(42),
    },
  );
  assert.equal(increased.status, 400);

  const retracted = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_amended",
      amount: "0",
      items: [
        {
          category: "11",
          description: "The landlord withdrew the pending deduction claim.",
          amount: "0",
        },
      ],
      note: "Claim withdrawn after reviewing the invoice.",
      evidenceUri: "openescrow://evidence/retraction",
      evidenceHash: `0x${"d".repeat(64)}`,
      californiaConfirmations: {
        itemizedStatement: true,
        supportingDocuments: true,
      },
      transactionHash: transactionHash(43),
    }),
  );
  assert.equal(retracted.events.at(-1).action, "deduction_claim_amended");

  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "withdrawal_completed",
      amount: "1200",
      transactionHash: transactionHash(44),
    }),
  );
});

test("static assets receive safe cache policies and browser privacy headers", async () => {
  const assets = {
    async fetch(assetRequest) {
      const path = new URL(assetRequest.url).pathname;
      if (path === "/missing") return new Response("missing", { status: 404 });
      if (path === "/assets/failing-12345678.js") {
        return new Response("temporary failure", { status: 503 });
      }
      return new Response(path === "/index.html" ? "<main>OpenEscrow</main>" : "asset", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };

  for (const path of ["/", "/missing", "/openescrow-logo.svg"]) {
    const response = await worker.fetch(request(path), { ASSETS: assets });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-security-policy"),
      /default-src 'self'/,
    );
    assert.match(
      response.headers.get("content-security-policy"),
      /frame-src https:\/\/auth\.privy\.io/,
    );
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("cache-control"), "no-cache");
  }

  const versionedAsset = await worker.fetch(
    request("/assets/WorkspaceApp-BLtOPHD6.js"),
    { ASSETS: assets },
  );
  assert.equal(versionedAsset.status, 200);
  assert.equal(
    versionedAsset.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(versionedAsset.headers.get("referrer-policy"), "no-referrer");
  assert.equal(versionedAsset.headers.get("x-content-type-options"), "nosniff");

  const failedVersionedAsset = await worker.fetch(
    request("/assets/failing-12345678.js"),
    { ASSETS: assets },
  );
  assert.equal(failedVersionedAsset.status, 503);
  assert.equal(failedVersionedAsset.headers.get("cache-control"), "no-cache");
});

test("configured receipt verification accepts only the expected Base Sepolia agreement event", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const originalFetch = globalThis.fetch;
  let receiptMutation = "missing";
  let stateToken = RECEIPT_TEST_USDC;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://sepolia.base.org/");
    const rpcRequest = JSON.parse(options.body);
    if (rpcRequest.method === "eth_call") {
      return Response.json({
        jsonrpc: "2.0",
        id: 2,
        result: agreementStateResult(stateToken),
      });
    }
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    const receipt =
      receiptMutation === "missing"
        ? {
            status: "0x1",
            blockNumber: "0x2a",
            from: RECEIPT_TEST_LANDLORD,
            logs: [],
          }
        : finalizationReceipt(42, receiptMutation);
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        ...receipt,
        blockHash: transactionHash(9_002),
        transactionHash: rpcRequest.params[0],
      },
    });
  };
  const env = {
    VERIFY_TRANSACTION_RECEIPTS: "true",
  };
  try {
    const rejected = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "42",
        transactionHash: transactionHash(50),
      },
      env,
    );
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /expected event/);

    receiptMutation = "wrong-tenant";
    const wrongTenant = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "42",
        transactionHash: transactionHash(51),
      },
      env,
    );
    assert.equal(wrongTenant.status, 400);

    receiptMutation = "wrong-amount";
    const wrongAmount = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "42",
        transactionHash: transactionHash(52),
      },
      env,
    );
    assert.equal(wrongAmount.status, 400);

    for (const [mutation, hashIndex] of [
      ["tenant-as-landlord", 114],
      ["wrong-arbiter", 115],
      ["wrong-claim-start", 116],
      ["wrong-response-period", 117],
      ["wrong-participant-share", 118],
      ["missing-participant", 119],
      ["split-match", 120],
    ]) {
      receiptMutation = mutation;
      const rejected = await act(
        db,
        created.record.id,
        created.access.landlord,
        {
          type: "finalize",
          agreementId: "42",
          transactionHash: transactionHash(hashIndex),
        },
        env,
      );
      assert.equal(rejected.status, 400, mutation);
    }

    receiptMutation = "valid";
    stateToken = RECEIPT_TEST_YIELD_USDC;
    const wrongToken = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "42",
        transactionHash: transactionHash(53),
      },
      env,
    );
    assert.equal(wrongToken.status, 400);

    stateToken = RECEIPT_TEST_USDC;
    const finalized = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.landlord,
        {
          type: "finalize",
          agreementId: "42",
          transactionHash: transactionHash(50),
        },
        env,
      ),
    );
    assert.equal(finalized.status, "finalized");
    const verified = finalized.events.find(
      (event) => event.action === "transaction_receipt_verified",
    );
    assert.equal(verified.metadata.transactionHash, transactionHash(50));
    assert.equal(verified.metadata.blockNumber, "0x2a");
    assert.equal(verified.metadata.chainId, 84532);
    assert.equal(verified.metadata.actorAddress, RECEIPT_TEST_LANDLORD);
    assert.equal(
      finalized.events.filter((event) => event.action === "posted_onchain").length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("receipt verification rejects malformed RPC envelopes and mismatched receipts before recovering", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: RECEIPT_TEST_TENANT,
    }),
  );
  const originalFetch = globalThis.fetch;
  let mode = "wrong-id";
  globalThis.fetch = async (url, options) => {
    const rpcRequest = JSON.parse(options.body);
    if (rpcRequest.method === "eth_chainId") {
      return Response.json({
        jsonrpc: "2.0",
        id: rpcRequest.id,
        result:
          String(url) === "https://wrong-receipt-chain.example/"
            ? "0x1"
            : "0x14a34",
      });
    }
    if (mode === "oversized") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: rpcRequest.id,
          result: null,
          padding: "x".repeat(512 * 1024),
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (rpcRequest.method === "eth_call") {
      return Response.json({
        jsonrpc: "2.0",
        id: rpcRequest.id,
        result: agreementStateResult(),
      });
    }
    const receipt = {
      ...finalizationReceipt(88),
      transactionHash:
        mode === "wrong-transaction"
          ? transactionHash(8_888)
          : rpcRequest.params[0],
    };
    return Response.json({
      jsonrpc: "2.0",
      id: mode === "wrong-id" ? rpcRequest.id + 1 : rpcRequest.id,
      result: receipt,
    });
  };
  const env = {
    VERIFY_TRANSACTION_RECEIPTS: "true",
    BASE_SEPOLIA_RPC_URL: "https://rpc.example/",
  };
  const finalize = (hashIndex) =>
    act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "88",
        transactionHash: transactionHash(hashIndex),
      },
      env,
    );
  try {
    const wrongChain = await act(
      db,
      created.record.id,
      created.access.landlord,
      {
        type: "finalize",
        agreementId: "88",
        transactionHash: transactionHash(300),
      },
      {
        ...env,
        BASE_SEPOLIA_RPC_URL: "https://wrong-receipt-chain.example/",
      },
    );
    assert.equal(wrongChain.status, 503);
    assert.match((await wrongChain.json()).error, /does not report Base Sepolia/);

    for (const [nextMode, hashIndex] of [
      ["wrong-id", 301],
      ["oversized", 302],
      ["wrong-transaction", 303],
    ]) {
      mode = nextMode;
      const response = await finalize(hashIndex);
      assert.equal(response.status, 503, nextMode);
      assert.match((await response.json()).error, /could not verify/i);
    }

    mode = "valid";
    const recovered = await jsonResponse(await finalize(304));
    assert.equal(recovered.status, "finalized");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("simultaneous receipt verification shares identical RPC work", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: RECEIPT_TEST_TENANT,
    }),
  );
  const originalFetch = globalThis.fetch;
  let rpcFetchCount = 0;
  globalThis.fetch = async (_url, options) => {
    rpcFetchCount += 1;
    const rpcRequest = JSON.parse(options.body);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result:
        rpcRequest.method === "eth_call"
          ? agreementStateResult()
          : {
              ...finalizationReceipt(89),
              transactionHash: rpcRequest.params[0],
            },
    });
  };
  const action = {
    type: "finalize",
    agreementId: "89",
    transactionHash: transactionHash(305),
  };
  try {
    const responses = await Promise.all([
      act(db, created.record.id, created.access.landlord, action, {
        VERIFY_TRANSACTION_RECEIPTS: "true",
      }),
      act(db, created.record.id, created.access.landlord, action, {
        VERIFY_TRANSACTION_RECEIPTS: "true",
      }),
    ]);
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200],
    );
    assert.equal(rpcFetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("arbiter replacement mirrors mutual consent, gates nominee access, and revokes the former arbiter", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  await finalizeWithVerifiedReceipt(db, created, {
    arbiterWallet: RECEIPT_TEST_ARBITER,
  });
  const replacementWallet = "0x4444444444444444444444444444444444444444";
  const replacementEmail = "replacement@example.com";
  const agreementTopic = receiptWord(42);
  const proposedReceipt = {
    status: "0x1",
    blockNumber: "0x31",
    from: RECEIPT_TEST_LANDLORD,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [
          ARBITER_REPLACEMENT_PROPOSED_TOPIC,
          agreementTopic,
          receiptAddressWord(RECEIPT_TEST_LANDLORD),
          receiptAddressWord(replacementWallet),
        ],
        data: "0x",
      },
    ],
  };
  const proposed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "arbiter_replacement_proposed",
        newArbiterEmail: replacementEmail,
        newArbiterWallet: replacementWallet,
        transactionHash: transactionHash(201),
      },
      proposedReceipt,
    ),
  );
  assert.equal(proposed.record.arbiterReplacement.status, "proposed");
  assert.equal(proposed.record.arbiterReplacement.wallet, replacementWallet);
  assert.equal(proposed.invite.email, replacementEmail);
  const firstNomineeToken = proposed.invite.token;

  const nomineeBeforeConfirmation = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(firstNomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeBeforeConfirmation.status, 403);

  const proposerCannotConfirm = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    {
      type: "arbiter_replacement_confirmed",
      transactionHash: transactionHash(202),
    },
    {
      status: "0x1",
      blockNumber: "0x32",
      from: RECEIPT_TEST_LANDLORD,
      logs: [
        {
          address: RECEIPT_TEST_OPEN_ESCROW,
          topics: [
            ARBITER_REPLACEMENT_CONFIRMED_TOPIC,
            agreementTopic,
            receiptAddressWord(RECEIPT_TEST_LANDLORD),
          ],
          data: "0x",
        },
      ],
    },
  );
  assert.equal(proposerCannotConfirm.status, 409);

  const wrongConfirmationReceipt = await actWithVerifiedReceipt(
    db,
    created,
    created.access.tenant,
    {
      type: "arbiter_replacement_confirmed",
      transactionHash: transactionHash(212),
    },
    {
      status: "0x1",
      blockNumber: "0x32",
      from: RECEIPT_TEST_TENANT,
      logs: [
        {
          address: RECEIPT_TEST_OPEN_ESCROW,
          topics: [
            ARBITER_REPLACEMENT_CONFIRMED_TOPIC,
            agreementTopic,
            receiptAddressWord(RECEIPT_TEST_LANDLORD),
          ],
          data: "0x",
        },
      ],
    },
  );
  assert.equal(wrongConfirmationReceipt.status, 400);

  const confirmed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      {
        type: "arbiter_replacement_confirmed",
        transactionHash: transactionHash(203),
      },
      {
        status: "0x1",
        blockNumber: "0x33",
        from: RECEIPT_TEST_TENANT,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [
              ARBITER_REPLACEMENT_CONFIRMED_TOPIC,
              agreementTopic,
              receiptAddressWord(RECEIPT_TEST_TENANT),
            ],
            data: "0x",
          },
        ],
      },
    ),
  );
  assert.equal(confirmed.arbiterReplacement.status, "confirmed");

  const nomineeAfterConfirmation = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(firstNomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeAfterConfirmation.status, 200);
  const appId = "test-privy-replacement-arbiter-app";
  const kid = "test-replacement-arbiter-key";
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const nomineeIdentityToken = await identityTokenFor(
    keyPair.privateKey,
    appId,
    kid,
    replacementEmail,
    { sub: "did:privy:replacement-arbiter" },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`,
    );
    return Response.json({ keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] });
  };
  let nomineeAccountToken;
  try {
    const discovery = await jsonResponse(
      await worker.fetch(
        new Request("https://openescrow.example/api/negotiations/discover", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "privy-id-token": nomineeIdentityToken,
          },
          body: JSON.stringify({ role: "arbiter" }),
        }),
        { DB: db, PRIVY_APP_ID: appId },
      ),
    );
    assert.equal(discovery.accesses.length, 1);
    nomineeAccountToken = discovery.accesses[0].token;
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(nomineeAccountToken);
  const nomineeAccountSession = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeAccountToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeAccountSession.status, 200);
  const formerArbiterBeforeAcceptance = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(created.access.arbiter)}`,
    ),
    { DB: db },
  );
  assert.equal(formerArbiterBeforeAcceptance.status, 200);

  const reset = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "arbiter_replacement_invite_reset",
    }),
  );
  assert.equal(reset.record.arbiterReplacement.status, "confirmed");
  const replacementToken = reset.invite.token;
  assert.notEqual(replacementToken, firstNomineeToken);
  const revokedNomineeLink = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(firstNomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(revokedNomineeLink.status, 403);
  const revokedNomineeAccountSession = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeAccountToken)}`,
    ),
    { DB: db },
  );
  assert.equal(revokedNomineeAccountSession.status, 403);

  const acceptedReceipt = ({
    oldArbiter = RECEIPT_TEST_ARBITER,
    newArbiter = replacementWallet,
    from = replacementWallet,
  } = {}) => ({
    status: "0x1",
    blockNumber: "0x34",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [
          ARBITER_REPLACED_TOPIC,
          agreementTopic,
          receiptAddressWord(oldArbiter),
          receiptAddressWord(newArbiter),
        ],
        data: "0x",
      },
    ],
  });
  for (const [receipt, hashIndex, label] of [
    [
      acceptedReceipt({
        oldArbiter: "0x5555555555555555555555555555555555555555",
      }),
      204,
      "wrong former arbiter",
    ],
    [
      acceptedReceipt({
        newArbiter: "0x5555555555555555555555555555555555555555",
      }),
      205,
      "wrong nominee",
    ],
    [
      acceptedReceipt({
        from: RECEIPT_TEST_ARBITER,
      }),
      206,
      "wrong sender",
    ],
  ]) {
    const rejected = await actWithVerifiedReceipt(
      db,
      created,
      replacementToken,
      {
        type: "arbiter_replacement_accepted",
        transactionHash: transactionHash(hashIndex),
      },
      receipt,
    );
    assert.equal(rejected.status, 400, label);
  }

  const accepted = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "arbiter_replacement_accepted",
        transactionHash: transactionHash(207),
      },
      acceptedReceipt(),
    ),
  );
  assert.equal(accepted.arbiterEmail, replacementEmail);
  assert.equal(accepted.arbiterWallet, replacementWallet);
  assert.equal(accepted.arbiterReplacement, null);
  assert.ok(
    accepted.events.some(
      (event) =>
        event.action === "transaction_receipt_verified" &&
        event.metadata.eventType === "arbiter_replacement_accepted" &&
        event.metadata.actorAddress === replacementWallet,
    ),
  );

  const formerArbiterAfterAcceptance = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(created.access.arbiter)}`,
    ),
    { DB: db },
  );
  assert.equal(formerArbiterAfterAcceptance.status, 403);
  const replacementArbiterAfterAcceptance = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(replacementToken)}`,
    ),
    { DB: db },
  );
  assert.equal(replacementArbiterAfterAcceptance.status, 200);
});

test("arbiter replacement cancellation revokes the nominee and cannot bypass receipt verification", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  await finalizeWithVerifiedReceipt(db, created, {
    arbiterWallet: RECEIPT_TEST_ARBITER,
  });
  const replacementWallet = "0x4444444444444444444444444444444444444444";
  const disabled = await act(db, created.record.id, created.access.landlord, {
    type: "arbiter_replacement_proposed",
    newArbiterEmail: "replacement@example.com",
    newArbiterWallet: replacementWallet,
    transactionHash: transactionHash(208),
  });
  assert.equal(disabled.status, 503);

  const wrongNomineeReceipt = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    {
      type: "arbiter_replacement_proposed",
      newArbiterEmail: "replacement@example.com",
      newArbiterWallet: replacementWallet,
      transactionHash: transactionHash(213),
    },
    {
      status: "0x1",
      blockNumber: "0x35",
      from: RECEIPT_TEST_LANDLORD,
      logs: [
        {
          address: RECEIPT_TEST_OPEN_ESCROW,
          topics: [
            ARBITER_REPLACEMENT_PROPOSED_TOPIC,
            receiptWord(42),
            receiptAddressWord(RECEIPT_TEST_LANDLORD),
            receiptAddressWord("0x5555555555555555555555555555555555555555"),
          ],
          data: "0x",
        },
      ],
    },
  );
  assert.equal(wrongNomineeReceipt.status, 400);

  const proposed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "arbiter_replacement_proposed",
        newArbiterEmail: "replacement@example.com",
        newArbiterWallet: replacementWallet,
        transactionHash: transactionHash(209),
      },
      {
        status: "0x1",
        blockNumber: "0x35",
        from: RECEIPT_TEST_LANDLORD,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [
              ARBITER_REPLACEMENT_PROPOSED_TOPIC,
              receiptWord(42),
              receiptAddressWord(RECEIPT_TEST_LANDLORD),
              receiptAddressWord(replacementWallet),
            ],
            data: "0x",
          },
        ],
      },
    ),
  );
  const nomineeToken = proposed.invite.token;
  await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      {
        type: "arbiter_replacement_confirmed",
        transactionHash: transactionHash(215),
      },
      {
        status: "0x1",
        blockNumber: "0x36",
        from: RECEIPT_TEST_TENANT,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [
              ARBITER_REPLACEMENT_CONFIRMED_TOPIC,
              receiptWord(42),
              receiptAddressWord(RECEIPT_TEST_TENANT),
            ],
            data: "0x",
          },
        ],
      },
    ),
  );
  const nomineeBeforeCancellation = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeBeforeCancellation.status, 200);
  const wrongParty = await actWithVerifiedReceipt(
    db,
    created,
    created.access.tenant,
    {
      type: "arbiter_replacement_cancelled",
      transactionHash: transactionHash(210),
    },
    {
      status: "0x1",
      blockNumber: "0x36",
      from: RECEIPT_TEST_TENANT,
      logs: [
        {
          address: RECEIPT_TEST_OPEN_ESCROW,
          topics: [ARBITER_REPLACEMENT_CANCELLED_TOPIC, receiptWord(42)],
          data: "0x",
        },
      ],
    },
  );
  assert.equal(wrongParty.status, 403);

  const wrongCancellationSender = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    {
      type: "arbiter_replacement_cancelled",
      transactionHash: transactionHash(214),
    },
    {
      status: "0x1",
      blockNumber: "0x36",
      from: RECEIPT_TEST_TENANT,
      logs: [
        {
          address: RECEIPT_TEST_OPEN_ESCROW,
          topics: [ARBITER_REPLACEMENT_CANCELLED_TOPIC, receiptWord(42)],
          data: "0x",
        },
      ],
    },
  );
  assert.equal(wrongCancellationSender.status, 400);

  const cancelled = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "arbiter_replacement_cancelled",
        transactionHash: transactionHash(211),
      },
      {
        status: "0x1",
        blockNumber: "0x37",
        from: RECEIPT_TEST_LANDLORD,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [ARBITER_REPLACEMENT_CANCELLED_TOPIC, receiptWord(42)],
            data: "0x",
          },
        ],
      },
    ),
  );
  assert.equal(cancelled.arbiterReplacement, null);
  const nomineeAfterCancellation = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeAfterCancellation.status, 403);
});

test("a verified terminal lifecycle action revokes an unaccepted replacement arbiter", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  await finalizeWithVerifiedReceipt(db, created, {
    arbiterWallet: RECEIPT_TEST_ARBITER,
  });
  const replacementWallet = "0x4444444444444444444444444444444444444444";
  const agreementTopic = receiptWord(42);
  const proposed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      {
        type: "arbiter_replacement_proposed",
        newArbiterEmail: "replacement@example.com",
        newArbiterWallet: replacementWallet,
        transactionHash: transactionHash(216),
      },
      {
        status: "0x1",
        blockNumber: "0x38",
        from: RECEIPT_TEST_LANDLORD,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [
              ARBITER_REPLACEMENT_PROPOSED_TOPIC,
              agreementTopic,
              receiptAddressWord(RECEIPT_TEST_LANDLORD),
              receiptAddressWord(replacementWallet),
            ],
            data: "0x",
          },
        ],
      },
    ),
  );
  await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      {
        type: "arbiter_replacement_confirmed",
        transactionHash: transactionHash(217),
      },
      {
        status: "0x1",
        blockNumber: "0x39",
        from: RECEIPT_TEST_TENANT,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [
              ARBITER_REPLACEMENT_CONFIRMED_TOPIC,
              agreementTopic,
              receiptAddressWord(RECEIPT_TEST_TENANT),
            ],
            data: "0x",
          },
        ],
      },
    ),
  );
  const nomineeToken = proposed.invite.token;
  const nomineeBeforeClose = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeBeforeClose.status, 200);

  const refunded = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      {
        type: "timeout_executed",
        timeout: "no_claim_refund",
        transactionHash: transactionHash(218),
      },
      {
        status: "0x1",
        blockNumber: "0x3a",
        from: RECEIPT_TEST_TENANT,
        logs: [
          {
            address: RECEIPT_TEST_OPEN_ESCROW,
            topics: [NO_CLAIM_WITHDRAWAL_TOPIC, agreementTopic],
            data: receiptData(receiptWord(1_200_000_000n)),
          },
        ],
      },
    ),
  );
  assert.equal(refunded.arbiterReplacement, null);
  assert.ok(
    refunded.events.some(
      (event) =>
        event.action === "arbiter_replacement_expired" &&
        event.metadata.closedByAction === "timeout_executed",
    ),
  );
  const nomineeAfterClose = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(nomineeToken)}`,
    ),
    { DB: db },
  );
  assert.equal(nomineeAfterClose.status, 403);
  const currentArbiterAfterClose = await worker.fetch(
    request(
      `/api/negotiations/${created.record.id}?token=${encodeURIComponent(created.access.arbiter)}`,
    ),
    { DB: db },
  );
  assert.equal(currentArbiterAfterClose.status, 200);
});

test("receipt verification binds the operations reserve to its escrow, tenant, token, and exact share", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const reserveReceipt = ({
    reserve = RECEIPT_TEST_OPERATIONS_RESERVE,
    escrow = RECEIPT_TEST_OPEN_ESCROW,
    agreementId = 42,
    payer = RECEIPT_TEST_TENANT,
    token = RECEIPT_TEST_USDC,
    amount = 5_000_000n,
    from = RECEIPT_TEST_TENANT,
  } = {}) => ({
    status: "0x1",
    blockNumber: "0x2b",
    from,
    logs: [
      {
        address: reserve,
        topics: [
          OPERATIONS_RESERVE_PAID_TOPIC,
          receiptAddressWord(escrow),
          receiptWord(agreementId),
          receiptAddressWord(payer),
        ],
        data: receiptData(receiptAddressWord(token), receiptWord(amount)),
      },
    ],
  });
  const action = {
    type: "operations_reserve_paid",
    amount: "5",
    transactionHash: transactionHash(121),
  };
  for (const [receipt, hashIndex, label] of [
    [
      reserveReceipt({
        reserve: RECEIPT_TEST_OPEN_ESCROW,
      }),
      122,
      "wrong reserve",
    ],
    [
      reserveReceipt({
        escrow: RECEIPT_TEST_OPERATIONS_RESERVE,
      }),
      123,
      "wrong escrow",
    ],
    [
      reserveReceipt({
        agreementId: 43,
      }),
      124,
      "wrong agreement",
    ],
    [
      reserveReceipt({
        payer: RECEIPT_TEST_OTHER_TENANT,
      }),
      125,
      "wrong tenant",
    ],
    [
      reserveReceipt({
        token: RECEIPT_TEST_YIELD_USDC,
      }),
      126,
      "wrong token",
    ],
    [
      reserveReceipt({
        amount: 4_999_999n,
      }),
      127,
      "wrong amount",
    ],
    [
      reserveReceipt({
        from: RECEIPT_TEST_OTHER_TENANT,
      }),
      128,
      "wrong sender",
    ],
  ]) {
    const rejected = await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      { ...action, transactionHash: transactionHash(hashIndex) },
      receipt,
    );
    assert.equal(rejected.status, 400, label);
  }

  const paid = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      { ...action, transactionHash: transactionHash(129) },
      reserveReceipt(),
    ),
  );
  assert.equal(
    paid.events.filter(
      (event) => event.action === "operations_reserve_paid",
    ).length,
    1,
  );
});

test("receipt verification falls back when the official public RPC is rate limited", async () => {
  const db = new TestD1();
  const created = await create(db);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "approve",
      wallet: "0x1111111111111111111111111111111111111111",
    }),
  );
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url, options) => {
    requestedUrls.push(String(url));
    const rpcRequest = JSON.parse(options.body);
    if (String(url) === "https://sepolia.base.org/") {
      return new Response("rate limited", { status: 429 });
    }
    assert.equal(String(url), "https://base-sepolia-rpc.publicnode.com/");
    if (rpcRequest.method === "eth_call") {
      return Response.json({
        jsonrpc: "2.0",
        id: 2,
        result: agreementStateResult(),
      });
    }
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        ...finalizationReceipt(43),
        blockNumber: "0x2b",
        transactionHash: rpcRequest.params[0],
      },
    });
  };
  try {
    const finalized = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.landlord,
        {
          type: "finalize",
          agreementId: "43",
          transactionHash: transactionHash(51),
        },
        { VERIFY_TRANSACTION_RECEIPTS: "true" },
      ),
    );
    assert.equal(finalized.status, "finalized");
    assert.deepEqual(requestedUrls, [
      "https://sepolia.base.org/",
      "https://base-sepolia-rpc.publicnode.com/",
      "https://sepolia.base.org/",
      "https://base-sepolia-rpc.publicnode.com/",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("receipt verification binds tenant funding to the exact participant and amount", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const originalFetch = globalThis.fetch;
  let receiptMode = "wrong-tenant";
  globalThis.fetch = async (_url, options) => {
    const rpcRequest = JSON.parse(options.body);
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    const tenant =
      receiptMode === "wrong-tenant"
        ? RECEIPT_TEST_OTHER_TENANT
        : RECEIPT_TEST_TENANT;
    const eventTopic =
      receiptMode === "aggregate-only"
        ? AGREEMENT_FUNDED_TOPIC
        : TENANT_SHARE_FUNDED_TOPIC;
    const amount =
      receiptMode === "wrong-amount" ? 1_199_000_000n : 1_200_000_000n;
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "0x1",
        blockNumber: "0x2c",
        blockHash: transactionHash(9_003),
        transactionHash: rpcRequest.params[0],
        from: RECEIPT_TEST_TENANT,
        logs: [
          {
            address: "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99",
            topics:
              eventTopic === TENANT_SHARE_FUNDED_TOPIC
                ? [
                    eventTopic,
                    receiptWord(42),
                    receiptAddressWord(tenant),
                  ]
                : [eventTopic, receiptWord(42)],
            data:
              eventTopic === TENANT_SHARE_FUNDED_TOPIC
                ? receiptData(receiptWord(amount), receiptWord(amount))
                : receiptData(receiptWord(amount)),
          },
        ],
      },
    });
  };
  const action = {
    type: "tenant_share_funded",
    amount: "1200",
    transactionHash: transactionHash(60),
  };
  try {
    const wrongTenant = await act(
      db,
      created.record.id,
      created.access.tenant,
      action,
      { VERIFY_TRANSACTION_RECEIPTS: "true" },
    );
    assert.equal(wrongTenant.status, 400);

    receiptMode = "wrong-amount";
    const wrongAmount = await act(
      db,
      created.record.id,
      created.access.tenant,
      { ...action, transactionHash: transactionHash(61) },
      { VERIFY_TRANSACTION_RECEIPTS: "true" },
    );
    assert.equal(wrongAmount.status, 400);

    receiptMode = "aggregate-only";
    const aggregateOnly = await act(
      db,
      created.record.id,
      created.access.tenant,
      { ...action, transactionHash: transactionHash(62) },
      { VERIFY_TRANSACTION_RECEIPTS: "true" },
    );
    assert.equal(aggregateOnly.status, 400);

    receiptMode = "valid";
    const funded = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.tenant,
        { ...action, transactionHash: transactionHash(63) },
        { VERIFY_TRANSACTION_RECEIPTS: "true" },
      ),
    );
    assert.equal(
      funded.events.filter((event) => event.action === "tenant_share_funded")
        .length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("receipt verification binds deduction claims and amendments to exact values and the verified landlord", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithVerifiedReceipt(db, created);
  const claimAction = {
    type: "claim_submitted",
    amount: "300",
    category: "Damage beyond ordinary wear",
    items: [
      {
        category: "11",
        description: "Documented repair",
        amount: "300",
      },
    ],
    note: "",
    evidenceUri: "openescrow://evidence/receipt-claim",
    evidenceHash: transactionHash(81),
    californiaConfirmations: {
      itemizedStatement: true,
      supportingDocuments: true,
    },
    transactionHash: transactionHash(82),
  };
  const claimReceipt = ({
    from = RECEIPT_TEST_LANDLORD,
    amount = 300_000_000n,
    unclaimed = 900_000_000n,
  } = {}) => ({
    status: "0x1",
    blockNumber: "0x2e",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [CLAIM_SUBMITTED_TOPIC, receiptWord(42)],
        data: receiptData(receiptWord(amount), receiptWord(unclaimed)),
      },
    ],
  });

  const wrongLandlord = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    claimAction,
    claimReceipt({ from: RECEIPT_TEST_TENANT }),
  );
  assert.equal(wrongLandlord.status, 400);

  const wrongClaimAmount = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    { ...claimAction, transactionHash: transactionHash(83) },
    claimReceipt({ amount: 299_000_000n, unclaimed: 901_000_000n }),
  );
  assert.equal(wrongClaimAmount.status, 400);

  const claimed = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      { ...claimAction, transactionHash: transactionHash(84) },
      claimReceipt(),
    ),
  );
  assert.equal(
    claimed.events.filter(
      (event) => event.action === "deduction_claim_submitted",
    ).length,
    1,
  );

  const amendmentAction = {
    type: "claim_amended",
    amount: "200",
    items: [
      {
        category: "11",
        description: "Updated documented repair",
        amount: "200",
      },
    ],
    note: "Reduced after reviewing the final invoice.",
    evidenceUri: "openescrow://evidence/receipt-amendment",
    evidenceHash: transactionHash(85),
    californiaConfirmations: {
      itemizedStatement: true,
      supportingDocuments: true,
    },
    transactionHash: transactionHash(86),
  };
  const amendmentReceipt = (reduction = 100_000_000n) => ({
    status: "0x1",
    blockNumber: "0x2f",
    from: RECEIPT_TEST_LANDLORD,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [CLAIM_AMENDED_TOPIC, receiptWord(42)],
        data: receiptData(receiptWord(200_000_000n), receiptWord(reduction)),
      },
    ],
  });
  const wrongReduction = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    amendmentAction,
    amendmentReceipt(99_000_000n),
  );
  assert.equal(wrongReduction.status, 400);

  const amended = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      { ...amendmentAction, transactionHash: transactionHash(87) },
      amendmentReceipt(),
    ),
  );
  assert.equal(
    amended.events.filter(
      (event) => event.action === "deduction_claim_amended",
    ).length,
    1,
  );

  const retractionDb = new TestD1();
  const retractionCreated = await create(retractionDb);
  await finalizeWithVerifiedReceipt(retractionDb, retractionCreated, {
    agreementId: 43,
  });
  await submitStandardClaim(retractionDb, retractionCreated, {
    amount: "100",
    transactionByte: "8",
  });
  const retractionAction = {
    type: "claim_amended",
    amount: "0",
    items: [
      {
        category: "11",
        description: "The landlord withdrew the pending deduction claim.",
        amount: "0",
      },
    ],
    note: "Claim withdrawn after reviewing the invoice.",
    evidenceUri: "openescrow://evidence/receipt-retraction",
    evidenceHash: transactionHash(88),
    californiaConfirmations: {
      itemizedStatement: true,
      supportingDocuments: true,
    },
    transactionHash: transactionHash(89),
  };
  const retractionReceipt = (data = "0x") => ({
    status: "0x1",
    blockNumber: "0x30",
    from: RECEIPT_TEST_LANDLORD,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [CLAIM_RETRACTED_TOPIC, receiptWord(43)],
        data,
      },
    ],
  });
  const retractionWithUnexpectedData = await actWithVerifiedReceipt(
    retractionDb,
    retractionCreated,
    retractionCreated.access.landlord,
    retractionAction,
    retractionReceipt(receiptData(receiptWord(0))),
  );
  assert.equal(retractionWithUnexpectedData.status, 400);

  const retracted = await jsonResponse(
    await actWithVerifiedReceipt(
      retractionDb,
      retractionCreated,
      retractionCreated.access.landlord,
      { ...retractionAction, transactionHash: transactionHash(90) },
      retractionReceipt(),
    ),
  );
  assert.equal(
    retracted.events.filter(
      (event) => event.action === "deduction_claim_amended",
    ).length,
    1,
  );
});

test("receipt verification binds tenant responses, rulings, and withdrawals to exact parties and values", async () => {
  const db = new TestD1();
  const created = await create(db, "arbiter@example.com");
  await finalizeWithVerifiedReceipt(db, created, {
    arbiterWallet: RECEIPT_TEST_ARBITER,
  });
  await submitStandardClaim(db, created, {
    amount: "300",
    transactionByte: "9",
  });

  const responseAction = {
    type: "claim_response",
    decision: "dispute",
    acceptedAmount: "0",
    note: "The documentation does not support this deduction.",
    transactionHash: transactionHash(91),
  };
  const responseReceipt = ({
    topic = TENANT_CLAIM_RESPONSE_TOPIC,
    tenant = RECEIPT_TEST_TENANT,
    from = RECEIPT_TEST_TENANT,
    accepted = 0n,
    responseCount = 1n,
    requiredCount = 1n,
  } = {}) => ({
    status: "0x1",
    blockNumber: "0x31",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics:
          topic === TENANT_CLAIM_RESPONSE_TOPIC
            ? [topic, receiptWord(42), receiptAddressWord(tenant)]
            : [topic, receiptWord(42)],
        data:
          topic === TENANT_CLAIM_RESPONSE_TOPIC
            ? receiptData(
                receiptWord(accepted),
                receiptWord(responseCount),
                receiptWord(requiredCount),
              )
            : receiptData(receiptWord(accepted), receiptWord(requiredCount)),
      },
    ],
  });
  for (const [receipt, hashIndex] of [
    [
      responseReceipt({ topic: LEGACY_CLAIM_RESPONSE_TOPIC }),
      92,
    ],
    [
      responseReceipt({ tenant: RECEIPT_TEST_OTHER_TENANT }),
      93,
    ],
    [
      responseReceipt({ accepted: 1n }),
      94,
    ],
    [
      responseReceipt({ responseCount: 2n }),
      95,
    ],
    [
      responseReceipt({ requiredCount: 2n }),
      111,
    ],
    [
      responseReceipt({ from: RECEIPT_TEST_OTHER_TENANT }),
      112,
    ],
  ]) {
    const rejected = await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      { ...responseAction, transactionHash: transactionHash(hashIndex) },
      receipt,
    );
    assert.equal(rejected.status, 400);
  }

  const responded = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      { ...responseAction, transactionHash: transactionHash(96) },
      responseReceipt(),
    ),
  );
  assert.equal(
    responded.events.filter(
      (event) => event.action === "claim_response_submitted",
    ).length,
    1,
  );

  const rulingAction = {
    type: "arbiter_ruling",
    awardToLandlord: "75",
    note: "The documentation supports part of the requested amount.",
    transactionHash: transactionHash(97),
  };
  const rulingReceipt = ({
    from = RECEIPT_TEST_ARBITER,
    landlordAward = 75_000_000n,
    tenantRefund = 225_000_000n,
  } = {}) => ({
    status: "0x1",
    blockNumber: "0x32",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [DISPUTE_RESOLVED_TOPIC, receiptWord(42)],
        data: receiptData(
          receiptWord(landlordAward),
          receiptWord(tenantRefund),
        ),
      },
    ],
  });
  const wrongArbiter = await actWithVerifiedReceipt(
    db,
    created,
    created.access.arbiter,
    rulingAction,
    rulingReceipt({ from: RECEIPT_TEST_LANDLORD }),
  );
  assert.equal(wrongArbiter.status, 400);
  const wrongAward = await actWithVerifiedReceipt(
    db,
    created,
    created.access.arbiter,
    { ...rulingAction, transactionHash: transactionHash(98) },
    rulingReceipt({ landlordAward: 74_000_000n, tenantRefund: 226_000_000n }),
  );
  assert.equal(wrongAward.status, 400);

  const ruled = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.arbiter,
      { ...rulingAction, transactionHash: transactionHash(99) },
      rulingReceipt(),
    ),
  );
  assert.equal(
    ruled.events.filter(
      (event) => event.action === "arbiter_ruling_submitted",
    ).length,
    1,
  );

  const withdrawalReceipt = (party, amount, from = party) => ({
    status: "0x1",
    blockNumber: "0x33",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [
          WITHDRAWN_TOPIC,
          receiptWord(42),
          receiptAddressWord(party),
        ],
        data: receiptData(receiptWord(amount)),
      },
    ],
  });
  const landlordWithdrawal = {
    type: "withdrawal_completed",
    amount: "75",
    transactionHash: transactionHash(100),
  };
  const wrongLandlordParty = await actWithVerifiedReceipt(
    db,
    created,
    created.access.landlord,
    landlordWithdrawal,
    withdrawalReceipt(RECEIPT_TEST_TENANT, 75_000_000n),
  );
  assert.equal(wrongLandlordParty.status, 400);
  await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.landlord,
      { ...landlordWithdrawal, transactionHash: transactionHash(101) },
      withdrawalReceipt(RECEIPT_TEST_LANDLORD, 75_000_000n),
    ),
  );

  const tenantWithdrawal = {
    type: "withdrawal_completed",
    amount: "1125",
    transactionHash: transactionHash(102),
  };
  const wrongTenantAmount = await actWithVerifiedReceipt(
    db,
    created,
    created.access.tenant,
    tenantWithdrawal,
    withdrawalReceipt(RECEIPT_TEST_TENANT, 1_124_000_000n),
  );
  assert.equal(wrongTenantAmount.status, 400);
  const withdrawn = await jsonResponse(
    await actWithVerifiedReceipt(
      db,
      created,
      created.access.tenant,
      { ...tenantWithdrawal, transactionHash: transactionHash(103) },
      withdrawalReceipt(RECEIPT_TEST_TENANT, 1_125_000_000n),
    ),
  );
  assert.equal(
    withdrawn.events.filter(
      (event) => event.action === "withdrawal_completed",
    ).length,
    2,
  );
});

test("legacy finalized records re-prove and preserve the landlord wallet before landlord receipts", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "operations_reserve_paid",
      transactionHash: transactionHash(220),
    }),
  );
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "agreement_funded",
      transactionHash: transactionHash(221),
    }),
  );
  await submitStandardClaim(db, created, {
    amount: "300",
    transactionByte: "d",
  });
  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "claim_response",
      decision: "approve",
      acceptedAmount: "300",
      note: "",
      transactionHash: transactionHash(222),
    }),
  );

  const originalTransactionHash = `0x${"a".repeat(64)}`;
  const otherWallet = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const withdrawalReceipt = (party) => ({
    status: "0x1",
    blockNumber: "0x40",
    from: party,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [
          WITHDRAWN_TOPIC,
          receiptWord(42),
          receiptAddressWord(party),
        ],
        data: receiptData(receiptWord(300_000_000n)),
      },
    ],
  });
  const contentHash = transactionHash(223);
  const activityReceipt = {
    status: "0x1",
    blockNumber: "0x41",
    from: RECEIPT_TEST_LANDLORD,
    logs: [
      {
        address: "0xC004dF4C43146FE55e5761EA1BB3C14f01161951",
        topics: [
          ACTIVITY_PUBLISHED_TOPIC,
          receiptWord(42),
          receiptWord(3),
          receiptAddressWord(RECEIPT_TEST_LANDLORD),
        ],
        data: receiptData(contentHash, receiptWord(1_785_000_000)),
      },
    ],
  };

  const originalFetch = globalThis.fetch;
  let originalReceiptMode = "wrong-amount";
  let currentReceipt = withdrawalReceipt(RECEIPT_TEST_LANDLORD);
  let originalReceiptReads = 0;
  globalThis.fetch = async (_url, options) => {
    const rpcRequest = JSON.parse(options.body);
    if (rpcRequest.method === "eth_call") {
      return Response.json({
        jsonrpc: "2.0",
        id: rpcRequest.id,
        result: agreementStateResult(),
      });
    }
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    if (rpcRequest.params[0] === originalTransactionHash) {
      originalReceiptReads += 1;
      return Response.json({
        jsonrpc: "2.0",
        id: rpcRequest.id,
        result: {
          ...finalizationReceipt(42, originalReceiptMode),
          transactionHash: rpcRequest.params[0],
        },
      });
    }
    return Response.json({
      jsonrpc: "2.0",
      id: rpcRequest.id,
      result: {
        blockHash: transactionHash(9_004),
        transactionHash: rpcRequest.params[0],
        ...currentReceipt,
      },
    });
  };

  const action = {
    type: "withdrawal_completed",
    amount: "300",
    transactionHash: transactionHash(224),
  };
  const verificationEnv = { VERIFY_TRANSACTION_RECEIPTS: "true" };
  try {
    const unprovableCreator = await act(
      db,
      created.record.id,
      created.access.landlord,
      action,
      verificationEnv,
    );
    assert.equal(unprovableCreator.status, 409);
    assert.match(
      (await unprovableCreator.json()).error,
      /could not prove the original agreement creator/i,
    );

    originalReceiptMode = "valid";
    currentReceipt = withdrawalReceipt(otherWallet);
    const wrongLandlord = await act(
      db,
      created.record.id,
      created.access.landlord,
      { ...action, transactionHash: transactionHash(225) },
      verificationEnv,
    );
    assert.equal(wrongLandlord.status, 400);

    currentReceipt = withdrawalReceipt(RECEIPT_TEST_LANDLORD);
    const withdrawn = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.landlord,
        { ...action, transactionHash: transactionHash(226) },
        verificationEnv,
      ),
    );
    const recoveredEvents = withdrawn.events.filter(
      (event) =>
        event.action === "transaction_receipt_verified" &&
        event.metadata?.eventType === "posted_onchain" &&
        event.metadata?.recoveredForLegacyRecord === true,
    );
    assert.equal(recoveredEvents.length, 1);
    assert.equal(
      recoveredEvents[0].metadata.actorAddress,
      RECEIPT_TEST_LANDLORD,
    );
    assert.equal(
      recoveredEvents[0].metadata.transactionHash,
      originalTransactionHash,
    );
    assert.equal(originalReceiptReads, 3);

    currentReceipt = activityReceipt;
    const published = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.landlord,
        {
          type: "activity_hash_published",
          activityType: 3,
          contentHash,
          transactionHash: transactionHash(227),
        },
        verificationEnv,
      ),
    );
    assert.equal(
      published.events.filter(
        (event) => event.action === "activity_hash_published",
      ).length,
      1,
    );
    assert.equal(originalReceiptReads, 3);
    assert.equal(
      published.events.filter(
        (event) =>
          event.action === "transaction_receipt_verified" &&
          event.metadata?.recoveredForLegacyRecord === true,
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("receipt verification binds deadline actions to the exact outcome amount", async () => {
  const timeoutReceipt = ({
    agreementId,
    topic,
    amount,
    from = RECEIPT_TEST_LANDLORD,
  }) => ({
    status: "0x1",
    blockNumber: "0x34",
    from,
    logs: [
      {
        address: RECEIPT_TEST_OPEN_ESCROW,
        topics: [topic, receiptWord(agreementId)],
        data: receiptData(receiptWord(amount)),
      },
    ],
  });

  const noClaimDb = new TestD1();
  const noClaimCreated = await create(noClaimDb);
  await finalizeWithVerifiedReceipt(noClaimDb, noClaimCreated, {
    agreementId: 44,
  });
  const noClaimAction = {
    type: "timeout_executed",
    timeout: "no_claim_refund",
    transactionHash: transactionHash(104),
  };
  const wrongNoClaimSender = await actWithVerifiedReceipt(
    noClaimDb,
    noClaimCreated,
    noClaimCreated.access.tenant,
    noClaimAction,
    timeoutReceipt({
      agreementId: 44,
      topic: NO_CLAIM_WITHDRAWAL_TOPIC,
      amount: 1_200_000_000n,
      from: RECEIPT_TEST_LANDLORD,
    }),
  );
  assert.equal(wrongNoClaimSender.status, 400);
  const wrongNoClaimAmount = await actWithVerifiedReceipt(
    noClaimDb,
    noClaimCreated,
    noClaimCreated.access.tenant,
    { ...noClaimAction, transactionHash: transactionHash(113) },
    timeoutReceipt({
      agreementId: 44,
      topic: NO_CLAIM_WITHDRAWAL_TOPIC,
      amount: 1_199_000_000n,
      from: RECEIPT_TEST_TENANT,
    }),
  );
  assert.equal(wrongNoClaimAmount.status, 400);
  const noClaimRefunded = await jsonResponse(
    await actWithVerifiedReceipt(
      noClaimDb,
      noClaimCreated,
      noClaimCreated.access.tenant,
      { ...noClaimAction, transactionHash: transactionHash(105) },
      timeoutReceipt({
        agreementId: 44,
        topic: NO_CLAIM_WITHDRAWAL_TOPIC,
        amount: 1_200_000_000n,
        from: RECEIPT_TEST_TENANT,
      }),
    ),
  );
  assert.equal(
    noClaimRefunded.events.filter(
      (event) =>
        event.action === "timeout_executed" &&
        event.metadata.timeout === "no_claim_refund",
    ).length,
    1,
  );

  const noResponseDb = new TestD1();
  const noResponseCreated = await create(noResponseDb);
  await finalizeWithVerifiedReceipt(noResponseDb, noResponseCreated, {
    agreementId: 45,
  });
  await submitStandardClaim(noResponseDb, noResponseCreated, {
    amount: "300",
    transactionByte: "a",
  });
  const noResponseAction = {
    type: "timeout_executed",
    timeout: "no_response_dispute",
    transactionHash: transactionHash(106),
  };
  const wrongNoResponseAmount = await actWithVerifiedReceipt(
    noResponseDb,
    noResponseCreated,
    noResponseCreated.access.landlord,
    noResponseAction,
    timeoutReceipt({
      agreementId: 45,
      topic: RESPONSE_TIMED_OUT_TOPIC,
      amount: 299_000_000n,
    }),
  );
  assert.equal(wrongNoResponseAmount.status, 400);
  await jsonResponse(
    await actWithVerifiedReceipt(
      noResponseDb,
      noResponseCreated,
      noResponseCreated.access.landlord,
      { ...noResponseAction, transactionHash: transactionHash(107) },
      timeoutReceipt({
        agreementId: 45,
        topic: RESPONSE_TIMED_OUT_TOPIC,
        amount: 300_000_000n,
      }),
    ),
  );

  const arbiterTimeoutDb = new TestD1();
  const arbiterTimeoutCreated = await create(
    arbiterTimeoutDb,
    "arbiter@example.com",
  );
  await finalizeWithVerifiedReceipt(arbiterTimeoutDb, arbiterTimeoutCreated, {
    agreementId: 46,
    arbiterWallet: RECEIPT_TEST_ARBITER,
  });
  await submitStandardClaim(arbiterTimeoutDb, arbiterTimeoutCreated, {
    amount: "300",
    transactionByte: "b",
  });
  await jsonResponse(
    await act(
      arbiterTimeoutDb,
      arbiterTimeoutCreated.record.id,
      arbiterTimeoutCreated.access.tenant,
      {
        type: "claim_response",
        decision: "dispute",
        acceptedAmount: "0",
        note: "The full amount remains disputed.",
        transactionHash: transactionHash(108),
      },
    ),
  );
  const arbiterTimeoutAction = {
    type: "timeout_executed",
    timeout: "arbiter_timeout_refund",
    transactionHash: transactionHash(109),
  };
  const wrongArbiterTimeoutAmount = await actWithVerifiedReceipt(
    arbiterTimeoutDb,
    arbiterTimeoutCreated,
    arbiterTimeoutCreated.access.tenant,
    arbiterTimeoutAction,
    timeoutReceipt({
      agreementId: 46,
      topic: ARBITER_TIMED_OUT_TOPIC,
      amount: 299_000_000n,
      from: RECEIPT_TEST_TENANT,
    }),
  );
  assert.equal(wrongArbiterTimeoutAmount.status, 400);
  const arbiterTimedOut = await jsonResponse(
    await actWithVerifiedReceipt(
      arbiterTimeoutDb,
      arbiterTimeoutCreated,
      arbiterTimeoutCreated.access.tenant,
      { ...arbiterTimeoutAction, transactionHash: transactionHash(110) },
      timeoutReceipt({
        agreementId: 46,
        topic: ARBITER_TIMED_OUT_TOPIC,
        amount: 300_000_000n,
        from: RECEIPT_TEST_TENANT,
      }),
    ),
  );
  assert.equal(
    arbiterTimedOut.events.filter(
      (event) =>
        event.action === "timeout_executed" &&
        event.metadata.timeout === "arbiter_timeout_refund",
    ).length,
    1,
  );
});

test("receipt verification binds private record anchors to the submitted hash, type, and participant", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);
  const originalFetch = globalThis.fetch;
  const snapshotHash = transactionHash(70);
  const contentHash = transactionHash(71);
  let mode = "snapshot-wrong-hash";
  globalThis.fetch = async (_url, options) => {
    const rpcRequest = JSON.parse(options.body);
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    const isActivity = mode.startsWith("activity");
    const party =
      mode === "snapshot-wrong-party" || mode === "activity-wrong-party"
        ? RECEIPT_TEST_OTHER_TENANT
        : RECEIPT_TEST_TENANT;
    const loggedSnapshotHash =
      mode === "snapshot-wrong-hash" ? transactionHash(72) : snapshotHash;
    const loggedActivityType = mode === "activity-wrong-type" ? 4 : 3;
    const loggedContentHash =
      mode === "activity-wrong-content" ? transactionHash(73) : contentHash;
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "0x1",
        blockNumber: "0x2d",
        blockHash: transactionHash(9_005),
        transactionHash: rpcRequest.params[0],
        from: RECEIPT_TEST_TENANT,
        logs: [
          isActivity
            ? {
                address: "0xC004dF4C43146FE55e5761EA1BB3C14f01161951",
                topics: [
                  ACTIVITY_PUBLISHED_TOPIC,
                  receiptWord(42),
                  receiptWord(loggedActivityType),
                  receiptAddressWord(party),
                ],
                data: receiptData(
                  loggedContentHash,
                  receiptWord(1_785_000_000),
                ),
              }
            : {
                address: "0xC004dF4C43146FE55e5761EA1BB3C14f01161951",
                topics: [
                  RECORD_SNAPSHOT_ANCHORED_TOPIC,
                  receiptWord(42),
                  loggedSnapshotHash,
                  receiptAddressWord(party),
                ],
                data: receiptData(receiptWord(1_785_000_000)),
              },
        ],
      },
    });
  };
  const verificationEnv = { VERIFY_TRANSACTION_RECEIPTS: "true" };
  try {
    const wrongHash = await act(
      db,
      created.record.id,
      created.access.tenant,
      {
        type: "record_snapshot_anchored",
        snapshotHash,
        transactionHash: transactionHash(74),
      },
      verificationEnv,
    );
    assert.equal(wrongHash.status, 400);

    mode = "snapshot-wrong-party";
    const wrongParty = await act(
      db,
      created.record.id,
      created.access.tenant,
      {
        type: "record_snapshot_anchored",
        snapshotHash,
        transactionHash: transactionHash(75),
      },
      verificationEnv,
    );
    assert.equal(wrongParty.status, 400);

    mode = "snapshot-valid";
    const anchored = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.tenant,
        {
          type: "record_snapshot_anchored",
          snapshotHash,
          transactionHash: transactionHash(76),
        },
        verificationEnv,
      ),
    );
    assert.equal(
      anchored.events.filter(
        (event) => event.action === "record_snapshot_anchored",
      ).length,
      1,
    );

    for (const [activityMode, hashIndex] of [
      ["activity-wrong-type", 77],
      ["activity-wrong-party", 78],
      ["activity-wrong-content", 79],
    ]) {
      mode = activityMode;
      const rejected = await act(
        db,
        created.record.id,
        created.access.tenant,
        {
          type: "activity_hash_published",
          activityType: 3,
          contentHash,
          transactionHash: transactionHash(hashIndex),
        },
        verificationEnv,
      );
      assert.equal(rejected.status, 400);
    }

    mode = "activity-valid";
    const published = await jsonResponse(
      await act(
        db,
        created.record.id,
        created.access.tenant,
        {
          type: "activity_hash_published",
          activityType: 3,
          contentHash,
          transactionHash: transactionHash(80),
        },
        verificationEnv,
      ),
    );
    assert.equal(
      published.events.filter(
        (event) => event.action === "activity_hash_published",
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
