import assert from "node:assert/strict";
import test from "node:test";
import {
  ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE,
  findArbiterReplacementTransaction,
  type ArbiterReplacementRecoveryClient,
  type ArbiterReplacementRecoveryLog,
} from "./arbiterReplacementTransaction.ts";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const REPLACEMENT = "0x2222222222222222222222222222222222222222" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const HASH_A = `0x${"a".repeat(64)}` as const;
const HASH_B = `0x${"b".repeat(64)}` as const;

function fakeClient({
  deploymentBlock = 1_000n,
  latestBlock = 5_500n,
  baseTimestamp = 1_750_000_000n,
  logs = [],
}: {
  deploymentBlock?: bigint;
  latestBlock?: bigint;
  baseTimestamp?: bigint;
  logs?: ArbiterReplacementRecoveryLog[];
} = {}) {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client: ArbiterReplacementRecoveryClient = {
    async getBlockNumber() {
      return latestBlock;
    },
    async getBlock({ blockNumber }) {
      return { timestamp: baseTimestamp + (blockNumber - deploymentBlock) * 2n };
    },
    async getContractEvents({ fromBlock, toBlock, eventName }) {
      ranges.push({ fromBlock, toBlock });
      return logs.filter(
        (log) =>
          (log.eventName === undefined || log.eventName === eventName) &&
          (log.blockNumber ?? -1n) >= fromBlock &&
          (log.blockNumber ?? -1n) <= toBlock,
      );
    },
  };
  return { client, ranges };
}

test("finds the latest matching replacement acceptance in bounded ranges", async () => {
  const { client, ranges } = fakeClient({
    logs: [
      {
        eventName: "ArbiterReplaced",
        args: { id: 41n, newArbiter: REPLACEMENT },
        transactionHash: HASH_A,
        blockNumber: 4_300n,
        logIndex: 1,
      },
      {
        eventName: "ArbiterReplaced",
        args: { id: 42n, newArbiter: OTHER },
        transactionHash: HASH_A,
        blockNumber: 4_400n,
        logIndex: 1,
      },
      {
        eventName: "ArbiterReplaced",
        args: { id: 42n, newArbiter: REPLACEMENT },
        transactionHash: HASH_A,
        blockNumber: 4_500n,
        logIndex: 2,
      },
      {
        eventName: "ArbiterReplaced",
        args: { id: 42n, newArbiter: REPLACEMENT },
        transactionHash: HASH_B,
        blockNumber: 5_100n,
        logIndex: 0,
      },
      {
        eventName: "ArbiterReplaced",
        args: { id: 42n, newArbiter: REPLACEMENT },
        transactionHash: `0x${"c".repeat(64)}`,
        blockNumber: 5_200n,
        removed: true,
      },
    ],
  });

  const found = await findArbiterReplacementTransaction(client, {
    deploymentBlock: 1_000n,
    contractAddress: CONTRACT,
    abi: [],
    agreementId: 42n,
    replacementWallet: REPLACEMENT,
    proposedAt: new Date(Number((1_750_006_000n + 3_600n) * 1_000n)).toISOString(),
    outcome: "accepted",
  });

  assert.equal(found, HASH_B);
  assert.ok(ranges.length >= 1);
  assert.ok(ranges[0].fromBlock > 1_000n, "search should start near the proposal");
  assert.ok(
    ranges.every(
      ({ fromBlock, toBlock }) =>
        toBlock - fromBlock <= ARBITER_REPLACEMENT_RECOVERY_MAX_BLOCK_RANGE,
    ),
  );
});

test("finds a cancellation and ignores malformed or unrelated logs", async () => {
  const { client } = fakeClient({
    logs: [
      {
        eventName: "ArbiterReplacementCancelled",
        args: { id: 42n },
        transactionHash: "0x123" as `0x${string}`,
        blockNumber: 3_900n,
      },
      {
        eventName: "ArbiterReplacementCancelled",
        args: { id: 43n },
        transactionHash: HASH_A,
        blockNumber: 4_000n,
      },
      {
        eventName: "ArbiterReplacementCancelled",
        args: { id: 42n },
        transactionHash: HASH_B,
        blockNumber: 4_100n,
      },
    ],
  });

  const found = await findArbiterReplacementTransaction(client, {
    deploymentBlock: 1_000n,
    contractAddress: CONTRACT,
    abi: [],
    agreementId: 42n,
    replacementWallet: REPLACEMENT,
    proposedAt: new Date(Number(1_750_003_600n * 1_000n)).toISOString(),
    outcome: "cancelled",
  });

  assert.equal(found, HASH_B);
});

test("returns null when the proposal is newer than the latest block", async () => {
  const { client, ranges } = fakeClient();
  const found = await findArbiterReplacementTransaction(client, {
    deploymentBlock: 1_000n,
    contractAddress: CONTRACT,
    abi: [],
    agreementId: 42n,
    replacementWallet: REPLACEMENT,
    proposedAt: new Date(Number(1_750_020_000n * 1_000n)).toISOString(),
    outcome: "accepted",
  });
  assert.equal(found, null);
  assert.equal(ranges.length, 0);
});

test("fails closed when the proposal timestamp is invalid", async () => {
  const { client } = fakeClient();
  await assert.rejects(
    findArbiterReplacementTransaction(client, {
      deploymentBlock: 1_000n,
      contractAddress: CONTRACT,
      abi: [],
      agreementId: 42n,
      replacementWallet: REPLACEMENT,
      proposedAt: "not-a-date",
      outcome: "cancelled",
    }),
    /proposal time is unavailable/i,
  );
});

test("returns null before the contract deployment block", async () => {
  const { client } = fakeClient({ deploymentBlock: 1_000n, latestBlock: 999n });
  const found = await findArbiterReplacementTransaction(client, {
    deploymentBlock: 1_000n,
    contractAddress: CONTRACT,
    abi: [],
    agreementId: 42n,
    replacementWallet: REPLACEMENT,
    proposedAt: new Date(Number(1_750_000_000n * 1_000n)).toISOString(),
    outcome: "cancelled",
  });
  assert.equal(found, null);
});
