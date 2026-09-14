import assert from "node:assert/strict";
import test from "node:test";
import { applySampleAction, createSampleAgreements, sampleActions, sampleBalance, visibleSampleAgreements } from "./sampleData.ts";

test("sample portfolio reconciles balances and limits the tenant to their own examples", () => {
  const records = createSampleAgreements();
  assert.equal(records.length, 4);
  assert.deepEqual(visibleSampleAgreements(records, "tenant").map((item) => item.id), ["SAMPLE-101", "SAMPLE-103"]);
  for (const record of records) {
    assert.equal(record.transactions.reduce((sum, transaction) => sum + transaction.amount, 0), sampleBalance(record));
    assert.match(record.email, /@example\.test$/);
    assert.ok(record.documents.length > 0);
  }
});

test("proposal flow enforces approval, role order, and idempotent funding without mutating fixtures", () => {
  const original = createSampleAgreements();
  const before = JSON.stringify(original);
  let records = applySampleAction(original, "SAMPLE-101", "landlord", "finalize");
  assert.equal(records[0].stage, "proposal");
  records = applySampleAction(records, "SAMPLE-101", "tenant", "approve-proposal");
  records = applySampleAction(records, "SAMPLE-101", "tenant", "finalize");
  assert.equal(records[0].stage, "proposal");
  records = applySampleAction(records, "SAMPLE-101", "landlord", "finalize");
  assert.equal(sampleBalance(records[0]), 0);
  records = applySampleAction(records, "SAMPLE-101", "tenant", "fund");
  records = applySampleAction(records, "SAMPLE-101", "tenant", "fund");
  assert.equal(records[0].stage, "funded");
  assert.equal(sampleBalance(records[0]), 180000);
  assert.equal(records[0].transactions.length, 1);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(createSampleAgreements(), original);
});

test("accepted claim conserves money until both parties withdraw their separate allocations", () => {
  let records = applySampleAction(createSampleAgreements(), "SAMPLE-103", "tenant", "approve-claim");
  records = applySampleAction(records, "SAMPLE-103", "tenant", "withdraw");
  assert.equal(records[2].stage, "resolved");
  assert.equal(records[2].tenantWithdrawn, 147000);
  assert.equal(sampleBalance(records[2]), 18000);
  records = applySampleAction(records, "SAMPLE-103", "tenant", "withdraw");
  assert.equal(sampleBalance(records[2]), 18000);
  records = applySampleAction(records, "SAMPLE-103", "landlord", "withdraw");
  assert.equal(records[2].stage, "complete");
  assert.equal(sampleBalance(records[2]), 0);
  assert.equal(records[2].transactions.reduce((sum, transaction) => sum + transaction.amount, 0), 0);
});

test("disputed claims cannot release funds and another tenant's sample record cannot be acted on", () => {
  const records = applySampleAction(createSampleAgreements(), "SAMPLE-103", "tenant", "dispute-claim");
  for (const role of ["landlord", "tenant"] as const) {
    assert.deepEqual(sampleActions(records[2], role), []);
    assert.equal(applySampleAction(records, "SAMPLE-103", role, "withdraw")[2], records[2]);
  }
  assert.equal(sampleBalance(records[2]), 165000);
  assert.deepEqual(sampleActions({ ...records[2], tenant: "Someone else" }, "tenant"), []);
});
