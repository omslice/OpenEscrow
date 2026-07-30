import {
  parseAbiItem,
  type GetLogsParameters,
  type GetLogsReturnType,
} from "viem";
import {
  ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "../contracts/activityRegistryConfig.ts";

// The public Base Sepolia RPC rejects broad eth_getLogs ranges. Keep the same
// safety margin used by agreement discovery while querying both registry
// events together.
export const ACTIVITY_LOG_MAX_BLOCK_RANGE = 1_900n;

export const snapshotEvent = parseAbiItem(
  "event RecordSnapshotAnchored(uint256 indexed agreementId, bytes32 indexed snapshotHash, address indexed party, uint64 timestamp)",
);
export const activityEvent = parseAbiItem(
  "event ActivityPublished(uint256 indexed agreementId, uint8 indexed activityType, address indexed party, bytes32 contentHash, uint64 timestamp)",
);

type RegistryEvents = readonly [typeof snapshotEvent, typeof activityEvent];
type RegistryLog = GetLogsReturnType<
  undefined,
  RegistryEvents,
  true,
  bigint,
  bigint
>[number];

export interface ActivityRegistryLogClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(
    parameters: GetLogsParameters<
      undefined,
      RegistryEvents,
      true,
      bigint,
      bigint
    >,
  ): Promise<readonly RegistryLog[]>;
}

export type RegistryActivityItem = {
  key: string;
  type: "snapshot" | "activity";
  agreementId: bigint;
  actor: `0x${string}`;
  contentHash: `0x${string}`;
  activityType?: number;
  timestamp: bigint;
  transactionHash: `0x${string}`;
};

function normalizeRegistryLog(log: RegistryLog): RegistryActivityItem | null {
  if (log.eventName === "RecordSnapshotAnchored") {
    const args = log.args as {
      agreementId: bigint;
      snapshotHash: `0x${string}`;
      party: `0x${string}`;
      timestamp: bigint;
    };
    return {
      key: `${log.transactionHash}-${log.logIndex}`,
      type: "snapshot",
      agreementId: args.agreementId,
      actor: args.party,
      contentHash: args.snapshotHash,
      timestamp: args.timestamp,
      transactionHash: log.transactionHash,
    };
  }
  if (log.eventName === "ActivityPublished") {
    const args = log.args as {
      agreementId: bigint;
      activityType: number;
      party: `0x${string}`;
      contentHash: `0x${string}`;
      timestamp: bigint;
    };
    return {
      key: `${log.transactionHash}-${log.logIndex}`,
      type: "activity",
      agreementId: args.agreementId,
      actor: args.party,
      contentHash: args.contentHash,
      activityType: args.activityType,
      timestamp: args.timestamp,
      transactionHash: log.transactionHash,
    };
  }
  return null;
}

export async function getActivityRegistryItems(
  client: ActivityRegistryLogClient,
  agreementIds: readonly bigint[],
): Promise<RegistryActivityItem[]> {
  const requestedIds = new Set(agreementIds.map((id) => id.toString()));
  if (requestedIds.size === 0) return [];

  const latestBlock = await client.getBlockNumber();
  if (latestBlock < ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK) return [];

  const items: RegistryActivityItem[] = [];
  for (
    let fromBlock = ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK;
    fromBlock <= latestBlock;
    fromBlock += ACTIVITY_LOG_MAX_BLOCK_RANGE + 1n
  ) {
    const candidateToBlock = fromBlock + ACTIVITY_LOG_MAX_BLOCK_RANGE;
    const toBlock =
      candidateToBlock > latestBlock ? latestBlock : candidateToBlock;
    const logs = await client.getLogs({
      address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
      events: [snapshotEvent, activityEvent],
      strict: true,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      const item = normalizeRegistryLog(log);
      if (item && requestedIds.has(item.agreementId.toString())) {
        items.push(item);
      }
    }
  }

  return items.sort((left, right) =>
    left.timestamp === right.timestamp
      ? right.key.localeCompare(left.key)
      : left.timestamp > right.timestamp
        ? -1
        : 1,
  );
}
