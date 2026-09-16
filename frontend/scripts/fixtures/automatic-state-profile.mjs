import { automaticStateVersion, buildAutomaticStateProfile, digestText, STATE_SOURCE_ADAPTER, STATE_SOURCE_MODEL, STATE_REVIEW_MODEL } from "../../shared/automatic-state-profile.js";

// Fabricated rules for transport/UI tests only. Never a legal research fixture.
export async function syntheticStateProfile(base, generatedAt = "2026-09-16T20:00:00.000Z") {
  const quote = "Synthetic fixture: return and itemize within thirty days after tenancy termination; the deposit must not exceed one month's rent.";
  const citation = "Synthetic test section 1";
  const patch = {
    ready: true, effectiveNow: true, reason: "Synthetic test only",
    requirements: [{ text: "Synthetic test: return and itemize within 30 days after termination.", citation, quote }],
    depositCap: { kind: "months-rent", months: 1, summary: "Synthetic test: one month's rent.", citation, quote },
    deadlines: [{ id: "return-accounting", label: "Return and itemize", days: 30, trigger: "tenancyTerminatedAt", triggerDescription: "tenancy termination", dayType: "calendar", statutory: true, condition: null, comparison: null, citation, quote }],
    claimDeadlineIds: ["return-accounting"], defaultClaimDays: 30, statutoryDeadlineDays: 30, deadlineSummary: "Synthetic test: return and itemize within 30 days after termination.",
    exceptions: [], stateAttestations: [],
  };
  const sourceDigest = await digestText(`${STATE_SOURCE_ADAPTER}\n${base.version}\n${quote}`);
  return buildAutomaticStateProfile(base, {
    adapter: STATE_SOURCE_ADAPTER, baseVersion: base.version, sourceDigest, sourceUrl: base.statuteUrl,
    generatedAt, model: STATE_SOURCE_MODEL, reviewer: STATE_REVIEW_MODEL, patch,
    profileVersion: await automaticStateVersion(base, sourceDigest, patch),
  }, quote);
}
