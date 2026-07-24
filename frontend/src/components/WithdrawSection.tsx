import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function WithdrawSection({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  if (!address) return null;

  const isTenant = address.toLowerCase() === agreement.tenant.toLowerCase();
  const isLandlord = address.toLowerCase() === agreement.landlord.toLowerCase();
  const credited = isTenant ? agreement.tenantWithdrawable : isLandlord ? agreement.landlordWithdrawable : 0n;

  if (!isTenant && !isLandlord) return null;
  if (credited === 0n) return null;

  return (
    <div className="action-section">
      <h3>Withdraw</h3>
      <p className="hint">
        You have {formatUSDC(credited)} USDC credited to you on this agreement. Withdrawal is pull-based
        and available any time your balance is nonzero, independent of the agreement's overall phase.
      </p>
      <TxButton
        address={OPEN_ESCROW_ADDRESS}
        abi={OpenEscrowABI}
        functionName="withdraw"
        args={[id]}
        label={`Withdraw ${formatUSDC(credited)} USDC`}
        onSuccess={onRefetch}
      />
    </div>
  );
}
