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
export const ACTIVITY_LOG_REORG_WINDOW = 12n;

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
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

type ActivityRegistryCacheState = {
  itemsByKey: Map<string, RegistryActivityItem>;
  lastScannedBlock: bigint | null;
  inflight: Promise<void> | null;
};

const activityRegistryCacheByClient =
  new WeakMap<ActivityRegistryLogClient, ActivityRegistryCacheState>();

function normalizeRegistryLog(log: RegistryLog): RegistryActivityItem | null {
  if (log.removed || log.blockNumber === null) return null;

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
      blockNumber: log.blockNumber,
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
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    };
  }
  return null;
}

function getActivityRegistryCache(
  client: ActivityRegistryLogClient,
): ActivityRegistryCacheState {
  const existing = activityRegistryCacheByClient.get(client);
  if (existing) return existing;

  const created: ActivityRegistryCacheState = {
    itemsByKey: new Map(),
    lastScannedBlock: null,
    inflight: null,
  };
  activityRegistryCacheByClient.set(client, created);
  return created;
}

async function scanActivityRegistry(
  client: ActivityRegistryLogClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RegistryActivityItem[]> {
  const items: RegistryActivityItem[] = [];
  for (
    let rangeStart = fromBlock;
    rangeStart <= toBlock;
    rangeStart += ACTIVITY_LOG_MAX_BLOCK_RANGE + 1n
  ) {
    const candidateRangeEnd = rangeStart + ACTIVITY_LOG_MAX_BLOCK_RANGE;
    const rangeEnd =
      candidateRangeEnd > toBlock ? toBlock : candidateRangeEnd;
    const logs = await client.getLogs({
      address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
      events: [snapshotEvent, activityEvent],
      strict: true,
      fromBlock: rangeStart,
      toBlock: rangeEnd,
    });
    for (const log of logs) {
      const item = normalizeRegistryLog(log);
      if (item) items.push(item);
    }
  }
  return items;
}

async function refreshActivityRegistryCache(
  client: ActivityRegistryLogClient,
  cache: ActivityRegistryCacheState,
): Promise<void> {
  if (cache.inflight) {
    await cache.inflight;
    return;
  }

  const refresh = (async () => {
    const latestBlock = await client.getBlockNumber();
    if (latestBlock < ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK) return;
    if (
      cache.lastScannedBlock !== null &&
      latestBlock <= cache.lastScannedBlock
    ) {
      // A lagging RPC response must not roll a known-good cache backward.
      return;
    }

    const fromBlock =
      cache.lastScannedBlock === null
        ? ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK
        : cache.lastScannedBlock -
              (ACTIVITY_LOG_REORG_WINDOW - 1n) <
            ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK
          ? ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK
          : cache.lastScannedBlock - (ACTIVITY_LOG_REORG_WINDOW - 1n);
    const scannedItems = await scanActivityRegistry(
      client,
      fromBlock,
      latestBlock,
    );

    // Apply a completed refresh atomically. If any bounded request rejects,
    // the previous items and cursor remain available for a later retry.
    const nextItemsByKey = new Map(cache.itemsByKey);
    if (cache.lastScannedBlock !== null) {
      for (const [key, item] of nextItemsByKey) {
        if (item.blockNumber >= fromBlock) nextItemsByKey.delete(key);
      }
    }
    for (const item of scannedItems) {
      nextItemsByKey.set(item.key, item);
    }
    cache.itemsByKey = nextItemsByKey;
    cache.lastScannedBlock = latestBlock;
  })();

  cache.inflight = refresh;
  try {
    await refresh;
  } finally {
    if (cache.inflight === refresh) cache.inflight = null;
  }
}

export async function getActivityRegistryItems(
  client: ActivityRegistryLogClient,
  agreementIds: readonly bigint[],
): Promise<RegistryActivityItem[]> {
  const requestedIds = new Set(agreementIds.map((id) => id.toString()));
  if (requestedIds.size === 0) return [];

  const cache = getActivityRegistryCache(client);
  await refreshActivityRegistryCache(client, cache);

  return Array.from(cache.itemsByKey.values())
    .filter((item) => requestedIds.has(item.agreementId.toString()))
    .sort((left, right) =>
      left.timestamp === right.timestamp
        ? right.key.localeCompare(left.key)
        : left.timestamp > right.timestamp
          ? -1
          : 1,
    );
}
