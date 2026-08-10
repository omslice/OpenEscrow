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
import { validateDeploymentManifest } from "./deployment-config-plan.mjs";
import { buildReleaseSoftwareInventory } from "./release-software-inventory.mjs";

export const PILOT_CANDIDATE_SCHEMA_VERSION =
  "openescrow-pilot-candidate/v6";

export const PILOT_CANDIDATE_STEPS = Object.freeze([
  Object.freeze({
    id: "release-check",
    script: "release:check",
    label: "Repository release envelope",
  }),
  Object.freeze({
    id: "deployment-rehearsal",
    script: "deploy:rehearse",
    label: "Credential-free deployment and rollback rehearsal",
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
    id: "cloudflare-build",
    script: "build:cloudflare",
    label: "Exact-source Cloudflare Worker build",
  }),
  Object.freeze({
    id: "cloudflare-config",
    script: "check:cloudflare-config",
    label: "Cloudflare binding and safety configuration",
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
    requiredAdditionalTargets: Object.freeze([
      "scripts/check-record-verification.mjs",
    ]),
  }),
  Object.freeze({
    key: "incidentRehearsal",
    directory: ".incident-rehearsal",
    schema: "openescrow.incident-rehearsal.v1",
  }),
]);

export function validateCandidateContext({ commitSha, hosting, sourceChanges = [] }) {
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
  if (sourceChanges.length > 0) {
    errors.push(
      `Candidate source differs from HEAD: ${sourceChanges.join(", ")}.`,
    );
  }
  return errors;
}

export async function executeCandidateVerification({
  commitSha,
  hosting,
  runScript,
  collectArtifacts,
  sourceChanges = [],
  now = () => new Date(),
}) {
  const startedAt = now();
  const contextErrors = validateCandidateContext({
    commitSha,
    hosting,
    sourceChanges,
  });
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
  const testTargets = [
    summary.testTarget,
    ...(Array.isArray(summary.additionalTestTargets)
      ? summary.additionalTestTargets
      : []),
  ].filter((target) => typeof target === "string" && target.length > 0);
  const missingTargets = (descriptor.requiredAdditionalTargets || []).filter(
    (target) => !testTargets.includes(target),
  );
  if (missingTargets.length > 0) {
    throw new Error(
      `${descriptor.key} evidence is missing required rendered target(s): ${missingTargets.join(", ")}.`,
    );
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
    testTargets,
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

function verifiedContractAssuranceArtifact({
  frontendRoot,
  repositoryRoot,
  commitSha,
}) {
  const summaryPath = path.join(
    frontendRoot,
    ".contract-assurance",
    "latest.json",
  );
  const summaryBytes = readFileSync(summaryPath);
  const summary = JSON.parse(summaryBytes.toString("utf8"));
  if (
    summary.schema !== "openescrow.contract-assurance/v1" ||
    summary.status !== "passed" ||
    summary.executionMode !== "local-credential-free" ||
    summary.sourceCommit !== commitSha ||
    summary.deterministicBuild?.forcedCleanCompile !== true ||
    summary.deterministicBuild?.offline !== true
  ) {
    throw new Error(
      `Contract assurance is not passing deterministic offline evidence for ${commitSha}.`,
    );
  }
  if (
    typeof summary.forgeVersion !== "string" ||
    summary.forgeVersion.length < 3 ||
    summary.forgeVersion.length > 200 ||
    summary.profile?.solcVersion !== "0.8.26" ||
    summary.profile?.optimizer !== true ||
    summary.profile?.optimizerRuns !== 200 ||
    summary.profile?.viaIr !== true ||
    summary.profile?.storageLayoutOutput !== true ||
    summary.profile?.fuzzRuns !== 512 ||
    summary.profile?.invariantRuns !== 256 ||
    summary.profile?.invariantDepth !== 128
  ) {
    throw new Error("Contract assurance has an unexpected compiler or test toolchain.");
  }

  const total = Number(summary.tests?.total);
  const passed = Number(summary.tests?.passed);
  const failed = Number(summary.tests?.failed);
  const skipped = Number(summary.tests?.skipped);
  if (
    !Number.isInteger(total) ||
    total <= 0 ||
    !Number.isInteger(passed) ||
    !Number.isInteger(skipped) ||
    failed !== 0 ||
    passed + skipped !== total
  ) {
    throw new Error("Contract assurance contains incomplete Foundry results.");
  }

  if (
    !Array.isArray(summary.contracts) ||
    summary.contracts.length !== 3 ||
    summary.contracts.some(
      (contract) =>
        contract?.abiMatched !== true ||
        !Number.isInteger(contract?.runtime?.marginBytes) ||
        contract.runtime.marginBytes < 2_048 ||
        !Array.isArray(contract?.selectors?.collisions) ||
        contract.selectors.collisions.length !== 0,
    )
  ) {
    throw new Error("Contract assurance contains unsafe or incomplete contract evidence.");
  }

  if (
    !Array.isArray(summary.dependencies) ||
    summary.dependencies.length !== 2 ||
    summary.dependencies.some(
      (dependency) =>
        dependency?.algorithm !== "sha256-file-manifest-v1" ||
        !/^sha256:[0-9a-f]{64}$/.test(dependency?.sha256 || "") ||
        !/^[0-9a-f]{40}$/.test(dependency?.gitlink || ""),
    )
  ) {
    throw new Error("Contract assurance contains incomplete dependency evidence.");
  }

  return {
    schema: summary.schema,
    generatedAt: summary.generatedAt,
    sourceCommit: summary.sourceCommit,
    executionMode: summary.executionMode,
    toolchain: {
      forge: summary.forgeVersion,
      solc: summary.profile.solcVersion,
    },
    profile: {
      optimizer: summary.profile.optimizer,
      optimizerRuns: summary.profile.optimizerRuns,
      viaIr: summary.profile.viaIr,
      storageLayoutOutput: summary.profile.storageLayoutOutput,
      fuzzRuns: summary.profile.fuzzRuns,
      invariantRuns: summary.profile.invariantRuns,
      invariantDepth: summary.profile.invariantDepth,
    },
    tests: { total, passed, failed, skipped },
    contracts: summary.contracts.map((contract) => ({
      name: contract.name,
      runtimeBytes: contract.runtime.runtimeBytes,
      runtimeMarginBytes: contract.runtime.marginBytes,
      runtimeSha256: contract.runtime.sha256,
      abiSha256: contract.abiSha256,
      storageLayoutSha256: contract.storageLayoutSha256,
      selectorCount: contract.selectors.count,
    })),
    dependencies: summary.dependencies.map((dependency) => ({
      path: dependency.path,
      gitlink: dependency.gitlink,
      sha256: dependency.sha256,
    })),
    summary: {
      path: relativeArtifactPath(repositoryRoot, summaryPath),
      sha256: sha256(summaryBytes),
    },
  };
}

function verifiedDeploymentRehearsalArtifact({
  frontendRoot,
  repositoryRoot,
  commitSha,
}) {
  const summaryPath = path.join(
    frontendRoot,
    ".deployment-rehearsal",
    "latest.json",
  );
  const summaryBytes = readFileSync(summaryPath);
  const summary = JSON.parse(summaryBytes.toString("utf8"));
  if (
    summary.schema !== "openescrow.deployment-rehearsal/v1" ||
    summary.status !== "passed" ||
    summary.executionMode !== "local-anvil-credential-free" ||
    summary.sourceCommit !== commitSha ||
    summary.chainId !== 84_532
  ) {
    throw new Error(
      `Deployment rehearsal is not passing local credential-free evidence for ${commitSha}.`,
    );
  }
  const manifest = summary.manifest;
  try {
    validateDeploymentManifest(manifest, commitSha);
  } catch {
    throw new Error("Deployment rehearsal manifest is incomplete or cross-bound.");
  }
  if (manifest.cohortStatus !== "candidate-rehearsal-only") {
    throw new Error("Deployment rehearsal manifest is incomplete or cross-bound.");
  }
  if (
    summary.bindings?.retired?.reciprocalBindingsVerified !== true ||
    summary.bindings?.candidate?.reciprocalBindingsVerified !== true ||
    Object.keys(summary.bindings?.candidate?.runtime || {}).length !== 3
  ) {
    throw new Error("Deployment rehearsal is missing cohort runtime or binding evidence.");
  }
  if (
    summary.retiredCohort?.principalWithdrawn !== true ||
    summary.retiredCohort?.registryIsolationVerified !== true ||
    summary.retiredCohort?.candidateUnaffected !== true
  ) {
    throw new Error("Deployment rehearsal did not prove retired-cohort isolation.");
  }
  if (
    summary.configSwitch?.switchVerified !== true ||
    summary.configSwitch?.rollbackVerified !== true ||
    summary.configSwitch?.replacementCount !== 12 ||
    !Array.isArray(summary.configSwitch?.files) ||
    summary.configSwitch.files.length !== 3
  ) {
    throw new Error("Deployment rehearsal did not prove configuration switch and rollback.");
  }
  return {
    schema: summary.schema,
    generatedAt: summary.generatedAt,
    sourceCommit: summary.sourceCommit,
    chainId: summary.chainId,
    manifest: {
      schema: manifest.schema,
      openEscrow: manifest.openEscrow.address,
      operationsReserve: manifest.operationsReserve.address,
      agreementActivityRegistry: manifest.agreementActivityRegistry.address,
    },
    retiredCohortIsolationVerified: true,
    configSwitch: {
      replacementCount: summary.configSwitch.replacementCount,
      rollbackVerified: summary.configSwitch.rollbackVerified,
    },
    summary: {
      path: relativeArtifactPath(repositoryRoot, summaryPath),
      sha256: sha256(summaryBytes),
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

function verifiedCloudflareBuild({
  frontendRoot,
  repositoryRoot,
  commitSha,
}) {
  const cloudflareDirectory = path.join(frontendRoot, "cloudflare-dist");
  const releaseManifestPath = path.join(
    cloudflareDirectory,
    "release-manifest.json",
  );
  const releaseManifest = JSON.parse(
    readFileSync(releaseManifestPath, "utf8"),
  );
  if (
    releaseManifest.schemaVersion !== "openescrow-release/v1" ||
    releaseManifest.commitSha !== commitSha ||
    releaseManifest.sourceDirty !== false
  ) {
    throw new Error(
      "Packaged Cloudflare release provenance does not match the clean candidate commit.",
    );
  }
  for (const requiredPath of [
    path.join(cloudflareDirectory, "server", "index.js"),
    path.join(cloudflareDirectory, "client", "index.html"),
  ]) {
    if (readFileSync(requiredPath).length === 0) {
      throw new Error("Packaged Cloudflare Worker output is incomplete.");
    }
  }

  const configPath = path.join(frontendRoot, "wrangler.jsonc");
  const configBytes = readFileSync(configPath);
  const config = JSON.parse(configBytes.toString("utf8"));
  const staging = { ...config, ...config.env?.staging };
  const d1 = staging.d1_databases || [];
  const r2 = staging.r2_buckets || [];
  const vars = staging.vars || {};
  const secretLikeVariables = Object.keys(vars).filter((key) =>
    /(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|JWT)/i.test(key),
  );
  const configReady =
    config.account_id === "ac83ad901f0f00358a9b59e81487d354" &&
    staging.main === "cloudflare-dist/server/index.js" &&
    staging.name === "openescrow" &&
    staging.workers_dev === true &&
    staging.routes?.length === 1 &&
    staging.routes[0]?.pattern === "openescrow.io" &&
    staging.routes[0]?.custom_domain === true &&
    staging.assets?.directory === "./cloudflare-dist/client" &&
    staging.assets?.binding === "ASSETS" &&
    staging.assets?.not_found_handling === "single-page-application" &&
    staging.assets?.run_worker_first === true &&
    d1.length === 1 &&
    d1[0]?.binding === "DB" &&
    d1[0]?.database_name === "openescrow-mvp-staging" &&
    d1[0]?.database_id === "60dae94f-334d-4d71-89e2-6ce9e386fd9d" &&
    d1[0]?.migrations_dir === "../drizzle" &&
    r2.length === 1 &&
    r2[0]?.binding === "EVIDENCE" &&
    r2[0]?.bucket_name === "openescrow-mvp-evidence-staging" &&
    staging.triggers?.crons?.length === 1 &&
    staging.triggers.crons[0] === "*/15 * * * *" &&
    vars.API_RATE_LIMIT_ENABLED === "true" &&
    vars.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true" &&
    vars.EVIDENCE_STORAGE_MODE === "private-r2" &&
    vars.PUBLIC_APP_URL === "https://openescrow.io/" &&
    vars.VERIFY_ACTIVITY_REGISTRY_BINDING === "true" &&
    vars.VERIFY_TRANSACTION_RECEIPTS === "true" &&
    secretLikeVariables.length === 0;
  if (!configReady) {
    throw new Error(
      "Cloudflare staging bindings, origin, scheduler, or safety variables drifted from the reviewed boundary.",
    );
  }

  return {
    path: relativeArtifactPath(repositoryRoot, cloudflareDirectory),
    release: {
      schemaVersion: releaseManifest.schemaVersion,
      commitSha: releaseManifest.commitSha,
      sourceDirty: releaseManifest.sourceDirty,
    },
    worker: staging.name,
    accountId: config.account_id,
    configuration: {
      path: relativeArtifactPath(repositoryRoot, configPath),
      sha256: sha256(configBytes),
    },
    bindings: {
      d1: {
        binding: d1[0].binding,
        databaseName: d1[0].database_name,
        databaseId: d1[0].database_id,
      },
      r2: {
        binding: r2[0].binding,
        bucketName: r2[0].bucket_name,
      },
      assets: staging.assets.binding,
    },
    publicAppUrl: vars.PUBLIC_APP_URL,
    schedule: staging.triggers.crons[0],
    safetyVariables: Object.fromEntries(
      [
        "API_RATE_LIMIT_ENABLED",
        "COMPLIANCE_SOURCE_MONITOR_ENABLED",
        "EVIDENCE_STORAGE_MODE",
        "VERIFY_ACTIVITY_REGISTRY_BINDING",
        "VERIFY_TRANSACTION_RECEIPTS",
      ].map((key) => [key, vars[key]]),
    ),
    ...digestDirectory(cloudflareDirectory),
  };
}

export function collectCandidateArtifacts({
  frontendRoot,
  repositoryRoot,
  commitSha,
}) {
  const artifacts = {
    contractAssurance: verifiedContractAssuranceArtifact({
      frontendRoot,
      repositoryRoot,
      commitSha,
    }),
    deploymentRehearsal: verifiedDeploymentRehearsalArtifact({
      frontendRoot,
      repositoryRoot,
      commitSha,
    }),
    softwareInventory: buildReleaseSoftwareInventory({
      frontendRoot,
      commitSha,
    }),
    cloudflareBuild: verifiedCloudflareBuild({
      frontendRoot,
      repositoryRoot,
      commitSha,
    }),
  };
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

function gitSourceChanges(repositoryRoot) {
  const result = spawnSync(
    "git",
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ".openai",
      "contracts",
      "script",
      "test",
      "foundry.toml",
      ".gitmodules",
      "frontend",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    return ["Git source status could not be determined"];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
  const sourceChanges = gitSourceChanges(repositoryRoot);
  const evidence = await executeCandidateVerification({
    commitSha,
    hosting,
    sourceChanges,
    runScript: (scriptName) => runNpmScript(frontendRoot, scriptName),
    collectArtifacts: () => {
      const finalSourceChanges = gitSourceChanges(repositoryRoot);
      if (finalSourceChanges.length > 0) {
        throw new Error(
          `Candidate source changed during verification: ${finalSourceChanges.join(", ")}.`,
        );
      }
      return collectCandidateArtifacts({
        frontendRoot,
        repositoryRoot,
        commitSha,
      });
    },
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
