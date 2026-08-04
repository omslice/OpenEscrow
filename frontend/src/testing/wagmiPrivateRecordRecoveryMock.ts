import { useState } from "react";

const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;
const ARBITER = "0x4444444444444444444444444444444444444444" as const;
const CLAIM_TRANSACTION_HASH = `0x${"9".repeat(64)}` as const;
const RESPONSE_TRANSACTION_HASH = `0x${"8".repeat(64)}` as const;
const RULING_TRANSACTION_HASH = `0x${"6".repeat(64)}` as const;
const CLAIM_TRANSACTION_COUNT_KEY = "openescrow:test:claim-transaction-writes";
const RESPONSE_TRANSACTION_COUNT_KEY =
  "openescrow:test:response-transaction-writes";
const RULING_TRANSACTION_COUNT_KEY =
  "openescrow:test:ruling-transaction-writes";

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

export function useAccount() {
  return { address: selectedAddress() };
}

export function useReadContract(parameters: { functionName?: string }) {
  switch (parameters.functionName) {
    case "tenantShareBps":
      return { data: 10_000n };
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
    writeContract: () => {
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
