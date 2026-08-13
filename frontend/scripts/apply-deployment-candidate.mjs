import { copyFileSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const verificationPath = path.join(
  repositoryRoot,
  "deployments",
  "base-sepolia-candidate-verification.json",
);
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

const VERIFICATION_SCHEMA = "openescrow.base-sepolia-independent-verification/v1";
const VERIFICATION_MANIFEST = "deployments/base-sepolia-candidate.json";
const CODE_KEYS = [
  "TestUSDC",
  "TestAaveUSDC",
  "OpenEscrow",
  "OperationsReserve",
  "AgreementActivityRegistry",
];
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;

function normalizeEvidenceAddress(value, label) {
  if (!EVM_ADDRESS.test(value || "")) {
    throw new Error(`Independent verification ${label} is invalid.`);
  }
  return value.toLowerCase();
}

export function validateIndependentVerification(candidateManifest, evidence, candidateSource) {
  if (
    evidence?.schema !== VERIFICATION_SCHEMA ||
    evidence.status !== "passed" ||
    evidence.sourceCommit !== candidateManifest.sourceCommit ||
    evidence.candidateManifest !== VERIFICATION_MANIFEST ||
    evidence.transactionCount !== 6
  ) {
    throw new Error("Independent Base Sepolia verification evidence is incomplete or mismatched.");
  }
  const actualManifestHash = createHash("sha256").update(candidateSource).digest("hex");
  if (
    !/^[0-9a-f]{64}$/.test(evidence.candidateManifestSha256 || "") ||
    evidence.candidateManifestSha256 !== actualManifestHash
  ) {
    throw new Error("Independent verification does not cover the exact candidate manifest bytes.");
  }

  const expectedAddresses = {
    TestUSDC: candidateManifest.tokens?.plain,
    TestAaveUSDC: candidateManifest.tokens?.yield,
    OpenEscrow: candidateManifest.openEscrow?.address,
    OperationsReserve: candidateManifest.operationsReserve?.address,
    AgreementActivityRegistry: candidateManifest.agreementActivityRegistry?.address,
  };
  for (const [key, expected] of Object.entries(expectedAddresses)) {
    if (
      normalizeEvidenceAddress(evidence.contractAddresses?.[key], `${key} address`) !==
      normalizeEvidenceAddress(expected, `${key} candidate address`)
    ) {
      throw new Error(`Independent verification does not match the ${key} candidate address.`);
    }
  }

  const rpcAgreement = evidence.rpcAgreement;
  if (
    !Array.isArray(rpcAgreement) ||
    rpcAgreement.length < 2 ||
    new Set(rpcAgreement.map((entry) => entry?.rpcUrl)).size < 2
  ) {
    throw new Error("Independent verification requires agreement from two distinct RPC endpoints.");
  }
  let referenceHashes;
  for (const rpc of rpcAgreement) {
    if (
      rpc?.chainId !== 84_532 ||
      rpc.receiptsVerified !== 6 ||
      rpc.reciprocalBindingsVerified !== true
    ) {
      throw new Error("Independent RPC receipt or reciprocal-binding evidence is incomplete.");
    }
    const hashes = Object.fromEntries(
      CODE_KEYS.map((key) => {
        const value = rpc.codeHashes?.[key]?.toLowerCase();
        if (!EVM_HASH.test(value || "")) {
          throw new Error(`Independent RPC evidence is missing the ${key} runtime hash.`);
        }
        return [key, value];
      }),
    );
    if (referenceHashes) {
      for (const key of CODE_KEYS) {
        if (hashes[key] !== referenceHashes[key]) {
          throw new Error(`Independent RPC endpoints disagree on ${key} runtime code.`);
        }
      }
    } else {
      referenceHashes = hashes;
    }
  }
  return {
    candidateManifestSha256: actualManifestHash,
    rpcCount: rpcAgreement.length,
    transactionCount: evidence.transactionCount,
  };
}

export function applyCandidate() {
  const currentCommit = process.env.OPENESCROW_DEPLOYMENT_SOURCE_COMMIT?.trim();
  const candidateSource = readFileSync(candidatePath, "utf8");
  const candidateManifest = JSON.parse(candidateSource);
  const candidate = validateDeploymentManifest(candidateManifest, currentCommit || undefined);
  const independentVerification = validateIndependentVerification(
    candidateManifest,
    readJson(verificationPath),
    candidateSource,
  );
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
        independentVerification,
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
