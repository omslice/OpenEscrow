import assert from "node:assert/strict";
import test from "node:test";
import {
  executeCandidateVerification,
  PILOT_CANDIDATE_STEPS,
  validateCandidateContext,
} from "./verify-pilot-candidate.mjs";

const commitSha = "a".repeat(40);
const hosting = {
  project_id: "appgprj_test",
  d1: "DB",
  r2: "EVIDENCE",
};

function clock() {
  let milliseconds = Date.parse("2026-07-30T12:00:00.000Z");
  return () => {
    const value = new Date(milliseconds);
    milliseconds += 25;
    return value;
  };
}

test("candidate verification runs every credential-free gate in dependency order", async () => {
  const commands = [];
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    now: clock(),
    runScript: async (scriptName) => {
      commands.push(scriptName);
      return 0;
    },
  });

  assert.deepEqual(
    commands,
    PILOT_CANDIDATE_STEPS.map((step) => step.script),
  );
  assert.equal(evidence.ok, true);
  assert.equal(evidence.testnetBoundary.releaseMode, "testnet");
  assert.equal(evidence.testnetBoundary.productionMoneyEnabled, false);
  assert.equal(evidence.testnetBoundary.hostedReadinessEvaluated, false);
  assert.equal(evidence.steps.every((step) => step.status === "passed"), true);
});

test("candidate verification stops after the first failed gate and records skips", async () => {
  const commands = [];
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    now: clock(),
    runScript: async (scriptName) => {
      commands.push(scriptName);
      return scriptName === "pilot:rehearse" ? 7 : 0;
    },
  });

  assert.deepEqual(commands, ["release:check", "pilot:rehearse"]);
  assert.equal(evidence.ok, false);
  assert.deepEqual(
    evidence.steps.map((step) => step.status),
    ["passed", "failed", "skipped", "skipped"],
  );
  assert.equal(evidence.steps[1].exitCode, 7);
});

test("candidate preflight fails closed before commands when provenance is invalid", async () => {
  let commandCalls = 0;
  const evidence = await executeCandidateVerification({
    commitSha: "not-a-commit",
    hosting,
    now: clock(),
    runScript: async () => {
      commandCalls += 1;
      return 0;
    },
  });

  assert.equal(commandCalls, 0);
  assert.equal(evidence.ok, false);
  assert.equal(evidence.commitSha, null);
  assert.equal(
    evidence.preflightErrors.includes(
      "Candidate commit SHA is missing or invalid.",
    ),
    true,
  );
});

test("candidate context preserves the existing D1 and R2 binding names", () => {
  assert.deepEqual(validateCandidateContext({ commitSha, hosting }), []);
  assert.deepEqual(
    validateCandidateContext({
      commitSha,
      hosting: { ...hosting, d1: "OTHER", r2: "FILES" },
    }),
    [
      "The required D1 binding name DB was not preserved.",
      "The required R2 binding name EVIDENCE was not preserved.",
    ],
  );
});
