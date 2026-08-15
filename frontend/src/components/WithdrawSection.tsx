import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  OPERATIONS_RESERVE_ADDRESS,
  OperationsReserveABI,
  Phase,
  YIELD_USDC_ADDRESS,
} from "../contracts/config";
import { payoutAmountUnit } from "../lib/agreementAmountDisplay";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  clearRecoveryJsonIf,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import { formatUSDC } from "../lib/format";
import { negotiationAction, type NegotiationAccess } from "../lib/negotiations";
import {
  isWithdrawalReceiptAction,
  sameTerminalReceipt,
  terminalReceiptRecoveryKey,
  type WithdrawalReceiptAction,
} from "../lib/terminalReceiptRecovery";
import type { Agreement } from "../lib/useAgreement";
import { useNow } from "../lib/useNow";
import { TxButton } from "./TxButton";

export function WithdrawSection({
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
    useState<WithdrawalReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [withdrawalRecorded, setWithdrawalRecorded] = useState(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const pendingRecordStored = useRef(true);
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: tenantCredit } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantWithdrawableByAddress",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const isYieldToken = agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const { data: yieldSettled } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "yieldSettled",
    args: [id],
    query: { enabled: isYieldToken, refetchInterval: 5000 },
  });
  const payoutUnit = payoutAmountUnit({
    tokenAddress: agreement.token,
    yieldTokenAddress: YIELD_USDC_ADDRESS,
    yieldSettled: isYieldToken && yieldSettled === true,
  });
  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const isLandlord = Boolean(
    address && address.toLowerCase() === agreement.landlord.toLowerCase(),
  );
  const { data: reservePaidAmount } = useReadContract({
    address: OPERATIONS_RESERVE_ADDRESS,
    abi: OperationsReserveABI,
    functionName: "paidAmount",
    args: address ? [OPEN_ESCROW_ADDRESS, id, address] : undefined,
    query: { enabled: Boolean(address && isTenant), refetchInterval: 5000 },
  });
  const { data: reserveAlreadyRefunded } = useReadContract({
    address: OPERATIONS_RESERVE_ADDRESS,
    abi: OperationsReserveABI,
    functionName: "refunded",
    args: address ? [OPEN_ESCROW_ADDRESS, id, address] : undefined,
    query: { enabled: Boolean(address && isTenant), refetchInterval: 5000 },
  });
  const credited = isTenant
    ? typeof tenantCredit === "bigint"
      ? tenantCredit
      : 0n
    : isLandlord
      ? agreement.landlordWithdrawable
      : 0n;
  const reserveRefund =
    isTenant && reserveAlreadyRefunded !== true && typeof reservePaidAmount === "bigint"
      ? reservePaidAmount
      : 0n;
  const matchingAccess =
    negotiationAccess &&
    ((isTenant && negotiationAccess.role === "tenant") ||
      (isLandlord && negotiationAccess.role === "landlord"))
      ? negotiationAccess
      : null;
  const recoveryKey =
    matchingAccess && address
      ? terminalReceiptRecoveryKey({
          receipt: "withdrawal",
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
        ? readRecoveryJson(recoveryKey, isWithdrawalReceiptAction, storage)
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setWithdrawalRecorded(Boolean(recovered));
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet withdrawal that still needs to be added to the private Record. Finish that Record update; do not withdraw again."
        : null,
    );
    return () => recoveryScope.close();
  }, [recoveryKey, recoveryScope]);

  useLayoutEffect(() => {
    if (pendingRecord && recordError && !isSavingRecord) {
      retryButton.current?.focus({ preventScroll: true });
    }
  }, [isSavingRecord, pendingRecord, recordError]);

  async function saveWithdrawal(action: WithdrawalReceiptAction) {
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
            isWithdrawalReceiptAction(value) &&
            sameTerminalReceipt(value, action),
          storage,
        );
      }
      if (!recoveryScope.isCurrent(operationId)) return;
      setPendingRecord((current) =>
        sameTerminalReceipt(current, action) ? null : current,
      );
      setWithdrawalRecorded(true);
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
        `The testnet withdrawal succeeded, but it still needs to be added to the private Record${failureDetail}${reloadWarning}`,
      );
    } finally {
      if (recoveryScope.isCurrent(operationId)) {
        setIsSavingRecord(false);
      }
    }
  }

  const recordRecovery = pendingRecord && (
    <div className="receipt-recovery" aria-busy={isSavingRecord}>
      {recordError && (
        <p className="tx-error" role="alert">
          {recordError}
        </p>
      )}
      {isSavingRecord && (
        <p className="hint" role="status" aria-live="polite">
          Adding the confirmed withdrawal to the private Record...
        </p>
      )}
      {matchingAccess && (
        <button
          ref={retryButton}
          className="btn btn-ghost small"
          type="button"
          disabled={isSavingRecord}
          onClick={() => void saveWithdrawal(pendingRecord)}
        >
          {isSavingRecord
            ? "Adding withdrawal to Record..."
            : "Finish adding withdrawal to Record"}
        </button>
      )}
    </div>
  );

  if (!address) return null;
  if (!isTenant && !isLandlord && !pendingRecord) return null;
  if (credited === 0n && reserveRefund === 0n && !pendingRecord) return null;

  const claimPeriodEnded = now >= Number(agreement.claimSubmissionDeadline);
  const resolved =
    agreement.phase === Phase.Cancelled ||
    (agreement.phase === Phase.Closed && claimPeriodEnded);
  if (pendingRecord || (withdrawalRecorded && credited > 0n)) {
    return (
      <div className="action-section" tabIndex={-1}>
        <h3>Withdrawal confirmed</h3>
        <p className="hint">
          The testnet withdrawal is confirmed. OpenEscrow will only finish the private Record
          update; it will not withdraw again.
        </p>
        {recordRecovery}
      </div>
    );
  }

  return (
    <div className="action-section">
      <h3>Withdraw</h3>
      <p className="hint">
        You have {formatUSDC(credited)} {payoutUnit} allocated to you on this agreement.
        {reserveRefund > 0n && (
          <>
            {" "}Your {formatUSDC(reserveRefund)} {isYieldToken ? "taUSDC" : "testUSDC"} testnet
            reserve will be returned in the same transaction.
          </>
        )}{" "}
        {resolved
          ? agreement.phase === Phase.Cancelled
            ? "This proposal was cancelled, so the funded balance and unused reserve are available to withdraw."
            : "The claim period has ended and the claim process is complete, so this balance is available to withdraw."
          : agreement.phase === Phase.Closed
            ? `The outcome is recorded, but all funds remain protected in escrow until the claim period ends on ${new Date(Number(agreement.claimSubmissionDeadline) * 1000).toLocaleString()}.`
            : "This balance remains protected in escrow until the claim period ends and the deduction claim and any dispute are fully resolved."}
      </p>
      {resolved ? (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="withdraw"
          args={[id]}
          label={
            reserveRefund > 0n
              ? `Withdraw ${formatUSDC(credited)} ${payoutUnit} + refund ${formatUSDC(reserveRefund)} ${isYieldToken ? "taUSDC" : "testUSDC"} reserve`
              : `Withdraw ${formatUSDC(credited)} ${payoutUnit}`
          }
          onSuccess={(transactionHash) => {
            const action: WithdrawalReceiptAction = {
              type: "withdrawal_completed",
              amount: formatUSDC(credited),
              reserveRefundAmount: formatUSDC(reserveRefund),
              transactionHash,
            };
            setWithdrawalRecorded(true);
            setPendingRecord(action);
            if (!matchingAccess) {
              pendingRecordStored.current = false;
              setRecordError(
                "The testnet withdrawal succeeded, but this view does not have matching private-record access. Reopen the agreement from the same participant account before relying on its activity report.",
              );
              onRefetch?.();
              return;
            }
            const storage = getBrowserRecoveryStorage("session");
            pendingRecordStored.current = Boolean(
              recoveryKey &&
                storage &&
                writeRecoveryJson(recoveryKey, action, storage),
            );
            void saveWithdrawal(action);
          }}
        />
      ) : (
        <button className="btn btn-secondary" type="button" disabled>
          {agreement.phase === Phase.Closed
            ? "Withdrawal locked until claim period ends"
            : "Withdrawal locked until claim period ends and outcome is resolved"}
        </button>
      )}
    </div>
  );
}
