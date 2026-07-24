import { useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

type Mode = "accept" | "partial" | "dispute";

export function ResponseSection({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>("accept");
  const [partialAmount, setPartialAmount] = useState("");

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
        Landlord claimed {formatUSDC(claimed)} USDC. Whatever you don't accept becomes disputed and goes
        to your arbiter, not the landlord automatically - even if you never respond at all (spec §6).
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
      <TxButton
        address={OPEN_ESCROW_ADDRESS}
        abi={OpenEscrowABI}
        functionName="respondToClaim"
        args={[id, accepted >= 0n ? accepted : 0n]}
        label="Submit response"
        disabled={!validAmount}
        onSuccess={onRefetch}
      />
    </div>
  );
}
