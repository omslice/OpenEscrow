import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, ZERO_ADDRESS } from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { formatUSDC, parseUSDC } from "../lib/format";
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
  decisionReceiptRecoveryKey,
  isClaimResponseReceiptAction,
  sameDecisionReceipt,
  type ClaimResponseReceiptAction,
} from "../lib/decisionReceiptRecovery";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import {
  loadNegotiation,
  negotiationAction,
  sendClaimResponseNotification,
  type NegotiationAccess,
  type NegotiationEvent,
  type NegotiationRecord,
} from "../lib/negotiations";
import { EvidenceList } from "./EvidenceList";

type Mode = "accept" | "partial" | "dispute";
type ClaimResponseAction = ClaimResponseReceiptAction;
type NoticeFeedback = {
  kind: "progress" | "success" | "error";
  message: string;
};

function responseFromEvent(
  event: NegotiationEvent | undefined,
): ClaimResponseAction | null {
  const metadata = event?.metadata;
  const decision = metadata?.decision;
  const acceptedAmount = metadata?.acceptedAmount;
  const note = metadata?.note;
  const transactionHash = metadata?.transactionHash;
  if (
    event?.action !== "claim_response_submitted" ||
    (decision !== "approve" && decision !== "partial" && decision !== "dispute") ||
    typeof acceptedAmount !== "string" ||
    typeof note !== "string" ||
    typeof transactionHash !== "string" ||
    !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)
  ) {
    return null;
  }
  return {
    type: "claim_response",
    decision,
    acceptedAmount,
    note,
    transactionHash: transactionHash as `0x${string}`,
  };
}

function decisionText(action: ClaimResponseAction) {
  if (action.decision === "approve") {
    return `Approved the full deduction (${action.acceptedAmount} shares).`;
  }
  if (action.decision === "dispute") {
    return "Disputed the full deduction.";
  }
  return `Approved ${action.acceptedAmount} shares and disputed the remainder.`;
}

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
  const [record, setRecord] = useState<NegotiationRecord | null>(null);
  const [recordLoadAttempt, setRecordLoadAttempt] = useState(0);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [submittedResponse, setSubmittedResponse] = useState<ClaimResponseAction | null>(null);
  const [pendingRecord, setPendingRecord] = useState<ClaimResponseAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingResponseRecord, setIsSavingResponseRecord] = useState(false);
  const [noticeFeedback, setNoticeFeedback] = useState<NoticeFeedback | null>(null);
  const recordRetryButton = useRef<HTMLButtonElement>(null);
  const responseReceiptRetryButton = useRef<HTMLButtonElement>(null);
  const landlordEmailButton = useRef<HTMLButtonElement>(null);
  const pendingNotificationFallbackFocus = useRef(false);
  const pendingRecordStored = useRef(true);
  const recordLoadProposalId = negotiationAccess?.role === "tenant"
    ? negotiationAccess.proposalId
    : null;
  const recordLoadToken = negotiationAccess?.role === "tenant"
    ? negotiationAccess.token
    : null;
  const recordLoadScope = recordLoadProposalId && recordLoadToken
    ? `${recordLoadProposalId}:tenant:${recordLoadToken}`
    : null;
  const previousRecordLoadScope = useRef<string | null>(null);
  const pendingRecordKey =
    negotiationAccess?.role === "tenant" && address
      ? decisionReceiptRecoveryKey({
          receipt: "claim-response",
          agreementId: id.toString(),
          proposalId: negotiationAccess.proposalId,
          role: "tenant",
          address,
        })
      : null;
  const responseReceiptScopeKey = JSON.stringify([
    id.toString(),
    pendingRecordKey,
  ]);
  const responseReceiptScope = useMemo(
    () => createAsyncOperationScope(responseReceiptScopeKey),
    [responseReceiptScopeKey],
  );
  const responseNotificationScope = useMemo(
    () => createAsyncOperationScope(responseReceiptScopeKey),
    [responseReceiptScopeKey],
  );

  useLayoutEffect(() => {
    responseReceiptScope.open();
    responseNotificationScope.open();
    setIsSavingResponseRecord(false);
    setNoticeFeedback(null);
    pendingNotificationFallbackFocus.current = false;
    const storage = getBrowserRecoveryStorage("session");
    const recovered =
      pendingRecordKey && storage
        ? readRecoveryJson(
            pendingRecordKey,
            isClaimResponseReceiptAction,
            storage,
          )
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setSubmittedResponse(recovered);
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet response whose private activity receipt still needs to be saved. Retry the record save; do not submit another response."
        : null,
    );
    return () => {
      responseReceiptScope.close();
      responseNotificationScope.close();
    };
  }, [pendingRecordKey, responseNotificationScope, responseReceiptScope]);

  useLayoutEffect(() => {
    if (!pendingNotificationFallbackFocus.current) return;
    pendingNotificationFallbackFocus.current = false;
    landlordEmailButton.current?.focus();
  }, [noticeFeedback]);

  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: tenantRespondedOnchain } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantClaimResponded",
    args: address ? [id, address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });
  const { data: responseCountData } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "claimResponseCount",
    args: [id],
    query: { refetchInterval: 5000 },
  });
  const { data: tenantParticipantsData } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "getTenantParticipants",
    args: [id],
    query: { refetchInterval: 5000 },
  });

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
      role: "tenant",
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
            "OpenEscrow could not load the private agreement summary used for response details and landlord email. Check your connection and try again.",
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
    if (pendingRecord && recordError && !isSavingResponseRecord) {
      responseReceiptRetryButton.current?.focus({ preventScroll: true });
    }
  }, [isSavingResponseRecord, pendingRecord, recordError]);

  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const responseCount =
    typeof responseCountData === "bigint"
      ? Number(responseCountData)
      : typeof responseCountData === "number"
        ? responseCountData
        : 0;
  const tenantParticipants = tenantParticipantsData as
    | readonly [readonly `0x${string}`[], readonly number[], readonly bigint[], readonly bigint[]]
    | undefined;
  const requiredResponseCount =
    tenantParticipants?.[0].length || record?.tenants.length || 1;
  const tenantResponded =
    tenantRespondedOnchain === true || submittedResponse !== null;

  const priorResponse = useMemo(() => {
    if (!record) return null;
    const viewerTenantId = record.viewerTenantId;
    const event = [...record.events]
      .reverse()
      .find(
        (candidate) =>
          candidate.action === "claim_response_submitted" &&
          (!viewerTenantId || candidate.metadata?.tenantId === viewerTenantId),
      );
    return responseFromEvent(event);
  }, [record]);
  const responseForNotice = submittedResponse || priorResponse;

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
  const validAmount =
    mode === "partial"
      ? accepted > 0n && accepted < claimed
      : accepted >= 0n && accepted <= claimed;
  const validExplanation = mode === "accept" || note.trim().length > 0;

  function landlordReviewUrl() {
    const url = new URL(window.location.origin);
    url.searchParams.set("id", id.toString());
    return url.toString();
  }

  function responseEmail(action: ClaimResponseAction) {
    if (!record?.landlordEmail) return null;
    const tenant =
      record.tenants.find((candidate) => candidate.id === record.viewerTenantId) ||
      record.tenants.find((candidate) => candidate.email === record.viewerEmail);
    const tenantName = tenant?.name || record.tenantName || "A tenant";
    const subject = `OpenEscrow tenant response for ${agreementReference(id)}`;
    const body = [
      `${tenantName} submitted a deduction-claim response for ${agreementReference(id)}.`,
      "",
      `Decision: ${decisionText(action)}`,
      action.note ? `Explanation: ${action.note}` : "",
      "",
      `Review the agreement record: ${landlordReviewUrl()}`,
      `Onchain transaction: https://sepolia.basescan.org/tx/${action.transactionHash}`,
      "",
      "The deposit remains in escrow until the claim and any dispute are fully resolved.",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      body,
      gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(record.landlordEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    };
  }

  async function notifyLandlord(action: ClaimResponseAction) {
    if (!negotiationAccess || negotiationAccess.role !== "tenant") return;
    const operationId = responseNotificationScope.start();
    setNoticeFeedback({
      kind: "progress",
      message: "Sending the landlord notification...",
    });
    try {
      await sendClaimResponseNotification(negotiationAccess, {
        transactionHash: action.transactionHash,
      });
      if (responseNotificationScope.isCurrent(operationId)) {
        setNoticeFeedback({
          kind: "success",
          message: "The landlord was emailed automatically.",
        });
      }
    } catch {
      if (responseNotificationScope.isCurrent(operationId)) {
        pendingNotificationFallbackFocus.current = true;
        setNoticeFeedback({
          kind: "error",
          message:
            "Automatic email is unavailable. Use the Gmail or copy-email option below.",
        });
      }
    }
  }

  async function saveResponse(action: ClaimResponseAction) {
    if (!negotiationAccess || negotiationAccess.role !== "tenant") return;
    const operationId = responseReceiptScope.start();
    setRecordError(null);
    setIsSavingResponseRecord(true);
    try {
      const updated = await negotiationAction(negotiationAccess, action);
      const storage = getBrowserRecoveryStorage("session");
      if (pendingRecordKey && storage) {
        clearRecoveryJsonIf(
          pendingRecordKey,
          (value) =>
            isClaimResponseReceiptAction(value) &&
            sameDecisionReceipt(value, action),
          storage,
        );
      }
      if (!responseReceiptScope.isCurrent(operationId)) return;
      setRecord(updated);
      setPendingRecord((current) =>
        sameDecisionReceipt(current, action) ? null : current,
      );
      setSubmittedResponse(action);
      void notifyLandlord(action);
      onRefetch?.();
    } catch (cause) {
      if (!responseReceiptScope.isCurrent(operationId)) return;
      const reloadWarning = pendingRecordStored.current
        ? " This retry is kept only in this browser tab until it is saved."
        : " This browser could not keep a reload-recovery copy, so keep this page open and retry now.";
      const failureDetail = cause instanceof Error
        ? `: ${cause.message.replace(/[.\s]+$/, "")}.`
        : ".";
      setRecordError(
        `The onchain response succeeded, but its activity record still needs to be saved${failureDetail}${reloadWarning}`,
      );
    } finally {
      if (responseReceiptScope.isCurrent(operationId)) {
        setIsSavingResponseRecord(false);
      }
    }
  }

  async function recordNotice(method: "gmail" | "copy") {
    if (!negotiationAccess || negotiationAccess.role !== "tenant") return;
    try {
      await negotiationAction(negotiationAccess, {
        type: "claim_response_notification_prepared",
        method,
      });
    } catch {
      setNoticeFeedback({
        kind: "error",
        message:
          "The email or copy action worked, but OpenEscrow could not add that preparation step to the private record. Your response receipt and onchain decision are unchanged.",
      });
    }
  }

  async function copyLandlordEmail(body: string) {
    setNoticeFeedback(null);
    try {
      await copyTextToClipboard(body);
      setNoticeFeedback({
        kind: "success",
        message: "The landlord email was copied.",
      });
      void recordNotice("copy");
    } catch (error) {
      setNoticeFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "The landlord email could not be copied.",
      });
    }
  }

  function openLandlordEmail(url: string) {
    setNoticeFeedback(null);
    try {
      openExternalWindow(url);
      void recordNotice("gmail");
    } catch (error) {
      setNoticeFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "The landlord email could not be opened.",
      });
    }
  }

  if (
    !isTenant ||
    (agreement.phase !== Phase.ClaimOpen && !tenantResponded && !responseForNotice)
  ) {
    return null;
  }

  const email = responseForNotice ? responseEmail(responseForNotice) : null;
  const claimDecisionName = `claim-decision-${id.toString()}`;
  const claimDecisionLabelId = `claim-decision-label-${id.toString()}`;

  return (
    <div className="action-section" id={`agreement-${id.toString()}-response`} tabIndex={-1}>
      <h3>Review and answer the deduction claim</h3>
      <p className="hint">
        The landlord claimed {formatUSDC(claimed)} USDC. Review the supporting document, then
        approve all, approve part, or dispute the deduction. Funds stay locked until the claim is
        settled or the dispute process finishes.
      </p>
      {recordLoadError && (
        <div
          className="receipt-recovery"
          role="alert"
          aria-label="Private response details could not be loaded"
          aria-busy={isLoadingRecord}
        >
          <p className="tx-error">{recordLoadError}</p>
          <p className="field-help">
            A time-sensitive onchain response remains available below. Retry before relying on
            the response count or sending the landlord notice.
          </p>
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
              ? "Loading response details..."
              : "Try loading response details again"}
          </button>
        </div>
      )}
      {requiredResponseCount > 1 && (
        <p className="field-help">
          Every tenant records a decision. A deduction is accepted only up to the lowest amount
          approved by all tenants. {responseCount} of {requiredResponseCount} responses are
          currently recorded.
        </p>
      )}

      <div className="claim-response-step">
        <span className="eyebrow">1. Review documentation</span>
        <EvidenceList id={id} negotiationAccess={negotiationAccess} />
      </div>

      {!tenantResponded && agreement.phase === Phase.ClaimOpen ? (
        <>
          <div className="claim-response-step">
            <fieldset className="claim-decision-choice">
              <legend className="eyebrow" id={claimDecisionLabelId}>
                2. Choose your decision
              </legend>
              <div className="radio-row" role="radiogroup" aria-labelledby={claimDecisionLabelId}>
                <label htmlFor={`${claimDecisionName}-accept`}>
                  <input
                    id={`${claimDecisionName}-accept`}
                    type="radio"
                    name={claimDecisionName}
                    checked={mode === "accept"}
                    onChange={() => setMode("accept")}
                  />{" "}
                  Approve in full
                </label>
                <label htmlFor={`${claimDecisionName}-partial`}>
                  <input
                    id={`${claimDecisionName}-partial`}
                    type="radio"
                    name={claimDecisionName}
                    checked={mode === "partial"}
                    onChange={() => setMode("partial")}
                  />{" "}
                  Approve part
                </label>
                <label htmlFor={`${claimDecisionName}-dispute`}>
                  <input
                    id={`${claimDecisionName}-dispute`}
                    type="radio"
                    name={claimDecisionName}
                    checked={mode === "dispute"}
                    onChange={() => setMode("dispute")}
                  />{" "}
                  Dispute in full
                </label>
              </div>
            </fieldset>
            {mode === "partial" && (
              <label>
                Amount to approve (USDC; the rest becomes disputed)
                <input
                  value={partialAmount}
                  onChange={(event) => setPartialAmount(event.target.value)}
                  type="number"
                  min="0"
                  max={formatUSDC(claimed)}
                  step="0.000001"
                />
              </label>
            )}
            <label>
              Decision explanation {mode === "accept" ? "(optional)" : "(required)"}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  mode === "accept"
                    ? "Add any note you want included in the record."
                    : "Briefly explain why you are disputing all or part of the deduction."
                }
                rows={4}
                maxLength={1000}
              />
            </label>
          </div>
          <div className="claim-response-step">
            <span className="eyebrow">3. Record your decision</span>
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
                    : "Approve part and dispute remainder"
              }
              disabled={
                !validAmount ||
                !validExplanation ||
                submittedResponse !== null ||
                Boolean(pendingRecord)
              }
              onSuccess={(transactionHash) => {
                if (!negotiationAccess || negotiationAccess.role !== "tenant") return;
                const action: ClaimResponseAction = {
                  type: "claim_response",
                  decision: mode === "accept" ? "approve" : mode,
                  acceptedAmount: formatUSDC(accepted),
                  note: note.trim(),
                  transactionHash,
                };
                setSubmittedResponse(action);
                setPendingRecord(action);
                const storage = getBrowserRecoveryStorage("session");
                pendingRecordStored.current = Boolean(
                  pendingRecordKey &&
                    storage &&
                    writeRecoveryJson(pendingRecordKey, action, storage),
                );
                void saveResponse(action);
              }}
            />
            {!validExplanation && (
              <p className="tx-error" role="alert">
                Add a short explanation before submitting a dispute.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="claim-response-step">
          <span className="eyebrow">Decision recorded</span>
          <p>
            {responseForNotice
              ? decisionText(responseForNotice)
              : "Your onchain decision is recorded."}
          </p>
          {agreement.phase === Phase.ClaimOpen && (
            <p className="hint">
              Waiting for the remaining tenant response
              {requiredResponseCount - responseCount === 1 ? "" : "s"}. No funds can be withdrawn
              while the claim remains open.
            </p>
          )}
        </div>
      )}

      {pendingRecord && (
        <div className="receipt-recovery" aria-busy={isSavingResponseRecord}>
          {recordError && (
            <p className="tx-error" role="alert">
              {recordError}
            </p>
          )}
          {isSavingResponseRecord && (
            <p className="hint" role="status" aria-live="polite">
              Saving the confirmed response to the private activity record...
            </p>
          )}
          <button
            ref={responseReceiptRetryButton}
            className="btn btn-ghost small"
            type="button"
            disabled={isSavingResponseRecord}
            onClick={() => void saveResponse(pendingRecord)}
          >
            {isSavingResponseRecord
              ? "Saving response receipt..."
              : "Retry saving response receipt"}
          </button>
        </div>
      )}

      {email && (
        <div className="claim-response-step">
          <span className="eyebrow">4. Notify the landlord</span>
          <p className="hint">
            Open a ready-to-send Gmail draft or copy the same email. The explanation and onchain
            receipt are included.
          </p>
          <div className="button-row">
            <button
              ref={landlordEmailButton}
              className="btn btn-secondary"
              type="button"
              onClick={() => openLandlordEmail(email.gmailUrl)}
            >
              Email decision to landlord
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void copyLandlordEmail(email.body)}
            >
              Copy landlord email
            </button>
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
      )}

      {agreement.arbiter === ZERO_ADDRESS && agreement.phase === Phase.Disputed && (
        <p className="hint">
          No arbiter is currently appointed. The dispute remains locked until the configured
          resolution deadline or a later mutually agreed resolution path.
        </p>
      )}
    </div>
  );
}
