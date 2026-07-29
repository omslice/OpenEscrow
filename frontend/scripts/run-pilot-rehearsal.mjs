import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const artifactDirectory = join(frontendDirectory, ".pilot-rehearsal");
const generatedAt = new Date().toISOString();
const artifactSuffix = generatedAt.replaceAll(":", "-").replaceAll(".", "-");

const expectedScenarios = [
  {
    id: "archive-restore",
    name: "pilot rehearsal: archive and restore permissions are isolated by signed-in account",
    covers: ["archive", "restore", "cross-account authorization"],
  },
  {
    id: "record-proof",
    name: "pilot rehearsal: record export and proof include claim, decision, and receipts",
    covers: ["report export", "canonical JSON", "snapshot hash", "receipt trail"],
  },
  {
    id: "disputed-claim",
    name: "pilot rehearsal: a disputed claim completes funding, ruling, and withdrawals once",
    covers: ["multi-tenant funding", "partial dispute", "arbiter ruling", "withdrawals"],
  },
  {
    id: "accepted-claim",
    name: "pilot rehearsal: an accepted claim resolves allocations, withdrawals, and record export",
    covers: ["full claim acceptance", "allocation", "withdrawals", "record export"],
  },
  {
    id: "no-claim-refund",
    name: "pilot rehearsal: a no-claim refund and withdrawal are role-safe and one-time",
    covers: ["no-claim timeout", "refund", "role authorization", "idempotency"],
  },
  {
    id: "evidence-upload-outage",
    name: "pilot rehearsal: an evidence upload outage is retryable without a phantom record",
    covers: ["R2 outage", "retry", "metadata consistency", "privacy-safe error"],
  },
  {
    id: "evidence-download-outage",
    name: "pilot rehearsal: an evidence download outage fails closed without storage details",
    covers: ["R2 outage", "fail-closed download", "privacy-safe error"],
  },
  {
    id: "notification-outage",
    name: "pilot rehearsal: a notification outage is retryable without a phantom delivery",
    covers: ["email outage", "retry", "delivery idempotency", "event consistency"],
  },
  {
    id: "arbiter-invite-reset",
    name: "pilot rehearsal: the landlord can reset an arbiter link and invalidate prior sessions",
    covers: ["arbiter recovery", "link rotation", "session invalidation", "role authorization"],
  },
  {
    id: "arbiter-account-recovery",
    name: "pilot rehearsal: verified arbiter discovery is isolated and survives link rotation",
    covers: [
      "verified identity",
      "arbiter recovery",
      "cross-account isolation",
      "archive isolation",
    ],
  },
];

const testRun = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-name-pattern=^pilot rehearsal:",
    "--test-reporter=junit",
    "server/index.test.mjs",
  ],
  {
    cwd: frontendDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
    },
  },
);
const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: frontendDirectory,
  encoding: "utf8",
});
const sourceCommit =
  gitRevision.status === 0 ? gitRevision.stdout.trim() || null : null;

const junit = testRun.stdout || "";
const runnerError = testRun.error?.message || testRun.stderr?.trim() || null;
const testcasePattern =
  /<testcase\b[^>]*\bname="([^"]+)"[^>]*(?:\/>|>([\s\S]*?)<\/testcase>)/g;
const observedTests = new Map();
for (const match of junit.matchAll(testcasePattern)) {
  observedTests.set(match[1], {
    failed: /<(?:failure|error)\b/.test(match[2] || ""),
  });
}

const scenarios = expectedScenarios.map((scenario) => {
  const observed = observedTests.get(scenario.name);
  return {
    ...scenario,
    status: !observed ? "missing" : observed.failed ? "failed" : "passed",
  };
});
const passed = testRun.status === 0 && scenarios.every(
  (scenario) => scenario.status === "passed",
);

mkdirSync(artifactDirectory, { recursive: true });
const junitPath = join(
  artifactDirectory,
  `openescrow-pilot-rehearsal-${artifactSuffix}.xml`,
);
const summaryPath = join(
  artifactDirectory,
  `openescrow-pilot-rehearsal-${artifactSuffix}.json`,
);
const latestSummaryPath = join(artifactDirectory, "latest.json");
writeFileSync(junitPath, junit, "utf8");

const summary = {
  schema: "openescrow.pilot-rehearsal.v1",
  generatedAt,
  status: passed ? "passed" : "failed",
  executionMode: "local-credential-free",
  sourceCommit,
  nodeVersion: process.version,
  testTarget: "server/index.test.mjs",
  safetyBoundary:
    "In-memory workflow simulation only; no hosted identities, wallets, contracts, providers, secrets, or real funds.",
  tests: {
    expected: expectedScenarios.length,
    passed: scenarios.filter((scenario) => scenario.status === "passed").length,
    failed: scenarios.filter((scenario) => scenario.status === "failed").length,
    missing: scenarios.filter((scenario) => scenario.status === "missing").length,
  },
  scenarios,
  junitArtifact: basename(junitPath),
  runnerError,
};
const serializedSummary = `${JSON.stringify(summary, null, 2)}\n`;
writeFileSync(summaryPath, serializedSummary, "utf8");
writeFileSync(latestSummaryPath, serializedSummary, "utf8");

console.log(
  `${passed ? "PASS" : "FAIL"}: ${summary.tests.passed}/${summary.tests.expected} credential-free pilot scenarios passed.`,
);
for (const scenario of scenarios) {
  console.log(`- ${scenario.status.toUpperCase()}: ${scenario.id}`);
}
console.log(`Evidence: ${summaryPath}`);

if (!passed) {
  if (runnerError) console.error(runnerError);
  process.exitCode = 1;
}
