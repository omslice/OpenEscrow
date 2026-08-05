import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  loadDeploymentConfiguration,
  rehearseConfigurationSwitch,
  validateDeploymentManifest,
} from "./deployment-config-plan.mjs";

const REHEARSAL_SCHEMA = "openescrow.deployment-rehearsal/v1";
// Anvil's documented public development key. It must never hold value or leave localhost.
const DEPLOYER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPOSIT = 1_000n * 10n ** 6n;
const RESERVE = 5n * 10n ** 6n;
const PERIOD = 300n;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitHead(repositoryRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0 || !/^[0-9a-f]{40}$/.test(result.stdout.trim())) {
    throw new Error("Could not bind deployment rehearsal to a source commit.");
  }
  return result.stdout.trim();
}

function resolveAnvil() {
  const candidates = [
    process.env.ANVIL_BIN,
    process.platform === "win32"
      ? path.join(homedir(), ".foundry", "bin", "anvil.exe")
      : null,
    "anvil",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("Foundry anvil is required for the local deployment rehearsal.");
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function artifact(repositoryRoot, source, name) {
  const artifactPath = path.join(repositoryRoot, "out", source, `${name}.json`);
  const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  const bytecode = parsed.bytecode?.object;
  const deployedBytecode = parsed.deployedBytecode?.object;
  if (
    !Array.isArray(parsed.abi) ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(bytecode || "") ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(deployedBytecode || "")
  ) {
    throw new Error(`Compiled artifact is incomplete: ${source}/${name}.json`);
  }
  return { name, abi: parsed.abi, bytecode, deployedBytecode };
}

async function waitForRpc(publicClient, processState) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processState.exited) {
      throw new Error(`Anvil exited before readiness: ${processState.stderr.trim()}`);
    }
    try {
      if ((await publicClient.getChainId()) === 84_532) return;
    } catch {
      // Retry while the local process binds its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local Anvil rehearsal did not become ready in time.");
}

async function deploy(wallet, publicClient, compiled, args = []) {
  const transactionHash = await wallet.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`${compiled.name} local deployment failed.`);
  }
  return {
    address: receipt.contractAddress,
    transactionHash,
    deploymentBlock: Number(receipt.blockNumber),
  };
}

async function writeAndWait(wallet, publicClient, parameters, label) {
  const hash = await wallet.writeContract(parameters);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed locally.`);
  return { hash, blockNumber: Number(receipt.blockNumber) };
}

async function deployCohort({ wallet, publicClient, compiled, token, yieldToken }) {
  const reserve = await deploy(wallet, publicClient, compiled.reserve, [token, yieldToken]);
  const escrow = await deploy(wallet, publicClient, compiled.escrow, [
    token,
    yieldToken,
    reserve.address,
  ]);
  const configuration = await writeAndWait(
    wallet,
    publicClient,
    {
      address: reserve.address,
      abi: compiled.reserve.abi,
      functionName: "configureEscrow",
      args: [escrow.address],
    },
    "Reserve reciprocal configuration",
  );
  const registry = await deploy(wallet, publicClient, compiled.registry, [escrow.address]);
  return { escrow, reserve, registry, configuration };
}

async function bindingEvidence({ publicClient, compiled, cohort, deployer, token, yieldToken }) {
  const reads = await Promise.all([
    publicClient.readContract({
      address: cohort.escrow.address,
      abi: compiled.escrow.abi,
      functionName: "OPERATIONS_RESERVE",
    }),
    publicClient.readContract({
      address: cohort.reserve.address,
      abi: compiled.reserve.abi,
      functionName: "ESCROW",
    }),
    publicClient.readContract({
      address: cohort.registry.address,
      abi: compiled.registry.abi,
      functionName: "ESCROW",
    }),
    publicClient.readContract({
      address: cohort.reserve.address,
      abi: compiled.reserve.abi,
      functionName: "TREASURY",
    }),
    publicClient.readContract({
      address: cohort.escrow.address,
      abi: compiled.escrow.abi,
      functionName: "TOKEN",
    }),
    publicClient.readContract({
      address: cohort.escrow.address,
      abi: compiled.escrow.abi,
      functionName: "YIELD_TOKEN",
    }),
  ]);
  const expected = [
    cohort.reserve.address,
    cohort.escrow.address,
    cohort.escrow.address,
    deployer,
    token,
    yieldToken,
  ].map((value) => value.toLowerCase());
  if (reads.map((value) => value.toLowerCase()).some((value, index) => value !== expected[index])) {
    throw new Error("Local deployment cohort binding verification failed.");
  }

  const runtime = {};
  for (const [key, descriptor] of [
    ["openEscrow", compiled.escrow],
    ["operationsReserve", compiled.reserve],
    ["agreementActivityRegistry", compiled.registry],
  ]) {
    const address =
      key === "openEscrow"
        ? cohort.escrow.address
        : key === "operationsReserve"
          ? cohort.reserve.address
          : cohort.registry.address;
    const code = await publicClient.getCode({ address });
    const runtimeBytes = ((code?.length || 2) - 2) / 2;
    const expectedBytes = (descriptor.deployedBytecode.length - 2) / 2;
    if (!code || runtimeBytes !== expectedBytes) {
      throw new Error(`${descriptor.name} local runtime size differs from its compiled artifact.`);
    }
    runtime[key] = {
      address,
      runtimeBytes,
      runtimeKeccak256: keccak256(code),
      creationBytecodeSha256: sha256(
        Buffer.from(descriptor.bytecode.slice(2), "hex"),
      ),
    };
  }
  return { reciprocalBindingsVerified: true, runtime };
}

async function fundAgreement({
  publicClient,
  deployerWallet,
  tenantWallet,
  compiled,
  token,
  cohort,
  claimWindowStart,
}) {
  await writeAndWait(
    deployerWallet,
    publicClient,
    {
      address: token,
      abi: compiled.token.abi,
      functionName: "mint",
      args: [tenantWallet.account.address, DEPOSIT + RESERVE],
    },
    "Test token mint",
  );
  await writeAndWait(
    deployerWallet,
    publicClient,
    {
      address: cohort.escrow.address,
      abi: compiled.escrow.abi,
      functionName: "createAgreementWithToken",
      args: [
        tenantWallet.account.address,
        "0x0000000000000000000000000000000000000000",
        token,
        DEPOSIT,
        claimWindowStart,
        PERIOD,
        PERIOD,
        PERIOD,
      ],
    },
    "Agreement creation",
  );
  await writeAndWait(
    tenantWallet,
    publicClient,
    {
      address: token,
      abi: compiled.token.abi,
      functionName: "approve",
      args: [cohort.escrow.address, DEPOSIT + RESERVE],
    },
    "Tenant approval",
  );
  await writeAndWait(
    tenantWallet,
    publicClient,
    {
      address: cohort.escrow.address,
      abi: compiled.escrow.abi,
      functionName: "fundTenantShareWithReserve",
      args: [0n],
    },
    "Atomic agreement funding",
  );
}

async function expectRegistryRejection(wallet, publicClient, registry, abi, label) {
  try {
    await writeAndWait(
      wallet,
      publicClient,
      {
        address: registry,
        abi,
        functionName: "anchorSnapshot",
        args: [0n, keccak256(toBytes(label))],
      },
      label,
    );
  } catch (error) {
    if (error instanceof BaseError) {
      const reverted = error.walk(
        (entry) => entry instanceof ContractFunctionRevertedError,
      );
      if (
        reverted instanceof ContractFunctionRevertedError &&
        reverted.data?.errorName === "NotAgreementParty"
      ) {
        return;
      }
    }
    throw new Error(`${label} did not fail with NotAgreementParty.`);
  }
  throw new Error(`${label} unexpectedly crossed deployment cohorts.`);
}

function localManifest({ sourceCommit, cohort, token, yieldToken }) {
  return {
    schema: "openescrow.deployment-manifest/v2",
    network: "local-anvil-base-sepolia-rehearsal",
    chainId: 84_532,
    sourceCommit,
    cohortStatus: "candidate-rehearsal-only",
    openEscrow: cohort.escrow,
    operationsReserve: cohort.reserve,
    agreementActivityRegistry: {
      ...cohort.registry,
      escrowAddress: cohort.escrow.address,
    },
    reciprocalConfiguration: {
      transactionHash: cohort.configuration.hash,
      reserveAddress: cohort.reserve.address,
      escrowAddress: cohort.escrow.address,
    },
    tokens: { plain: token, yield: yieldToken },
  };
}

async function run() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDirectory, "..");
  const repositoryRoot = path.resolve(frontendRoot, "..");
  const sourceCommit = gitHead(repositoryRoot);
  const compiled = {
    token: artifact(repositoryRoot, "MockUSDC.sol", "MockUSDC"),
    yieldToken: artifact(repositoryRoot, "MockYieldUSDC.sol", "MockYieldUSDC"),
    reserve: artifact(repositoryRoot, "OperationsReserve.sol", "OperationsReserve"),
    escrow: artifact(repositoryRoot, "OpenEscrow.sol", "OpenEscrow"),
    registry: artifact(
      repositoryRoot,
      "AgreementActivityRegistry.sol",
      "AgreementActivityRegistry",
    ),
  };

  const port = await availablePort();
  const anvil = spawn(
    resolveAnvil(),
    ["--silent", "--host", "127.0.0.1", "--port", String(port), "--chain-id", "84532"],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  const processState = { exited: false, stderr: "" };
  anvil.stderr.on("data", (chunk) => {
    processState.stderr += chunk.toString();
  });
  anvil.once("exit", () => {
    processState.exited = true;
  });

  const rpcUrl = `http://127.0.0.1:${port}`;
  const chain = {
    ...baseSepolia,
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const deployerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const deployerWallet = createWalletClient({
    account: deployerAccount,
    chain,
    transport: http(rpcUrl),
  });

  try {
    await waitForRpc(publicClient, processState);
    const token = await deploy(deployerWallet, publicClient, compiled.token);
    const yieldToken = await deploy(deployerWallet, publicClient, compiled.yieldToken);
    const retired = await deployCohort({
      wallet: deployerWallet,
      publicClient,
      compiled,
      token: token.address,
      yieldToken: yieldToken.address,
    });
    const candidate = await deployCohort({
      wallet: deployerWallet,
      publicClient,
      compiled,
      token: token.address,
      yieldToken: yieldToken.address,
    });

    const retiredBinding = await bindingEvidence({
      publicClient,
      compiled,
      cohort: retired,
      deployer: deployerAccount.address,
      token: token.address,
      yieldToken: yieldToken.address,
    });
    const candidateBinding = await bindingEvidence({
      publicClient,
      compiled,
      cohort: candidate,
      deployer: deployerAccount.address,
      token: token.address,
      yieldToken: yieldToken.address,
    });

    const retiredTenant = privateKeyToAccount(generatePrivateKey());
    const candidateTenant = privateKeyToAccount(generatePrivateKey());
    for (const tenant of [retiredTenant, candidateTenant]) {
      await publicClient.request({
        method: "anvil_setBalance",
        params: [tenant.address, "0x3635c9adc5dea00000"],
      });
    }
    const retiredWallet = createWalletClient({
      account: retiredTenant,
      chain,
      transport: http(rpcUrl),
    });
    const candidateWallet = createWalletClient({
      account: candidateTenant,
      chain,
      transport: http(rpcUrl),
    });
    const head = await publicClient.getBlock();
    const claimWindowStart = head.timestamp + 60n;
    await fundAgreement({
      publicClient,
      deployerWallet,
      tenantWallet: retiredWallet,
      compiled,
      token: token.address,
      cohort: retired,
      claimWindowStart,
    });
    await fundAgreement({
      publicClient,
      deployerWallet,
      tenantWallet: candidateWallet,
      compiled,
      token: token.address,
      cohort: candidate,
      claimWindowStart,
    });

    await writeAndWait(
      retiredWallet,
      publicClient,
      {
        address: retired.registry.address,
        abi: compiled.registry.abi,
        functionName: "anchorSnapshot",
        args: [0n, keccak256(toBytes("retired cohort"))],
      },
      "Retired registry anchor",
    );
    await writeAndWait(
      candidateWallet,
      publicClient,
      {
        address: candidate.registry.address,
        abi: compiled.registry.abi,
        functionName: "anchorSnapshot",
        args: [0n, keccak256(toBytes("candidate cohort"))],
      },
      "Candidate registry anchor",
    );
    await expectRegistryRejection(
      retiredWallet,
      publicClient,
      candidate.registry.address,
      compiled.registry.abi,
      "Retired tenant against candidate registry",
    );
    await expectRegistryRejection(
      candidateWallet,
      publicClient,
      retired.registry.address,
      compiled.registry.abi,
      "Candidate tenant against retired registry",
    );

    await publicClient.request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(claimWindowStart + PERIOD)],
    });
    await publicClient.request({ method: "evm_mine", params: [] });
    await writeAndWait(
      retiredWallet,
      publicClient,
      {
        address: retired.escrow.address,
        abi: compiled.escrow.abi,
        functionName: "withdrawNoClaim",
        args: [0n],
      },
      "Retired no-claim allocation",
    );
    await writeAndWait(
      retiredWallet,
      publicClient,
      {
        address: retired.escrow.address,
        abi: compiled.escrow.abi,
        functionName: "withdraw",
        args: [0n],
      },
      "Retired tenant withdrawal",
    );

    const [candidateAgreement, retiredEscrowBalance, candidateEscrowBalance] =
      await Promise.all([
        publicClient.readContract({
          address: candidate.escrow.address,
          abi: compiled.escrow.abi,
          functionName: "getAgreement",
          args: [0n],
        }),
        publicClient.readContract({
          address: token.address,
          abi: compiled.token.abi,
          functionName: "balanceOf",
          args: [retired.escrow.address],
        }),
        publicClient.readContract({
          address: token.address,
          abi: compiled.token.abi,
          functionName: "balanceOf",
          args: [candidate.escrow.address],
        }),
      ]);
    if (
      retiredEscrowBalance !== 0n ||
      candidateEscrowBalance !== DEPOSIT ||
      Number(candidateAgreement.phase) !== 3 ||
      candidateAgreement.locked !== DEPOSIT ||
      candidateAgreement.withdrawn !== 0n
    ) {
      throw new Error("Retiring the old local cohort changed candidate principal or lifecycle state.");
    }

    const manifest = localManifest({
      sourceCommit,
      cohort: candidate,
      token: token.address,
      yieldToken: yieldToken.address,
    });
    const candidateConfig = validateDeploymentManifest(manifest, sourceCommit);
    const configSwitch = rehearseConfigurationSwitch(
      loadDeploymentConfiguration(repositoryRoot),
      candidateConfig,
    );

    const evidence = {
      schema: REHEARSAL_SCHEMA,
      generatedAt: new Date().toISOString(),
      status: "passed",
      executionMode: "local-anvil-credential-free",
      sourceCommit,
      chainId: 84_532,
      manifest,
      retiredCohort: {
        status: "retired-rehearsal-only",
        openEscrow: retired.escrow.address,
        operationsReserve: retired.reserve.address,
        agreementActivityRegistry: retired.registry.address,
        agreementId: "0",
        principalWithdrawn: true,
        registryIsolationVerified: true,
        candidateUnaffected: true,
      },
      bindings: { retired: retiredBinding, candidate: candidateBinding },
      configSwitch,
      safetyBoundary:
        "Ephemeral localhost Anvil only; public dev keys and mock tokens; no external RPC, signer, broadcast, hosted secret, real asset, or source-file configuration change.",
    };
    const outputDirectory = path.join(frontendRoot, ".deployment-rehearsal");
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, "latest.json");
    writeFileSync(
      outputPath,
      `${JSON.stringify(evidence, (_, value) =>
        typeof value === "bigint" ? value.toString() : value, 2)}\n`,
    );
    console.log(
      `Deployment rehearsal passed: two isolated cohorts, ${configSwitch.replacementCount} in-memory config replacements, byte-for-byte rollback.`,
    );
    console.log(`Deployment rehearsal evidence: ${outputPath}`);
  } finally {
    if (!processState.exited) anvil.kill();
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Deployment rehearsal failed.");
  process.exitCode = 1;
}
