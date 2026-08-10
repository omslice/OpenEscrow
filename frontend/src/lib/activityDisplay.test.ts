import assert from "node:assert/strict";
import test from "node:test";
import {
  activityHasVerificationDetails,
  friendlyActivitySummary,
} from "./activityDisplay.ts";
import type { NegotiationEvent } from "./negotiations.ts";

function event(action: string, summary: string): NegotiationEvent {
  return {
    id: 1,
    createdAt: "2026-07-30T00:00:00.000Z",
    actorRole: "system",
    action,
    summary,
    revision: 1,
  };
}

test("technical receipts use friendly main activity copy while preserving details", () => {
  const anchored = event(
    "record_snapshot_anchored",
    `Anchored agreement record snapshot 0x${"a".repeat(64)} onchain in transaction 0x${"b".repeat(64)}.`,
  );
  assert.equal(
    friendlyActivitySummary(anchored),
    "Saved a tamper-evident receipt for this record on Base Sepolia.",
  );
  assert.equal(activityHasVerificationDetails(anchored), true);
  assert.doesNotMatch(friendlyActivitySummary(anchored), /0x[a-f0-9]{64}/);
});

test("ordinary participant activity keeps its exact human-readable summary", () => {
  const approved = event("revision_approved", "Tenant approved revision 2.");
  assert.equal(friendlyActivitySummary(approved), approved.summary);
  assert.equal(activityHasVerificationDetails(approved), false);
});
