import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { useNow } from "../lib/useNow";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

/**
 * Nothing in OpenEscrow executes automatically at a deadline (spec §4) - every one of
 * these requires an explicit transaction from someone. These buttons only render once
 * their deadline has actually passed, since calling early would just revert.
 */
export function TimeoutSection({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const now = useNow();
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();

  if (agreement.phase === Phase.Active && isTenant && now >= Number(agreement.claimSubmissionDeadline)) {
    return (
      <div className="action-section">
        <h3>No claim was submitted</h3>
        <p className="hint">The claim window has closed with no claim. You can withdraw the full deposit.</p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="withdrawNoClaim"
          args={[id]}
          label="Withdraw full deposit"
          onSuccess={onRefetch}
        />
      </div>
    );
  }

  if (agreement.phase === Phase.ClaimOpen && now >= Number(agreement.responseDeadline)) {
    return (
      <div className="action-section">
        <h3>Response window has closed</h3>
        <p className="hint">
          The tenant never responded. Anyone can trigger this—it creates a dispute and never pays
          the landlord automatically. If no arbiter is appointed and rules in time, the disputed
          balance defaults to the tenant.
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="finalizeNoResponse"
          args={[id]}
          label="Escalate to dispute"
          onSuccess={onRefetch}
        />
      </div>
    );
  }

  if (agreement.phase === Phase.Disputed && now >= Number(agreement.arbiterRulingDeadline)) {
    return (
      <div className="action-section">
        <h3>Arbiter ruling window has closed</h3>
        <p className="hint">
          The arbiter never ruled. Anyone can trigger this - the entire disputed amount defaults to the
          tenant.
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="claimArbiterTimeout"
          args={[id]}
          label="Send disputed funds to tenant"
          onSuccess={onRefetch}
        />
      </div>
    );
  }

  return null;
}
