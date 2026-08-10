// The public Base Sepolia RPC caps eth_getLogs at a 2000-block range per call.
// Keep every inclusive range comfortably below that limit.
export const ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE = 1900n;

const PROPOSAL_TIME_SAFETY_SECONDS = 60n * 60n;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

type ReplacementEventName =
  | "ArbiterReplaced"
  | "ArbiterReplacementCancelled";

type ReplacementEventArgs = {
  id?: bigint;
  newArbiter?: `0x${string}`;
};

export type ArbiterReplacementRecoveryLog = {
  eventName?: ReplacementEventName;
  args?: ReplacementEventArgs;
  transactionHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  removed?: boolean;
};

export type ArbiterReplacementRecoveryClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getContractEvents(input: {
    address: `0x${string}`;
    abi: unknown;
    eventName: ReplacementEventName;
    args: {
      id: bigint;
      newArbiter?: `0x${string}`;
    };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly ArbiterReplacementRecoveryLog[]>;
};

export type ArbiterReplacementRecoveryConfig = {
  deploymentBlock: bigint;
  contractAddress: `0x${string}`;
  abi: unknown;
  agreementId: bigint;
  replacementWallet: `0x${string}`;
  proposedAt: string;
  outcome: "accepted" | "cancelled";
};

async function firstBlockAtOrAfter(
  client: ArbiterReplacementRecoveryClient,
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

function isLaterLog(
  candidate: ArbiterReplacementRecoveryLog,
  current: ArbiterReplacementRecoveryLog | null,
) {
  if (!current) return true;
  const candidateBlock = candidate.blockNumber ?? -1n;
  const currentBlock = current.blockNumber ?? -1n;
  if (candidateBlock !== currentBlock) return candidateBlock > currentBlock;
  return (candidate.logIndex ?? -1) > (current.logIndex ?? -1);
}

/**
 * Finds a likely missing arbiter-replacement receipt without trusting the
 * browser to authorize the private-record update. The server still verifies
 * the receipt, event, agreement, wallet, and sender before changing access.
 */
export async function findArbiterReplacementTransaction(
  client: ArbiterReplacementRecoveryClient,
  config: ArbiterReplacementRecoveryConfig,
): Promise<`0x${string}` | null> {
  const proposedAtMilliseconds = Date.parse(config.proposedAt);
  if (!Number.isFinite(proposedAtMilliseconds)) {
    throw new Error("The replacement proposal time is unavailable.");
  }

  const latestBlock = await client.getBlockNumber();
  if (latestBlock < config.deploymentBlock) return null;

  const proposedAtSeconds = BigInt(Math.floor(proposedAtMilliseconds / 1000));
  const searchTimestamp =
    proposedAtSeconds > PROPOSAL_TIME_SAFETY_SECONDS
      ? proposedAtSeconds - PROPOSAL_TIME_SAFETY_SECONDS
      : 0n;
  const firstCandidateBlock = await firstBlockAtOrAfter(
    client,
    config.deploymentBlock,
    latestBlock,
    searchTimestamp,
  );
  if (firstCandidateBlock === null) return null;

  // Step back one block to tolerate timestamp ties at the binary-search edge.
  const searchStart =
    firstCandidateBlock > config.deploymentBlock
      ? firstCandidateBlock - 1n
      : config.deploymentBlock;
  const eventName: ReplacementEventName =
    config.outcome === "accepted"
      ? "ArbiterReplaced"
      : "ArbiterReplacementCancelled";
  const args =
    config.outcome === "accepted"
      ? { id: config.agreementId, newArbiter: config.replacementWallet }
      : { id: config.agreementId };

  let latestMatch: ArbiterReplacementRecoveryLog | null = null;
  for (
    let fromBlock = searchStart;
    fromBlock <= latestBlock;
    fromBlock += ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE + 1n
  ) {
    const toBlock =
      fromBlock + ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE > latestBlock
        ? latestBlock
        : fromBlock + ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE;
    const logs = await client.getContractEvents({
      address: config.contractAddress,
      abi: config.abi,
      eventName,
      args,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const transactionHash = log.transactionHash || "";
      const matchesOutcome = log.eventName === undefined || log.eventName === eventName;
      const matchesAgreement = log.args?.id === config.agreementId;
      const matchesWallet =
        config.outcome === "cancelled" ||
        log.args?.newArbiter?.toLowerCase() ===
          config.replacementWallet.toLowerCase();
      if (
        log.removed ||
        log.blockNumber === null ||
        log.blockNumber === undefined ||
        !TRANSACTION_HASH_PATTERN.test(transactionHash) ||
        !matchesOutcome ||
        !matchesAgreement ||
        !matchesWallet
      ) {
        continue;
      }
      if (isLaterLog(log, latestMatch)) latestMatch = log;
    }
  }

  return latestMatch?.transactionHash || null;
}
