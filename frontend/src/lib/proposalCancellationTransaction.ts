// The public Base Sepolia RPC caps eth_getLogs at a 2000-block range per call.
// Keep every inclusive range comfortably below that limit.
export const PROPOSAL_CANCELLATION_RECOVERY_MAX_BLOCK_RANGE = 1900n;

const FINALIZATION_TIME_SAFETY_SECONDS = 60n * 60n;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export type ProposalCancellationRecoveryLog = {
  eventName?: "ProposalCancelled";
  args?: { id?: bigint };
  transactionHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  removed?: boolean;
};

export type ProposalCancellationRecoveryClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getContractEvents(input: {
    address: `0x${string}`;
    abi: unknown;
    eventName: "ProposalCancelled";
    args: { id: bigint };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly ProposalCancellationRecoveryLog[]>;
};

export type ProposalCancellationRecoveryConfig = {
  deploymentBlock: bigint;
  contractAddress: `0x${string}`;
  abi: unknown;
  agreementId: bigint;
  finalizedAt: string;
};

async function firstBlockAtOrAfter(
  client: ProposalCancellationRecoveryClient,
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

function latestMatchingLog(
  logs: readonly ProposalCancellationRecoveryLog[],
  agreementId: bigint,
) {
  return logs.reduce<ProposalCancellationRecoveryLog | null>((latest, log) => {
    const transactionHash = log.transactionHash || "";
    if (
      log.removed ||
      log.blockNumber === null ||
      log.blockNumber === undefined ||
      log.eventName !== "ProposalCancelled" ||
      log.args?.id !== agreementId ||
      !TRANSACTION_HASH_PATTERN.test(transactionHash)
    ) {
      return latest;
    }
    if (!latest) return log;
    const latestBlock = latest.blockNumber ?? -1n;
    if (log.blockNumber !== latestBlock) {
      return log.blockNumber > latestBlock ? log : latest;
    }
    return (log.logIndex ?? -1) > (latest.logIndex ?? -1) ? log : latest;
  }, null);
}

/**
 * Finds a missing ProposalCancelled receipt without treating browser output as
 * authorization. The server still verifies the receipt, event, agreement, and
 * landlord sender before changing the private Record.
 */
export async function findProposalCancellationTransaction(
  client: ProposalCancellationRecoveryClient,
  config: ProposalCancellationRecoveryConfig,
): Promise<`0x${string}` | null> {
  const finalizedAtMilliseconds = Date.parse(config.finalizedAt);
  if (!Number.isFinite(finalizedAtMilliseconds)) {
    throw new Error("The agreement finalization time is unavailable.");
  }

  const latestBlock = await client.getBlockNumber();
  if (latestBlock < config.deploymentBlock) return null;

  const finalizedAtSeconds = BigInt(Math.floor(finalizedAtMilliseconds / 1000));
  const searchTimestamp =
    finalizedAtSeconds > FINALIZATION_TIME_SAFETY_SECONDS
      ? finalizedAtSeconds - FINALIZATION_TIME_SAFETY_SECONDS
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
  let toBlock = latestBlock;
  while (toBlock >= searchStart) {
    const fromBlock =
      toBlock - searchStart > PROPOSAL_CANCELLATION_RECOVERY_MAX_BLOCK_RANGE
        ? toBlock - PROPOSAL_CANCELLATION_RECOVERY_MAX_BLOCK_RANGE
        : searchStart;
    const logs = await client.getContractEvents({
      address: config.contractAddress,
      abi: config.abi,
      eventName: "ProposalCancelled",
      args: { id: config.agreementId },
      fromBlock,
      toBlock,
    });
    const match = latestMatchingLog(logs, config.agreementId);
    if (match?.transactionHash) return match.transactionHash;
    if (fromBlock === searchStart) break;
    toBlock = fromBlock - 1n;
  }

  return null;
}
