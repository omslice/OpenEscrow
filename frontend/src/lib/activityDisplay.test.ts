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

test("scheduled agreement notices use concise consumer-facing language", () => {
  const reminder = {
    ...event("scheduled_notification_due", "Sent the response deadline notice."),
    metadata: {
      notificationType: "response_deadline_1_day",
      recipientRole: "tenant-1",
    },
  };
  assert.equal(
    friendlyActivitySummary(reminder),
    "Your response to the deduction claim is due tomorrow.",
  );
});

test("direct onchain activity uses consumer-facing notification language", () => {
  assert.equal(
    friendlyActivitySummary({
      id: 8,
      createdAt: "2026-08-10T09:59:00.000Z",
      actorRole: "system",
      action: "onchain_activity_indexed",
      summary: "Detected response_timeout_recorded directly on Base Sepolia.",
      revision: 1,
      metadata: { eventType: "response_timeout_recorded" },
    }),
    "A missed response deadline was recorded and the documented claim was finalized.",
  );
  assert.equal(
    friendlyActivitySummary({
      id: 9,
      createdAt: "2026-08-10T10:00:00.000Z",
      actorRole: "system",
      action: "onchain_activity_indexed",
      summary: "Detected response_timeout_escalated directly on Base Sepolia.",
      revision: 1,
      metadata: { eventType: "response_timeout_escalated" },
    }),
    "An unanswered claim was escalated for resolution.",
  );
  assert.equal(
    friendlyActivitySummary({
      id: 10,
      createdAt: "2026-08-10T10:01:00.000Z",
      actorRole: "system",
      action: "onchain_activity_indexed",
      summary: "Detected arbiter_resigned directly on Base Sepolia.",
      revision: 1,
      metadata: { eventType: "arbiter_resigned" },
    }),
    "The optional arbiter resigned from this agreement.",
  );
});
