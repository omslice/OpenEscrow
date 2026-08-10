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

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function appendAdditionalCheckJUnit(junit, results) {
  if (results.length === 0) return junit;
  const closingTag = "</testsuites>";
  const closingIndex = junit.lastIndexOf(closingTag);
  if (closingIndex < 0) {
    throw new Error("The server rehearsal did not produce a valid JUnit root.");
  }
  const testcases = results
    .map((result) => {
      const attributes = [
        `name="${escapeXml(result.name)}"`,
        `time="${Math.max(0, result.durationMs) / 1_000}"`,
        'classname="rendered-pilot"',
        `file="${escapeXml(result.target)}"`,
      ].join(" ");
      if (!result.failed) return `\t<testcase ${attributes}/>`;
      const rawFailure = String(
        result.error ||
          result.stderr ||
          result.stdout ||
          "The rendered credential-free check failed.",
      );
      const message = escapeXml(rawFailure.slice(0, 500));
      const details = escapeXml(rawFailure.slice(0, 4_000));
      return `\t<testcase ${attributes}><failure message="${message}">${details}</failure></testcase>`;
    })
    .join("\n");
  return `${junit.slice(0, closingIndex)}${testcases}\n${junit.slice(closingIndex)}`;
}

export function parseJUnitTestcases(junit) {
  const testcasePattern =
    /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  const observedTests = new Map();
  for (const match of junit.matchAll(testcasePattern)) {
    const name = /\bname="([^"]+)"/.exec(match[1])?.[1];
    if (!name) continue;
    observedTests.set(name, {
      failed: /<(?:failure|error)\b/.test(match[2] || ""),
    });
  }
  return observedTests;
}

export function runServerRehearsal({
  artifactDirectoryName,
  artifactPrefix,
  schema,
  consoleLabel,
  expectedScenarios,
  testNamePattern,
  safetyBoundary,
  additionalChecks = [],
}) {
  const artifactDirectory = join(frontendDirectory, artifactDirectoryName);
  const generatedAt = new Date().toISOString();
  const artifactSuffix = generatedAt.replaceAll(":", "-").replaceAll(".", "-");
  const selectedPattern =
    testNamePattern ||
    `^(?:${expectedScenarios
      .map((scenario) => escapeRegularExpression(scenario.name))
      .join("|")})$`;

  const testRun = spawnSync(
    process.execPath,
    [
      "--test",
      `--test-name-pattern=${selectedPattern}`,
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
  const additionalResults = additionalChecks.map((check) => {
    const startedAt = Date.now();
    const result = spawnSync(check.command, check.args || [], {
      cwd: frontendDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
      },
    });
    return {
      name: check.name,
      target: check.target,
      durationMs: Math.max(0, Date.now() - startedAt),
      failed: result.status !== 0 || Boolean(result.error),
      error: result.error?.message || null,
      stdout: result.stdout?.trim() || null,
      stderr: result.stderr?.trim() || null,
    };
  });

  const gitRevision = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: frontendDirectory,
    encoding: "utf8",
  });
  const sourceCommit =
    gitRevision.status === 0 ? gitRevision.stdout.trim() || null : null;

  let junit = testRun.stdout || "";
  let junitAppendError = null;
  try {
    junit = appendAdditionalCheckJUnit(junit, additionalResults);
  } catch (error) {
    junitAppendError =
      error instanceof Error
        ? error.message
        : "The rendered checks could not be added to JUnit evidence.";
  }
  const runnerError = [
    testRun.error?.message || testRun.stderr?.trim() || null,
    junitAppendError,
    ...additionalResults
      .filter((result) => result.failed)
      .map(
        (result) =>
          `${result.name}: ${
            result.error ||
            result.stderr ||
            result.stdout ||
            "check failed without output"
          }`,
      ),
  ]
    .filter(Boolean)
    .join("\n") || null;
  const observedTests = parseJUnitTestcases(junit);
  for (const result of additionalResults) {
    observedTests.set(result.name, { failed: result.failed });
  }

  const scenarios = expectedScenarios.map((scenario) => {
    const observed = observedTests.get(scenario.name);
    return {
      ...scenario,
      status: !observed ? "missing" : observed.failed ? "failed" : "passed",
    };
  });
  const passed =
    testRun.status === 0 &&
    !junitAppendError &&
    additionalResults.every((result) => !result.failed) &&
    scenarios.every((scenario) => scenario.status === "passed");

  mkdirSync(artifactDirectory, { recursive: true });
  const junitPath = join(
    artifactDirectory,
    `${artifactPrefix}-${artifactSuffix}.xml`,
  );
  const summaryPath = join(
    artifactDirectory,
    `${artifactPrefix}-${artifactSuffix}.json`,
  );
  const latestSummaryPath = join(artifactDirectory, "latest.json");
  writeFileSync(junitPath, junit, "utf8");

  const summary = {
    schema,
    generatedAt,
    status: passed ? "passed" : "failed",
    executionMode: "local-credential-free",
    sourceCommit,
    nodeVersion: process.version,
    testTarget: "server/index.test.mjs",
    additionalTestTargets: additionalResults.map((result) => result.target),
    safetyBoundary,
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
    `${passed ? "PASS" : "FAIL"}: ${summary.tests.passed}/${summary.tests.expected} credential-free ${consoleLabel} scenarios passed.`,
  );
  for (const scenario of scenarios) {
    console.log(`- ${scenario.status.toUpperCase()}: ${scenario.id}`);
  }
  console.log(`Evidence: ${summaryPath}`);

  if (!passed) {
    if (runnerError) console.error(runnerError);
    process.exitCode = 1;
  }

  return summary;
}
