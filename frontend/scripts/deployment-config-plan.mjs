import { readFileSync } from "node:fs";
import path from "node:path";

export const DEPLOYMENT_MANIFEST_SCHEMA = "openescrow.deployment-manifest/v2";

const CONFIG_FILE = "frontend/src/contracts/config.ts";
const REGISTRY_FILE = "frontend/src/contracts/activityRegistryConfig.ts";
const SERVER_FILE = "frontend/server/index.js";
const WRANGLER_FILE = "frontend/wrangler.jsonc";
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

function capture(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not read ${label} from deployment configuration.`);
  return match[1];
}

function normalizeAddress(value, label) {
  if (!ADDRESS_PATTERN.test(value || "")) {
    throw new Error(`${label} is not a valid EVM address.`);
  }
  return value.toLowerCase();
}

export function validateDeploymentManifest(manifest, expectedCommit) {
  if (manifest?.schema !== DEPLOYMENT_MANIFEST_SCHEMA) {
    throw new Error("Deployment manifest schema is missing or unsupported.");
  }
  if (manifest.chainId !== 84_532) {
    throw new Error("Deployment manifest is not for Base Sepolia chain id 84532.");
  }
  if (expectedCommit && manifest.sourceCommit !== expectedCommit) {
    throw new Error("Deployment manifest source commit does not match the candidate.");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit || "")) {
    throw new Error("Deployment manifest source commit is invalid.");
  }
  if (
    !["candidate-unconfigured", "candidate-rehearsal-only"].includes(
      manifest.cohortStatus,
    )
  ) {
    throw new Error("Deployment manifest cohort status is not switchable.");
  }

  const candidate = {
    sourceCommit: manifest.sourceCommit,
    openEscrow: normalizeAddress(manifest.openEscrow?.address, "OpenEscrow address"),
    operationsReserve: normalizeAddress(
      manifest.operationsReserve?.address,
      "OperationsReserve address",
    ),
    activityRegistry: normalizeAddress(
      manifest.agreementActivityRegistry?.address,
      "AgreementActivityRegistry address",
    ),
    usdc: normalizeAddress(manifest.tokens?.plain, "Plain token address"),
    yieldUsdc: normalizeAddress(manifest.tokens?.yield, "Yield token address"),
    deploymentBlock: BigInt(manifest.openEscrow?.deploymentBlock ?? 0),
    registryDeploymentBlock: BigInt(
      manifest.agreementActivityRegistry?.deploymentBlock ?? 0,
    ),
  };
  if (
    new Set([
      candidate.openEscrow,
      candidate.operationsReserve,
      candidate.activityRegistry,
    ]).size !== 3
  ) {
    throw new Error("Candidate escrow, reserve, and registry addresses must be distinct.");
  }
  if (
    [
      candidate.openEscrow,
      candidate.operationsReserve,
      candidate.activityRegistry,
      candidate.usdc,
      candidate.yieldUsdc,
    ].includes(ZERO_ADDRESS)
  ) {
    throw new Error("Candidate deployment manifest contains a zero address.");
  }
  if (candidate.usdc === candidate.yieldUsdc) {
    throw new Error("Candidate plain and yield token addresses must be distinct.");
  }
  if (
    normalizeAddress(
      manifest.agreementActivityRegistry?.escrowAddress,
      "Registry escrow binding",
    ) !== candidate.openEscrow
  ) {
    throw new Error("Candidate registry is not bound to the candidate escrow.");
  }
  if (candidate.deploymentBlock <= 0n || candidate.registryDeploymentBlock <= 0n) {
    throw new Error("Candidate deployment blocks must be positive.");
  }
  if (BigInt(manifest.operationsReserve?.deploymentBlock ?? 0) <= 0n) {
    throw new Error("Candidate reserve deployment block must be positive.");
  }
  const reciprocalConfiguration = manifest.reciprocalConfiguration;
  if (
    normalizeAddress(
      reciprocalConfiguration?.reserveAddress,
      "Reciprocal reserve binding",
    ) !== candidate.operationsReserve ||
    normalizeAddress(
      reciprocalConfiguration?.escrowAddress,
      "Reciprocal escrow binding",
    ) !== candidate.openEscrow ||
    !TRANSACTION_HASH_PATTERN.test(
      reciprocalConfiguration?.transactionHash || "",
    )
  ) {
    throw new Error("Candidate reciprocal configuration is incomplete or cross-bound.");
  }
  const expectedNetwork =
    manifest.cohortStatus === "candidate-unconfigured"
      ? "base-sepolia"
      : "local-anvil-base-sepolia-rehearsal";
  if (
    manifest.cohortStatus === "candidate-unconfigured" &&
    reciprocalConfiguration?.liveBindingsVerified !== true
  ) {
    throw new Error(
      "Public candidate manifest is missing independent live-binding verification.",
    );
  }
  const deploymentTransactions = [
    manifest.openEscrow?.transactionHash,
    manifest.operationsReserve?.transactionHash,
    manifest.agreementActivityRegistry?.transactionHash,
  ];
  if (
    manifest.network !== expectedNetwork ||
    deploymentTransactions.some(
      (transactionHash) => !TRANSACTION_HASH_PATTERN.test(transactionHash || ""),
    )
  ) {
    throw new Error("Candidate manifest is missing network transaction evidence.");
  }
  return candidate;
}

export function loadDeploymentConfiguration(repositoryRoot) {
  return Object.fromEntries(
    [CONFIG_FILE, REGISTRY_FILE, SERVER_FILE, WRANGLER_FILE].map((relative) => [
      relative,
      readFileSync(path.join(repositoryRoot, relative), "utf8"),
    ]),
  );
}

export function parseDeploymentConfiguration(files) {
  const config = files[CONFIG_FILE];
  const registry = files[REGISTRY_FILE];
  const server = files[SERVER_FILE];
  const wrangler = files[WRANGLER_FILE];
  if (
    typeof config !== "string" ||
    typeof registry !== "string" ||
    typeof server !== "string" ||
    typeof wrangler !== "string"
  ) {
    throw new Error("Deployment configuration file set is incomplete.");
  }

  const values = {
    openEscrow: normalizeAddress(
      capture(config, /OPEN_ESCROW_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/, "client escrow"),
      "Client escrow",
    ),
    operationsReserve: normalizeAddress(
      capture(
        config,
        /OPERATIONS_RESERVE_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/,
        "client reserve",
      ),
      "Client reserve",
    ),
    usdc: normalizeAddress(
      capture(config, /USDC_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/, "client plain token"),
      "Client plain token",
    ),
    yieldUsdc: normalizeAddress(
      capture(
        config,
        /YIELD_USDC_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/,
        "client yield token",
      ),
      "Client yield token",
    ),
    deploymentBlock: BigInt(
      capture(config, /DEPLOYMENT_BLOCK\s*=\s*(\d+)n/, "client deployment block"),
    ),
    activityRegistry: normalizeAddress(
      capture(
        registry,
        /AGREEMENT_ACTIVITY_REGISTRY_ADDRESS\s*=\s*\r?\n?\s*"(0x[0-9a-fA-F]{40})"/,
        "client activity registry",
      ),
      "Client activity registry",
    ),
    registryDeploymentBlock: BigInt(
      capture(
        registry,
        /ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK\s*=\s*(\d+)n/,
        "client registry deployment block",
      ),
    ),
  };

  const serverValues = {
    openEscrow: normalizeAddress(
      capture(
        server,
        /DEFAULT_OPEN_ESCROW_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/,
        "server escrow",
      ),
      "Server escrow",
    ),
    operationsReserve: normalizeAddress(
      capture(
        server,
        /DEFAULT_OPERATIONS_RESERVE_ADDRESS\s*=\s*\r?\n?\s*"(0x[0-9a-fA-F]{40})"/,
        "server reserve",
      ),
      "Server reserve",
    ),
    activityRegistry: normalizeAddress(
      capture(
        server,
        /DEFAULT_ACTIVITY_REGISTRY_ADDRESS\s*=\s*\r?\n?\s*"(0x[0-9a-fA-F]{40})"/,
        "server activity registry",
      ),
      "Server activity registry",
    ),
    usdc: normalizeAddress(
      capture(
        server,
        /DEFAULT_USDC_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/,
        "server plain token",
      ),
      "Server plain token",
    ),
    yieldUsdc: normalizeAddress(
      capture(
        server,
        /DEFAULT_YIELD_USDC_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/,
        "server yield token",
      ),
      "Server yield token",
    ),
  };
  for (const key of Object.keys(serverValues)) {
    if (serverValues[key] !== values[key]) {
      throw new Error(`Client/server deployment configuration mismatch for ${key}.`);
    }
  }

  const wranglerPatterns = {
    openEscrow: /"OPEN_ESCROW_ADDRESS"\s*:\s*"(0x[0-9a-fA-F]{40})"/g,
    activityRegistry: /"ACTIVITY_REGISTRY_ADDRESS"\s*:\s*"(0x[0-9a-fA-F]{40})"/g,
    deploymentBlock: /"OPEN_ESCROW_DEPLOYMENT_BLOCK"\s*:\s*"(\d+)"/g,
  };
  for (const [key, pattern] of Object.entries(wranglerPatterns)) {
    const matches = [...wrangler.matchAll(pattern)].map((match) => match[1]);
    if (matches.length !== 2) {
      throw new Error(`Expected exactly two Cloudflare ${key} values.`);
    }
    const expected = key === "deploymentBlock" ? values[key].toString() : values[key];
    if (matches.some((value) => value.toLowerCase() !== expected.toLowerCase())) {
      throw new Error(`Client/Cloudflare deployment configuration mismatch for ${key}.`);
    }
  }
  return values;
}

function replaceExactlyOnce(source, before, after, label) {
  const searchable = ADDRESS_PATTERN.test(before) ? source.toLowerCase() : source;
  const needle = ADDRESS_PATTERN.test(before) ? before.toLowerCase() : before;
  const first = searchable.indexOf(needle);
  if (first < 0 || searchable.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${label} replacement target must appear exactly once.`);
  }
  return {
    source: `${source.slice(0, first)}${after}${source.slice(first + needle.length)}`,
    original: source.slice(first, first + needle.length),
  };
}

function replaceExactlyCount(source, before, after, expectedCount, label) {
  const address = ADDRESS_PATTERN.test(before);
  const searchable = address ? source.toLowerCase() : source;
  const needle = address ? before.toLowerCase() : before;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = searchable.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + needle.length;
  }
  if (count !== expectedCount) {
    throw new Error(`${label} replacement target must appear exactly ${expectedCount} times.`);
  }
  const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    source: source.replace(new RegExp(escaped, address ? "gi" : "g"), after),
    original: before,
  };
}

function replacements(current, candidate) {
  return [
    [CONFIG_FILE, current.openEscrow, candidate.openEscrow, "client escrow"],
    [CONFIG_FILE, current.operationsReserve, candidate.operationsReserve, "client reserve"],
    [CONFIG_FILE, current.usdc, candidate.usdc, "client plain token"],
    [CONFIG_FILE, current.yieldUsdc, candidate.yieldUsdc, "client yield token"],
    [
      CONFIG_FILE,
      `DEPLOYMENT_BLOCK = ${current.deploymentBlock}n`,
      `DEPLOYMENT_BLOCK = ${candidate.deploymentBlock}n`,
      "client deployment block",
    ],
    [REGISTRY_FILE, current.activityRegistry, candidate.activityRegistry, "client registry"],
    [
      REGISTRY_FILE,
      `ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK = ${current.registryDeploymentBlock}n`,
      `ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK = ${candidate.registryDeploymentBlock}n`,
      "client registry block",
    ],
    [SERVER_FILE, current.openEscrow, candidate.openEscrow, "server escrow"],
    [SERVER_FILE, current.operationsReserve, candidate.operationsReserve, "server reserve"],
    [SERVER_FILE, current.activityRegistry, candidate.activityRegistry, "server registry"],
    [SERVER_FILE, current.usdc, candidate.usdc, "server plain token"],
    [SERVER_FILE, current.yieldUsdc, candidate.yieldUsdc, "server yield token"],
    [WRANGLER_FILE, current.openEscrow, candidate.openEscrow, "Cloudflare escrow", 2],
    [
      WRANGLER_FILE,
      current.activityRegistry,
      candidate.activityRegistry,
      "Cloudflare registry",
      2,
    ],
    [
      WRANGLER_FILE,
      `"OPEN_ESCROW_DEPLOYMENT_BLOCK": "${current.deploymentBlock}"`,
      `"OPEN_ESCROW_DEPLOYMENT_BLOCK": "${candidate.deploymentBlock}"`,
      "Cloudflare escrow deployment block",
      2,
    ],
  ];
}

export function rehearseConfigurationSwitch(files, candidate) {
  const current = parseDeploymentConfiguration(files);
  const switched = { ...files };
  const executed = [];
  for (const [file, before, after, label, count = 1] of replacements(current, candidate)) {
    const result = count === 1
      ? replaceExactlyOnce(switched[file], before, after, label)
      : replaceExactlyCount(switched[file], before, after, count, label);
    switched[file] = result.source;
    executed.push([file, result.original, after, label, count]);
  }
  const switchedValues = parseDeploymentConfiguration(switched);
  for (const key of Object.keys(candidate).filter((key) => key !== "sourceCommit")) {
    if (switchedValues[key] !== candidate[key]) {
      throw new Error(`In-memory candidate switch failed for ${key}.`);
    }
  }

  const rolledBack = { ...switched };
  for (const [file, original, after, label, count] of executed.reverse()) {
    rolledBack[file] = (count === 1
      ? replaceExactlyOnce(rolledBack[file], after, original, `${label} rollback`)
      : replaceExactlyCount(rolledBack[file], after, original, count, `${label} rollback`)
    ).source;
  }
  for (const file of Object.keys(files)) {
    if (rolledBack[file] !== files[file]) {
      throw new Error(`In-memory rollback did not restore ${file} byte-for-byte.`);
    }
  }
  return {
    current,
    candidate,
    replacementCount: replacements(current, candidate).length,
    switchVerified: true,
    rollbackVerified: true,
    files: Object.keys(files),
    switchedFiles: switched,
  };
}
