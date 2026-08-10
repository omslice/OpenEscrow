import assert from "node:assert/strict";
import test from "node:test";
import {
  findProposalCancellationTransaction,
  PROPOSAL_CANCELLATION_RECOVERY_MAX_BLOCK_RANGE,
  type ProposalCancellationRecoveryClient,
  type ProposalCancellationRecoveryLog,
} from "./proposalCancellationTransaction.ts";

const contractAddress = "0x1111111111111111111111111111111111111111" as const;
const transactionHash = `0x${"ab".repeat(32)}` as const;
const deploymentBlock = 1_000n;
const finalizedAt = "2026-08-01T00:00:00.000Z";
const finalizedAtSeconds = BigInt(Math.floor(Date.parse(finalizedAt) / 1000));

function clientWith(
  logsForRange: (fromBlock: bigint, toBlock: bigint) =>
    readonly ProposalCancellationRecoveryLog[],
  { latestBlock = 8_000n, latestTimestamp = finalizedAtSeconds + 20_000n } = {},
) {
  const ranges: Array<[bigint, bigint]> = [];
  const client: ProposalCancellationRecoveryClient = {
    getBlockNumber: async () => latestBlock,
    getBlock: async ({ blockNumber }) => ({
      timestamp:
        latestTimestamp - (latestBlock - blockNumber) * 2n,
    }),
    getContractEvents: async ({
      address,
      eventName,
      args,
      fromBlock,
      toBlock,
    }) => {
      assert.equal(address, contractAddress);
      assert.equal(eventName, "ProposalCancelled");
      assert.deepEqual(args, { id: 43n });
      ranges.push([fromBlock, toBlock]);
      return logsForRange(fromBlock, toBlock);
    },
  };
  return { client, ranges };
}

test("finds a recent cancellation by searching bounded ranges backward", async () => {
  const eventBlock = 7_200n;
  const { client, ranges } = clientWith((fromBlock, toBlock) =>
    eventBlock >= fromBlock && eventBlock <= toBlock
      ? [
          {
            eventName: "ProposalCancelled",
            args: { id: 43n },
            transactionHash,
            blockNumber: eventBlock,
            logIndex: 1,
          },
        ]
      : [],
  );
  assert.equal(
    await findProposalCancellationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt,
    }),
    transactionHash,
  );
  assert.equal(ranges.length, 1);
  assert.ok(
    ranges.every(
      ([fromBlock, toBlock]) =>
        toBlock >= fromBlock &&
        toBlock - fromBlock <=
          PROPOSAL_CANCELLATION_RECOVERY_MAX_BLOCK_RANGE,
    ),
  );
});

test("ignores removed, malformed, wrong-event, and wrong-agreement logs", async () => {
  const { client } = clientWith(() => [
    {
      args: { id: 43n },
      transactionHash,
      blockNumber: 7_499n,
    },
    {
      eventName: "ProposalCancelled",
      args: { id: 44n },
      transactionHash,
      blockNumber: 7_500n,
    },
    {
      eventName: "ArbiterReplacementCancelled" as "ProposalCancelled",
      args: { id: 43n },
      transactionHash,
      blockNumber: 7_501n,
    },
    {
      eventName: "ProposalCancelled",
      args: { id: 43n },
      transactionHash: "0x1234" as `0x${string}`,
      blockNumber: 7_502n,
    },
    {
      eventName: "ProposalCancelled",
      args: { id: 43n },
      transactionHash,
      blockNumber: 7_503n,
      removed: true,
    },
    {
      eventName: "ProposalCancelled",
      args: { id: 43n },
      transactionHash,
      blockNumber: null,
    },
  ]);
  assert.equal(
    await findProposalCancellationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt,
    }),
    null,
  );
});

test("returns the latest valid match within the first matching range", async () => {
  const newerHash = `0x${"cd".repeat(32)}` as const;
  const { client } = clientWith(() => [
    {
      eventName: "ProposalCancelled",
      args: { id: 43n },
      transactionHash,
      blockNumber: 7_400n,
      logIndex: 5,
    },
    {
      eventName: "ProposalCancelled",
      args: { id: 43n },
      transactionHash: newerHash,
      blockNumber: 7_400n,
      logIndex: 6,
    },
  ]);
  assert.equal(
    await findProposalCancellationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt,
    }),
    newerHash,
  );
});

test("fails closed when finalization time is invalid", async () => {
  const { client } = clientWith(() => []);
  await assert.rejects(
    findProposalCancellationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt: "not-a-time",
    }),
    /finalization time is unavailable/i,
  );
});

test("returns null before deployment or when finalization is newer than the chain", async () => {
  const beforeDeployment = clientWith(() => [], { latestBlock: 999n });
  assert.equal(
    await findProposalCancellationTransaction(beforeDeployment.client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt,
    }),
    null,
  );

  const beforeFinalization = clientWith(() => [], {
    latestTimestamp: finalizedAtSeconds - 7_200n,
  });
  assert.equal(
    await findProposalCancellationTransaction(beforeFinalization.client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      agreementId: 43n,
      finalizedAt,
    }),
    null,
  );
});
