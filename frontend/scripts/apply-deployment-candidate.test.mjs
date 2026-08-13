import assert from "node:assert/strict";
import test from "node:test";
import { activateCandidateManifest } from "./apply-deployment-candidate.mjs";

test("activating a candidate preserves evidence and marks the exact cohort active", () => {
  const candidate = {
    schema: "openescrow.deployment-manifest/v2",
    cohortStatus: "candidate-unconfigured",
    sourceCommit: "a".repeat(40),
    reciprocalConfiguration: { liveBindingsVerified: true },
  };
  const result = activateCandidateManifest(
    candidate,
    { cohortStatus: "active-testnet" },
    "2026-08-13T23:00:00.000Z",
  );
  assert.equal(result.cohortStatus, "active-testnet");
  assert.equal(result.sourceCommit, candidate.sourceCommit);
  assert.equal(result.verification.liveBindingsVerified, true);
  assert.equal(result.activatedAtUtc, "2026-08-13T23:00:00.000Z");
});

test("activation refuses to overwrite a non-active rollback manifest", () => {
  assert.throws(
    () => activateCandidateManifest({}, { cohortStatus: "candidate-unconfigured" }, "now"),
    /not an active testnet rollback source/,
  );
});
