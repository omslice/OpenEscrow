import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  Phase,
  YIELD_USDC_ADDRESS,
  ZERO_ADDRESS,
} from "../contracts/config";
import { claimAmountUnit } from "../lib/agreementAmountDisplay";
import { agreementReference } from "../lib/displayIds";
import { formatUSDC, parseUSDC } from "../lib/format";
import {
  CALIFORNIA_POLICY,
  isVersionedComplianceSnapshot,
} from "../lib/jurisdictions";
import {
  copyTextToClipboard,
  openExternalWindow,
} from "../lib/browserActions";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  clearRecoveryJsonIf,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import {
  claimReceiptRecoveryKey,
  isClaimReceiptAction,
  sameClaimReceipt,
  type ClaimReceiptAction,
} from "../lib/claimReceiptRecovery";
import { tenantClaimEmailStatus } from "../lib/claimNotificationStatus";
import { publicAppOrigin } from "../lib/publicAppOrigin";
import {
  buildNegotiationInviteUrl,
  loadNegotiation,
  negotiationAction,
  readLandlordBundle,
  sendClaimNotification,
  type DeductionLineItem,
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

type NoticeFeedback = {
  kind: "progress" | "success" | "error";
  message: string;
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
  const [itemChangeStatus, setItemChangeStatus] = useState("");
  const [note, setNote] = useState("");
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [recordLoadAttempt, setRecordLoadAttempt] = useState(0);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [claimRecorded, setClaimRecorded] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<ClaimReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingClaimRecord, setIsSavingClaimRecord] = useState(false);
  const [noticeCopiedFor, setNoticeCopiedFor] = useState<string | null>(null);
  const [noticeFeedback, setNoticeFeedback] = useState<NoticeFeedback | null>(null);
  const [isSendingTenantNotification, setIsSendingTenantNotification] = useState(false);
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
  const claimReceiptRetryButton = useRef<HTMLButtonElement>(null);
  const pendingRecordStored = useRef(true);
  const itemFieldsets = useRef<Array<HTMLFieldSetElement | null>>([]);
  const pendingItemFocus = useRef<number | null>(null);
  const tenantNotificationButton = useRef<HTMLButtonElement>(null);
  const pendingNotificationRetryFocus = useRef(false);
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
  const tenantNotificationScope = useMemo(
    () => createAsyncOperationScope(recordLoadScope || "no-landlord-record"),
    [recordLoadScope],
  );
  const pendingRecordKey =
    negotiationAccess?.role === "landlord" && address
      ? claimReceiptRecoveryKey({
          agreementId: id.toString(),
          proposalId: negotiationAccess.proposalId,
          role: "landlord",
          address,
        })
      : null;
  const claimRecordScopeKey = JSON.stringify([id.toString(), pendingRecordKey]);
  const claimRecordScope = useMemo(
    () => createAsyncOperationScope(claimRecordScopeKey),
    [claimRecordScopeKey],
  );
  const amountUnit = claimAmountUnit(agreement.token, YIELD_USDC_ADDRESS);

  useLayoutEffect(() => {
    tenantNotificationScope.open();
    setIsSendingTenantNotification(false);
    setNoticeFeedback(null);
    setNoticeCopiedFor(null);
    pendingNotificationRetryFocus.current = false;
    return () => tenantNotificationScope.close();
  }, [tenantNotificationScope]);

  useLayoutEffect(() => {
    if (isSendingTenantNotification || !pendingNotificationRetryFocus.current) return;
    pendingNotificationRetryFocus.current = false;
    tenantNotificationButton.current?.focus();
  }, [isSendingTenantNotification]);

  useLayoutEffect(() => {
    claimRecordScope.open();
    setIsSavingClaimRecord(false);
    const storage = getBrowserRecoveryStorage("session");
    const recovered =
      pendingRecordKey && storage
        ? readRecoveryJson(pendingRecordKey, isClaimReceiptAction, storage)
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setClaimRecorded(Boolean(recovered));
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet claim that still needs to be added to the private Record. Finish that Record update; do not submit another claim."
        : null,
    );
    return () => claimRecordScope.close();
  }, [claimRecordScope, pendingRecordKey]);

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

  useLayoutEffect(() => {
    const index = pendingItemFocus.current;
    if (index === null) return;
    pendingItemFocus.current = null;
    itemFieldsets.current[index]?.focus({ preventScroll: true });
  }, [items]);

  useLayoutEffect(() => {
    if (pendingRecord && recordError && !isSavingClaimRecord) {
      claimReceiptRetryButton.current?.focus({ preventScroll: true });
    }
  }, [isSavingClaimRecord, pendingRecord, recordError]);

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
  const storedComplianceSnapshot = record?.terms.complianceSnapshot;
  const complianceSnapshot = isVersionedComplianceSnapshot(
    storedComplianceSnapshot,
  )
    ? storedComplianceSnapshot
    : null;
  const complianceSnapshotInvalid = Boolean(
    storedComplianceSnapshot && !complianceSnapshot,
  );
  const versionedClaimPolicy = complianceSnapshot?.claimPolicy;
  const isClaimPolicyLoading = Boolean(negotiationAccess && isLoadingRecord);
  const isClaimPolicyUnavailable = Boolean(
    negotiationAccess && (!record || complianceSnapshotInvalid),
  );
  const claimRequirementsError = complianceSnapshotInvalid
    ? "OpenEscrow could not validate this agreement's saved claim requirements. Preserve the record and contact support before submitting or amending a deduction."
    : recordLoadError;
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
    if (items.length >= 20) return;
    pendingItemFocus.current = items.length;
    setItemChangeStatus(
      `Deduction ${items.length + 1} added. Fill in its details.`,
    );
    setItems((current) => [...current, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    const remainingCount = items.length - 1;
    pendingItemFocus.current = Math.min(index, remainingCount - 1);
    setItemChangeStatus(
      `Deduction ${index + 1} removed. ${remainingCount} ${
        remainingCount === 1 ? "deduction remains" : "deductions remain"
      }.`,
    );
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveClaimRecord(action: ClaimReceiptAction) {
    if (!negotiationAccess || negotiationAccess.role !== "landlord") return;
    const operationId = claimRecordScope.start();
    setRecordError(null);
    setIsSavingClaimRecord(true);
    try {
      const updated = await negotiationAction(negotiationAccess, action);
      const storage = getBrowserRecoveryStorage("session");
      if (pendingRecordKey && storage) {
        clearRecoveryJsonIf(
          pendingRecordKey,
          (value) =>
            isClaimReceiptAction(value) && sameClaimReceipt(value, action),
          storage,
        );
      }
      if (!claimRecordScope.isCurrent(operationId)) return;
      setRecord(updated);
      setClaimRecorded(true);
      setPendingRecord((current) =>
        sameClaimReceipt(current, action) ? null : current,
      );
      onRefetch?.();
    } catch (cause) {
      if (!claimRecordScope.isCurrent(operationId)) return;
      const reloadWarning = pendingRecordStored.current
        ? " This retry is kept only in this browser tab until it is saved."
        : " This browser could not keep a reload-recovery copy, so keep this page open and retry now.";
      const failureDetail = cause instanceof Error
        ? `: ${cause.message.replace(/[.\s]+$/, "")}.`
        : ".";
      setRecordError(
        `The onchain claim succeeded, but its activity record still needs to be saved${failureDetail}${reloadWarning}`,
      );
    } finally {
      if (claimRecordScope.isCurrent(operationId)) {
        setIsSavingClaimRecord(false);
      }
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
    const action: ClaimReceiptAction = amended
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
    setClaimRecorded(true);
    setPendingRecord(action);
    const storage = getBrowserRecoveryStorage("session");
    pendingRecordStored.current = Boolean(
      pendingRecordKey &&
        storage &&
        writeRecoveryJson(pendingRecordKey, action, storage),
    );
    void saveClaimRecord(action);
  }

  function tenantNotices() {
    if (!negotiationAccess || !record) return [];
    const bundle = readLandlordBundle();
    if (!bundle || bundle.proposalId !== negotiationAccess.proposalId) return [];
    const subject = `OpenEscrow deduction claim for ${agreementReference(id)}`;
    const claimAmount = amount || formatUSDC(agreement.claimedAmount);
    const itemSummary = items.map(
      (item, index) =>
        `${index + 1}. ${CATEGORY_LABEL[item.category] || "Other"} — ${item.description.trim()} (${item.amount || "0"} ${amountUnit})`,
    );
    const accessTenants = bundle.access.tenants || [];
    const notices = record.tenants.map((tenant, index) => {
      const tenantAccess = accessTenants.find((candidate) => candidate.id === tenant.id);
      const token = tenantAccess?.token ||
        (record.tenants.length === 1 && index === 0 ? bundle.access.tenant : null);
      if (!token) return null;
      const email = tenant.email.trim().toLowerCase();
      const label = tenant.name?.trim() || email;
      const reviewUrl = buildNegotiationInviteUrl(
        "tenant",
        negotiationAccess.proposalId,
        token,
      );
      const appUrl = `${publicAppOrigin()}/`;
      const body = [
        tenant.name?.trim() ? `Hello ${tenant.name.trim()},` : "Hello,",
        "",
        `A deduction claim of ${claimAmount} ${amountUnit} has been submitted for ${agreementReference(id)}.`,
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
        `Open OpenEscrow and sign in to review the documentation, add a note, and approve or dispute the claim: ${appUrl}`,
        "",
        "Use the email address that received this notice. OpenEscrow will load only the agreements associated with that verified account.",
        "",
        "Your decision and all related actions will be included in the timestamped agreement record.",
      ].filter(Boolean).join("\n");
      return {
        tenantId: tenant.id,
        email,
        label,
        body,
        reviewUrl,
        gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      };
    });
    return notices.every(Boolean)
      ? notices.filter((notice) => notice !== null)
      : [];
  }

  const itemEditor = (
    <div className="claim-line-items">
      {claimRequirementsError && (
        <div
          className="receipt-recovery"
          role="alert"
          aria-label="Private claim requirements could not be loaded"
          aria-busy={isLoadingRecord}
        >
          <p className="tx-error">{claimRequirementsError}</p>
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
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {itemChangeStatus}
      </p>
      {items.map((item, index) => (
        <fieldset
          className="claim-line-item"
          key={index}
          ref={(element) => {
            itemFieldsets.current[index] = element;
          }}
          tabIndex={-1}
        >
          <legend>Deduction {index + 1}</legend>
          <label className="claim-field claim-field-category">
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
          <label className="claim-field claim-field-description">
            Description
            <textarea
              value={item.description}
              onChange={(event) => updateItem(index, { description: event.target.value })}
              placeholder="What was damaged or unpaid, and why this amount is being claimed."
              rows={2}
            />
          </label>
          <label className="claim-field claim-field-amount">
            Amount ({amountUnit})
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
              className="btn btn-ghost claim-line-item-remove"
              type="button"
              aria-label={`Remove deduction ${index + 1}`}
              onClick={() => removeItem(index)}
            >
              Remove line item
            </button>
          )}
        </fieldset>
      ))}
      <div className="claim-total">
        <span>Claim total</span>
        <strong>{amountRaw === null ? "Enter valid amounts" : `${amount} ${amountUnit}`}</strong>
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
      setNoticeFeedback({
        kind: "error",
        message:
          "The email or copy action worked, but OpenEscrow could not add that preparation step to the private Record. The confirmed claim is unchanged.",
      });
    }
  }

  const notices = tenantNotices();
  const tenantEmailStatus = tenantClaimEmailStatus(record);
  async function sendTenantClaimNotification() {
    if (
      notices.length === 0 ||
      !negotiationAccess ||
      negotiationAccess.role !== "landlord" ||
      isSendingTenantNotification
    ) {
      return;
    }
    const operationId = tenantNotificationScope.start();
    setIsSendingTenantNotification(true);
    setNoticeFeedback({
      kind: "progress",
      message: "Sending the tenant claim email...",
    });
    try {
      try {
        const resendRequestId = tenantEmailStatus.allSent
          ? crypto.randomUUID()
          : undefined;
        await sendClaimNotification(negotiationAccess, {
          reviewLinks: notices.map((notice) => ({
            tenantId: notice.tenantId,
            email: notice.email,
            reviewUrl: notice.reviewUrl,
          })),
          resend: tenantEmailStatus.allSent,
          resendRequestId,
        });
      } catch (emailError) {
        if (!tenantNotificationScope.isCurrent(operationId)) return;
        pendingNotificationRetryFocus.current = true;
        setNoticeFeedback({
          kind: "error",
          message:
            emailError instanceof Error
              ? emailError.message
              : "Automatic email could not be sent. Use the Gmail fallback.",
        });
        return;
      }
      if (!tenantNotificationScope.isCurrent(operationId)) return;
      setNoticeFeedback({
        kind: "success",
        message: tenantEmailStatus.allSent
          ? "Tenant claim emails resent and added to the record."
          : "Tenant claim emails sent and added to the record.",
      });
      try {
        const updatedRecord = await loadNegotiation(negotiationAccess);
        if (!tenantNotificationScope.isCurrent(operationId)) return;
        setRecord(updatedRecord);
        setRecordLoadError(null);
      } catch {
        if (!tenantNotificationScope.isCurrent(operationId)) return;
        setRecordLoadError(
          "The tenant claim email was accepted for delivery, but OpenEscrow could not refresh the private Record display. The email and confirmed claim are unchanged. Try loading the claim requirements again.",
        );
      }
    } finally {
      if (tenantNotificationScope.isCurrent(operationId)) {
        setIsSendingTenantNotification(false);
      }
    }
  }

  async function copyClaimNotice(notice: (typeof notices)[number]) {
    setNoticeFeedback(null);
    try {
      await copyTextToClipboard(notice.body);
      setNoticeCopiedFor(notice.tenantId);
      void recordNotice("copy");
    } catch (error) {
      setNoticeCopiedFor(null);
      setNoticeFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "The claim notice could not be copied.",
      });
    }
  }
  function openClaimNotice(notice: (typeof notices)[number]) {
    setNoticeFeedback(null);
    try {
      openExternalWindow(notice.gmailUrl);
      void recordNotice("gmail");
    } catch (error) {
      setNoticeFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "The claim notice could not be opened.",
      });
    }
  }
  const noticeActions = notices.length > 0 && (
    <div className="claim-notice-actions">
      <strong>Tenant claim emails</strong>
      <p className="hint">
        OpenEscrow sends each tenant a separate notice. The draft and copy controls are manual
        backups for individual recipients.
      </p>
      {negotiationAccess && (
        <button
          ref={tenantNotificationButton}
          className="btn btn-primary"
          type="button"
          disabled={isSendingTenantNotification}
          onClick={() => void sendTenantClaimNotification()}
        >
          {isSendingTenantNotification
            ? tenantEmailStatus.allSent
              ? "Resending tenant emails..."
              : "Sending tenant emails..."
            : tenantEmailStatus.allSent
              ? notices.length === 2
                ? "Resend to both tenants"
                : notices.length === 1
                  ? "Resend tenant email"
                  : `Resend to all ${notices.length} tenants`
              : "Send tenant emails"}
        </button>
      )}
      <div className="claim-notice-recipient-list">
        {notices.map((notice) => (
          <div className="claim-notice-recipient" key={notice.tenantId}>
            <span>
              <strong>{notice.label}</strong>
              {notice.label !== notice.email && <small>{notice.email}</small>}
              {tenantEmailStatus.statusByTenantId[notice.tenantId] ? (
                <small className="claim-email-sent">✓ Email sent</small>
              ) : (
                <small>Email delivery not yet confirmed</small>
              )}
            </span>
            <div className="button-row">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => openClaimNotice(notice)}
              >
                Open draft for {notice.label}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void copyClaimNotice(notice)}
              >
                {noticeCopiedFor === notice.tenantId
                  ? `Notice copied for ${notice.label}`
                  : `Copy notice for ${notice.label}`}
              </button>
            </div>
          </div>
        ))}
      </div>
      {noticeFeedback && (
        <p
          className={
            noticeFeedback.kind === "error"
              ? "tx-error"
              : noticeFeedback.kind === "success"
                ? "tx-success"
                : "field-help"
          }
          role={noticeFeedback.kind === "error" ? "alert" : "status"}
          aria-live={noticeFeedback.kind === "error" ? "assertive" : "polite"}
        >
          {noticeFeedback.message}
        </p>
      )}
    </div>
  );
  const showNotice = agreement.phase === Phase.ClaimOpen || claimRecorded;
  const recordRecovery = pendingRecord && (
    <div className="receipt-recovery" aria-busy={isSavingClaimRecord}>
      {recordError && (
        <p className="tx-error" role="alert">
          {recordError}
        </p>
      )}
      {isSavingClaimRecord && (
        <p className="hint" role="status" aria-live="polite">
          Adding the confirmed claim to the private Record...
        </p>
      )}
      <button
        ref={claimReceiptRetryButton}
        className="btn btn-ghost small"
        type="button"
        disabled={isSavingClaimRecord}
        onClick={() => void saveClaimRecord(pendingRecord)}
      >
        {isSavingClaimRecord
          ? "Adding claim to Record..."
          : "Finish adding claim to Record"}
      </button>
    </div>
  );

  if (agreement.phase === Phase.Active) {
    return (
    <div className="action-section" id={`agreement-${id.toString()}-claim`} tabIndex={-1}>
        <h3>Submit a documented deduction claim</h3>
        <p className="hint">
          {agreement.arbiter === ZERO_ADDRESS
            ? "Only the landlord can initiate a deduction. Tenant responses—including a dispute or no response—are preserved in the shared record. In this no-arbiter version, the documented claim is allocated to the landlord and the remaining balance to the tenants once the response step is complete."
            : "Only the landlord can initiate a deduction. The claimed amount remains subject to each tenant’s recorded response and, if disputed, the agreed arbiter process. Balances stay in escrow until the claim and any dispute are resolved."}
        </p>
        {itemEditor}
        <p className="field-help">
          Maximum total: {formatUSDC(agreement.depositAmount)} {amountUnit}.
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
             claimRecorded ||
             Boolean(pendingRecord) ||
             amountRaw === null ||
            amountRaw <= 0n ||
            amountRaw > agreement.depositAmount
          }
          onSuccess={(transactionHash) => recordClaim(transactionHash)}
        />
        {recordRecovery}
        {showNotice && noticeActions}
      </div>
    );
  }

  if (agreement.phase === Phase.ClaimOpen && !agreement.claimAmended) {
    return (
      <div className="action-section">
        <h3>Amend deduction claim (one time)</h3>
        <p className="hint">
          You may only lower the current {formatUSDC(agreement.claimedAmount)} {amountUnit} claim. The
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
            claimRecorded ||
            Boolean(pendingRecord) ||
            amountRaw === null ||
            amountRaw > agreement.claimedAmount
          }
          onSuccess={(transactionHash) => recordClaim(transactionHash, true)}
        />
        {recordRecovery}
        {noticeActions}
      </div>
    );
  }

  if (recordRecovery) {
    return (
      <div className="action-section">
        <h3>Finish saving the confirmed claim</h3>
        <p className="hint">
          The testnet agreement has moved forward. Use the safe Record-only action below; it will
          not submit another claim.
        </p>
        {recordRecovery}
      </div>
    );
  }

  return null;
}
