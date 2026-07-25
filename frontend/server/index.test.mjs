import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "./index.js";

test("the packaged D1 migration applies cleanly", () => {
  const database = new DatabaseSync(":memory:");
  const migration = readFileSync(new URL("../../drizzle/0000_agreement_negotiations.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.ok(tables.includes("agreement_negotiations"));
  assert.ok(tables.includes("negotiation_events"));
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

const terms = {
  jurisdiction: "us-ca",
  tokenChoice: "plain",
  deposit: "1200",
  claimWindowStart: "2027-07-01T12:00",
  claimDays: "30",
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
        landlordEmail: "landlord@example.com",
        tenantEmail: "tenant@example.com",
        arbiterEmail,
        terms,
      }),
      { DB: db },
    ),
  );
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
    }),
  );
  assert.equal(approved.status, "ready");
  assert.equal(approved.tenantApproved, true);
  assert.equal(approved.arbiterApproved, true);

  const report = await worker.fetch(
    request(`/api/negotiations/${id}/report?token=${created.access.tenant}`),
    { DB: db },
  );
  assert.equal(report.status, 200);
  assert.match(await report.text(), /Timestamped activity/);
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
  const revised = await jsonResponse(
    await act(db, id, created.access.landlord, {
      type: "revise",
      summary: "Extended the tenant response period to ten days.",
      terms: { ...terms, responseDays: "10" },
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

  const claimed = await jsonResponse(
    await act(db, created.record.id, created.access.landlord, {
      type: "claim_submitted",
      amount: "300",
      category: "Damage beyond ordinary wear",
      note: "Invoice covers replacement of the damaged fixture.",
      evidenceUri: "ipfs://bafy-test-invoice",
      evidenceHash: `0x${"b".repeat(64)}`,
      transactionHash: `0x${"c".repeat(64)}`,
    }),
  );
  assert.equal(claimed.events.at(-1).action, "deduction_claim_submitted");
  assert.match(claimed.events.at(-1).summary, /ipfs:\/\/bafy-test-invoice/);

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

  const email = await worker.fetch(
    request("/api/notifications/claim", "POST", {
      proposalId: created.record.id,
      token: created.access.landlord,
      reviewUrl: `https://openescrow.example/?invite=tenant&proposal=${created.record.id}&token=${created.access.tenant}`,
      agreementId: "42",
      amount: "300",
      note: "",
      evidenceUri: "ipfs://bafy-test-invoice",
    }),
    { DB: db },
  );
  assert.equal(email.status, 503);
  assert.match((await email.json()).error, /not configured/);
});
