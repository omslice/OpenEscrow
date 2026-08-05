import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectCandidateArtifacts,
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
  assert.equal(
    evidence.artifactSchemaVersion,
    "openescrow-pilot-candidate/v3",
  );
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

test("candidate preflight rejects source that differs from the named commit", async () => {
  let commandCalls = 0;
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    sourceChanges: ["M frontend/src/App.tsx"],
    now: clock(),
    runScript: async () => {
      commandCalls += 1;
      return 0;
    },
  });

  assert.equal(commandCalls, 0);
  assert.equal(evidence.ok, false);
  assert.match(evidence.preflightErrors[0], /differs from HEAD/);
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

test("candidate verification fails when subordinate evidence cannot be bound", async () => {
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    now: clock(),
    runScript: async () => 0,
    collectArtifacts: async () => {
      throw new Error("The pilot report belongs to a different commit.");
    },
  });

  assert.equal(evidence.ok, false);
  assert.equal(evidence.artifacts, null);
  assert.equal(
    evidence.artifactError,
    "The pilot report belongs to a different commit.",
  );
});

function writeRehearsalFixture({
  frontendRoot,
  directory,
  schema,
  sourceCommit,
  additionalTestTargets = [],
}) {
  const artifactDirectory = path.join(frontendRoot, directory);
  mkdirSync(artifactDirectory, { recursive: true });
  const junitArtifact = "evidence.xml";
  writeFileSync(
    path.join(artifactDirectory, junitArtifact),
    '<testsuites tests="1" failures="0"><testcase name="scenario"/></testsuites>',
  );
  writeFileSync(
    path.join(artifactDirectory, "latest.json"),
    `${JSON.stringify({
      schema,
      generatedAt: "2026-07-30T12:00:00.000Z",
      status: "passed",
      executionMode: "local-credential-free",
      sourceCommit,
      testTarget: "server/index.test.mjs",
      additionalTestTargets,
      tests: { expected: 1, passed: 1, failed: 0, missing: 0 },
      scenarios: [{ id: "scenario", status: "passed" }],
      junitArtifact,
    })}\n`,
  );
}

function candidateArtifactFixture(t) {
  const repositoryRoot = mkdtempSync(
    path.join(tmpdir(), "openescrow-candidate-"),
  );
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  const frontendRoot = path.join(repositoryRoot, "frontend");
  mkdirSync(path.join(frontendRoot, ".contract-assurance"), {
    recursive: true,
  });
  writeFileSync(
    path.join(frontendRoot, ".contract-assurance", "latest.json"),
    `${JSON.stringify({
      schema: "openescrow.contract-assurance/v1",
      generatedAt: "2026-07-30T12:00:00.000Z",
      status: "passed",
      executionMode: "local-credential-free",
      sourceCommit: commitSha,
      deterministicBuild: { forcedCleanCompile: true, offline: true },
      tests: { total: 2, passed: 1, failed: 0, skipped: 1 },
      contracts: ["OpenEscrow", "OperationsReserve", "AgreementActivityRegistry"].map(
        (name) => ({
          name,
          abiMatched: true,
          abiSha256: `sha256:${"a".repeat(64)}`,
          runtime: {
            runtimeBytes: 10_000,
            marginBytes: 14_576,
            sha256: `sha256:${"b".repeat(64)}`,
          },
          selectors: { count: 4, collisions: [] },
          storageLayoutSha256: `sha256:${"c".repeat(64)}`,
        }),
      ),
      dependencies: ["lib/forge-std", "lib/openzeppelin-contracts"].map(
        (dependencyPath) => ({
          path: dependencyPath,
          gitlink: "d".repeat(40),
          algorithm: "sha256-file-manifest-v1",
          sha256: `sha256:${"e".repeat(64)}`,
        }),
      ),
    })}\n`,
  );
  writeRehearsalFixture({
    frontendRoot,
    directory: ".pilot-rehearsal",
    schema: "openescrow.pilot-rehearsal.v1",
    sourceCommit: commitSha,
    additionalTestTargets: ["scripts/check-record-verification.mjs"],
  });
  writeRehearsalFixture({
    frontendRoot,
    directory: ".incident-rehearsal",
    schema: "openescrow.incident-rehearsal.v1",
    sourceCommit: commitSha,
  });
  mkdirSync(path.join(repositoryRoot, "dist", "server"), {
    recursive: true,
  });
  mkdirSync(path.join(repositoryRoot, "dist", "client"), {
    recursive: true,
  });
  mkdirSync(path.join(repositoryRoot, "dist", ".openai"), {
    recursive: true,
  });
  writeFileSync(
    path.join(repositoryRoot, "dist", "server", "release-provenance.js"),
    `export const RELEASE_PROVENANCE_SCHEMA = "openescrow-release/v1";
export const RELEASE_PROVENANCE = Object.freeze({
  schemaVersion: RELEASE_PROVENANCE_SCHEMA,
  commitSha: "${commitSha}",
});
`,
  );
  writeFileSync(
    path.join(repositoryRoot, "dist", ".openai", "hosting.json"),
    `${JSON.stringify(hosting)}\n`,
  );
  writeFileSync(
    path.join(repositoryRoot, "dist", "server", "index.js"),
    "export default {};\n",
  );
  writeFileSync(
    path.join(repositoryRoot, "dist", "client", "index.html"),
    "<!doctype html><title>OpenEscrow</title>\n",
  );
  return { frontendRoot, repositoryRoot };
}

test("candidate artifacts bind both rehearsals and every packaged Sites byte", (t) => {
  const fixture = candidateArtifactFixture(t);
  const first = collectCandidateArtifacts({
    ...fixture,
    commitSha,
  });

  assert.equal(first.pilotRehearsal.sourceCommit, commitSha);
  assert.equal(first.contractAssurance.sourceCommit, commitSha);
  assert.equal(first.contractAssurance.contracts.length, 3);
  assert.equal(first.contractAssurance.dependencies.length, 2);
  assert.deepEqual(first.pilotRehearsal.testTargets, [
    "server/index.test.mjs",
    "scripts/check-record-verification.mjs",
  ]);
  assert.equal(first.incidentRehearsal.scenarioCount, 1);
  assert.equal(first.sitesBuild.release.commitSha, commitSha);
  assert.equal(first.sitesBuild.hosting.d1, "DB");
  assert.equal(first.sitesBuild.hosting.r2, "EVIDENCE");
  assert.equal(first.sitesBuild.fileCount, 4);
  assert.match(first.sitesBuild.sha256, /^sha256:[0-9a-f]{64}$/);

  writeFileSync(
    path.join(fixture.repositoryRoot, "dist", "client", "index.html"),
    "<!doctype html><title>Changed candidate</title>\n",
  );
  const changed = collectCandidateArtifacts({
    ...fixture,
    commitSha,
  });
  assert.notEqual(changed.sitesBuild.sha256, first.sitesBuild.sha256);
});

test("candidate artifacts reject rehearsal evidence from another commit", (t) => {
  const fixture = candidateArtifactFixture(t);
  writeRehearsalFixture({
    frontendRoot: fixture.frontendRoot,
    directory: ".incident-rehearsal",
    schema: "openescrow.incident-rehearsal.v1",
    sourceCommit: "b".repeat(40),
  });

  assert.throws(
    () =>
      collectCandidateArtifacts({
        ...fixture,
        commitSha,
      }),
    /incidentRehearsal evidence is not a passing credential-free artifact/,
  );
});

test("candidate artifacts require the rendered record-verification target", (t) => {
  const fixture = candidateArtifactFixture(t);
  writeRehearsalFixture({
    frontendRoot: fixture.frontendRoot,
    directory: ".pilot-rehearsal",
    schema: "openescrow.pilot-rehearsal.v1",
    sourceCommit: commitSha,
  });

  assert.throws(
    () =>
      collectCandidateArtifacts({
        ...fixture,
        commitSha,
      }),
    /missing required rendered target/,
  );
});

test("candidate artifacts reject a contract with insufficient bytecode margin", (t) => {
  const fixture = candidateArtifactFixture(t);
  const summaryPath = path.join(
    fixture.frontendRoot,
    ".contract-assurance",
    "latest.json",
  );
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  summary.contracts[0].runtime.marginBytes = 100;
  writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);

  assert.throws(
    () => collectCandidateArtifacts({ ...fixture, commitSha }),
    /unsafe or incomplete contract evidence/,
  );
});
