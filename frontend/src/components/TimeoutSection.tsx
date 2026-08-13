import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, ZERO_ADDRESS } from "../contracts/config";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  clearRecoveryJsonIf,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import { negotiationAction, type NegotiationAccess } from "../lib/negotiations";
import {
  isTimeoutReceiptAction,
  sameTerminalReceipt,
  terminalReceiptRecoveryKey,
  type TimeoutReceiptAction,
} from "../lib/terminalReceiptRecovery";
import type { Agreement } from "../lib/useAgreement";
import { useNow } from "../lib/useNow";
import { TxButton } from "./TxButton";

type TimeoutKind = TimeoutReceiptAction["timeout"];

const timeoutPresentation: Record<
  TimeoutKind,
  { heading: string; transactionLabel: string }
> = {
  no_claim_refund: {
    heading: "Refund confirmed",
    transactionLabel: "Finalize tenant refund",
  },
  no_response_recorded: {
    heading: "No response recorded",
    transactionLabel: "Record no response and finalize claim",
  },
  no_response_dispute: {
    heading: "Dispute escalation confirmed",
    transactionLabel: "Escalate to dispute",
  },
  arbiter_timeout_refund: {
    heading: "Timeout refund confirmed",
    transactionLabel: "Send disputed funds to tenant",
  },
};

/**
 * Nothing in OpenEscrow executes automatically at a deadline. Each path needs
 * an explicit transaction after its deadline has passed.
 */
export function TimeoutSection({
  id,
  agreement,
  negotiationAccess,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const now = useNow();
  const [pendingRecord, setPendingRecord] =
    useState<TimeoutReceiptAction | null>(null);
  const [confirmedAction, setConfirmedAction] =
    useState<TimeoutReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const pendingRecordStored = useRef(true);
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const isLandlord = Boolean(
    address && address.toLowerCase() === agreement.landlord.toLowerCase(),
  );
  const isArbiter = Boolean(
    address && address.toLowerCase() === agreement.arbiter.toLowerCase(),
  );
  const connectedRole = isTenant
    ? "tenant"
    : isLandlord
      ? "landlord"
      : isArbiter
        ? "arbiter"
        : null;
  const matchingAccess =
    negotiationAccess && negotiationAccess.role === connectedRole
      ? negotiationAccess
      : null;
  const recoveryKey =
    matchingAccess && address
      ? terminalReceiptRecoveryKey({
          receipt: "timeout",
          agreementId: id.toString(),
          proposalId: matchingAccess.proposalId,
          role: matchingAccess.role,
          address,
        })
      : null;
  const recoveryScopeKey = JSON.stringify([id.toString(), recoveryKey]);
  const recoveryScope = useMemo(
    () => createAsyncOperationScope(recoveryScopeKey),
    [recoveryScopeKey],
  );

  useLayoutEffect(() => {
    recoveryScope.open();
    setIsSavingRecord(false);
    const storage = getBrowserRecoveryStorage("session");
    const recovered =
      recoveryKey && storage
        ? readRecoveryJson(recoveryKey, isTimeoutReceiptAction, storage)
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setConfirmedAction(recovered);
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet deadline action that still needs to be added to the private Record. Finish that Record update; do not submit the action again."
        : null,
    );
    return () => recoveryScope.close();
  }, [recoveryKey, recoveryScope]);

  useLayoutEffect(() => {
    if (pendingRecord && recordError && !isSavingRecord) {
      retryButton.current?.focus({ preventScroll: true });
    }
  }, [isSavingRecord, pendingRecord, recordError]);

  async function saveTimeout(action: TimeoutReceiptAction) {
    if (!matchingAccess) return;
    const operationId = recoveryScope.start();
    setRecordError(null);
    setIsSavingRecord(true);
    try {
      await negotiationAction(matchingAccess, action);
      const storage = getBrowserRecoveryStorage("session");
      if (recoveryKey && storage) {
        clearRecoveryJsonIf(
          recoveryKey,
          (value) =>
            isTimeoutReceiptAction(value) &&
            sameTerminalReceipt(value, action),
          storage,
        );
      }
      if (!recoveryScope.isCurrent(operationId)) return;
      setPendingRecord((current) =>
        sameTerminalReceipt(current, action) ? null : current,
      );
      setConfirmedAction(action);
      onRefetch?.();
    } catch (cause) {
      if (!recoveryScope.isCurrent(operationId)) return;
      const reloadWarning = pendingRecordStored.current
        ? " This retry is kept only in this browser tab until it is saved."
        : " This browser could not keep a reload-recovery copy, so keep this page open and retry now.";
      const failureDetail =
        cause instanceof Error
          ? `: ${cause.message.replace(/[.\s]+$/, "")}.`
          : ".";
      setRecordError(
        `The testnet deadline action succeeded, but it still needs to be added to the private Record${failureDetail}${reloadWarning}`,
      );
    } finally {
      if (recoveryScope.isCurrent(operationId)) {
        setIsSavingRecord(false);
      }
    }
  }

  function recordTimeout(
    timeout: TimeoutKind,
    transactionHash: `0x${string}`,
  ) {
    const action: TimeoutReceiptAction = {
      type: "timeout_executed",
      timeout,
      transactionHash,
    };
    setConfirmedAction(action);
    setPendingRecord(action);
    if (!matchingAccess) {
      pendingRecordStored.current = false;
      setRecordError(
        "The testnet deadline action succeeded, but this view does not have matching private-record access. Reopen the agreement from the same participant account before relying on its activity report.",
      );
      onRefetch?.();
      return;
    }
    const storage = getBrowserRecoveryStorage("session");
    pendingRecordStored.current = Boolean(
      recoveryKey && storage && writeRecoveryJson(recoveryKey, action, storage),
    );
    void saveTimeout(action);
  }

  const displayedAction = pendingRecord || confirmedAction;
  if (displayedAction) {
    return (
      <div className="action-section" tabIndex={-1}>
        <h3>{timeoutPresentation[displayedAction.timeout].heading}</h3>
        <p className="hint">
          The testnet action is confirmed. OpenEscrow will only finish the private Record update;
          it will not submit the action again.
        </p>
        {pendingRecord && (
          <div className="receipt-recovery" aria-busy={isSavingRecord}>
            {recordError && (
              <p className="tx-error" role="alert">
                {recordError}
              </p>
            )}
            {isSavingRecord && (
              <p className="hint" role="status" aria-live="polite">
                Adding the confirmed deadline action to the private Record...
              </p>
            )}
            {matchingAccess && (
              <button
                ref={retryButton}
                className="btn btn-ghost small"
                type="button"
                disabled={isSavingRecord}
                onClick={() => void saveTimeout(pendingRecord)}
              >
                {isSavingRecord
                  ? "Adding deadline action to Record..."
                  : "Finish adding deadline action to Record"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (
    agreement.phase === Phase.Active &&
    isTenant &&
    now >= Number(agreement.claimSubmissionDeadline)
  ) {
    return (
      <div className="action-section">
        <h3>No claim was submitted</h3>
        <p className="hint">
          The claim window closed with no claim, so the full deposit is now
          refundable. Complete the testnet settlement; each tenant can then
          withdraw their approved share.
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="withdrawNoClaim"
          args={[id]}
          label={timeoutPresentation.no_claim_refund.transactionLabel}
          onSuccess={(transactionHash) =>
            recordTimeout("no_claim_refund", transactionHash)
          }
        />
      </div>
    );
  }

  if (
    agreement.phase === Phase.ClaimOpen &&
    now >= Number(agreement.responseDeadline)
  ) {
    const hasArbiter = agreement.arbiter !== ZERO_ADDRESS;
    const timeout: TimeoutKind = hasArbiter
      ? "no_response_dispute"
      : "no_response_recorded";
    return (
      <div className="action-section">
        <h3>Response window has closed</h3>
        <p className="hint">
          {hasArbiter
            ? "A tenant did not respond. Any participant can move the unanswered amount into the agreed dispute process."
            : "A tenant did not respond. Any participant can record the non-response and finalize the landlord’s documented claim. The shared record will not treat silence as tenant approval or as a dispute."}
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="finalizeNoResponse"
          args={[id]}
          label={timeoutPresentation[timeout].transactionLabel}
          onSuccess={(transactionHash) =>
            recordTimeout(timeout, transactionHash)
          }
        />
      </div>
    );
  }

  if (
    agreement.phase === Phase.Disputed &&
    now >= Number(agreement.arbiterRulingDeadline)
  ) {
    return (
      <div className="action-section">
        <h3>Arbiter ruling window has closed</h3>
        <p className="hint">
          The arbiter did not rule in time. Any participant can complete the
          testnet refund, which sends the disputed amount to the tenant side.
        </p>
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="claimArbiterTimeout"
          args={[id]}
          label={timeoutPresentation.arbiter_timeout_refund.transactionLabel}
          onSuccess={(transactionHash) =>
            recordTimeout("arbiter_timeout_refund", transactionHash)
          }
        />
      </div>
    );
  }

  return null;
}
