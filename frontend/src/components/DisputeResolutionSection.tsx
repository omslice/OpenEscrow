import { useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import { EvidenceList } from "./EvidenceList";
import {
  negotiationAction,
  type NegotiationAccess,
} from "../lib/negotiations";

export function DisputeResolutionSection({
  id,
  agreement,
  onRefetch,
  negotiationAccess,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
  negotiationAccess?: NegotiationAccess | null;
}) {
  const { address } = useAccount();
  const [award, setAward] = useState("");
  const [note, setNote] = useState("");

  const isArbiter = address?.toLowerCase() === agreement.arbiter.toLowerCase();
  if (!isArbiter || agreement.phase !== Phase.Disputed) return null;

  const disputed = agreement.locked;
  let awardRaw: bigint | null = null;
  try {
    awardRaw = award ? parseUSDC(award) : null;
  } catch {
    awardRaw = null;
  }
  const valid = awardRaw !== null && awardRaw >= 0n && awardRaw <= disputed;

  return (
    <div className="action-section">
      <h3>Resolve dispute</h3>
      <p className="hint">
        Disputed amount: {formatUSDC(disputed)} ytUSDC shares. Award any amount from 0 up to the full disputed
        amount to the landlord - the remainder goes to the tenant. You cannot award more than what's
        disputed (spec §8/§11).
      </p>
      <EvidenceList id={id} />
      <label>
        Award to landlord (ytUSDC shares, max {formatUSDC(disputed)})
        <input value={award} onChange={(e) => setAward(e.target.value)} type="number" min="0" step="0.000001" />
      </label>
      <label>
        Ruling note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Briefly explain how the submitted documentation supports this allocation."
          rows={3}
        />
      </label>
      <div className="button-row">
        <button className="btn btn-ghost" onClick={() => setAward("0")}>
          Set to 0 (all to tenant)
        </button>
        <button className="btn btn-ghost" onClick={() => setAward(formatUSDC(disputed))}>
          Set to full disputed amount (all to landlord)
        </button>
      </div>
      <TxButton
        address={OPEN_ESCROW_ADDRESS}
        abi={OpenEscrowABI}
        functionName="resolveDispute"
        args={[id, awardRaw ?? 0n]}
        label="Submit ruling"
        disabled={!valid}
        onSuccess={(transactionHash) => {
          onRefetch?.();
          if (!negotiationAccess || negotiationAccess.role !== "arbiter" || awardRaw === null) return;
          void negotiationAction(negotiationAccess, {
            type: "arbiter_ruling",
            awardToLandlord: formatUSDC(awardRaw),
            note: note.trim(),
            transactionHash,
          });
        }}
      />
    </div>
  );
}
