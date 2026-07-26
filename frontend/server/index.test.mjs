import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "./index.js";
import { US_JURISDICTION_PROFILES } from "../shared/us-jurisdiction-profiles.js";
import {
  buildComplianceSnapshot,
  calculateDeadline,
  evaluateCompliance,
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
  ]) {
    applyMigration(migrationName);
  }
  applyMigration("0001_negotiation_account_access.sql");
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
        profile.version.endsWith("rules-2026-07-26.v2"),
    ),
  );
  assert.ok(US_JURISDICTION_PROFILES.every((profile) => profile.legalReviewRequired));
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
  assert.equal(newYorkResearchTerms.complianceSnapshot.schema, "openescrow.us-compliance-profile.v3");
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
  assert.equal(
    calculateDeadline("2027-01-08T12:00:00Z", 1, "business"),
    "2027-01-11T12:00:00.000Z",
  );
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
  return new Request(`https://openescrow.example${path}`, {
    method,
    headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function identityTokenFor(privateKey, appId, kid, email) {
  const encodedHeader = base64UrlJson({ alg: "ES256", typ: "JWT", kid });
  const encodedPayload = base64UrlJson({
    sub: "did:privy:test-landlord",
    iss: "privy.io",
    aud: appId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
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
  globalThis.fetch = async (input) => {
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

    const recovered = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${discovery.accesses[0].token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(recovered.landlordEmail, "landlord@example.com");
    assert.equal(recovered.status, "finalized");
    assert.equal(recovered.onchainAgreementId, "0");

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
    const tenantRecord = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${tenantDiscovery.accesses[0].token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(tenantRecord.status, "finalized");
    assert.equal(tenantRecord.onchainAgreementId, "0");

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
      assert.equal(payload.method, "eth_call");
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: `0x${"0".repeat(24)}f18bfdbfd3ff84c603cbdf895d2a96ac7260ae99`,
      });
    }
    if (url === "https://mismatched-rpc.example/") {
      const payload = JSON.parse(options.body);
      assert.equal(payload.method, "eth_call");
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        result: `0x${"0".repeat(24)}83fabc39c4fcccb6a4e42c568e9750d1a24ff11f`,
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
    assert.equal(readiness.email.configured, true);
    assert.equal(readiness.email.provider, "resend");
    assert.equal(readiness.evidence.contentTypeValidation, true);
    assert.equal(readiness.recordIntegrity.lifecycleStateGuards, true);
    assert.equal(readiness.recordIntegrity.activityRegistry.ready, true);
    assert.equal(readiness.addressValidation.configured, true);
    assert.equal(readiness.addressValidation.tamperResistantProfiles, true);
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

test("the scheduled compliance monitor baselines a rotating official-source batch", async () => {
  const db = new TestD1();
  const originalFetch = globalThis.fetch;
  const checkedUrls = [];
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
    assert.equal(checkedUrls.length, 4);
    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'unchanged' THEN 1 ELSE 0 END) AS baselined
         FROM compliance_source_checks`,
      )
      .first();
    assert.ok(Number(counts.total) >= 57);
    assert.equal(Number(counts.baselined), 4);

    const readiness = await jsonResponse(
      await worker.fetch(request("/api/system/readiness"), {
        DB: db,
        COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
      }),
    );
    assert.equal(readiness.complianceSources.configured, true);
    assert.equal(readiness.complianceSources.tracked, counts.total);
    assert.equal(
      readiness.complianceSources.lastRunAt,
      "2027-07-02T12:00:00.000Z",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private evidence is stored in R2 and only an agreement party can retrieve it", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
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

  const authorized = await worker.fetch(
    new Request(`https://openescrow.example${uploaded.gatewayUrl}`),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "%PDF-1.7\ntest invoice");
  assert.equal(authorized.headers.get("x-openescrow-sha256"), uploaded.sha256);
  assert.equal(authorized.headers.get("cache-control"), "private, no-store");
  assert.equal(authorized.headers.get("referrer-policy"), "no-referrer");
  assert.equal(authorized.headers.get("x-content-type-options"), "nosniff");
  assert.equal(authorized.headers.get("x-frame-options"), "DENY");

  const denied = await worker.fetch(
    new Request(
      `https://openescrow.example${uploaded.gatewayUrl.replace(
        encodeURIComponent(created.access.landlord),
        "invalid",
      )}`,
    ),
    { DB: db, EVIDENCE: evidence },
  );
  assert.equal(denied.status, 403);
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
    new Request(`https://openescrow.example${uploaded.gatewayUrl}`),
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
      new Request(`https://openescrow.example${uploaded.gatewayUrl}`),
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

test("deduction claim email includes every tenant", async () => {
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
  const originalFetch = globalThis.fetch;
  let sentEmail = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    sentEmail = JSON.parse(init.body);
    return Response.json({ id: "multi-tenant-claim-message" });
  };
  try {
    const response = await worker.fetch(
      request("/api/notifications/claim", "POST", {
        proposalId: created.record.id,
        token: created.access.landlord,
        reviewUrl: `https://openescrow.example/?invite=tenant&proposal=${created.record.id}&token=${created.access.tenant}`,
        agreementId: "42",
        amount: "100",
        items: [
          {
            category: "Damage beyond ordinary wear",
            description: "Documented repair",
            amount: "100",
          },
        ],
        note: "",
        evidenceUri: "openescrow://evidence/test",
      }),
      {
        DB: db,
        RESEND_API_KEY: "test-resend-key",
        NOTIFICATION_FROM_EMAIL: "OpenEscrow <notices@example.com>",
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(sentEmail.to, ["tenant@example.com", "casey@example.com"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("each invited tenant can record a claim decision and notify the landlord", async () => {
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
    agreementId: "77",
    decision: "dispute",
    acceptedAmount: "0",
    note: "This charge belongs to a different unit.",
    transactionHash: `0x${"b".repeat(64)}`,
    reviewUrl: "https://openescrow.example/?id=77",
  };
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("documented claim, tenant decision, and email attempts are included in the record", async () => {
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
      reviewUrl: `https://openescrow.example/?invite=tenant&proposal=${created.record.id}&token=${created.access.tenant}`,
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
      reviewUrl: `https://openescrow.example/?invite=tenant&proposal=${created.record.id}&token=${created.access.tenant}`,
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

test("a two-tenant agreement completes the negotiated funding, dispute, ruling, and withdrawal lifecycle once", async () => {
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

test("deadline refunds require the correct state and cannot be recorded twice", async () => {
  const db = new TestD1();
  const created = await create(db);
  await finalizeWithoutArbiter(db, created);

  const landlordRefund = await act(
    db,
    created.record.id,
    created.access.landlord,
    {
      type: "timeout_executed",
      timeout: "no_claim_refund",
      transactionHash: transactionHash(30),
    },
  );
  assert.equal(landlordRefund.status, 403);

  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "timeout_executed",
      timeout: "no_claim_refund",
      transactionHash: transactionHash(31),
    }),
  );
  const duplicateRefund = await act(
    db,
    created.record.id,
    created.access.tenant,
    {
      type: "timeout_executed",
      timeout: "no_claim_refund",
      transactionHash: transactionHash(32),
    },
  );
  assert.equal(duplicateRefund.status, 409);

  await jsonResponse(
    await act(db, created.record.id, created.access.tenant, {
      type: "withdrawal_completed",
      amount: "1200",
      transactionHash: transactionHash(33),
    }),
  );
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

test("static assets and single-page fallbacks receive browser privacy headers", async () => {
  const assets = {
    async fetch(assetRequest) {
      const path = new URL(assetRequest.url).pathname;
      if (path === "/missing") return new Response("missing", { status: 404 });
      return new Response(path === "/index.html" ? "<main>OpenEscrow</main>" : "asset", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };

  for (const path of ["/", "/missing"]) {
    const response = await worker.fetch(request(path), { ASSETS: assets });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
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
  let includeExpectedEvent = false;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://sepolia.base.org/");
    const rpcRequest = JSON.parse(options.body);
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "0x1",
        blockNumber: "0x2a",
        logs: includeExpectedEvent
          ? [
              {
                address: "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99",
                topics: [
                  "0x664e4c94d146ccef3e51a2b7665242fbd89c9e268a28a1807fc660bfc39327f6",
                  `0x${BigInt(42).toString(16).padStart(64, "0")}`,
                ],
              },
            ]
          : [],
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

    includeExpectedEvent = true;
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
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    assert.equal(rpcRequest.method, "eth_getTransactionReceipt");
    if (String(url) === "https://sepolia.base.org/") {
      return new Response("rate limited", { status: 429 });
    }
    assert.equal(String(url), "https://base-sepolia-rpc.publicnode.com/");
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "0x1",
        blockNumber: "0x2b",
        logs: [
          {
            address: "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99",
            topics: [
              "0x664e4c94d146ccef3e51a2b7665242fbd89c9e268a28a1807fc660bfc39327f6",
              `0x${BigInt(43).toString(16).padStart(64, "0")}`,
            ],
          },
        ],
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
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
