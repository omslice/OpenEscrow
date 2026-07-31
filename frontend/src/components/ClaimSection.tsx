import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase } from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { formatUSDC, parseUSDC } from "../lib/format";
import { CALIFORNIA_POLICY } from "../lib/jurisdictions";
import {
  copyTextToClipboard,
  openExternalWindow,
} from "../lib/browserActions";
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
import { requiredClaimAttestations } from "../../shared/claim-policies.js";

const CATEGORY_LABEL: Record<string, string> = {
  "10": "Unpaid rent",
  "11": "Damage beyond ordinary wear",
  "12": "Cleaning needed to restore move-in cleanliness",
  "13": "Lease-authorized restoration or replacement of landlord property",
  "14": "Other documented test deduction",
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
  const [recordLoadAttempt, setRecordLoadAttempt] = useState(0);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [claimRecorded, setClaimRecorded] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<NegotiationAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [noticeCopied, setNoticeCopied] = useState(false);
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null);
  const [itemizationConfirmed, setItemizationConfirmed] = useState(false);
  const [documentsConfirmed, setDocumentsConfirmed] = useState(false);
  const [moveInPhotosConfirmed, setMoveInPhotosConfirmed] = useState(false);
  const [preRepairPhotosConfirmed, setPreRepairPhotosConfirmed] = useState(false);
  const [postRepairPhotosConfirmed, setPostRepairPhotosConfirmed] = useState(false);
  const [claimAttestations, setClaimAttestations] = useState<
    Record<string, boolean>
  >({});
  const restoredClaim = useRef(false);
  const recordRetryButton = useRef<HTMLButtonElement>(null);
  const recordLoadProposalId = negotiationAccess?.role === "landlord"
    ? negotiationAccess.proposalId
    : null;
  const recordLoadToken = negotiationAccess?.role === "landlord"
    ? negotiationAccess.token
    : null;
  const recordLoadScope = recordLoadProposalId && recordLoadToken
    ? `${recordLoadProposalId}:landlord:${recordLoadToken}`
    : null;
  const previousRecordLoadScope = useRef<string | null>(null);

  useEffect(() => {
    if (!recordLoadProposalId || !recordLoadToken) {
      previousRecordLoadScope.current = null;
      setRecord(null);
      setRecordLoadError(null);
      setIsLoadingRecord(false);
      return;
    }
    let active = true;
    const scopeChanged = previousRecordLoadScope.current !== recordLoadScope;
    previousRecordLoadScope.current = recordLoadScope;
    setRecord(null);
    if (scopeChanged) setRecordLoadError(null);
    setIsLoadingRecord(true);
    void loadNegotiation({
      proposalId: recordLoadProposalId,
      role: "landlord",
      token: recordLoadToken,
    })
      .then((loadedRecord) => {
        if (active) {
          setRecord(loadedRecord);
          setRecordLoadError(null);
        }
      })
      .catch(() => {
        if (active) {
          setRecordLoadError(
            "OpenEscrow could not load this agreement's private claim requirements. Check your connection and try again before submitting or amending a deduction.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingRecord(false);
      });
    return () => {
      active = false;
    };
  }, [
    recordLoadAttempt,
    recordLoadProposalId,
    recordLoadScope,
    recordLoadToken,
  ]);

  useEffect(() => {
    if (recordLoadError && !isLoadingRecord) {
      recordRetryButton.current?.focus();
    }
  }, [isLoadingRecord, recordLoadError]);

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
  const isCaliforniaPolicy =
    record?.terms.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
    record.terms.policyVersion === CALIFORNIA_POLICY.version;
  const versionedClaimPolicy = record?.terms.complianceSnapshot?.claimPolicy;
  const isClaimPolicyLoading = Boolean(negotiationAccess && isLoadingRecord);
  const isClaimPolicyUnavailable = Boolean(negotiationAccess && !record);
  const amount = amountRaw === null ? "" : formatUSDC(amountRaw);
  const evidenceType =
    items.length === 1 ? Number(items[0].category) : Number("13");
  const hasConditionBasedDeduction = items.some((item) =>
    ["11", "12", "13"].includes(item.category),
  );
  const requiredVersionedAttestations = versionedClaimPolicy
    ? requiredClaimAttestations(
        versionedClaimPolicy,
        items.map((item) => item.category),
      )
    : [];
  const claimRequirementsConfirmed = versionedClaimPolicy
    ? requiredVersionedAttestations.length > 0 &&
      requiredVersionedAttestations.every(
        (attestation) => claimAttestations[attestation.id] === true,
      )
    : itemizationConfirmed &&
      documentsConfirmed &&
      (!isCaliforniaPolicy ||
        !hasConditionBasedDeduction ||
        (moveInPhotosConfirmed &&
          preRepairPhotosConfirmed &&
          postRepairPhotosConfirmed));
  const allowedCategoryIds = new Set(
    versionedClaimPolicy?.allowedCategoryIds ||
      Object.keys(CATEGORY_LABEL).filter(
        (categoryId) => !isCaliforniaPolicy || categoryId !== "14",
      ),
  );

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
    const claimConfirmations = versionedClaimPolicy
      ? {
          attestations: Object.fromEntries(
            requiredVersionedAttestations.map((attestation) => [
              attestation.id,
              true as const,
            ]),
          ),
        }
      : {
          itemizedStatement: true as const,
          supportingDocuments: true as const,
          ...(isCaliforniaPolicy && hasConditionBasedDeduction
            ? {
                moveInPhotos: true as const,
                preRepairPhotos: true as const,
                postRepairPhotos: true as const,
              }
            : {}),
        };
    const action: NegotiationAction = amended
      ? {
          type: "claim_amended" as const,
          amount,
          items,
          note: note.trim(),
          evidenceUri: uri,
          evidenceHash: contentHash,
          claimConfirmations,
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
          claimConfirmations,
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
    const subject = `OpenEscrow deduction claim for ${agreementReference(id)}`;
    const claimAmount = amount || formatUSDC(agreement.claimedAmount);
    const itemSummary = items.map(
      (item, index) =>
        `${index + 1}. ${CATEGORY_LABEL[item.category] || "Other"} — ${item.description.trim()} (${item.amount || "0"} shares)`,
    );
    const body = [
      `A deduction claim of ${claimAmount} shares has been submitted for ${agreementReference(id)}.`,
      "",
      "Itemized deductions:",
      ...itemSummary,
      "",
      note.trim() ? `Landlord note: ${note.trim()}` : "",
      uri
        ? uri.startsWith("openescrow://evidence/")
          ? "Invoice / evidence: available privately after opening the agreement"
          : `Invoice / evidence: ${uri}`
        : "",
      "",
      `Review the documentation, add a note, and approve or dispute the claim here: ${reviewUrl}`,
      "",
      "Your decision and all related actions will be included in the timestamped agreement record.",
    ].filter(Boolean).join("\n");
    const tenantEmails = Array.from(
      new Set(
        [record.tenantEmail, ...record.tenants.map((tenant) => tenant.email)]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const primaryEmail = record.tenantEmail.trim().toLowerCase() || tenantEmails[0];
    const ccEmails = tenantEmails.filter((email) => email !== primaryEmail);
    const ccParameter = ccEmails.length
      ? `&cc=${encodeURIComponent(ccEmails.join(","))}`
      : "";
    return {
      body,
      reviewUrl,
      gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(primaryEmail)}${ccParameter}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    };
  }

  const itemEditor = (
    <div className="claim-line-items">
      {recordLoadError && (
        <div
          className="receipt-recovery"
          role="alert"
          aria-label="Private claim requirements could not be loaded"
          aria-busy={isLoadingRecord}
        >
          <p className="tx-error">{recordLoadError}</p>
          <button
            ref={recordRetryButton}
            className="btn btn-ghost small"
            type="button"
            disabled={isLoadingRecord}
            onClick={() => {
              setIsLoadingRecord(true);
              setRecordLoadAttempt((attempt) => attempt + 1);
            }}
          >
            {isLoadingRecord
              ? "Loading claim requirements..."
              : "Try loading claim requirements again"}
          </button>
        </div>
      )}
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
              {Object.entries(CATEGORY_LABEL)
                .filter(([value]) => allowedCategoryIds.has(value))
                .map(([value, label]) => (
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
      <fieldset className="california-claim-checklist">
        <legend>
          {versionedClaimPolicy
            ? "Address-routed claim packet · required"
            : isCaliforniaPolicy
            ? "California deduction record · required"
            : "Test deduction record · required"}
        </legend>
        {isClaimPolicyLoading && (
          <p className="field-help">
            Loading the agreement’s address-routed claim requirements…
          </p>
        )}
        {isClaimPolicyUnavailable ? null : versionedClaimPolicy ? (
          <>
            {requiredVersionedAttestations.map((attestation) => (
              <label key={attestation.id}>
                <input
                  type="checkbox"
                  checked={claimAttestations[attestation.id] === true}
                  onChange={(event) =>
                    setClaimAttestations((current) => ({
                      ...current,
                      [attestation.id]: event.target.checked,
                    }))
                  }
                />
                <span>
                  {attestation.label}
                  <small>
                    {attestation.basis === "state-source"
                      ? " State-profile requirement."
                      : " OpenEscrow evidence safeguard."}
                  </small>
                </span>
              </label>
            ))}
            {versionedClaimPolicy.stateInstructions.length > 0 && (
              <details>
                <summary>Review delivery and state process instructions</summary>
                <ul>
                  {versionedClaimPolicy.stateInstructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
                <p className="field-help">
                  Source: {versionedClaimPolicy.source.citation}. The app records
                  the packet; it does not prove mailing, service, inspection, or
                  legal sufficiency.
                </p>
              </details>
            )}
          </>
        ) : (
          <>
            <label>
              <input
                type="checkbox"
                checked={itemizationConfirmed}
                onChange={(event) =>
                  setItemizationConfirmed(event.target.checked)
                }
              />
              <span>
                {isCaliforniaPolicy
                  ? "Every deduction is itemized and limited to a reasonable, authorized purpose."
                  : "Every test deduction is separately itemized and described."}
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={documentsConfirmed}
                onChange={(event) =>
                  setDocumentsConfirmed(event.target.checked)
                }
              />
              <span>
                The supporting file includes applicable invoices, receipts,
                labor details, photographs, or a permitted good-faith estimate.
              </span>
            </label>
            {isCaliforniaPolicy && hasConditionBasedDeduction && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={moveInPhotosConfirmed}
                    onChange={(event) =>
                      setMoveInPhotosConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    The record includes the required move-in condition
                    photographs.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={preRepairPhotosConfirmed}
                    onChange={(event) =>
                      setPreRepairPhotosConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    The record includes photographs taken after possession
                    returned and before work.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={postRepairPhotosConfirmed}
                    onChange={(event) =>
                      setPostRepairPhotosConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    The record includes photographs taken after repairs or
                    cleaning were completed.
                  </span>
                </label>
              </>
            )}
          </>
        )}
        {!isClaimPolicyUnavailable && (
          <p className="field-help">
            {versionedClaimPolicy
              ? "The exact checklist and source are stored with this agreement's compliance snapshot. Combine the itemization and supporting records into one private PDF or supported image for this pilot."
              : isCaliforniaPolicy
              ? "Combine multiple pages and photographs into one PDF for this pilot. Checking these boxes creates a timestamped attestation; it does not prove the deduction is lawful."
              : "Attach one supporting test file. This non-specific profile records the test lifecycle but does not validate legal compliance."}
          </p>
        )}
      </fieldset>
    </div>
  );

  async function recordNotice(method: "gmail" | "copy") {
    if (!negotiationAccess) return;
    try {
      await negotiationAction(negotiationAccess, {
        type: "claim_notification_prepared",
        method,
      });
    } catch {
      setNoticeStatus(
        "The email or copy action worked, but OpenEscrow could not add that preparation step to the private record. The claim receipt and onchain agreement are unchanged.",
      );
    }
  }

  const notice = tenantNotice();
  async function copyClaimNotice() {
    if (!notice) return;
    setNoticeStatus(null);
    try {
      await copyTextToClipboard(notice.body);
      setNoticeCopied(true);
      void recordNotice("copy");
    } catch (error) {
      setNoticeCopied(false);
      setNoticeStatus(
        error instanceof Error ? error.message : "The claim notice could not be copied.",
      );
    }
  }
  function openClaimNotice() {
    if (!notice) return;
    setNoticeStatus(null);
    try {
      openExternalWindow(notice.gmailUrl);
      void recordNotice("gmail");
    } catch (error) {
      setNoticeStatus(
        error instanceof Error ? error.message : "The claim notice could not be opened.",
      );
    }
  }
  const showNotice = agreement.phase === Phase.ClaimOpen || claimRecorded;
  const recordRecovery = pendingRecord && recordError && (
    <div className="receipt-recovery">
      <p className="tx-error" role="alert">
        {recordError}
      </p>
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
    <div className="action-section" id={`agreement-${id.toString()}-claim`} tabIndex={-1}>
        <h3>Submit a documented deduction claim</h3>
        <p className="hint">
          Only the landlord can initiate a deduction. The claimed amount remains subject to the
          tenant’s approve-or-dispute response and, if disputed, the appointed arbiter process.
          All balances stay in escrow until the claim and any dispute are fully resolved.
        </p>
        {itemEditor}
        <p className="field-help">
          Maximum total: {formatUSDC(agreement.depositAmount)} shares.
        </p>
        <label>
          Claim note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Explain the deduction and what the attached file or photo shows."
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
             isClaimPolicyUnavailable ||
             !claimRequirementsConfirmed ||
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
                  Send tenant email(s)
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={openClaimNotice}
              >
                Email tenant(s)
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void copyClaimNotice()}
              >
                {noticeCopied ? "Claim notice copied" : "Copy claim notice"}
              </button>
            </div>
            {noticeStatus && (
              <p
                className={noticeStatus.includes("sent") ? "tx-success" : "tx-error"}
                role={noticeStatus.includes("sent") ? "status" : "alert"}
              >
                {noticeStatus}
              </p>
            )}
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
          Claim note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Explain the amendment and what the attached file or photo shows."
            rows={3}
          />
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
            isClaimPolicyUnavailable ||
            !claimRequirementsConfirmed ||
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
                  Send tenant email(s)
                </button>
              )}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={openClaimNotice}
              >
                Email tenant(s)
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void copyClaimNotice()}
              >
                {noticeCopied ? "Claim notice copied" : "Copy claim notice"}
              </button>
            </div>
            {noticeStatus && (
              <p
                className={noticeStatus.includes("sent") ? "tx-success" : "tx-error"}
                role={noticeStatus.includes("sent") ? "status" : "alert"}
              >
                {noticeStatus}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
