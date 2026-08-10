import assert from "node:assert/strict";
import test from "node:test";
import {
  INITIAL_NEGOTIATION_FEEDBACK,
  createNegotiationRefreshGuard,
  reduceNegotiationFeedback,
} from "./negotiationFeedback.ts";

test("proposal refresh success never clears a user-action failure", () => {
  const actionFailure = reduceNegotiationFeedback(
    INITIAL_NEGOTIATION_FEEDBACK,
    { type: "action_failed", message: "Approval failed." },
  );
  assert.deepEqual(
    reduceNegotiationFeedback(actionFailure, { type: "refresh_succeeded" }),
    {
      refreshError: null,
      actionError: "Approval failed.",
    },
  );
});

test("proposal refresh failure remains separate from user-action feedback", () => {
  const actionFailure = reduceNegotiationFeedback(
    INITIAL_NEGOTIATION_FEEDBACK,
    { type: "action_failed", message: "Approval failed." },
  );
  assert.deepEqual(
    reduceNegotiationFeedback(actionFailure, {
      type: "refresh_failed",
      message: "Refresh failed.",
    }),
    {
      refreshError: "Refresh failed.",
      actionError: "Approval failed.",
    },
  );
});

test("proposal actions clear only their own old error until a current record succeeds", () => {
  const bothFailed = {
    refreshError: "Refresh failed.",
    actionError: "Approval failed.",
  };
  assert.deepEqual(
    reduceNegotiationFeedback(bothFailed, { type: "action_started" }),
    {
      refreshError: "Refresh failed.",
      actionError: null,
    },
  );
  assert.deepEqual(
    reduceNegotiationFeedback(bothFailed, { type: "action_succeeded" }),
    INITIAL_NEGOTIATION_FEEDBACK,
  );
});

test("proposal refresh guard rejects responses invalidated by a user action", () => {
  const guard = createNegotiationRefreshGuard();
  const beforeAction = guard.capture();
  assert.equal(guard.isCurrent(beforeAction), true);

  const actionEpoch = guard.invalidate();
  assert.equal(guard.isCurrent(beforeAction), false);
  assert.equal(guard.isCurrent(actionEpoch), true);

  const completedActionEpoch = guard.invalidate();
  assert.equal(guard.isCurrent(actionEpoch), false);
  assert.equal(guard.isCurrent(completedActionEpoch), true);
});
