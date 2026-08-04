import { useState } from "react";

const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;
const CLAIM_TRANSACTION_HASH = `0x${"9".repeat(64)}` as const;
const CLAIM_TRANSACTION_COUNT_KEY = "openescrow:test:claim-transaction-writes";

function selectedAddress() {
  return new URLSearchParams(window.location.search).get("role") === "tenant"
    ? TENANT
    : LANDLORD;
}

export function useAccount() {
  return { address: selectedAddress() };
}

export function useReadContract(parameters: { functionName?: string }) {
  switch (parameters.functionName) {
    case "tenantShareBps":
      return { data: 10_000n };
    case "tenantClaimResponded":
      return { data: false };
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
      if (
        new URLSearchParams(window.location.search).get("tx") ===
        "claim-success"
      ) {
        const count = Number(
          window.sessionStorage.getItem(CLAIM_TRANSACTION_COUNT_KEY) || "0",
        );
        window.sessionStorage.setItem(
          CLAIM_TRANSACTION_COUNT_KEY,
          String(count + 1),
        );
        setData(CLAIM_TRANSACTION_HASH);
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
