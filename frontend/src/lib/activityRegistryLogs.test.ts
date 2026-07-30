import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK } from "../contracts/activityRegistryConfig.ts";
import {
  ACTIVITY_LOG_MAX_BLOCK_RANGE,
  ACTIVITY_LOG_REORG_WINDOW,
  getActivityRegistryItems,
  type ActivityRegistryLogClient,
} from "./activityRegistryLogs.ts";

const address = (digit: string) =>
  `0x${digit.repeat(40)}` as `0x${string}`;
const hash = (digit: string) =>
  `0x${digit.repeat(64)}` as `0x${string}`;

function snapshotLog({
  agreementId,
  timestamp,
  transactionHash,
  logIndex,
  blockNumber = ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  removed = false,
}: {
  agreementId: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber?: bigint;
  removed?: boolean;
}) {
  return {
    eventName: "RecordSnapshotAnchored",
    args: {
      agreementId,
      snapshotHash: hash("a"),
      party: address("1"),
      timestamp,
    },
    transactionHash,
    logIndex,
    blockNumber,
    removed,
  };
}

function activityLog({
  agreementId,
  timestamp,
  transactionHash,
  logIndex,
  blockNumber = ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  removed = false,
}: {
  agreementId: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber?: bigint;
  removed?: boolean;
}) {
  return {
    eventName: "ActivityPublished",
    args: {
      agreementId,
      activityType: 3,
      party: address("2"),
      contentHash: hash("b"),
      timestamp,
    },
    transactionHash,
    logIndex,
    blockNumber,
    removed,
  };
}

test("activity registry reads each bounded range once and reuses all cached agreements", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let blockCalls = 0;
  const latestBlock =
    ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
    ACTIVITY_LOG_MAX_BLOCK_RANGE * 2n +
    2n;
  const client = {
    async getBlockNumber() {
      blockCalls += 1;
      return latestBlock;
    },
    async getLogs(parameters: Record<string, unknown>) {
      calls.push(parameters);
      if (calls.length === 1) {
        return [
          snapshotLog({
            agreementId: 7n,
            timestamp: 10n,
            transactionHash: hash("3"),
            logIndex: 0,
          }),
          activityLog({
            agreementId: 8n,
            timestamp: 20n,
            transactionHash: hash("4"),
            logIndex: 1,
          }),
          activityLog({
            agreementId: 99n,
            timestamp: 30n,
            transactionHash: hash("5"),
            logIndex: 2,
          }),
        ];
      }
      return [];
    },
  } as unknown as ActivityRegistryLogClient;

  const items = await getActivityRegistryItems(client, [8n, 7n, 8n]);
  const cachedOtherAgreement = await getActivityRegistryItems(client, [99n]);

  assert.equal(calls.length, 3);
  assert.equal(blockCalls, 2);
  assert.deepEqual(
    calls.map(({ fromBlock, toBlock }) => ({ fromBlock, toBlock })),
    [
      {
        fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
        toBlock:
          ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
          ACTIVITY_LOG_MAX_BLOCK_RANGE,
      },
      {
        fromBlock:
          ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
          ACTIVITY_LOG_MAX_BLOCK_RANGE +
          1n,
        toBlock:
          ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
          ACTIVITY_LOG_MAX_BLOCK_RANGE * 2n +
          1n,
      },
      {
        fromBlock:
          ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
          ACTIVITY_LOG_MAX_BLOCK_RANGE * 2n +
          2n,
        toBlock: latestBlock,
      },
    ],
  );
  for (const call of calls) {
    assert.equal(call.strict, true);
    assert.equal("event" in call, false);
    assert.equal("args" in call, false);
    assert.deepEqual(
      (call.events as Array<{ name: string }>).map((event) => event.name),
      ["RecordSnapshotAnchored", "ActivityPublished"],
    );
  }
  assert.deepEqual(
    items.map((item) => ({
      agreementId: item.agreementId,
      type: item.type,
      timestamp: item.timestamp,
    })),
    [
      { agreementId: 8n, type: "activity", timestamp: 20n },
      { agreementId: 7n, type: "snapshot", timestamp: 10n },
    ],
  );
  assert.deepEqual(
    cachedOtherAgreement.map((item) => item.agreementId),
    [99n],
  );
  assert.equal(calls.length, 3);
});

test("activity registry refreshes only a reorg-safe tail and replaces recent logs", async () => {
  const initialLatest = ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK + 20n;
  let latestBlock = initialLatest;
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    async getBlockNumber() {
      return latestBlock;
    },
    async getLogs(parameters: Record<string, unknown>) {
      calls.push(parameters);
      if (calls.length === 1) {
        return [
          snapshotLog({
            agreementId: 7n,
            timestamp: 10n,
            transactionHash: hash("3"),
            logIndex: 0,
            blockNumber: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK + 3n,
          }),
          activityLog({
            agreementId: 7n,
            timestamp: 20n,
            transactionHash: hash("4"),
            logIndex: 1,
            blockNumber: initialLatest - 4n,
          }),
        ];
      }
      return [
        activityLog({
          agreementId: 7n,
          timestamp: 30n,
          transactionHash: hash("5"),
          logIndex: 2,
          blockNumber: latestBlock,
        }),
        activityLog({
          agreementId: 7n,
          timestamp: 40n,
          transactionHash: hash("6"),
          logIndex: 3,
          blockNumber: latestBlock,
          removed: true,
        }),
      ];
    },
  } as unknown as ActivityRegistryLogClient;

  assert.deepEqual(
    (await getActivityRegistryItems(client, [7n])).map((item) => item.timestamp),
    [20n, 10n],
  );

  latestBlock = initialLatest + 1n;
  const refreshed = await getActivityRegistryItems(client, [7n]);

  assert.equal(calls.length, 2);
  assert.deepEqual(
    {
      fromBlock: calls[1]?.fromBlock,
      toBlock: calls[1]?.toBlock,
    },
    {
      fromBlock: initialLatest - (ACTIVITY_LOG_REORG_WINDOW - 1n),
      toBlock: latestBlock,
    },
  );
  assert.deepEqual(
    refreshed.map((item) => item.timestamp),
    [30n, 10n],
  );
});

test("activity registry shares one in-flight history scan across consumers", async () => {
  let blockCalls = 0;
  let logCalls = 0;
  let releaseScan: (() => void) | null = null;
  const scanStarted = new Promise<void>((resolve) => {
    releaseScan = resolve;
  });
  const client = {
    async getBlockNumber() {
      blockCalls += 1;
      return ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK;
    },
    async getLogs() {
      logCalls += 1;
      await scanStarted;
      return [
        snapshotLog({
          agreementId: 7n,
          timestamp: 10n,
          transactionHash: hash("3"),
          logIndex: 0,
        }),
      ];
    },
  } as unknown as ActivityRegistryLogClient;

  const first = getActivityRegistryItems(client, [7n]);
  const second = getActivityRegistryItems(client, [7n]);
  await Promise.resolve();
  releaseScan?.();

  const [firstItems, secondItems] = await Promise.all([first, second]);
  assert.equal(blockCalls, 1);
  assert.equal(logCalls, 1);
  assert.deepEqual(firstItems, secondItems);
});

test("activity registry preserves and retries the last known-good tail after failure", async () => {
  const initialLatest = ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK + 20n;
  let latestBlock = initialLatest;
  let shouldFail = false;
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    async getBlockNumber() {
      return latestBlock;
    },
    async getLogs(parameters: Record<string, unknown>) {
      calls.push(parameters);
      if (shouldFail) throw new Error("temporary RPC failure");
      if (calls.length === 1) {
        return [
          snapshotLog({
            agreementId: 7n,
            timestamp: 10n,
            transactionHash: hash("3"),
            logIndex: 0,
            blockNumber: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK + 3n,
          }),
          activityLog({
            agreementId: 7n,
            timestamp: 20n,
            transactionHash: hash("4"),
            logIndex: 1,
            blockNumber: initialLatest - 4n,
          }),
        ];
      }
      return [
        activityLog({
          agreementId: 7n,
          timestamp: 30n,
          transactionHash: hash("5"),
          logIndex: 2,
          blockNumber: latestBlock,
        }),
      ];
    },
  } as unknown as ActivityRegistryLogClient;

  await getActivityRegistryItems(client, [7n]);
  latestBlock = initialLatest + 1n;
  shouldFail = true;
  await assert.rejects(
    getActivityRegistryItems(client, [7n]),
    /temporary RPC failure/,
  );

  latestBlock = initialLatest;
  shouldFail = false;
  assert.deepEqual(
    (await getActivityRegistryItems(client, [7n])).map((item) => item.timestamp),
    [20n, 10n],
  );

  latestBlock = initialLatest + 1n;
  const recovered = await getActivityRegistryItems(client, [7n]);
  assert.deepEqual(
    recovered.map((item) => item.timestamp),
    [30n, 10n],
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(
    {
      fromBlock: calls[1]?.fromBlock,
      retryFromBlock: calls[2]?.fromBlock,
    },
    {
      fromBlock: initialLatest - (ACTIVITY_LOG_REORG_WINDOW - 1n),
      retryFromBlock: initialLatest - (ACTIVITY_LOG_REORG_WINDOW - 1n),
    },
  );
});

test("activity registry skips RPC work when no agreement can match", async () => {
  let blockCalls = 0;
  let logCalls = 0;
  const client = {
    async getBlockNumber() {
      blockCalls += 1;
      return ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK;
    },
    async getLogs() {
      logCalls += 1;
      return [];
    },
  } as unknown as ActivityRegistryLogClient;

  assert.deepEqual(await getActivityRegistryItems(client, []), []);
  assert.equal(blockCalls, 0);
  assert.equal(logCalls, 0);
});

test("activity registry handles a configured deployment block ahead of the RPC", async () => {
  let logCalls = 0;
  const client = {
    async getBlockNumber() {
      return ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK - 1n;
    },
    async getLogs() {
      logCalls += 1;
      return [];
    },
  } as unknown as ActivityRegistryLogClient;

  assert.deepEqual(await getActivityRegistryItems(client, [1n]), []);
  assert.equal(logCalls, 0);
});
