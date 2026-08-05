import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CONTRACT_ASSURANCE_SCHEMA = "openescrow.contract-assurance/v1";
export const EVM_RUNTIME_LIMIT_BYTES = 24_576;
export const MIN_RUNTIME_MARGIN_BYTES = 2_048;
const DEPENDENCY_LOCK_SCHEMA = "openescrow.contract-dependencies/v1";

const CONTRACTS = Object.freeze([
  Object.freeze({
    name: "OpenEscrow",
    source: "contracts/OpenEscrow.sol:OpenEscrow",
    abi: "frontend/src/contracts/OpenEscrowABI.json",
  }),
  Object.freeze({
    name: "OperationsReserve",
    source: "contracts/OperationsReserve.sol:OperationsReserve",
    abi: "frontend/src/contracts/OperationsReserveABI.json",
  }),
  Object.freeze({
    name: "AgreementActivityRegistry",
    source: "contracts/AgreementActivityRegistry.sol:AgreementActivityRegistry",
    abi: "frontend/src/contracts/AgreementActivityRegistryABI.json",
  }),
]);

const DEPENDENCIES = Object.freeze([
  Object.freeze({ path: "lib/forge-std" }),
  Object.freeze({ path: "lib/openzeppelin-contracts" }),
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function bytecodeSha256(bytecode, label = "Contract bytecode") {
  const normalized = String(bytecode || "").trim();
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(normalized)) {
    throw new Error(`${label} is missing or malformed.`);
  }
  return sha256(Buffer.from(normalized.slice(2), "hex"));
}

export function runtimeMetrics(bytecode) {
  const normalized = String(bytecode || "").trim();
  const runtimeSha256 = bytecodeSha256(normalized, "Contract runtime bytecode");
  const runtimeBytes = (normalized.length - 2) / 2;
  const marginBytes = EVM_RUNTIME_LIMIT_BYTES - runtimeBytes;
  if (marginBytes < MIN_RUNTIME_MARGIN_BYTES) {
    throw new Error(
      `Contract runtime has only ${marginBytes} bytes of EVM size margin; ${MIN_RUNTIME_MARGIN_BYTES} are required.`,
    );
  }
  return {
    runtimeBytes,
    limitBytes: EVM_RUNTIME_LIMIT_BYTES,
    marginBytes,
    sha256: runtimeSha256,
  };
}

export function summarizeForgeTests(results) {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    throw new Error("Foundry returned an invalid JSON test report.");
  }
  const summary = {
    suites: 0,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const suite of Object.values(results)) {
    const testResults = suite?.test_results;
    if (!testResults || typeof testResults !== "object") continue;
    summary.suites += 1;
    for (const result of Object.values(testResults)) {
      summary.total += 1;
      const status = String(result?.status || "").toLowerCase();
      if (status === "success") summary.passed += 1;
      else if (status === "skipped") summary.skipped += 1;
      else summary.failed += 1;
    }
  }
  if (summary.total === 0 || summary.failed !== 0) {
    throw new Error(
      `Foundry assurance requires passing tests; total=${summary.total}, failed=${summary.failed}.`,
    );
  }
  return summary;
}

export function digestDirectory(directory) {
  const manifest = createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const bytes = readFileSync(absolute);
      const relative = path.relative(directory, absolute).split(path.sep).join("/");
      const fileHash = sha256(bytes);
      manifest.update(`${relative}\0${bytes.length}\0${fileHash}\n`, "utf8");
      fileCount += 1;
      totalBytes += bytes.length;
    }
  }

  visit(directory);
  if (fileCount === 0) throw new Error(`Dependency directory is empty: ${directory}`);
  return {
    algorithm: "sha256-file-manifest-v1",
    sha256: `sha256:${manifest.digest("hex")}`,
    fileCount,
    totalBytes,
  };
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      FOUNDRY_OFFLINE: "true",
      NO_COLOR: "1",
    },
  });
  if (result.error || result.status !== 0) {
    const detail = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `${path.basename(command)} ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`,
    );
  }
  return String(result.stdout || "").trim();
}

function resolveForge(repositoryRoot) {
  const candidates = [
    process.env.FORGE_BIN,
    process.platform === "win32"
      ? path.join(homedir(), ".foundry", "bin", "forge.exe")
      : null,
    "forge",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("Foundry forge is required for contract-release assurance.");
}

function git(repositoryRoot, args) {
  return commandResult("git", args, { cwd: repositoryRoot });
}

function gitlinkPin(repositoryRoot, dependencyPath) {
  const output = git(repositoryRoot, ["ls-files", "--stage", "--", dependencyPath]);
  const match = output.match(/^160000 ([0-9a-f]{40}) 0\t/);
  if (!match) throw new Error(`${dependencyPath} is not pinned as a Git submodule.`);
  return match[1];
}

function validateFoundryProfile(repositoryRoot) {
  const source = readFileSync(path.join(repositoryRoot, "foundry.toml"), "utf8");
  const expectations = [
    [/solc_version\s*=\s*"0\.8\.26"/, "solc_version 0.8.26"],
    [/optimizer\s*=\s*true/, "optimizer enabled"],
    [/optimizer_runs\s*=\s*200/, "optimizer_runs 200"],
    [/via_ir\s*=\s*true/, "via_ir enabled"],
    [/extra_output\s*=\s*\[\s*"storageLayout"\s*\]/, "storage layout output"],
    [/\[fuzz\][\s\S]*?runs\s*=\s*512/, "512 fuzz runs"],
    [/\[invariant\][\s\S]*?runs\s*=\s*256/, "256 invariant runs"],
    [/\[invariant\][\s\S]*?depth\s*=\s*128/, "invariant depth 128"],
  ];
  const missing = expectations
    .filter(([pattern]) => !pattern.test(source))
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`Foundry release profile is missing: ${missing.join(", ")}.`);
  }
  return {
    solcVersion: "0.8.26",
    optimizer: true,
    optimizerRuns: 200,
    viaIr: true,
    storageLayoutOutput: true,
    fuzzRuns: 512,
    invariantRuns: 256,
    invariantDepth: 128,
  };
}

function selectorEvidence(methodIdentifiers) {
  const bySelector = new Map();
  for (const [signature, selector] of Object.entries(methodIdentifiers)) {
    const normalized = String(selector).replace(/^0x/, "").toLowerCase();
    const signatures = bySelector.get(normalized) || [];
    signatures.push(signature);
    bySelector.set(normalized, signatures);
  }
  const collisions = [...bySelector.entries()]
    .filter(([, signatures]) => signatures.length > 1)
    .map(([selector, signatures]) => ({ selector: `0x${selector}`, signatures }));
  if (collisions.length > 0) {
    throw new Error(`Function selector collision detected: ${JSON.stringify(collisions)}`);
  }
  return { count: Object.keys(methodIdentifiers).length, collisions };
}

export function parseForgeJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (directError) {
    // An uninitialized Git submodule can make Foundry print a dependency-install
    // warning before its otherwise valid JSON report. The dependency digest and
    // gitlink checks below remain authoritative; only discard text before the
    // first JSON token and never attempt to repair malformed JSON itself.
    const objectStart = output.indexOf("{");
    const arrayStart = output.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    if (starts.length > 0) {
      try {
        return JSON.parse(output.slice(Math.min(...starts)));
      } catch {
        // Report the original parser failure for a stable, useful diagnostic.
      }
    }
    throw new Error(`${label} was not valid JSON: ${directError.message}`);
  }
}

function parseJsonDocument(source, label) {
  try {
    return JSON.parse(String(source).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`);
  }
}

export function validateDependencyLock(actual, expected) {
  const fields = ["gitlink", "sha256", "fileCount", "totalBytes"];
  for (const field of fields) {
    if (actual[field] !== expected?.[field]) {
      throw new Error(
        `${actual.path} dependency ${field} does not match the reviewed lock.`,
      );
    }
  }
}

export function verifyDependencyTrees({ repositoryRoot, dependencyLock }) {
  return DEPENDENCIES.map((descriptor) => {
    const absolute = path.join(repositoryRoot, descriptor.path);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      throw new Error(`Pinned dependency directory is missing: ${descriptor.path}`);
    }
    const actual = {
      path: descriptor.path,
      gitlink: gitlinkPin(repositoryRoot, descriptor.path),
      ...digestDirectory(absolute),
    };
    if (dependencyLock) {
      const expected = dependencyLock.dependencies?.find(
        (entry) => entry.path === descriptor.path,
      );
      validateDependencyLock(actual, expected);
    }
    return actual;
  });
}

export function collectContractAssurance({
  repositoryRoot,
  forge,
  dependencyLock,
}) {
  const sourceCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const profile = validateFoundryProfile(repositoryRoot);
  const forgeVersion = commandResult(forge, ["--version"], {
    cwd: repositoryRoot,
  }).split(/\r?\n/)[0];

  commandResult(forge, ["fmt", "--check"], { cwd: repositoryRoot });
  commandResult(forge, ["build", "--offline", "--force"], {
    cwd: repositoryRoot,
  });
  const tests = summarizeForgeTests(
    parseForgeJson(
      commandResult(forge, ["test", "--offline", "--json"], {
        cwd: repositoryRoot,
      }),
      "Foundry test report",
    ),
  );

  const contracts = CONTRACTS.map((descriptor) => {
    const generatedAbi = parseForgeJson(
      commandResult(forge, ["inspect", descriptor.source, "abi", "--json"], {
        cwd: repositoryRoot,
      }),
      `${descriptor.name} ABI`,
    );
    const checkedInAbi = parseJsonDocument(
      readFileSync(path.join(repositoryRoot, descriptor.abi), "utf8"),
      `${descriptor.name} checked-in frontend ABI`,
    );
    const canonicalAbi = canonicalJson(generatedAbi);
    if (canonicalAbi !== canonicalJson(checkedInAbi)) {
      throw new Error(`${descriptor.name} frontend ABI is stale.`);
    }

    const deployedBytecode = commandResult(
      forge,
      ["inspect", descriptor.source, "deployedBytecode"],
      { cwd: repositoryRoot },
    );
    const creationBytecode = commandResult(
      forge,
      ["inspect", descriptor.source, "bytecode"],
      { cwd: repositoryRoot },
    );
    const methods = parseForgeJson(
      commandResult(
        forge,
        ["inspect", descriptor.source, "methodIdentifiers", "--json"],
        { cwd: repositoryRoot },
      ),
      `${descriptor.name} method identifiers`,
    );
    const storageLayout = parseForgeJson(
      commandResult(
        forge,
        ["inspect", descriptor.source, "storageLayout", "--json"],
        { cwd: repositoryRoot },
      ),
      `${descriptor.name} storage layout`,
    );

    return {
      name: descriptor.name,
      source: descriptor.source,
      frontendAbi: descriptor.abi,
      abiMatched: true,
      abiSha256: sha256(Buffer.from(canonicalAbi, "utf8")),
      runtime: runtimeMetrics(deployedBytecode),
      creationBytecodeSha256: bytecodeSha256(
        creationBytecode,
        `${descriptor.name} creation bytecode`,
      ),
      selectors: selectorEvidence(methods),
      storageLayoutSha256: sha256(
        Buffer.from(canonicalJson(storageLayout), "utf8"),
      ),
    };
  });

  const dependencies = verifyDependencyTrees({ repositoryRoot, dependencyLock });

  return {
    schema: CONTRACT_ASSURANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    status: "passed",
    executionMode: "local-credential-free",
    sourceCommit,
    forgeVersion,
    profile,
    deterministicBuild: {
      forcedCleanCompile: true,
      offline: true,
    },
    tests,
    contracts,
    dependencies,
    safetyBoundary:
      "Offline compilation and local tests only; no RPC, signer, broadcast, hosted secret, or real asset was used.",
  };
}

function runCli() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDirectory, "..");
  const repositoryRoot = path.resolve(frontendRoot, "..");
  const printDependencyLock = process.argv.includes("--print-dependency-lock");
  const verifyDependencies = process.argv.includes("--verify-dependencies");
  const lockPath = path.join(repositoryRoot, "contracts", "dependency-lock.json");
  const dependencyLock = printDependencyLock
    ? null
    : parseJsonDocument(readFileSync(lockPath, "utf8"), "Dependency lock");
  if (
    dependencyLock &&
    (dependencyLock.schema !== DEPENDENCY_LOCK_SCHEMA ||
      !Array.isArray(dependencyLock.dependencies) ||
      dependencyLock.dependencies.length !== DEPENDENCIES.length)
  ) {
    throw new Error("Dependency lock schema or dependency set is invalid.");
  }
  if (verifyDependencies) {
    const dependencies = verifyDependencyTrees({ repositoryRoot, dependencyLock });
    console.log(
      `Contract dependencies verified: ${dependencies.length} pinned SHA-256 source trees.`,
    );
    return;
  }
  const forge = resolveForge(repositoryRoot);
  const evidence = collectContractAssurance({
    repositoryRoot,
    forge,
    dependencyLock,
  });

  if (printDependencyLock) {
    console.log(
      JSON.stringify(
        {
          schema: DEPENDENCY_LOCK_SCHEMA,
          dependencies: evidence.dependencies,
        },
        null,
        2,
      ),
    );
    return;
  }

  const outputDirectory = path.join(frontendRoot, ".contract-assurance");
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "latest.json");
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Contract assurance passed: ${evidence.tests.passed}/${evidence.tests.total} tests, ${evidence.contracts.length} ABI/runtime checks, ${evidence.dependencies.length} pinned dependency trees.`,
  );
  console.log(`Contract assurance evidence: ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Contract assurance failed.",
    );
    process.exitCode = 1;
  }
}
