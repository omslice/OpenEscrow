import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function ArbiterActions({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  if (agreement.phase !== Phase.Proposed) return null;
  if (address?.toLowerCase() !== agreement.arbiter.toLowerCase()) return null;

  return (
    <div className="action-section">
      <h3>Arbiter action required</h3>
      <p className="hint">
        You've been nominated as the arbiter for this agreement. Funds cannot move into escrow until
        you accept (spec decision 4).
      </p>
      <div className="button-row">
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="acceptArbiterRole"
          args={[id]}
          label="Accept arbiter role"
          onSuccess={onRefetch}
        />
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="declineArbiterRole"
          args={[id]}
          label="Decline"
          className="btn btn-ghost"
          onSuccess={onRefetch}
        />
      </div>
    </div>
  );
}
