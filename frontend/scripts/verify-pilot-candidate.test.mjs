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
    "openescrow-pilot-candidate/v5",
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

  assert.deepEqual(commands, [
    "release:check",
    "deploy:rehearse",
    "pilot:rehearse",
  ]);
  assert.equal(evidence.ok, false);
  assert.deepEqual(
    evidence.steps.map((step) => step.status),
    ["passed", "passed", "failed", "skipped", "skipped"],
  );
  assert.equal(evidence.steps[2].exitCode, 7);
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

function writeDeploymentRehearsalFixture(frontendRoot) {
  mkdirSync(path.join(frontendRoot, ".deployment-rehearsal"), {
    recursive: true,
  });
  writeFileSync(
    path.join(frontendRoot, ".deployment-rehearsal", "latest.json"),
    `${JSON.stringify({
      schema: "openescrow.deployment-rehearsal/v1",
      generatedAt: "2026-08-05T12:00:00.000Z",
      status: "passed",
      executionMode: "local-anvil-credential-free",
      sourceCommit: commitSha,
      chainId: 84_532,
      manifest: {
        schema: "openescrow.deployment-manifest/v2",
        network: "local-anvil-base-sepolia-rehearsal",
        sourceCommit: commitSha,
        chainId: 84_532,
        cohortStatus: "candidate-rehearsal-only",
        openEscrow: {
          address: "0x1111111111111111111111111111111111111111",
          deploymentBlock: 10,
          transactionHash: `0x${"1".repeat(64)}`,
        },
        operationsReserve: {
          address: "0x2222222222222222222222222222222222222222",
          deploymentBlock: 9,
          transactionHash: `0x${"2".repeat(64)}`,
        },
        agreementActivityRegistry: {
          address: "0x3333333333333333333333333333333333333333",
          escrowAddress: "0x1111111111111111111111111111111111111111",
          deploymentBlock: 12,
          transactionHash: `0x${"3".repeat(64)}`,
        },
        reciprocalConfiguration: {
          transactionHash: `0x${"4".repeat(64)}`,
          reserveAddress: "0x2222222222222222222222222222222222222222",
          escrowAddress: "0x1111111111111111111111111111111111111111",
        },
        tokens: {
          plain: "0x4444444444444444444444444444444444444444",
          yield: "0x5555555555555555555555555555555555555555",
        },
      },
      bindings: {
        retired: { reciprocalBindingsVerified: true },
        candidate: {
          reciprocalBindingsVerified: true,
          runtime: { openEscrow: {}, operationsReserve: {}, agreementActivityRegistry: {} },
        },
      },
      retiredCohort: {
        principalWithdrawn: true,
        registryIsolationVerified: true,
        candidateUnaffected: true,
      },
      configSwitch: {
        switchVerified: true,
        rollbackVerified: true,
        replacementCount: 12,
        files: ["client", "registry", "server"],
      },
    })}\n`,
  );
}

function candidateArtifactFixture(t) {
  const repositoryRoot = mkdtempSync(
    path.join(tmpdir(), "openescrow-candidate-"),
  );
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  const frontendRoot = path.join(repositoryRoot, "frontend");
  mkdirSync(frontendRoot, { recursive: true });
  writeFileSync(
    path.join(frontendRoot, "package.json"),
    `${JSON.stringify({
      name: "frontend",
      version: "0.0.0",
      dependencies: { "runtime-package": "^1.0.0" },
      devDependencies: { "test-package": "^2.0.0" },
    })}\n`,
  );
  writeFileSync(
    path.join(frontendRoot, "package-lock.json"),
    `${JSON.stringify({
      name: "frontend",
      version: "0.0.0",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "frontend",
          version: "0.0.0",
          dependencies: { "runtime-package": "^1.0.0" },
          devDependencies: { "test-package": "^2.0.0" },
        },
        "node_modules/runtime-package": {
          version: "1.2.3",
          integrity: "sha512-runtime",
          license: "MIT",
        },
        "node_modules/test-package": {
          version: "2.3.4",
          integrity: "sha512-test",
          license: "MIT",
          dev: true,
        },
      },
    })}\n`,
  );
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
      forgeVersion: "forge Version: 1.7.1",
      profile: {
        solcVersion: "0.8.26",
        optimizer: true,
        optimizerRuns: 200,
        viaIr: true,
        storageLayoutOutput: true,
        fuzzRuns: 512,
        invariantRuns: 256,
        invariantDepth: 128,
      },
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
  writeDeploymentRehearsalFixture(frontendRoot);
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
  assert.equal(first.contractAssurance.toolchain.solc, "0.8.26");
  assert.equal(first.contractAssurance.profile.invariantDepth, 128);
  assert.equal(first.deploymentRehearsal.retiredCohortIsolationVerified, true);
  assert.equal(first.deploymentRehearsal.configSwitch.rollbackVerified, true);
  assert.equal(
    first.softwareInventory.schema,
    "openescrow.software-inventory/v1",
  );
  assert.equal(first.softwareInventory.sourceCommit, commitSha);
  assert.equal(first.softwareInventory.componentCount, 1);
  assert.deepEqual(
    first.softwareInventory.components.map((component) => component.name),
    ["runtime-package"],
  );
  assert.match(first.softwareInventory.sha256, /^sha256:[0-9a-f]{64}$/);
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

test("candidate artifacts reject compiler or invariant profile drift", (t) => {
  const fixture = candidateArtifactFixture(t);
  const summaryPath = path.join(
    fixture.frontendRoot,
    ".contract-assurance",
    "latest.json",
  );
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  summary.profile.solcVersion = "0.8.27";
  writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);

  assert.throws(
    () => collectCandidateArtifacts({ ...fixture, commitSha }),
    /unexpected compiler or test toolchain/i,
  );
});

test("candidate artifacts reject a deployment rehearsal without exact rollback", (t) => {
  const fixture = candidateArtifactFixture(t);
  const summaryPath = path.join(
    fixture.frontendRoot,
    ".deployment-rehearsal",
    "latest.json",
  );
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  summary.configSwitch.rollbackVerified = false;
  writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);

  assert.throws(
    () => collectCandidateArtifacts({ ...fixture, commitSha }),
    /configuration switch and rollback/,
  );
});

test("candidate artifacts reject incomplete production dependency evidence", (t) => {
  const fixture = candidateArtifactFixture(t);
  const lockfilePath = path.join(fixture.frontendRoot, "package-lock.json");
  const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
  delete lockfile.packages["node_modules/runtime-package"].integrity;
  writeFileSync(lockfilePath, `${JSON.stringify(lockfile)}\n`);

  assert.throws(
    () => collectCandidateArtifacts({ ...fixture, commitSha }),
    /incomplete lock evidence/i,
  );
});
