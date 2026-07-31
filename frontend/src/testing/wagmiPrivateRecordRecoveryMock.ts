const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;

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
  return {
    writeContract: () => undefined,
    data: undefined,
    isPending: false,
    error: null,
    reset: () => undefined,
  };
}

export function useWaitForTransactionReceipt() {
  return {
    isLoading: false,
    isSuccess: false,
    error: null,
  };
}
