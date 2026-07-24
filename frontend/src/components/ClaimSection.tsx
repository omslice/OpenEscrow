import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import { useEvidenceInputs } from "./EvidenceInputs";
import { useState } from "react";

export function ClaimSection({ id, agreement }: { id: bigint; agreement: Agreement }) {
  const { address } = useAccount();
  const { fields, contentHash, uri, valid } = useEvidenceInputs();
  const [amount, setAmount] = useState("");

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  if (!isLandlord) return null;

  let amountRaw: bigint | null = null;
  try {
    amountRaw = amount ? parseUSDC(amount) : null;
  } catch {
    amountRaw = null;
  }

  if (agreement.phase === Phase.Active) {
    return (
      <div className="action-section">
        <h3>Submit a claim</h3>
        <p className="hint">
          Deposit is {formatUSDC(agreement.depositAmount)} USDC. Whatever you don't claim becomes
          withdrawable by the tenant immediately (spec §6/§9).
        </p>
        <label>
          Claim amount (USDC, max {formatUSDC(agreement.depositAmount)})
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.000001" />
        </label>
        {fields}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="submitClaim"
          args={amountRaw !== null ? [id, amountRaw, contentHash, uri, 0] : [id, 0n, contentHash, uri, 0]}
          label="Submit claim"
          disabled={!valid || amountRaw === null || amountRaw <= 0n || amountRaw > agreement.depositAmount}
        />
      </div>
    );
  }

  if (agreement.phase === Phase.ClaimOpen && !agreement.claimAmended) {
    return (
      <div className="action-section">
        <h3>Amend claim (one-time only)</h3>
        <p className="hint">
          Current claimed amount: {formatUSDC(agreement.claimedAmount)} USDC. You may only lower this
          figure, never raise it, and this is the only amendment this agreement will ever allow (spec
          decision 2). It will not extend the tenant's response deadline. Setting the new amount to 0
          retracts the claim entirely.
        </p>
        <label>
          New claim amount (USDC, max {formatUSDC(agreement.claimedAmount)})
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.000001" />
        </label>
        {fields}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="amendClaim"
          args={amountRaw !== null ? [id, amountRaw, contentHash, uri, 1] : [id, 0n, contentHash, uri, 1]}
          label="Amend claim"
          disabled={!valid || amountRaw === null || amountRaw > agreement.claimedAmount}
        />
      </div>
    );
  }

  return null;
}
