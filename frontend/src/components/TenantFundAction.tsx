import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { MockUSDCABI, OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, USDC_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function TenantFundAction({ id, agreement }: { id: bigint; agreement: Agreement }) {
  const { address } = useAccount();
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPEN_ESCROW_ADDRESS] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund, refetchInterval: 4000 },
  });

  const { writeContract: approve, data: approveHash, isPending: approving } = useWriteContract();
  const { isLoading: approveMining } = useWaitForTransactionReceipt({ hash: approveHash });

  if (agreement.phase !== Phase.ReadyToFund) return null;
  if (!isTenant) return null;

  const needed = agreement.agreedAmount;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;

  return (
    <div className="action-section">
      <h3>Fund this agreement</h3>
      <p className="hint">
        Depositing {formatUSDC(needed)} USDC. This is a two-step process: approve the token spend, then
        fund. Acceptance and funding happen in the same transaction (spec §6) - there's no separate
        "I agree but haven't paid" state.
      </p>
      {!hasAllowance ? (
        <button
          className="btn btn-primary"
          disabled={approving || approveMining}
          onClick={() =>
            approve(
              {
                address: USDC_ADDRESS,
                abi: MockUSDCABI,
                functionName: "approve",
                args: [OPEN_ESCROW_ADDRESS, needed],
              },
              { onSuccess: () => setTimeout(() => refetchAllowance(), 1500) },
            )
          }
        >
          {approving ? "Confirm in wallet..." : approveMining ? "Mining..." : `1. Approve ${formatUSDC(needed)} USDC`}
        </button>
      ) : (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="tenantAcceptAndFund"
          args={[id]}
          label="2. Accept and fund"
        />
      )}
    </div>
  );
}
