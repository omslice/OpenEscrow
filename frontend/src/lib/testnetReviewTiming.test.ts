import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCELERATED_REVIEW_TIMING_PROFILE,
  acceleratedReviewClaimWindowStart,
  agreementTimingSeconds,
  isAcceleratedReviewTiming,
  reviewerTimingControlState,
} from "../../shared/testnet-review-timing.js";

test("accelerated reviewer timing uses fixed thirty-minute lifecycle periods", () => {
  const terms = {
    claimDays: "30",
    responseDays: "7",
    arbiterDays: "7",
    testnetTimingProfile: ACCELERATED_REVIEW_TIMING_PROFILE,
  };

  assert.equal(isAcceleratedReviewTiming(terms), true);
  assert.deepEqual(agreementTimingSeconds(terms), {
    claimPeriodSeconds: 1_800,
    responsePeriodSeconds: 1_800,
    arbiterRulingPeriodSeconds: 1_800,
  });
});

test("standard timing continues to use the recorded day values", () => {
  assert.deepEqual(
    agreementTimingSeconds({
      claimDays: "30",
      responseDays: "7",
      arbiterDays: "7",
    }),
    {
      claimPeriodSeconds: 2_592_000,
      responsePeriodSeconds: 604_800,
      arbiterRulingPeriodSeconds: 604_800,
    },
  );
});

test("accelerated claim window starts one hour after the preset is applied", () => {
  const now = new Date("2026-08-11T20:00:00.000Z");
  assert.equal(
    acceleratedReviewClaimWindowStart(now).toISOString(),
    "2026-08-11T21:00:00.000Z",
  );
});

test("expired accelerated timing offers a one-click clock refresh", () => {
  assert.deepEqual(
    reviewerTimingControlState({ accelerated: true, expired: true }),
    {
      label: "Refresh accelerated test clock",
      action: "apply",
      primary: true,
    },
  );
  assert.equal(
    reviewerTimingControlState({ accelerated: true, expired: false }).action,
    "restore",
  );
  assert.equal(
    reviewerTimingControlState({ accelerated: false, expired: false }).action,
    "apply",
  );
});
