import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  DEPLOYMENT_BLOCK,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  Phase,
} from "../contracts/config";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  clearRecoveryJsonIf,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import {
  negotiationAction,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import {
  findProposalCancellationTransaction,
  type ProposalCancellationRecoveryClient,
} from "../lib/proposalCancellationTransaction";
import {
  isProposalCancellationReceiptAction,
  sameTerminalReceipt,
  terminalReceiptRecoveryKey,
  type ProposalCancellationReceiptAction,
} from "../lib/terminalReceiptRecovery";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

export function ProposalActions({
  id,
  agreement,
  negotiationAccess,
  participantRecord,
  onParticipantRecordUpdated,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  onParticipantRecordUpdated?: (record: NegotiationRecord) => void;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [newArbiter, setNewArbiter] = useState("");
  const [pendingRecord, setPendingRecord] =
    useState<ProposalCancellationReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isFindingCancellation, setIsFindingCancellation] = useState(false);
  const [cancellationConfirmed, setCancellationConfirmed] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const recoverySearchButton = useRef<HTMLButtonElement>(null);
  const pendingRecordStored = useRef(true);

  const isLandlord = address?.toLowerCase() === agreement.landlord.toLowerCase();
  const matchingAccess =
    isLandlord && negotiationAccess?.role === "landlord"
      ? negotiationAccess
      : null;
  const recoveryKey =
    matchingAccess && address
      ? terminalReceiptRecoveryKey({
          receipt: "proposal-cancellation",
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
    setIsFindingCancellation(false);
    const storage = getBrowserRecoveryStorage("session");
    const recovered =
      recoveryKey && storage
        ? readRecoveryJson(
            recoveryKey,
            isProposalCancellationReceiptAction,
            storage,
          )
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setCancellationConfirmed(Boolean(recovered));
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet cancellation that still needs to be added to the private Record. Finish that Record update; do not cancel again."
        : null,
    );
    return () => recoveryScope.close();
  }, [recoveryKey, recoveryScope]);

  const recordOutOfSync =
    agreement.phase === Phase.Cancelled &&
    participantRecord?.status === "finalized";
  const needsDiscovery =
    recordOutOfSync && !pendingRecord && !cancellationConfirmed;

  useLayoutEffect(() => {
    if (
      pendingRecord &&
      recordError &&
      !isSavingRecord &&
      !isFindingCancellation
    ) {
      retryButton.current?.focus({ preventScroll: true });
    } else if (
      needsDiscovery &&
      recordError &&
      !isFindingCancellation
    ) {
      recoverySearchButton.current?.focus({ preventScroll: true });
    }
  }, [
    isFindingCancellation,
    isSavingRecord,
    needsDiscovery,
    pendingRecord,
    recordError,
  ]);

  async function saveCancellation(action: ProposalCancellationReceiptAction) {
    if (!matchingAccess) return;
    const operationId = recoveryScope.start();
    setRecordError(null);
    setIsSavingRecord(true);
    try {
      const updatedRecord = await negotiationAction(matchingAccess, action);
      const storage = getBrowserRecoveryStorage("session");
      if (recoveryKey && storage) {
        clearRecoveryJsonIf(
          recoveryKey,
          (value) =>
            isProposalCancellationReceiptAction(value) &&
            sameTerminalReceipt(value, action),
          storage,
        );
      }
      if (!recoveryScope.isCurrent(operationId)) return;
      setPendingRecord((current) =>
        sameTerminalReceipt(current, action) ? null : current,
      );
      setCancellationConfirmed(true);
      onParticipantRecordUpdated?.(updatedRecord);
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
        `The testnet cancellation succeeded, but it still needs to be added to the private Record${failureDetail}${reloadWarning}`,
      );
      onRefetch?.();
    } finally {
      if (recoveryScope.isCurrent(operationId)) {
        setIsSavingRecord(false);
      }
    }
  }

  function recordCancellation(transactionHash: `0x${string}`) {
    const action: ProposalCancellationReceiptAction = {
      type: "onchain_proposal_cancelled",
      transactionHash,
    };
    setCancellationConfirmed(true);
    setPendingRecord(action);
    if (!matchingAccess) {
      pendingRecordStored.current = false;
      setRecordError(
        "The testnet cancellation succeeded, but this view does not have matching private-record access. Reopen the agreement from the same landlord account before relying on its activity report.",
      );
      onRefetch?.();
      return;
    }
    const storage = getBrowserRecoveryStorage("session");
    pendingRecordStored.current = Boolean(
      recoveryKey && storage && writeRecoveryJson(recoveryKey, action, storage),
    );
    void saveCancellation(action);
  }

  async function findAndSaveCancellation() {
    if (!publicClient || !matchingAccess || !participantRecord) return;
    const operationId = recoveryScope.start();
    setRecordError(null);
    setIsFindingCancellation(true);
    try {
      const finalizedAt =
        participantRecord.events?.find(
          (event) => event.action === "posted_onchain",
        )?.createdAt ||
        participantRecord.updatedAt ||
        participantRecord.createdAt;
      const transactionHash = await findProposalCancellationTransaction(
        publicClient as unknown as ProposalCancellationRecoveryClient,
        {
          deploymentBlock: DEPLOYMENT_BLOCK,
          contractAddress: OPEN_ESCROW_ADDRESS,
          abi: OpenEscrowABI,
          agreementId: id,
          finalizedAt,
        },
      );
      if (!recoveryScope.isCurrent(operationId)) return;
      if (!transactionHash) {
        setRecordError(
          "OpenEscrow could not find the matching test-network cancellation yet. Try the search again shortly. The agreement is already cancelled, so do not submit another cancellation.",
        );
        return;
      }

      const action: ProposalCancellationReceiptAction = {
        type: "onchain_proposal_cancelled",
        transactionHash,
      };
      setCancellationConfirmed(true);
      setPendingRecord(action);
      const storage = getBrowserRecoveryStorage("session");
      pendingRecordStored.current = Boolean(
        recoveryKey &&
          storage &&
          writeRecoveryJson(recoveryKey, action, storage),
      );
      setIsFindingCancellation(false);
      void saveCancellation(action);
    } catch {
      if (!recoveryScope.isCurrent(operationId)) return;
      setRecordError(
        "OpenEscrow could not search the test network right now. Try again shortly. The agreement is already cancelled, so do not submit another cancellation.",
      );
    } finally {
      if (recoveryScope.isCurrent(operationId)) {
        setIsFindingCancellation(false);
      }
    }
  }

  if (!isLandlord) return null;

  if (pendingRecord || cancellationConfirmed || recordOutOfSync) {
    return (
      <div className="action-section" tabIndex={-1}>
        <h3>Proposal cancellation confirmed</h3>
        <p className="hint">
          {recordOutOfSync && !pendingRecord
            ? matchingAccess
              ? "The testnet agreement is cancelled, but its private Record has not caught up yet. OpenEscrow can find the public confirmation and securely finish the Record update; do not submit another cancellation."
              : "The testnet agreement is cancelled, but its private Record has not caught up yet. Reopen it through the same landlord account so OpenEscrow can securely finish the Record update; do not submit another cancellation."
            : "The testnet agreement is cancelled. OpenEscrow will only finish the private Record update; it will not submit another cancellation."}
        </p>
        {(recordError || pendingRecord || needsDiscovery) && (
          <div
            className="receipt-recovery"
            aria-busy={isSavingRecord || isFindingCancellation}
          >
            {recordError && (
              <p className="tx-error" role="alert">
                {recordError}
              </p>
            )}
            {isSavingRecord && (
              <p className="hint" role="status" aria-live="polite">
                Adding the confirmed cancellation to the private Record...
              </p>
            )}
            {isFindingCancellation && (
              <p className="hint" role="status" aria-live="polite">
                Finding the confirmed cancellation on the test network...
              </p>
            )}
            {needsDiscovery && matchingAccess && (
              <button
                ref={recoverySearchButton}
                className="btn btn-secondary small"
                type="button"
                disabled={!publicClient || isFindingCancellation}
                onClick={() => void findAndSaveCancellation()}
              >
                {isFindingCancellation
                  ? "Finding cancellation..."
                  : "Find cancellation and finish Record update"}
              </button>
            )}
            {needsDiscovery && matchingAccess && !publicClient && (
              <p className="field-help">
                Connect to Base Sepolia before asking OpenEscrow to find the
                cancellation.
              </p>
            )}
            {pendingRecord && matchingAccess && (
              <button
                ref={retryButton}
                className="btn btn-ghost small"
                type="button"
                disabled={isSavingRecord}
                onClick={() => void saveCancellation(pendingRecord)}
              >
                {isSavingRecord
                  ? "Adding cancellation to Record..."
                  : "Finish adding cancellation to Record"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const isPreFunding =
    agreement.phase === Phase.Proposed || agreement.phase === Phase.ReadyToFund;
  if (!isPreFunding) return null;

  const validCandidate =
    isAddress(newArbiter) &&
    newArbiter.toLowerCase() !== agreement.landlord.toLowerCase() &&
    newArbiter.toLowerCase() !== agreement.tenant.toLowerCase();

  return (
    <div className="action-section">
      <h3>Manage proposal</h3>
      <p className="hint">
        {ARBITER_UI_ENABLED
          ? "Nominate a different neutral arbiter, or cancel before a tenant funds. Renomination resets any prior acceptance or decline."
          : "You can cancel this onchain proposal before any tenant funds it."}
      </p>
      {ARBITER_UI_ENABLED && (
        <>
          <label>
            New arbiter address
            <input value={newArbiter} onChange={(event) => setNewArbiter(event.target.value)} placeholder="0x..." />
          </label>
          {newArbiter.length > 0 && !validCandidate && (
            <p className="tx-error" role="alert">Enter a valid address that is different from the landlord and tenant.</p>
          )}
        </>
      )}
      <div className="button-row">
        {ARBITER_UI_ENABLED && (
          <TxButton
            address={OPEN_ESCROW_ADDRESS}
            abi={OpenEscrowABI}
            functionName="renominateArbiter"
            args={[id, newArbiter]}
            label="Nominate new arbiter"
            disabled={!validCandidate}
            onSuccess={() => {
              setNewArbiter("");
              onRefetch?.();
            }}
          />
        )}
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="cancelProposal"
          args={[id]}
          label="Cancel proposal"
          className="btn btn-ghost"
          onSuccess={recordCancellation}
        />
      </div>
    </div>
  );
}
