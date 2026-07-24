import { useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";

// Mirrors contracts/OpenEscrow.sol's Agreement struct field order exactly.
export interface Agreement {
  landlord: `0x${string}`;
  arbiterAccepted: boolean;
  arbiterResigned: boolean;
  claimAmended: boolean;
  pendingArbiterConfirmed: boolean;
  tenant: `0x${string}`;
  phase: number;
  closeReason: number;
  arbiter: `0x${string}`;
  pendingArbiter: `0x${string}`;
  pendingArbiterProposer: `0x${string}`;
  agreedAmount: bigint;
  depositAmount: bigint;
  claimWindowStart: bigint;
  claimPeriod: bigint;
  responsePeriod: bigint;
  arbiterRulingPeriod: bigint;
  claimSubmissionDeadline: bigint;
  responseDeadline: bigint;
  disputeCreatedAt: bigint;
  arbiterRulingDeadline: bigint;
  claimedAmount: bigint;
  tenantWithdrawable: bigint;
  landlordWithdrawable: bigint;
  locked: bigint;
  withdrawn: bigint;
}

export function useAgreement(id: bigint | undefined) {
  const query = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "getAgreement",
    args: id !== undefined ? [id] : undefined,
    query: {
      enabled: id !== undefined,
      refetchInterval: 5000,
    },
  });

  const agreement = query.data as Agreement | undefined;
  const exists = !!agreement && agreement.phase !== 0;

  return { ...query, agreement, exists };
}
