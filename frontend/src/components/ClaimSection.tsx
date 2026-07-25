import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import { useEvidenceInputs } from "./EvidenceInputs";
import { useState } from "react";

export function ClaimSection({
  id,
  agreement,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const { fields, contentHash, uri, valid } = useEvidenceInputs();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("10");
  const evidenceType = Number(category);

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
          Deposit is {formatUSDC(agreement.depositAmount)} ytUSDC shares. Whatever you don't claim
          becomes withdrawable by the tenant immediately.
        </p>
        <label>
          Deduction category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="10">Unpaid rent</option>
            <option value="11">Damage beyond ordinary wear</option>
            <option value="12">Cleaning</option>
            <option value="13">Utilities or other unpaid charges</option>
            <option value="14">Other—requires explanation</option>
          </select>
        </label>
        <p className="field-help">
          This category is an itemization aid, not a legal determination. Permitted deductions and
          documentation requirements depend on the agreement's jurisdiction.
        </p>
        <label>
          Claim amount (ytUSDC shares, max {formatUSDC(agreement.depositAmount)})
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.000001" />
        </label>
        {fields}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="submitClaim"
          args={amountRaw !== null ? [id, amountRaw, contentHash, uri, evidenceType] : [id, 0n, contentHash, uri, evidenceType]}
          label="Submit claim"
          disabled={!valid || amountRaw === null || amountRaw <= 0n || amountRaw > agreement.depositAmount}
          onSuccess={onRefetch}
        />
      </div>
    );
  }

  if (agreement.phase === Phase.ClaimOpen && !agreement.claimAmended) {
    return (
      <div className="action-section">
        <h3>Amend claim (one-time only)</h3>
        <p className="hint">
          Current claimed amount: {formatUSDC(agreement.claimedAmount)} shares. You may only lower this
          figure, never raise it, and this is the only amendment this agreement will ever allow (spec
          decision 2). It will not extend the tenant's response deadline. Setting the new amount to 0
          retracts the claim entirely.
        </p>
        <label>
          New claim amount (ytUSDC shares, max {formatUSDC(agreement.claimedAmount)})
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
          onSuccess={onRefetch}
        />
      </div>
    );
  }

  return null;
}
