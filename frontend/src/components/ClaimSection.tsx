import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import {
  buildNegotiationInviteUrl,
  loadNegotiation,
  negotiationAction,
  readLandlordBundle,
  sendClaimNotification,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import { useEvidenceInputs } from "./EvidenceInputs";

const CATEGORY_LABEL: Record<string, string> = {
  "10": "Unpaid rent",
  "11": "Damage beyond ordinary wear",
  "12": "Cleaning",
  "13": "Utilities or other unpaid charges",
  "14": "Other documented deduction",
};

export function ClaimSection({
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
  const { fields, contentHash, uri, valid } = useEvidenceInputs(negotiationAccess);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("10");
  const [note, setNote] = useState("");
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [claimRecorded, setClaimRecorded] = useState(false);
  const [noticeCopied, setNoticeCopied] = useState(false);
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null);
  const evidenceType = Number(category);

  useEffect(() => {
    if (!negotiationAccess || negotiationAccess.role !== "landlord") return;
    void loadNegotiation(negotiationAccess).then(setRecord);
  }, [negotiationAccess]);

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  if (!isLandlord) return null;

  let amountRaw: bigint | null = null;
  try {
    amountRaw = amount ? parseUSDC(amount) : null;
  } catch {
    amountRaw = null;
  }

  function recordClaim(transactionHash: `0x${string}`, amended = false) {
    onRefetch?.();
    if (!negotiationAccess || negotiationAccess.role !== "landlord" || amountRaw === null) return;
    const action = amended
      ? {
          type: "claim_amended" as const,
          amount,
          note: note.trim(),
          evidenceUri: uri,
          evidenceHash: contentHash,
          transactionHash,
        }
      : {
          type: "claim_submitted" as const,
          amount,
          category: CATEGORY_LABEL[category] || "Other documented deduction",
          note: note.trim(),
          evidenceUri: uri,
          evidenceHash: contentHash,
          transactionHash,
        };
    void negotiationAction(negotiationAccess, action).then((updated) => {
      setRecord(updated);
      setClaimRecorded(true);
    });
  }

  function tenantNotice() {
    if (!negotiationAccess || !record) return null;
    const bundle = readLandlordBundle();
    if (!bundle || bundle.proposalId !== negotiationAccess.proposalId) return null;
    const reviewUrl = buildNegotiationInviteUrl(
      "tenant",
      negotiationAccess.proposalId,
      bundle.access.tenant,
    );
    const subject = `OpenEscrow deduction claim for agreement #${id}`;
    const claimAmount = amount || formatUSDC(agreement.claimedAmount);
    const body = [
      `A deduction claim of ${claimAmount} shares has been submitted for OpenEscrow agreement #${id}.`,
      "",
      note.trim() ? `Landlord note: ${note.trim()}` : "",
      uri ? `Invoice / evidence: ${uri}` : "",
      "",
      `Review the documentation, add a note, and approve or dispute the claim here: ${reviewUrl}`,
      "",
      "Your decision and all related actions will be included in the timestamped agreement record.",
    ].filter(Boolean).join("\n");
    return {
      body,
      reviewUrl,
      gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(record.tenantEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    };
  }

  function recordNotice(method: "gmail" | "copy") {
    if (!negotiationAccess) return;
    void negotiationAction(negotiationAccess, {
      type: "claim_notification_prepared",
      method,
    }).then(setRecord);
  }

  const notice = tenantNotice();
  const showNotice = agreement.phase === Phase.ClaimOpen || claimRecorded;

  if (agreement.phase === Phase.Active) {
    return (
      <div className="action-section">
        <h3>Submit a documented deduction claim</h3>
        <p className="hint">
          Only the landlord can initiate a deduction. The claimed amount remains subject to the
          tenant’s approve-or-dispute response and, if disputed, the appointed arbiter process.
          Whatever you do not claim becomes immediately withdrawable by the tenant.
        </p>
        <label>
          Deduction category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Claim amount (shares, max {formatUSDC(agreement.depositAmount)})
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.000001" />
        </label>
        <label>
          Landlord claim note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Briefly explain the deduction and how the invoice supports it."
            rows={3}
          />
        </label>
        {fields}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="submitClaim"
          args={amountRaw !== null ? [id, amountRaw, contentHash, uri, evidenceType] : [id, 0n, contentHash, uri, evidenceType]}
          label="Submit documented deduction claim"
          disabled={!valid || amountRaw === null || amountRaw <= 0n || amountRaw > agreement.depositAmount}
          onSuccess={(transactionHash) => recordClaim(transactionHash)}
        />
        {showNotice && notice && (
          <div className="claim-notice-actions">
            <strong>Notify the tenant</strong>
            <div className="button-row">
              {negotiationAccess && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    setNoticeStatus(null);
                    try {
                      await sendClaimNotification(negotiationAccess, {
                        reviewUrl: notice.reviewUrl,
                        agreementId: id.toString(),
                        amount: amount || formatUSDC(agreement.claimedAmount),
                        note: note.trim(),
                        evidenceUri: uri,
                      });
                      setNoticeStatus("Tenant claim email sent and added to the record.");
                      setRecord(await loadNegotiation(negotiationAccess));
                    } catch (emailError) {
                      setNoticeStatus(
                        emailError instanceof Error
                          ? emailError.message
                          : "Automatic email could not be sent. Use the Gmail fallback.",
                      );
                    }
                  }}
                >
                  Send tenant email
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  window.open(notice.gmailUrl, "_blank", "noopener,noreferrer");
                  recordNotice("gmail");
                }}
              >
                Open claim notice in Gmail
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(notice.body);
                  setNoticeCopied(true);
                  recordNotice("copy");
                }}
              >
                {noticeCopied ? "Claim notice copied" : "Copy claim notice"}
              </button>
            </div>
            {noticeStatus && <p className={noticeStatus.includes("sent") ? "tx-success" : "tx-error"}>{noticeStatus}</p>}
          </div>
        )}
      </div>
    );
  }

  if (agreement.phase === Phase.ClaimOpen && !agreement.claimAmended) {
    return (
      <div className="action-section">
        <h3>Amend deduction claim (one time)</h3>
        <p className="hint">
          You may only lower the current {formatUSDC(agreement.claimedAmount)}-share claim. The
          original tenant response deadline does not move.
        </p>
        <label>
          New claim amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.000001" />
        </label>
        <label>
          Amendment note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </label>
        {fields}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="amendClaim"
          args={amountRaw !== null ? [id, amountRaw, contentHash, uri, 1] : [id, 0n, contentHash, uri, 1]}
          label="Submit documented amendment"
          disabled={!valid || amountRaw === null || amountRaw > agreement.claimedAmount}
          onSuccess={(transactionHash) => recordClaim(transactionHash, true)}
        />
        {notice && (
          <div className="claim-notice-actions">
            <strong>Notify the tenant about the current claim</strong>
            <div className="button-row">
              {negotiationAccess && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    setNoticeStatus(null);
                    try {
                      await sendClaimNotification(negotiationAccess, {
                        reviewUrl: notice.reviewUrl,
                        agreementId: id.toString(),
                        amount: amount || formatUSDC(agreement.claimedAmount),
                        note: note.trim(),
                        evidenceUri: uri,
                      });
                      setNoticeStatus("Tenant claim email sent and added to the record.");
                      setRecord(await loadNegotiation(negotiationAccess));
                    } catch (emailError) {
                      setNoticeStatus(
                        emailError instanceof Error
                          ? emailError.message
                          : "Automatic email could not be sent. Use the Gmail fallback.",
                      );
                    }
                  }}
                >
                  Send tenant email
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  window.open(notice.gmailUrl, "_blank", "noopener,noreferrer");
                  recordNotice("gmail");
                }}
              >
                Open notice in Gmail
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(notice.body);
                  setNoticeCopied(true);
                  recordNotice("copy");
                }}
              >
                {noticeCopied ? "Claim notice copied" : "Copy claim notice"}
              </button>
            </div>
            {noticeStatus && <p className={noticeStatus.includes("sent") ? "tx-success" : "tx-error"}>{noticeStatus}</p>}
          </div>
        )}
      </div>
    );
  }

  return null;
}
