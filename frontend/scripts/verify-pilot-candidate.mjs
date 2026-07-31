import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PILOT_CANDIDATE_SCHEMA_VERSION =
  "openescrow-pilot-candidate/v2";

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

const REHEARSAL_ARTIFACTS = Object.freeze([
  Object.freeze({
    key: "pilotRehearsal",
    directory: ".pilot-rehearsal",
    schema: "openescrow.pilot-rehearsal.v1",
  }),
  Object.freeze({
    key: "incidentRehearsal",
    directory: ".incident-rehearsal",
    schema: "openescrow.incident-rehearsal.v1",
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
  collectArtifacts,
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

  let artifacts = null;
  let artifactError = null;
  if (!failed && collectArtifacts) {
    try {
      artifacts = await collectArtifacts();
      if (!artifacts) {
        throw new Error("Candidate artifact collection returned no evidence.");
      }
    } catch (caught) {
      artifactError =
        caught instanceof Error
          ? caught.message
          : "Candidate artifacts could not be verified.";
      failed = true;
    }
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
    artifacts,
    artifactError,
  };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function relativeArtifactPath(repositoryRoot, artifactPath) {
  return path
    .relative(repositoryRoot, artifactPath)
    .split(path.sep)
    .join("/");
}

function verifiedRehearsalArtifact({
  frontendRoot,
  repositoryRoot,
  commitSha,
  descriptor,
}) {
  const artifactDirectory = path.join(frontendRoot, descriptor.directory);
  const summaryPath = path.join(artifactDirectory, "latest.json");
  const summaryBytes = readFileSync(summaryPath);
  const summary = JSON.parse(summaryBytes.toString("utf8"));
  if (
    summary.schema !== descriptor.schema ||
    summary.status !== "passed" ||
    summary.executionMode !== "local-credential-free" ||
    summary.sourceCommit !== commitSha
  ) {
    throw new Error(
      `${descriptor.key} evidence is not a passing credential-free artifact for ${commitSha}.`,
    );
  }
  const expected = Number(summary.tests?.expected);
  if (
    !Number.isInteger(expected) ||
    expected <= 0 ||
    summary.tests?.passed !== expected ||
    summary.tests?.failed !== 0 ||
    summary.tests?.missing !== 0 ||
    !Array.isArray(summary.scenarios) ||
    summary.scenarios.length !== expected ||
    summary.scenarios.some((scenario) => scenario?.status !== "passed")
  ) {
    throw new Error(`${descriptor.key} evidence has incomplete scenario results.`);
  }
  if (
    typeof summary.junitArtifact !== "string" ||
    path.basename(summary.junitArtifact) !== summary.junitArtifact ||
    !summary.junitArtifact.endsWith(".xml")
  ) {
    throw new Error(`${descriptor.key} evidence has an invalid JUnit reference.`);
  }
  const junitPath = path.join(artifactDirectory, summary.junitArtifact);
  const junitBytes = readFileSync(junitPath);
  if (junitBytes.length === 0) {
    throw new Error(`${descriptor.key} JUnit evidence is empty.`);
  }

  return {
    schema: summary.schema,
    generatedAt: summary.generatedAt,
    sourceCommit: summary.sourceCommit,
    scenarioCount: expected,
    summary: {
      path: relativeArtifactPath(repositoryRoot, summaryPath),
      sha256: sha256(summaryBytes),
    },
    junit: {
      path: relativeArtifactPath(repositoryRoot, junitPath),
      sha256: sha256(junitBytes),
    },
  };
}

function digestDirectory(directory) {
  const manifestHash = createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;

  function visit(currentDirectory) {
    const entries = readdirSync(currentDirectory, { withFileTypes: true }).sort(
      (left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const metadata = lstatSync(absolutePath);
      if (metadata.isSymbolicLink()) {
        throw new Error("Packaged Sites output must not contain symbolic links.");
      }
      if (metadata.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!metadata.isFile()) continue;
      const bytes = readFileSync(absolutePath);
      const relativePath = path
        .relative(directory, absolutePath)
        .split(path.sep)
        .join("/");
      const fileHash = sha256(bytes);
      manifestHash.update(
        `${relativePath}\0${bytes.length}\0${fileHash}\n`,
        "utf8",
      );
      fileCount += 1;
      totalBytes += bytes.length;
    }
  }

  visit(directory);
  if (fileCount === 0) {
    throw new Error("Packaged Sites output is empty.");
  }
  return {
    algorithm: "sha256-file-manifest-v1",
    sha256: `sha256:${manifestHash.digest("hex")}`,
    fileCount,
    totalBytes,
  };
}

export function collectCandidateArtifacts({
  frontendRoot,
  repositoryRoot,
  commitSha,
}) {
  const artifacts = {};
  for (const descriptor of REHEARSAL_ARTIFACTS) {
    artifacts[descriptor.key] = verifiedRehearsalArtifact({
      frontendRoot,
      repositoryRoot,
      commitSha,
      descriptor,
    });
  }

  const sitesDirectory = path.join(repositoryRoot, "dist");
  const releasePath = path.join(
    sitesDirectory,
    "server",
    "release-provenance.js",
  );
  const releaseSource = readFileSync(releasePath, "utf8");
  const schemaMatch = releaseSource.match(
    /RELEASE_PROVENANCE_SCHEMA\s*=\s*"([^"]+)"/,
  );
  const commitMatch = releaseSource.match(/commitSha:\s*"([0-9a-f]{40})"/);
  if (
    schemaMatch?.[1] !== "openescrow-release/v1" ||
    commitMatch?.[1] !== commitSha
  ) {
    throw new Error(
      "Packaged Sites release provenance does not match the candidate commit.",
    );
  }
  const packagedHostingPath = path.join(
    sitesDirectory,
    ".openai",
    "hosting.json",
  );
  const packagedHosting = JSON.parse(
    readFileSync(packagedHostingPath, "utf8"),
  );
  const hostingErrors = validateCandidateContext({
    commitSha,
    hosting: packagedHosting,
  });
  if (hostingErrors.length > 0) {
    throw new Error(
      `Packaged Sites hosting metadata failed validation: ${hostingErrors.join(" ")}`,
    );
  }

  artifacts.sitesBuild = {
    path: relativeArtifactPath(repositoryRoot, sitesDirectory),
    release: {
      schemaVersion: schemaMatch[1],
      commitSha: commitMatch[1],
    },
    hosting: {
      projectId: packagedHosting.project_id,
      d1: packagedHosting.d1,
      r2: packagedHosting.r2,
    },
    ...digestDirectory(sitesDirectory),
  };
  return artifacts;
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

  const commitSha = gitHead(repositoryRoot);
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    runScript: (scriptName) => runNpmScript(frontendRoot, scriptName),
    collectArtifacts: () =>
      collectCandidateArtifacts({
        frontendRoot,
        repositoryRoot,
        commitSha,
      }),
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
