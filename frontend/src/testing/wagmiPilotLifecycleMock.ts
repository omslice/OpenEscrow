import { useState } from "react";
import type { PilotLifecycleRole } from "./pilotLifecycleTypes";

const ADDRESSES: Record<PilotLifecycleRole, `0x${string}`> = {
  landlord: "0x1111111111111111111111111111111111111111",
  "tenant-one": "0x2222222222222222222222222222222222222222",
  "tenant-two": "0x3333333333333333333333333333333333333333",
  arbiter: "0x4444444444444444444444444444444444444444",
};

const TRANSACTION_HASHES: Record<string, `0x${string}`> = {
  "landlord:submitClaim": `0x${"1".repeat(64)}`,
  "tenant-one:respondToClaim": `0x${"2".repeat(64)}`,
  "tenant-two:respondToClaim": `0x${"3".repeat(64)}`,
  "arbiter:resolveDispute": `0x${"4".repeat(64)}`,
  "landlord:withdraw": `0x${"5".repeat(64)}`,
  "tenant-one:withdraw": `0x${"6".repeat(64)}`,
  "tenant-two:withdraw": `0x${"7".repeat(64)}`,
};

function state() {
  const current = window.__OPENESCROW_PILOT_LIFECYCLE__;
  if (!current) throw new Error("The pilot lifecycle state was not loaded.");
  return current;
}

function address() {
  return ADDRESSES[state().role];
}

export function useAccount() {
  return { address: address() };
}

export function useReadContract(parameters: { functionName?: string }) {
  const current = state();
  const result = (() => {
    switch (parameters.functionName) {
      case "tenantShareBps":
        return current.role === "tenant-one"
          ? 6_000n
          : current.role === "tenant-two"
            ? 4_000n
            : 0n;
      case "tenantWithdrawableByAddress":
        return BigInt(current.tenantWithdrawableMicros);
      case "tenantClaimResponded":
        return current.viewerResponded;
      case "claimResponseCount":
        return BigInt(current.responseCount);
      case "getTenantParticipants":
        return [
          [ADDRESSES["tenant-one"], ADDRESSES["tenant-two"]],
          [6_000, 4_000],
          [600_000_000n, 400_000_000n],
          [600_000_000n, 400_000_000n],
        ] as const;
      case "getEvidence":
        return [];
      case "ESCROW":
        return undefined;
      default:
        return undefined;
    }
  })();
  return {
    data: result,
    isPending: false,
    error: null,
    refetch: async () => ({ data: result }),
  };
}

export function useWriteContract() {
  const [data, setData] = useState<`0x${string}` | undefined>();
  return {
    writeContract: ({ functionName }: { functionName: string }) => {
      const key = `${state().role}:${functionName}`;
      const hash = TRANSACTION_HASHES[key];
      if (!hash) throw new Error(`Unexpected pilot transaction: ${key}`);
      setData(hash);
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

export function usePublicClient() {
  return null;
}
