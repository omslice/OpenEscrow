import assert from "node:assert/strict";
import test from "node:test";
import type { NegotiationAccess, NegotiationRecord } from "./negotiations.ts";
import {
  mergeSavedRecordRefresh,
  refreshOpenProposalAccess,
  type SavedRecord,
} from "./savedRecordRefresh.ts";

function access(proposalId: string): NegotiationAccess {
  return { proposalId, role: "landlord", token: `token-${proposalId}` };
}

function saved(proposalId: string, revision: number): SavedRecord {
  return {
    access: access(proposalId),
    record: { revision } as NegotiationRecord,
  };
}

test("background record refresh keeps prior data for only the failed current access", () => {
  const requested = [access("one"), access("two")];
  const previous = [saved("one", 1), saved("two", 1), saved("removed", 1)];
  const refreshed = saved("one", 2);
  const results: PromiseSettledResult<SavedRecord>[] = [
    { status: "fulfilled", value: refreshed },
    { status: "rejected", reason: new Error("temporary outage") },
  ];

  assert.deepEqual(
    mergeSavedRecordRefresh(requested, results, previous),
    [refreshed, previous[1]],
  );
});

test("background record refresh omits an unavailable record with no trusted prior copy", () => {
  const requested = [access("new")];
  const results: PromiseSettledResult<SavedRecord>[] = [
    { status: "rejected", reason: new Error("temporary outage") },
  ];
  assert.deepEqual(mergeSavedRecordRefresh(requested, results, []), []);
});

test("background discovery replaces an open proposal's stale account session", () => {
  const current = { ...access("one"), token: "stale-session", source: "account" as const };
  const refreshed = {
    access: { ...access("one"), token: "fresh-session", source: "account" as const },
    record: { revision: 3 } as NegotiationRecord,
  };

  assert.equal(refreshOpenProposalAccess(current, [refreshed])?.token, "fresh-session");
  assert.equal(refreshOpenProposalAccess(current, [saved("two", 1)])?.token, "stale-session");
  assert.equal(refreshOpenProposalAccess(null, [refreshed]), null);
});
