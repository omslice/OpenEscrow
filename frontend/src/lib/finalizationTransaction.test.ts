import assert from "node:assert/strict";
import test from "node:test";
import {
  FINALIZATION_RECOVERY_MAX_BLOCK_RANGE,
  finalizationRecoveryKey,
  findAgreementFinalizationTransaction,
  type FinalizationRecoveryClient,
  type FinalizationRecoveryLog,
} from "./finalizationTransaction.ts";

const contractAddress = "0x1111111111111111111111111111111111111111" as const;
const landlord = "0x2222222222222222222222222222222222222222" as const;
const tenant = "0x3333333333333333333333333333333333333333" as const;
const arbiter = "0x0000000000000000000000000000000000000000" as const;
const transactionHash = `0x${"ab".repeat(32)}` as const;
const deploymentBlock = 1_000n;
const readyAt = "2026-08-01T00:00:00.000Z";
const readyAtSeconds = BigInt(Math.floor(Date.parse(readyAt) / 1000));

const expected = {
  landlord,
  tenant,
  arbiter,
  agreedAmount: 1_000_000n,
  claimWindowStart: readyAtSeconds + 86_400n,
  claimPeriod: 2_592_000n,
  responsePeriod: 604_800n,
  arbiterRulingPeriod: 604_800n,
};

function clientWith(
  logsForRange: (fromBlock: bigint, toBlock: bigint) =>
    readonly FinalizationRecoveryLog[],
) {
  const latestBlock = 8_000n;
  const ranges: Array<[bigint, bigint]> = [];
  const client: FinalizationRecoveryClient = {
    getBlockNumber: async () => latestBlock,
    getBlock: async ({ blockNumber }) => ({
      timestamp:
        readyAtSeconds + 20_000n - (latestBlock - blockNumber) * 2n,
    }),
    getContractEvents: async ({
      address,
      eventName,
      args,
      fromBlock,
      toBlock,
    }) => {
      assert.equal(address, contractAddress);
      assert.equal(eventName, "AgreementProposed");
      assert.deepEqual(args, { landlord });
      ranges.push([fromBlock, toBlock]);
      return logsForRange(fromBlock, toBlock);
    },
  };
  return { client, ranges };
}

function exactLog(
  overrides: Partial<FinalizationRecoveryLog> & {
    args?: FinalizationRecoveryLog["args"];
  } = {},
): FinalizationRecoveryLog {
  return {
    eventName: "AgreementProposed",
    args: { id: 43n, ...expected },
    transactionHash,
    blockNumber: 7_200n,
    logIndex: 1,
    ...overrides,
  };
}

test("finds one exact candidate after exhaustively scanning RPC-safe ranges", async () => {
  const { client, ranges } = clientWith((fromBlock, toBlock) =>
    7_200n >= fromBlock && 7_200n <= toBlock
      ? [exactLog({ transactionHash, logIndex: 2 })]
      : [],
  );
  assert.deepEqual(
    await findAgreementFinalizationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      readyAt,
      fundingTenant: tenant,
      ...expected,
    }),
    { agreementId: 43n, transactionHash },
  );
  assert.ok(
    ranges.every(
      ([fromBlock, toBlock]) =>
        toBlock >= fromBlock &&
        toBlock - fromBlock <= FINALIZATION_RECOVERY_MAX_BLOCK_RANGE,
    ),
  );
  assert.ok(ranges.length > 1, "the scan must continue to rule out ambiguity");
});

test("fails closed when more than one exact candidate could match the proposal", async () => {
  const otherHash = `0x${"cd".repeat(32)}` as const;
  const { client } = clientWith((fromBlock, toBlock) => {
    if (7_200n >= fromBlock && 7_200n <= toBlock) {
      return [exactLog({ transactionHash, blockNumber: 7_200n })];
    }
    if (3_200n >= fromBlock && 3_200n <= toBlock) {
      return [
        exactLog({
          args: { id: 44n, ...expected },
          transactionHash: otherHash,
          blockNumber: 3_200n,
        }),
      ];
    }
    return [];
  });
  await assert.rejects(
    findAgreementFinalizationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      readyAt,
      fundingTenant: tenant,
      ...expected,
    }),
    /automatic recovery is unsafe/i,
  );
});

test("rejects malformed, removed, and terms-mismatched public candidates", async () => {
  const { client } = clientWith(() => [
    exactLog({ eventName: undefined }),
    exactLog({ args: { id: 43n, ...expected, tenant: landlord } }),
    exactLog({ args: { id: 43n, ...expected, agreedAmount: 2_000_000n } }),
    exactLog({ transactionHash: "0x1234" as `0x${string}` }),
    exactLog({ removed: true }),
    exactLog({ blockNumber: null }),
    exactLog({ logIndex: null }),
  ]);
  assert.equal(
    await findAgreementFinalizationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      readyAt,
      fundingTenant: tenant,
      ...expected,
    }),
    null,
  );
});

test("fails closed on invalid proposal time or participant wallets", async () => {
  const { client } = clientWith(() => []);
  await assert.rejects(
    findAgreementFinalizationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      readyAt: "not-a-time",
      fundingTenant: tenant,
      ...expected,
    }),
    /proposal-ready time is unavailable/i,
  );
  await assert.rejects(
    findAgreementFinalizationTransaction(client, {
      deploymentBlock,
      contractAddress,
      abi: [],
      readyAt,
      fundingTenant: "0x1234",
      ...expected,
    }),
    /participant wallets are unavailable/i,
  );
});

test("scopes durable recovery by proposal, landlord role, and wallet", () => {
  const key = finalizationRecoveryKey({
    proposalId: "OE-P-READY/ONE",
    role: "landlord",
    address: landlord.toUpperCase(),
  });
  assert.equal(
    key,
    `openescrow:pending-finalization:v2:OE-P-READY%2FONE:landlord:${landlord}`,
  );
  assert.doesNotMatch(key, /token|bearer|secret/i);
});
