import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "./index.js";

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
      writeHttpMetadata(headers) {
        headers.set("content-type", object.contentType);
      },
    };
  }
}

const terms = {
  jurisdiction: "us-ca",
  policyVersion: "ca-civ-1950.5-2026.1",
  tokenChoice: "plain",
  deposit: "1200",
  operationsReserve: "0",
  monthlyRent: "1200",
  smallLandlordException: false,
  tenantIsServiceMember: false,
  electronicDeliveryConsent: true,
  claimWindowStart: "2027-07-01T12:00",
  claimDays: "21",
  responseDays: "7",
  arbiterDays: "7",
};

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
    { DB: db, ...env },
  );
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
  assert.equal(approved.tenantName, "Terrence Tenant");

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
});

test("a verified Privy identity can discover its landlord proposals across browser sessions", async () => {
  const db = new TestD1();
  const created = await create(db);
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

    const recovered = await jsonResponse(
      await worker.fetch(
        request(
          `/api/negotiations/${created.record.id}?token=${discovery.accesses[0].token}`,
        ),
        { DB: db },
      ),
    );
    assert.equal(recovered.landlordEmail, "landlord@example.com");

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

test("private evidence is stored in R2 and only an agreement party can retrieve it", async () => {
  const db = new TestD1();
  const evidence = new TestR2();
  const created = await create(db);
  const form = new FormData();
  form.set("proposalId", created.record.id);
  form.set("token", created.access.landlord);
  form.set(
    "file",
    new File([new TextEncoder().encode("test invoice")], "invoice.pdf", {
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
  assert.equal(await authorized.text(), "test invoice");
  assert.equal(authorized.headers.get("x-openescrow-sha256"), uploaded.sha256);

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
    assert.match(deliveries[0].subject, /deduction deadline reminder/);
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
  assert.match(await report.text(), /Tenant reviewer/);
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

test("landlord revisions reset approvals and role capabilities are enforced", async () => {
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
  const lockedPolicyRevision = await act(db, id, created.access.landlord, {
    type: "revise",
    summary: "Attempted to change the locked tenant response period.",
    terms: { ...terms, responseDays: "10" },
  });
  assert.equal(lockedPolicyRevision.status, 400);
  const revised = await jsonResponse(
    await act(db, id, created.access.landlord, {
      type: "revise",
      summary: "Reduced the security deposit after tenant review.",
      terms: { ...terms, deposit: "1100" },
    }),
  );
  assert.equal(revised.revision, 2);
  assert.equal(revised.status, "draft");
  assert.equal(revised.tenantApproved, false);
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
  assert.match(claimed.events.at(-1).summary, /ipfs:\/\/bafy-test-invoice/);
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
  assert.match(claimReportHtml, new RegExp(`0x${"9".repeat(64)}`));
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
