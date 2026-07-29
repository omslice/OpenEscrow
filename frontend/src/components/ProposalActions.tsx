import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function ProposalActions({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const [newArbiter, setNewArbiter] = useState("");

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  const isPreFunding = agreement.phase === Phase.Proposed || agreement.phase === Phase.ReadyToFund;
  if (!isLandlord || !isPreFunding) return null;

  const validCandidate =
    isAddress(newArbiter) &&
    newArbiter.toLowerCase() !== agreement.landlord.toLowerCase() &&
    newArbiter.toLowerCase() !== agreement.tenant.toLowerCase();

  return (
    <div className="action-section">
      <h3>Manage proposal</h3>
      <p className="hint">
        {ARBITER_UI_ENABLED
          ? "Nominate a different neutral arbiter, or cancel before a tenant funds. Renomination resets any prior acceptance or decline."
          : "You can cancel this onchain proposal before any tenant funds it."}
      </p>
      {ARBITER_UI_ENABLED && (
        <>
          <label>
            New arbiter address
            <input value={newArbiter} onChange={(event) => setNewArbiter(event.target.value)} placeholder="0x..." />
          </label>
          {newArbiter.length > 0 && !validCandidate && (
            <p className="tx-error" role="alert">Enter a valid address that is different from the landlord and tenant.</p>
          )}
        </>
      )}
      <div className="button-row">
        {ARBITER_UI_ENABLED && (
          <TxButton
            address={OPEN_ESCROW_ADDRESS}
            abi={OpenEscrowABI}
            functionName="renominateArbiter"
            args={[id, newArbiter]}
            label="Nominate new arbiter"
            disabled={!validCandidate}
            onSuccess={() => {
              setNewArbiter("");
              onRefetch?.();
            }}
          />
        )}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="cancelProposal"
          args={[id]}
          label="Cancel proposal"
          className="btn btn-ghost"
          onSuccess={onRefetch}
        />
      </div>
    </div>
  );
}
