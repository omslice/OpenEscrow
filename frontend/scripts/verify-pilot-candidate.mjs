import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PILOT_CANDIDATE_SCHEMA_VERSION =
  "openescrow-pilot-candidate/v1";

export const PILOT_CANDIDATE_STEPS = Object.freeze([
  Object.freeze({
    id: "release-check",
    script: "release:check",
    label: "Repository release envelope",
  }),
  Object.freeze({
    id: "pilot-rehearsal",
    script: "pilot:rehearse",
    label: "Credential-free pilot rehearsal",
  }),
  Object.freeze({
    id: "incident-rehearsal",
    script: "incident:rehearse",
    label: "Credential-free incident rehearsal",
  }),
  Object.freeze({
    id: "sites-build",
    script: "build:sites",
    label: "Exact-source Sites build",
  }),
]);

export function validateCandidateContext({ commitSha, hosting }) {
  const errors = [];
  if (!/^[0-9a-f]{40}$/.test(commitSha || "")) {
    errors.push("Candidate commit SHA is missing or invalid.");
  }
  if (
    !hosting ||
    typeof hosting.project_id !== "string" ||
    hosting.project_id.length === 0
  ) {
    errors.push("Existing Sites project ID is missing.");
  }
  if (hosting?.d1 !== "DB") {
    errors.push("The required D1 binding name DB was not preserved.");
  }
  if (hosting?.r2 !== "EVIDENCE") {
    errors.push("The required R2 binding name EVIDENCE was not preserved.");
  }
  return errors;
}

export async function executeCandidateVerification({
  commitSha,
  hosting,
  runScript,
  now = () => new Date(),
}) {
  const startedAt = now();
  const contextErrors = validateCandidateContext({ commitSha, hosting });
  const steps = [];
  let failed = contextErrors.length > 0;

  for (const step of PILOT_CANDIDATE_STEPS) {
    if (failed) {
      steps.push({
        ...step,
        status: "skipped",
        durationMs: 0,
      });
      continue;
    }

    const stepStartedAt = now();
    let exitCode = 1;
    let error = null;
    try {
      exitCode = await runScript(step.script);
    } catch (caught) {
      error =
        caught instanceof Error
          ? caught.message
          : "Candidate verification command failed to start.";
    }
    const durationMs = Math.max(0, now().getTime() - stepStartedAt.getTime());
    const status = exitCode === 0 && !error ? "passed" : "failed";
    steps.push({
      ...step,
      status,
      exitCode,
      durationMs,
      ...(error ? { error } : {}),
    });
    failed = status === "failed";
  }

  const finishedAt = now();
  return {
    artifactSchemaVersion: PILOT_CANDIDATE_SCHEMA_VERSION,
    checkedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    commitSha: /^[0-9a-f]{40}$/.test(commitSha || "") ? commitSha : null,
    ok: !failed,
    preflightErrors: contextErrors,
    testnetBoundary: {
      releaseMode: "testnet",
      productionMoneyEnabled: false,
      hostedReadinessEvaluated: false,
    },
    hosting: hosting
      ? {
          projectId:
            typeof hosting.project_id === "string"
              ? hosting.project_id
              : null,
          d1: hosting.d1 ?? null,
          r2: hosting.r2 ?? null,
        }
      : null,
    steps,
  };
}

function npmInvocation(scriptName) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, "run", scriptName],
    };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd run ${scriptName}`],
    };
  }
  return { command: "npm", args: ["run", scriptName] };
}

function runNpmScript(frontendRoot, scriptName) {
  const invocation = npmInvocation(scriptName);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: frontendRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function gitHead(repositoryRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return "";
  return result.stdout.trim();
}

function artifactPath(frontendRoot, checkedAt, args) {
  const explicitPath = args.find((arg) => arg.startsWith("--artifact-path="));
  if (explicitPath) {
    return path.resolve(
      frontendRoot,
      explicitPath.slice("--artifact-path=".length),
    );
  }
  const explicitDir = args.find((arg) => arg.startsWith("--artifact-dir="));
  const directory = explicitDir
    ? explicitDir.slice("--artifact-dir=".length)
    : ".pilot-candidate";
  const fileName = `openescrow-pilot-candidate-${checkedAt.replace(/[:.]/g, "-")}.json`;
  return path.resolve(frontendRoot, directory, fileName);
}

async function runCli() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDir, "..");
  const repositoryRoot = path.resolve(frontendRoot, "..");
  const hostingPath = path.join(
    repositoryRoot,
    ".openai",
    "hosting.json",
  );
  let hosting = null;
  try {
    hosting = JSON.parse(readFileSync(hostingPath, "utf8"));
  } catch {
    // The preflight evidence below reports the missing/invalid hosting context.
  }

  const evidence = await executeCandidateVerification({
    commitSha: gitHead(repositoryRoot),
    hosting,
    runScript: (scriptName) => runNpmScript(frontendRoot, scriptName),
  });
  const destination = artifactPath(
    frontendRoot,
    evidence.checkedAt,
    process.argv.slice(2),
  );
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`);

  if (evidence.ok) {
    console.log(
      `PASS: credential-free pilot candidate verified at ${evidence.commitSha}.`,
    );
  } else {
    console.error("Pilot candidate verification failed.");
    for (const error of evidence.preflightErrors) {
      console.error(`- ${error}`);
    }
  }
  console.log(`Candidate evidence: ${destination}`);
  process.exitCode = evidence.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
