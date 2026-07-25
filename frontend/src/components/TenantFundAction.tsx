import { useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { MockUSDCABI, OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, YIELD_USDC_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function TenantFundAction({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPEN_ESCROW_ADDRESS] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund, refetchInterval: 4000 },
  });

  const { writeContract: approve, data: approveHash, isPending: approving } = useWriteContract();
  const { isLoading: approveMining, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Refetch once the approve tx is actually mined, not merely submitted - the
  // periodic refetchInterval above is only a backstop in case this misses a beat.
  useEffect(() => {
    if (approveConfirmed) refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);

  if (agreement.phase !== Phase.ReadyToFund) return null;
  if (!isTenant) return null;

  const needed = agreement.agreedAmount;
  const tokenLabel = agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase() ? "ytUSDC" : "testUSDC";
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;

  return (
    <div className="action-section">
      <h3>Fund this agreement</h3>
      <p className="hint">
        Depositing {formatUSDC(needed)} {tokenLabel}
        {tokenLabel === "ytUSDC" ? " shares. The dashboard will show their growing testUSDC value" : ""}
        . Approve the token spend, then fund; acceptance and funding happen in the same transaction.
      </p>
      {!hasAllowance ? (
        <button
          className="btn btn-primary"
          disabled={approving || approveMining}
          onClick={() =>
            approve({
              address: agreement.token,
              abi: MockUSDCABI,
              functionName: "approve",
              args: [OPEN_ESCROW_ADDRESS, needed],
            })
          }
        >
          {approving ? "Confirm in wallet..." : approveMining ? "Mining..." : `1. Approve ${formatUSDC(needed)} ${tokenLabel}`}
        </button>
      ) : (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="tenantAcceptAndFund"
          args={[id]}
          label="2. Accept and fund"
          onSuccess={onRefetch}
        />
      )}
    </div>
  );
}
