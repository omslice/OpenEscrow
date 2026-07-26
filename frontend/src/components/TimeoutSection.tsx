import { useAccount, useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { useNow } from "../lib/useNow";
import type { Agreement } from "../lib/useAgreement";
import { negotiationAction, type NegotiationAccess } from "../lib/negotiations";
import { TxButton } from "./TxButton";

/**
 * Nothing in OpenEscrow executes automatically at a deadline (spec §4) - every one of
 * these requires an explicit transaction from an authorized party. These buttons only
 * render once their deadline has actually passed, since calling early would just revert.
 */
export function TimeoutSection({
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
  const now = useNow();
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const recordTimeout = (
    timeout: "no_claim_refund" | "no_response_dispute" | "arbiter_timeout_refund",
    transactionHash: `0x${string}`,
  ) => {
    if (negotiationAccess) {
      void negotiationAction(negotiationAccess, {
        type: "timeout_executed",
        timeout,
        transactionHash,
      });
    }
    onRefetch?.();
  };

  if (agreement.phase === Phase.Active && isTenant && now >= Number(agreement.claimSubmissionDeadline)) {
    return (
      <div className="action-section">
        <h3>No claim was submitted</h3>
        <p className="hint">
          The claim window closed with no claim, so the full deposit is now refundable.
          Complete the onchain settlement; each tenant can then withdraw their approved share.
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="withdrawNoClaim"
          args={[id]}
          label="Finalize tenant refund"
          onSuccess={(transactionHash) => recordTimeout("no_claim_refund", transactionHash)}
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
          onSuccess={(transactionHash) => recordTimeout("no_response_dispute", transactionHash)}
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
          onSuccess={(transactionHash) =>
            recordTimeout("arbiter_timeout_refund", transactionHash)
          }
        />
      </div>
    );
  }

  return null;
}
