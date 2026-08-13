import { copyFileSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeploymentConfiguration,
  parseDeploymentConfiguration,
  rehearseConfigurationSwitch,
  validateDeploymentManifest,
} from "./deployment-config-plan.mjs";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = path.resolve(frontendRoot, "..");
const candidatePath = path.join(repositoryRoot, "deployments", "base-sepolia-candidate.json");
const activePath = path.join(repositoryRoot, "deployments", "base-sepolia-latest.json");
const rollbackPath = path.join(repositoryRoot, "deployments", "base-sepolia-rollback-prior.json");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function serializable(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]),
  );
}

export function activateCandidateManifest(candidateManifest, activeManifest, activatedAtUtc) {
  if (activeManifest?.cohortStatus !== "active-testnet") {
    throw new Error("The current deployment manifest is not an active testnet rollback source.");
  }
  return {
    ...candidateManifest,
    cohortStatus: "active-testnet",
    activatedAtUtc,
    verification: {
      ...(candidateManifest.verification || {}),
      liveBindingsVerified: true,
    },
  };
}

export function applyCandidate() {
  const currentCommit = process.env.OPENESCROW_DEPLOYMENT_SOURCE_COMMIT?.trim();
  const candidateManifest = readJson(candidatePath);
  const candidate = validateDeploymentManifest(candidateManifest, currentCommit || undefined);
  const activeManifest = readJson(activePath);
  const files = loadDeploymentConfiguration(repositoryRoot);
  const plan = rehearseConfigurationSwitch(files, candidate);

  const tempFiles = new Map();
  try {
    for (const [relative, source] of Object.entries(plan.switchedFiles)) {
      const target = path.join(repositoryRoot, relative);
      const temp = `${target}.candidate-switch`;
      writeFileSync(temp, source, "utf8");
      tempFiles.set(target, temp);
    }
    const activatedManifest = activateCandidateManifest(
      candidateManifest,
      activeManifest,
      new Date().toISOString(),
    );
    const manifestTemp = `${activePath}.candidate-switch`;
    writeFileSync(manifestTemp, `${JSON.stringify(activatedManifest, null, 2)}\n`, "utf8");
    tempFiles.set(activePath, manifestTemp);

    if (!readFileSync(activePath, "utf8").includes('"cohortStatus": "active-testnet"')) {
      throw new Error("The rollback manifest changed before the candidate switch.");
    }
    copyFileSync(activePath, rollbackPath);
    for (const [target, temp] of tempFiles) renameSync(temp, target);
  } catch (error) {
    for (const temp of tempFiles.values()) rmSync(temp, { force: true });
    throw error;
  }

  const applied = parseDeploymentConfiguration(loadDeploymentConfiguration(repositoryRoot));
  for (const [key, expected] of Object.entries(candidate)) {
    if (key === "sourceCommit") continue;
    if (applied[key] !== expected) {
      throw new Error(`Applied deployment configuration does not match ${key}.`);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "applied",
        candidate: serializable(candidate),
        replacementCount: plan.replacementCount,
        rollbackManifest: path.relative(repositoryRoot, rollbackPath).replaceAll("\\", "/"),
        activeManifest: path.relative(repositoryRoot, activePath).replaceAll("\\", "/"),
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyCandidate();
}
