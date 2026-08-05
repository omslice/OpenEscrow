import { useState } from "react";
import { AGREEMENT_ACTIVITY_REGISTRY_ADDRESS } from "../contracts/activityRegistryConfig";
import { DEPLOYMENT_BLOCK } from "../contracts/config";

const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;
const ARBITER = "0x4444444444444444444444444444444444444444" as const;
const CLAIM_TRANSACTION_HASH = `0x${"9".repeat(64)}` as const;
const RESPONSE_TRANSACTION_HASH = `0x${"8".repeat(64)}` as const;
const RULING_TRANSACTION_HASH = `0x${"6".repeat(64)}` as const;
const WITHDRAWAL_TRANSACTION_HASH = `0x${"5".repeat(64)}` as const;
const NO_CLAIM_TIMEOUT_TRANSACTION_HASH = `0x${"3".repeat(64)}` as const;
const NO_RESPONSE_TIMEOUT_TRANSACTION_HASH = `0x${"2".repeat(64)}` as const;
const ARBITER_TIMEOUT_TRANSACTION_HASH = `0x${"1".repeat(64)}` as const;
const ACTIVITY_TRANSACTION_HASH = `0x${"7".repeat(64)}` as const;
const ARBITER_REPLACEMENT_TRANSACTION_HASH = `0x${"d".repeat(64)}` as const;
const PROPOSAL_CANCELLATION_TRANSACTION_HASH = `0x${"f".repeat(64)}` as const;
const REPLACEMENT_ARBITER = "0x5555555555555555555555555555555555555555" as const;
const ARBITER_REPLACEMENT_SEARCH_COUNT_KEY =
  "openescrow:test:arbiter-replacement-searches";
const CLAIM_TRANSACTION_COUNT_KEY = "openescrow:test:claim-transaction-writes";
const RESPONSE_TRANSACTION_COUNT_KEY =
  "openescrow:test:response-transaction-writes";
const RULING_TRANSACTION_COUNT_KEY =
  "openescrow:test:ruling-transaction-writes";
const WITHDRAWAL_TRANSACTION_COUNT_KEY =
  "openescrow:test:withdrawal-transaction-writes";
const ACTIVITY_TRANSACTION_COUNT_KEY =
  "openescrow:test:activity-transaction-writes";
const ACTIVITY_CONTENT_HASH_KEY = "openescrow:test:activity-content-hash";

function transactionCount(key: string) {
  return Number(window.sessionStorage.getItem(key) || "0");
}

function recordTransaction(key: string) {
  window.sessionStorage.setItem(key, String(transactionCount(key) + 1));
}

function selectedAddress() {
  const role = new URLSearchParams(window.location.search).get("role");
  return role === "tenant" ? TENANT : role === "arbiter" ? ARBITER : LANDLORD;
}

function currentFlow() {
  return new URLSearchParams(window.location.search).get("flow");
}

export function useAccount() {
  return { address: selectedAddress() };
}

export function usePublicClient() {
  if (currentFlow() === "arbiter-replacement-recovery") {
    const proposalTimestamp = BigInt(
      Math.floor(Date.parse("2026-07-31T00:00:00.000Z") / 1000),
    );
    const eventBlock = DEPLOYMENT_BLOCK + 2_500n;
    return {
      getBlockNumber: async () => {
        const searches = transactionCount(ARBITER_REPLACEMENT_SEARCH_COUNT_KEY) + 1;
        window.sessionStorage.setItem(
          ARBITER_REPLACEMENT_SEARCH_COUNT_KEY,
          String(searches),
        );
        return DEPLOYMENT_BLOCK + 5_000n;
      },
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
        timestamp:
          proposalTimestamp - 7_200n + (blockNumber - DEPLOYMENT_BLOCK) * 2n,
      }),
      getContractEvents: async ({
        fromBlock,
        toBlock,
      }: {
        fromBlock: bigint;
        toBlock: bigint;
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (
          transactionCount(ARBITER_REPLACEMENT_SEARCH_COUNT_KEY) === 1 ||
          eventBlock < fromBlock ||
          eventBlock > toBlock
        ) {
          return [];
        }
        return [
          {
            eventName: "ArbiterReplaced" as const,
            args: { id: 43n, newArbiter: REPLACEMENT_ARBITER },
            transactionHash: ARBITER_REPLACEMENT_TRANSACTION_HASH,
            blockNumber: eventBlock,
            logIndex: 1,
          },
        ];
      },
    };
  }
  if (currentFlow() !== "activity-receipt") return undefined;
  return {
    getTransactionReceipt: async () => ({
      status: "success" as const,
      to: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
      blockNumber: 12_345n,
    }),
    getLogs: async () => [
      {
        transactionHash: ACTIVITY_TRANSACTION_HASH,
        args: {
          activityType: 1,
          contentHash: window.sessionStorage.getItem(
            ACTIVITY_CONTENT_HASH_KEY,
          ) as `0x${string}`,
          party: selectedAddress(),
        },
      },
    ],
  };
}

export function useReadContract(parameters: { functionName?: string }) {
  switch (parameters.functionName) {
    case "tenantShareBps":
      return { data: selectedAddress() === TENANT ? 10_000n : 0n };
    case "tenantWithdrawableByAddress":
      return {
        data:
          currentFlow() === "withdrawal-receipt" &&
          transactionCount(WITHDRAWAL_TRANSACTION_COUNT_KEY) === 0
            ? 500_000n
            : 0n,
      };
    case "tenantClaimResponded":
      return {
        data:
          new URLSearchParams(window.location.search).get("flow") ===
            "response-receipt" &&
          transactionCount(RESPONSE_TRANSACTION_COUNT_KEY) > 0,
      };
    case "claimResponseCount":
      return { data: 0n };
    case "getTenantParticipants":
      return {
        data: [[TENANT], [10_000], [1_000_000n], [1_000_000n]] as const,
      };
    case "getEvidence":
      return { data: [] };
    default:
      return { data: undefined };
  }
}

export function useWriteContract() {
  const [data, setData] = useState<`0x${string}` | undefined>();
  return {
    writeContract: (request?: { args?: readonly unknown[] }) => {
      const transaction = new URLSearchParams(window.location.search).get("tx");
      if (transaction === "claim-success") {
        recordTransaction(CLAIM_TRANSACTION_COUNT_KEY);
        setData(CLAIM_TRANSACTION_HASH);
      } else if (transaction === "response-success") {
        recordTransaction(RESPONSE_TRANSACTION_COUNT_KEY);
        setData(RESPONSE_TRANSACTION_HASH);
      } else if (transaction === "ruling-success") {
        recordTransaction(RULING_TRANSACTION_COUNT_KEY);
        setData(RULING_TRANSACTION_HASH);
      } else if (transaction === "terminal-success") {
        const flow = currentFlow();
        if (flow === "withdrawal-receipt") {
          recordTransaction(WITHDRAWAL_TRANSACTION_COUNT_KEY);
          setData(WITHDRAWAL_TRANSACTION_HASH);
        } else if (flow === "no-claim-timeout-receipt") {
          recordTransaction(
            "openescrow:test:no-claim-timeout-receipt-transaction-writes",
          );
          setData(NO_CLAIM_TIMEOUT_TRANSACTION_HASH);
        } else if (flow === "no-response-timeout-receipt") {
          recordTransaction(
            "openescrow:test:no-response-timeout-receipt-transaction-writes",
          );
          setData(NO_RESPONSE_TIMEOUT_TRANSACTION_HASH);
        } else if (flow === "arbiter-timeout-receipt") {
          recordTransaction(
            "openescrow:test:arbiter-timeout-receipt-transaction-writes",
          );
          setData(ARBITER_TIMEOUT_TRANSACTION_HASH);
        } else if (flow === "proposal-cancellation-receipt") {
          recordTransaction(
            "openescrow:test:proposal-cancellation-transaction-writes",
          );
          setData(PROPOSAL_CANCELLATION_TRANSACTION_HASH);
        }
      } else if (transaction === "activity-success") {
        const contentHash = request?.args?.[2];
        if (typeof contentHash === "string") {
          window.sessionStorage.setItem(ACTIVITY_CONTENT_HASH_KEY, contentHash);
        }
        recordTransaction(ACTIVITY_TRANSACTION_COUNT_KEY);
        setData(ACTIVITY_TRANSACTION_HASH);
      }
    },
    data,
    isPending: false,
    error: null,
    reset: () => setData(undefined),
  };
}

export function useWaitForTransactionReceipt({
  hash,
}: {
  hash?: `0x${string}`;
}) {
  return {
    isLoading: false,
    isSuccess: Boolean(hash),
    error: null,
  };
}
