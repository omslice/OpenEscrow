// The public Base Sepolia RPC caps eth_getLogs at a 2000-block range per call.
// Keep every inclusive range comfortably below that limit.
export const FINALIZATION_RECOVERY_MAX_BLOCK_RANGE = 1900n;

const READY_TIME_SAFETY_SECONDS = 5n * 60n;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type FinalizationRecoveryLog = {
  eventName?: "AgreementProposed";
  args?: {
    id?: bigint;
    landlord?: `0x${string}`;
    tenant?: `0x${string}`;
    arbiter?: `0x${string}`;
    agreedAmount?: bigint;
    claimWindowStart?: bigint;
    claimPeriod?: bigint;
    responsePeriod?: bigint;
    arbiterRulingPeriod?: bigint;
  };
  transactionHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  removed?: boolean;
};

export type FinalizationRecoveryClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getContractEvents(input: {
    address: `0x${string}`;
    abi: unknown;
    eventName: "AgreementProposed";
    args: { landlord: `0x${string}` };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly FinalizationRecoveryLog[]>;
};

export type FinalizationRecoveryConfig = {
  deploymentBlock: bigint;
  contractAddress: `0x${string}`;
  abi: unknown;
  readyAt: string;
  landlord: `0x${string}`;
  fundingTenant: `0x${string}`;
  arbiter: `0x${string}`;
  agreedAmount: bigint;
  claimWindowStart: bigint;
  claimPeriod: bigint;
  responsePeriod: bigint;
  arbiterRulingPeriod: bigint;
};

export type FinalizationRecoveryCandidate = {
  agreementId: bigint;
  transactionHash: `0x${string}`;
};

export function finalizationRecoveryKey(input: {
  proposalId: string;
  role: "landlord";
  address: string;
}) {
  return [
    "openescrow:pending-finalization:v2",
    encodeURIComponent(input.proposalId),
    input.role,
    input.address.toLowerCase(),
  ].join(":");
}

async function firstBlockAtOrAfter(
  client: FinalizationRecoveryClient,
  deploymentBlock: bigint,
  latestBlock: bigint,
  timestamp: bigint,
) {
  const latest = await client.getBlock({ blockNumber: latestBlock });
  if (latest.timestamp < timestamp) return null;

  let lower = deploymentBlock;
  let upper = latestBlock;
  while (lower < upper) {
    const middle = lower + (upper - lower) / 2n;
    const block = await client.getBlock({ blockNumber: middle });
    if (block.timestamp >= timestamp) {
      upper = middle;
    } else {
      lower = middle + 1n;
    }
  }
  return lower;
}

function sameAddress(left: unknown, right: string) {
  return (
    typeof left === "string" &&
    ADDRESS_PATTERN.test(left) &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function matchingCandidates(
  logs: readonly FinalizationRecoveryLog[],
  config: FinalizationRecoveryConfig,
) {
  return logs.flatMap((log) => {
    const args = log.args;
    const transactionHash = log.transactionHash || "";
    if (
      log.removed ||
      log.blockNumber === null ||
      log.blockNumber === undefined ||
      !Number.isInteger(log.logIndex) ||
      (log.logIndex ?? -1) < 0 ||
      log.eventName !== "AgreementProposed" ||
      typeof args?.id !== "bigint" ||
      args.id < 0n ||
      !sameAddress(args.landlord, config.landlord) ||
      !sameAddress(args.tenant, config.fundingTenant) ||
      !sameAddress(args.arbiter, config.arbiter) ||
      args.agreedAmount !== config.agreedAmount ||
      args.claimWindowStart !== config.claimWindowStart ||
      args.claimPeriod !== config.claimPeriod ||
      args.responsePeriod !== config.responsePeriod ||
      args.arbiterRulingPeriod !== config.arbiterRulingPeriod ||
      !TRANSACTION_HASH_PATTERN.test(transactionHash)
    ) {
      return [];
    }
    return [
      {
        agreementId: args.id,
        transactionHash: transactionHash as `0x${string}`,
      },
    ];
  });
}

/**
 * Finds an exact public AgreementProposed candidate before the UI permits a
 * new write. It returns only one unambiguous exact candidate after the latest
 * saved preflight; multiple candidates fail closed because the deployed event
 * does not contain the private proposal id. The candidate is never
 * authoritative: the hosted server still verifies the successful receipt,
 * every event field, all tenant shares, the selected token, the deployed
 * contract, the creating landlord, and exclusive receipt assignment.
 */
export async function findAgreementFinalizationTransaction(
  client: FinalizationRecoveryClient,
  config: FinalizationRecoveryConfig,
): Promise<FinalizationRecoveryCandidate | null> {
  const readyAtMilliseconds = Date.parse(config.readyAt);
  if (!Number.isFinite(readyAtMilliseconds)) {
    throw new Error("The proposal-ready time is unavailable.");
  }
  if (
    !ADDRESS_PATTERN.test(config.landlord) ||
    !ADDRESS_PATTERN.test(config.fundingTenant) ||
    !ADDRESS_PATTERN.test(config.arbiter)
  ) {
    throw new Error("The approved participant wallets are unavailable.");
  }

  const latestBlock = await client.getBlockNumber();
  if (latestBlock < config.deploymentBlock) return null;

  const readyAtSeconds = BigInt(Math.floor(readyAtMilliseconds / 1000));
  const searchTimestamp =
    readyAtSeconds > READY_TIME_SAFETY_SECONDS
      ? readyAtSeconds - READY_TIME_SAFETY_SECONDS
      : 0n;
  const firstCandidateBlock = await firstBlockAtOrAfter(
    client,
    config.deploymentBlock,
    latestBlock,
    searchTimestamp,
  );
  if (firstCandidateBlock === null) return null;

  const searchStart =
    firstCandidateBlock > config.deploymentBlock
      ? firstCandidateBlock - 1n
      : config.deploymentBlock;
  const candidates = new Map<string, FinalizationRecoveryCandidate>();
  let toBlock = latestBlock;
  while (toBlock >= searchStart) {
    const fromBlock =
      toBlock - searchStart > FINALIZATION_RECOVERY_MAX_BLOCK_RANGE
        ? toBlock - FINALIZATION_RECOVERY_MAX_BLOCK_RANGE
        : searchStart;
    const logs = await client.getContractEvents({
      address: config.contractAddress,
      abi: config.abi,
      eventName: "AgreementProposed",
      args: { landlord: config.landlord },
      fromBlock,
      toBlock,
    });
    for (const candidate of matchingCandidates(logs, config)) {
      candidates.set(
        `${candidate.agreementId}:${candidate.transactionHash.toLowerCase()}`,
        candidate,
      );
    }
    if (fromBlock === searchStart) break;
    toBlock = fromBlock - 1n;
  }

  if (candidates.size > 1) {
    throw new Error(
      "More than one matching agreement finalization was found; automatic recovery is unsafe.",
    );
  }
  return candidates.values().next().value || null;
}
