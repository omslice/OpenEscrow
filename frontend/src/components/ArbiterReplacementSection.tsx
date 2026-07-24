import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { shortAddr } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

const REPLACEABLE = new Set<number>([Phase.ReadyToFund, Phase.Active, Phase.ClaimOpen, Phase.Disputed]);

/**
 * Mutual-consent arbiter replacement (spec decision 5): either party proposes, the
 * *other* party confirms, then the nominee accepts. arbiterRulingDeadline is never
 * touched by this, even mid-dispute - replacing an arbiter can never extend how long
 * funds stay locked.
 */
export function ArbiterReplacementSection({ id, agreement }: { id: bigint; agreement: Agreement }) {
  const { address } = useAccount();
  const [candidate, setCandidate] = useState("");

  if (!REPLACEABLE.has(agreement.phase)) return null;

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  const isArbiter = address?.toLowerCase() === agreement.arbiter.toLowerCase();
  if (!isLandlord && !isTenant && !isArbiter) return null;

  const hasPending = agreement.pendingArbiter !== "0x0000000000000000000000000000000000000000";
  const isProposer = address?.toLowerCase() === agreement.pendingArbiterProposer.toLowerCase();
  const isPendingArbiter = address?.toLowerCase() === agreement.pendingArbiter.toLowerCase();

  return (
    <div className="action-section">
      <h3>Arbiter replacement (mutual consent)</h3>
      {isArbiter && !hasPending && (
        <p className="hint">You may resign; a replacement still requires both parties' agreement.</p>
      )}
      {isArbiter && !hasPending && (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="resignAsArbiter"
          args={[id]}
          label="Resign as arbiter"
          className="btn btn-ghost"
        />
      )}

      {!hasPending && (isLandlord || isTenant) && (
        <>
          <p className="hint">Propose a new arbiter. The other party (not you) must confirm before it can take effect.</p>
          <label>
            New arbiter address
            <input value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="0x..." />
          </label>
          <TxButton
            address={OPEN_ESCROW_ADDRESS}
            abi={OpenEscrowABI}
            functionName="proposeArbiterReplacement"
            args={[id, candidate]}
            label="Propose replacement"
            disabled={
              !isAddress(candidate) ||
              candidate.toLowerCase() === agreement.landlord.toLowerCase() ||
              candidate.toLowerCase() === agreement.tenant.toLowerCase()
            }
          />
        </>
      )}

      {hasPending && (
        <div>
          <p className="hint">
            Pending replacement: {shortAddr(agreement.pendingArbiter)}, proposed by{" "}
            {shortAddr(agreement.pendingArbiterProposer)}
            {agreement.pendingArbiterConfirmed ? " - confirmed, awaiting nominee's acceptance." : " - awaiting the other party's confirmation."}
          </p>
          <div className="button-row">
            {(isLandlord || isTenant) && !isProposer && !agreement.pendingArbiterConfirmed && (
              <TxButton
                address={OPEN_ESCROW_ADDRESS}
                abi={OpenEscrowABI}
                functionName="confirmArbiterReplacement"
                args={[id]}
                label="Confirm replacement"
              />
            )}
            {isProposer && (
              <TxButton
                address={OPEN_ESCROW_ADDRESS}
                abi={OpenEscrowABI}
                functionName="cancelArbiterReplacementProposal"
                args={[id]}
                label="Cancel proposal"
                className="btn btn-ghost"
              />
            )}
            {isPendingArbiter && agreement.pendingArbiterConfirmed && (
              <TxButton
                address={OPEN_ESCROW_ADDRESS}
                abi={OpenEscrowABI}
                functionName="acceptArbiterRole"
                args={[id]}
                label="Accept arbiter role"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
