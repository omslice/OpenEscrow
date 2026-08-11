export const ACCELERATED_REVIEW_TIMING_PROFILE = "accelerated-review-v1";

export const ACCELERATED_REVIEW_TIMING = Object.freeze({
  claimWindowLeadSeconds: 60 * 60,
  claimPeriodSeconds: 30 * 60,
  responsePeriodSeconds: 30 * 60,
  arbiterRulingPeriodSeconds: 30 * 60,
});

const DAY_SECONDS = 24 * 60 * 60;

export function isAcceleratedReviewTiming(terms) {
  return terms?.testnetTimingProfile === ACCELERATED_REVIEW_TIMING_PROFILE;
}

export function agreementTimingSeconds(terms) {
  if (isAcceleratedReviewTiming(terms)) {
    return {
      claimPeriodSeconds: ACCELERATED_REVIEW_TIMING.claimPeriodSeconds,
      responsePeriodSeconds: ACCELERATED_REVIEW_TIMING.responsePeriodSeconds,
      arbiterRulingPeriodSeconds:
        ACCELERATED_REVIEW_TIMING.arbiterRulingPeriodSeconds,
    };
  }
  return {
    claimPeriodSeconds: Math.round(Number(terms?.claimDays) * DAY_SECONDS),
    responsePeriodSeconds: Math.round(Number(terms?.responseDays) * DAY_SECONDS),
    arbiterRulingPeriodSeconds: Math.round(
      Number(terms?.arbiterDays) * DAY_SECONDS,
    ),
  };
}

export function acceleratedReviewClaimWindowStart(now = new Date()) {
  return new Date(
    now.getTime() + ACCELERATED_REVIEW_TIMING.claimWindowLeadSeconds * 1_000,
  );
}
