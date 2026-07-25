import { useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, ZERO_ADDRESS } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import {
  negotiationAction,
  type NegotiationAccess,
} from "../lib/negotiations";

type Mode = "accept" | "partial" | "dispute";

export function ResponseSection({
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
  const [mode, setMode] = useState<Mode>("accept");
  const [partialAmount, setPartialAmount] = useState("");
  const [note, setNote] = useState("");

  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  if (!isTenant || agreement.phase !== Phase.ClaimOpen) return null;

  const claimed = agreement.claimedAmount;
  let accepted: bigint;
  if (mode === "accept") accepted = claimed;
  else if (mode === "dispute") accepted = 0n;
  else {
    try {
      accepted = parseUSDC(partialAmount || "0");
    } catch {
      accepted = -1n;
    }
  }
  const validAmount = accepted >= 0n && accepted <= claimed;

  return (
    <div className="action-section">
      <h3>Respond to claim</h3>
      <p className="hint">
        Landlord claimed {formatUSDC(claimed)} ytUSDC shares. Whatever you don't accept becomes
        disputed, not paid to the landlord automatically—even if you never respond.
        {agreement.arbiter === ZERO_ADDRESS
          ? " Because no arbiter was preselected, both parties may mutually appoint one during the fixed ruling window."
          : " The accepted arbiter can rule on the disputed portion."}
      </p>
      <div className="radio-row">
        <label>
          <input type="radio" checked={mode === "accept"} onChange={() => setMode("accept")} /> Accept in full
        </label>
        <label>
          <input type="radio" checked={mode === "partial"} onChange={() => setMode("partial")} /> Accept partially
        </label>
        <label>
          <input type="radio" checked={mode === "dispute"} onChange={() => setMode("dispute")} /> Dispute in full
        </label>
      </div>
      {mode === "partial" && (
        <label>
          Amount to accept (USDC, rest becomes disputed)
          <input
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
            type="number"
            min="0"
            step="0.000001"
          />
        </label>
      )}
      <label>
        Tenant response note (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Briefly explain your approval or the reason for your dispute."
          rows={3}
        />
      </label>
      <TxButton
        address={OPEN_ESCROW_ADDRESS}
        abi={OpenEscrowABI}
        functionName="respondToClaim"
        args={[id, accepted >= 0n ? accepted : 0n]}
        label={
          mode === "accept"
            ? "Approve deduction"
            : mode === "dispute"
              ? "Dispute deduction"
              : "Approve partial amount and dispute remainder"
        }
        disabled={!validAmount}
        onSuccess={(transactionHash) => {
          onRefetch?.();
          if (!negotiationAccess || negotiationAccess.role !== "tenant") return;
          void negotiationAction(negotiationAccess, {
            type: "claim_response",
            decision: mode === "accept" ? "approve" : mode,
            acceptedAmount: formatUSDC(accepted),
            note: note.trim(),
            transactionHash,
          });
        }}
      />
    </div>
  );
}
