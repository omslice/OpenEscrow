import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK } from "../contracts/activityRegistryConfig.ts";
import {
  ACTIVITY_LOG_MAX_BLOCK_RANGE,
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
}: {
  agreementId: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
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
  };
}

function activityLog({
  agreementId,
  timestamp,
  transactionHash,
  logIndex,
}: {
  agreementId: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
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
  };
}

test("activity registry reads both event types once per bounded block range", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const latestBlock =
    ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK +
    ACTIVITY_LOG_MAX_BLOCK_RANGE * 2n +
    2n;
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

  assert.equal(calls.length, 3);
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
