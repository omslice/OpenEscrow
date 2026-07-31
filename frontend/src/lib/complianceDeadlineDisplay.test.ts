import assert from "node:assert/strict";
import test from "node:test";
import {
  complianceDeadlineFallbackText,
  complianceDeadlineNeedsReview,
  shouldShowComplianceDeadline,
} from "./complianceDeadlineDisplay.ts";

test("compliance timeline keeps calculation failures visible in consumer language", () => {
  for (const status of [
    "scheduled",
    "waiting-for-event",
    "invalid-event",
    "invalid-holiday-calendar",
    "invalid-rule",
  ]) {
    assert.equal(shouldShowComplianceDeadline(status), true);
  }
  assert.equal(shouldShowComplianceDeadline("does-not-apply"), false);
  assert.equal(complianceDeadlineNeedsReview("scheduled"), false);
  assert.equal(complianceDeadlineNeedsReview("invalid-event"), true);
  assert.match(
    complianceDeadlineFallbackText("invalid-event"),
    /^Needs review:.*date and timezone\.$/,
  );
  assert.match(
    complianceDeadlineFallbackText("invalid-holiday-calendar"),
    /^Needs review:.*holiday calendar\.$/,
  );
  assert.equal(
    complianceDeadlineFallbackText("invalid-rule"),
    "Needs review: this saved requirement cannot be calculated safely.",
  );
});
