import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverAccountDataInventory,
  prepareAccountDataInventory,
} from "./accountDataInventoryDownload.ts";
import type { AccountDataInventory } from "./negotiations.ts";

const inventory: AccountDataInventory = {
  schema: "openescrow.account-data-inventory.v1",
  generatedAt: "2026-07-30T19:33:43.526Z",
  scope:
    "Verified-account metadata only. Use each agreement's Record tab to export its complete shared record.",
  verifiedEmailCount: 1,
  records: [
    {
      proposalId: "OE-P-PRIVACY",
      role: "landlord",
      status: "finalized",
      updatedAt: "2026-07-30T19:30:00.000Z",
      archived: false,
    },
  ],
  accountSettings: {
    activeRecordSessions: 1,
    archivedRecordPreferences: 0,
    notificationPreferences: null,
  },
  boundaries: {
    includesPrivateEvidence: false,
    includesInvitationOrSessionTokens: false,
    includesOtherParticipantDetails: false,
    deletesOrChangesData: false,
    publicBlockchainRecordsCanBeErased: false,
  },
};

test("account inventory preparation produces timestamped formatted download data", () => {
  const prepared = prepareAccountDataInventory(inventory);

  assert.equal(prepared.contentType, "application/json");
  assert.equal(
    prepared.filename,
    "openescrow-account-data-inventory-2026-07-30T19-33-43-526Z.json",
  );
  assert.equal(prepared.content.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(prepared.content), inventory);
});

test("account inventory delivery uses the prepared filename and content", () => {
  const calls: Array<[string, string, string]> = [];
  const result = deliverAccountDataInventory(inventory, (...args) => {
    calls.push(args);
  });

  assert.equal(result.outcome, "downloaded");
  assert.deepEqual(calls, [
    [result.content, "application/json", result.filename],
  ]);
});

test("blocked account inventory downloads preserve an in-memory copy fallback", () => {
  const result = deliverAccountDataInventory(inventory, () => {
    throw new Error("downloads blocked");
  });

  assert.equal(result.outcome, "copy_available");
  assert.deepEqual(JSON.parse(result.content), inventory);
  assert.match(
    result.error instanceof Error ? result.error.message : "",
    /downloads blocked/,
  );
});

test("an invalid generated timestamp fails to a safe filename", () => {
  const prepared = prepareAccountDataInventory({
    ...inventory,
    generatedAt: "../../../private",
  });

  assert.equal(
    prepared.filename,
    "openescrow-account-data-inventory-unknown-time.json",
  );
});
