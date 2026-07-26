import { useAccount, useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { negotiationAction, type NegotiationAccess } from "../lib/negotiations";
import { TxButton } from "./TxButton";

export function WithdrawSection({
  id,
  agreement,
  negotiationAccess,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: tenantCredit } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantWithdrawableByAddress",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  if (!address) return null;

  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const isLandlord = address.toLowerCase() === agreement.landlord.toLowerCase();
  const credited = isTenant
    ? typeof tenantCredit === "bigint"
      ? tenantCredit
      : 0n
    : isLandlord
      ? agreement.landlordWithdrawable
      : 0n;

  if (!isTenant && !isLandlord) return null;
  if (credited === 0n) return null;
  const resolved =
    agreement.phase === Phase.Closed || agreement.phase === Phase.Cancelled;

  return (
    <div className="action-section">
      <h3>Withdraw</h3>
      <p className="hint">
        You have {formatUSDC(credited)} USDC allocated to you on this agreement.{" "}
        {resolved
          ? "The claim process is complete, so this balance is available to withdraw."
          : "This balance remains protected in escrow until the deduction claim and any dispute are fully resolved."}
      </p>
      {resolved ? (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="withdraw"
          args={[id]}
          label={`Withdraw ${formatUSDC(credited)} USDC`}
          onSuccess={(transactionHash) => {
            if (negotiationAccess) {
              void negotiationAction(negotiationAccess, {
                type: "withdrawal_completed",
                amount: formatUSDC(credited),
                transactionHash,
              });
            }
            onRefetch?.();
          }}
        />
      ) : (
        <button className="btn btn-secondary" type="button" disabled>
          Withdrawal locked until resolution
        </button>
      )}
    </div>
  );
}
