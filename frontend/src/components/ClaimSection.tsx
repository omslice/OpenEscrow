import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import {
  buildNegotiationInviteUrl,
  loadNegotiation,
  negotiationAction,
  readLandlordBundle,
  sendClaimNotification,
  type DeductionLineItem,
  type NegotiationAction,
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
const CATEGORY_VALUE = Object.fromEntries(
  Object.entries(CATEGORY_LABEL).map(([value, label]) => [label, value]),
);

const EMPTY_ITEM: DeductionLineItem = {
  category: "11",
  description: "",
  amount: "",
};

function itemAmounts(items: DeductionLineItem[]) {
  try {
    const amounts = items.map((item) => parseUSDC(item.amount));
    return {
      total: amounts.reduce((sum, value) => sum + value, 0n),
      valid: items.every((item, index) => item.description.trim() && amounts[index] >= 0n),
    };
  } catch {
    return { total: null, valid: false };
  }
}

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
  const [items, setItems] = useState<DeductionLineItem[]>([{ ...EMPTY_ITEM }]);
  const [note, setNote] = useState("");
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [claimRecorded, setClaimRecorded] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<NegotiationAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [noticeCopied, setNoticeCopied] = useState(false);
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null);
  const restoredClaim = useRef(false);

  useEffect(() => {
    if (!negotiationAccess || negotiationAccess.role !== "landlord") return;
    void loadNegotiation(negotiationAccess).then(setRecord);
  }, [negotiationAccess]);

  useEffect(() => {
    if (!record || restoredClaim.current || agreement.phase !== Phase.ClaimOpen) return;
    const priorClaim = [...record.events]
      .reverse()
      .find(
        (event) =>
          event.action === "deduction_claim_submitted" ||
          event.action === "deduction_claim_amended",
      );
    const priorItems = priorClaim?.metadata?.items;
    if (Array.isArray(priorItems) && priorItems.length > 0) {
      setItems(
        priorItems.map((item) => {
          const candidate = item as Partial<DeductionLineItem>;
          return {
            category:
              typeof candidate.category === "string"
                ? CATEGORY_VALUE[candidate.category] || candidate.category
                : "14",
            description:
              typeof candidate.description === "string" ? candidate.description : "",
            amount: typeof candidate.amount === "string" ? candidate.amount : "",
          };
        }),
      );
    }
    restoredClaim.current = true;
  }, [agreement.phase, record]);

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  if (!isLandlord) return null;

  const { total: amountRaw, valid: itemsValid } = itemAmounts(items);
  const amount = amountRaw === null ? "" : formatUSDC(amountRaw);
  const evidenceType =
    items.length === 1 ? Number(items[0].category) : Number("14");

  function updateItem(index: number, patch: Partial<DeductionLineItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function addItem() {
    setItems((current) => [...current, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveClaimRecord(action: NegotiationAction) {
    if (!negotiationAccess || negotiationAccess.role !== "landlord") return;
    setRecordError(null);
    try {
      const updated = await negotiationAction(negotiationAccess, action);
      setRecord(updated);
      setClaimRecorded(true);
      setPendingRecord(null);
      onRefetch?.();
    } catch (cause) {
      setRecordError(
        cause instanceof Error
          ? `The onchain claim succeeded, but its activity record still needs to be saved: ${cause.message}`
          : "The onchain claim succeeded, but its activity record still needs to be saved.",
      );
    }
  }

  function recordClaim(transactionHash: `0x${string}`, amended = false) {
    if (!negotiationAccess || negotiationAccess.role !== "landlord" || amountRaw === null) return;
    const action: NegotiationAction = amended
      ? {
          type: "claim_amended" as const,
          amount,
          items,
          note: note.trim(),
          evidenceUri: uri,
          evidenceHash: contentHash,
          transactionHash,
        }
      : {
          type: "claim_submitted" as const,
          amount,
          category:
            items.length === 1
              ? CATEGORY_LABEL[items[0].category] || "Other documented deduction"
              : "Itemized deductions",
          items,
          note: note.trim(),
          evidenceUri: uri,
          evidenceHash: contentHash,
          transactionHash,
        };
    setPendingRecord(action);
    void saveClaimRecord(action);
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
    const itemSummary = items.map(
      (item, index) =>
        `${index + 1}. ${CATEGORY_LABEL[item.category] || "Other"} — ${item.description.trim()} (${item.amount || "0"} shares)`,
    );
    const body = [
      `A deduction claim of ${claimAmount} shares has been submitted for OpenEscrow agreement #${id}.`,
      "",
      "Itemized deductions:",
      ...itemSummary,
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

  const itemEditor = (
    <div className="claim-line-items">
      <div className="claim-line-items-heading">
        <div>
          <strong>Itemized deductions</strong>
          <p className="field-help">
            Separate each charge so the tenant and arbiter can review what the total represents.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={addItem}
          disabled={items.length >= 20}
        >
          Add line item
        </button>
      </div>
      {items.map((item, index) => (
        <fieldset className="claim-line-item" key={index}>
          <legend>Deduction {index + 1}</legend>
          <label>
            Category
            <select
              value={item.category}
              onChange={(event) => updateItem(index, { category: event.target.value })}
            >
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              value={item.description}
              onChange={(event) => updateItem(index, { description: event.target.value })}
              placeholder="What was damaged or unpaid, and why this amount is being claimed."
              rows={2}
            />
          </label>
          <label>
            Amount (shares)
            <input
              value={item.amount}
              onChange={(event) => updateItem(index, { amount: event.target.value })}
              type="number"
              min="0"
              step="0.000001"
            />
          </label>
          {items.length > 1 && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => removeItem(index)}
            >
              Remove line item
            </button>
          )}
        </fieldset>
      ))}
      <div className="claim-total">
        <span>Claim total</span>
        <strong>{amountRaw === null ? "Enter valid amounts" : `${amount} shares`}</strong>
      </div>
    </div>
  );

  function recordNotice(method: "gmail" | "copy") {
    if (!negotiationAccess) return;
    void negotiationAction(negotiationAccess, {
      type: "claim_notification_prepared",
      method,
    }).then(setRecord);
  }

  const notice = tenantNotice();
  const showNotice = agreement.phase === Phase.ClaimOpen || claimRecorded;
  const recordRecovery = pendingRecord && recordError && (
    <div className="receipt-recovery">
      <p className="tx-error">{recordError}</p>
      <button
        className="btn btn-ghost small"
        type="button"
        onClick={() => void saveClaimRecord(pendingRecord)}
      >
        Retry saving claim receipt
      </button>
    </div>
  );

  if (agreement.phase === Phase.Active) {
    return (
      <div className="action-section">
        <h3>Submit a documented deduction claim</h3>
        <p className="hint">
          Only the landlord can initiate a deduction. The claimed amount remains subject to the
          tenant’s approve-or-dispute response and, if disputed, the appointed arbiter process.
          Whatever you do not claim becomes immediately withdrawable by the tenant.
        </p>
        {itemEditor}
        <p className="field-help">
          Maximum total: {formatUSDC(agreement.depositAmount)} shares.
        </p>
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
          disabled={
            !valid ||
            !itemsValid ||
            amountRaw === null ||
            amountRaw <= 0n ||
            amountRaw > agreement.depositAmount
          }
          onSuccess={(transactionHash) => recordClaim(transactionHash)}
        />
        {recordRecovery}
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
                        items,
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
        {itemEditor}
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
          disabled={
            !valid ||
            !itemsValid ||
            amountRaw === null ||
            amountRaw > agreement.claimedAmount
          }
          onSuccess={(transactionHash) => recordClaim(transactionHash, true)}
        />
        {recordRecovery}
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
                        items,
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
