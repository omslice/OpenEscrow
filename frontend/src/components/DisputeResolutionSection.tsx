import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  Phase,
  YIELD_USDC_ADDRESS,
} from "../contracts/config";
import { agreementAmountUnit } from "../lib/agreementAmountDisplay";
import { formatUSDC, parseUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";
import { EvidenceList } from "./EvidenceList";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  clearRecoveryJsonIf,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import {
  decisionReceiptRecoveryKey,
  isArbiterRulingReceiptAction,
  sameDecisionReceipt,
  type ArbiterRulingReceiptAction,
} from "../lib/decisionReceiptRecovery";
import {
  negotiationAction,
  type NegotiationAccess,
} from "../lib/negotiations";

export function DisputeResolutionSection({
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
  const [award, setAward] = useState("");
  const [note, setNote] = useState("");
  const [pendingRecord, setPendingRecord] =
    useState<ArbiterRulingReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRulingRecord, setIsSavingRulingRecord] = useState(false);
  const [rulingRecorded, setRulingRecorded] = useState(false);
  const rulingReceiptRetryButton = useRef<HTMLButtonElement>(null);
  const pendingRecordStored = useRef(true);
  const pendingRecordKey =
    negotiationAccess?.role === "arbiter" && address
      ? decisionReceiptRecoveryKey({
          receipt: "arbiter-ruling",
          agreementId: id.toString(),
          proposalId: negotiationAccess.proposalId,
          role: "arbiter",
          address,
        })
      : null;
  const rulingReceiptScopeKey = JSON.stringify([
    id.toString(),
    pendingRecordKey,
  ]);
  const rulingReceiptScope = useMemo(
    () => createAsyncOperationScope(rulingReceiptScopeKey),
    [rulingReceiptScopeKey],
  );

  useLayoutEffect(() => {
    rulingReceiptScope.open();
    setIsSavingRulingRecord(false);
    const storage = getBrowserRecoveryStorage("session");
    const recovered =
      pendingRecordKey && storage
        ? readRecoveryJson(
            pendingRecordKey,
            isArbiterRulingReceiptAction,
            storage,
          )
        : null;
    pendingRecordStored.current = Boolean(recovered);
    setPendingRecord(recovered);
    setRulingRecorded(Boolean(recovered));
    setRecordError(
      recovered
        ? "OpenEscrow recovered a confirmed testnet ruling that still needs to be added to the private Record. Finish that Record update; do not submit another ruling."
        : null,
    );
    return () => rulingReceiptScope.close();
  }, [pendingRecordKey, rulingReceiptScope]);

  useLayoutEffect(() => {
    if (pendingRecord && recordError && !isSavingRulingRecord) {
      rulingReceiptRetryButton.current?.focus({ preventScroll: true });
    }
  }, [isSavingRulingRecord, pendingRecord, recordError]);

  const isArbiter = address?.toLowerCase() === agreement.arbiter.toLowerCase();
  if (
    !isArbiter ||
    (agreement.phase !== Phase.Disputed && !pendingRecord && !rulingRecorded)
  ) {
    return null;
  }

  const disputed = agreement.locked;
  const amountUnit = agreementAmountUnit(agreement.token, YIELD_USDC_ADDRESS);
  let awardRaw: bigint | null = null;
  try {
    awardRaw = award ? parseUSDC(award) : null;
  } catch {
    awardRaw = null;
  }
  const valid = awardRaw !== null && awardRaw >= 0n && awardRaw <= disputed;

  async function saveRuling(action: ArbiterRulingReceiptAction) {
    if (!negotiationAccess || negotiationAccess.role !== "arbiter") return;
    const operationId = rulingReceiptScope.start();
    setRecordError(null);
    setIsSavingRulingRecord(true);
    try {
      await negotiationAction(negotiationAccess, action);
      const storage = getBrowserRecoveryStorage("session");
      if (pendingRecordKey && storage) {
        clearRecoveryJsonIf(
          pendingRecordKey,
          (value) =>
            isArbiterRulingReceiptAction(value) &&
            sameDecisionReceipt(value, action),
          storage,
        );
      }
      if (!rulingReceiptScope.isCurrent(operationId)) return;
      setPendingRecord((current) =>
        sameDecisionReceipt(current, action) ? null : current,
      );
      setRulingRecorded(true);
      onRefetch?.();
    } catch (cause) {
      if (!rulingReceiptScope.isCurrent(operationId)) return;
      const reloadWarning = pendingRecordStored.current
        ? " This retry is kept only in this browser tab until it is saved."
        : " This browser could not keep a reload-recovery copy, so keep this page open and retry now.";
      const failureDetail = cause instanceof Error
        ? `: ${cause.message.replace(/[.\s]+$/, "")}.`
        : ".";
      setRecordError(
        `The testnet ruling succeeded, but it still needs to be added to the private Record${failureDetail}${reloadWarning}`,
      );
    } finally {
      if (rulingReceiptScope.isCurrent(operationId)) {
        setIsSavingRulingRecord(false);
      }
    }
  }

  const recordRecovery = pendingRecord && (
    <div className="receipt-recovery" aria-busy={isSavingRulingRecord}>
      {recordError && (
        <p className="tx-error" role="alert">
          {recordError}
        </p>
      )}
      {isSavingRulingRecord && (
        <p className="hint" role="status" aria-live="polite">
          Adding the confirmed ruling to the private Record...
        </p>
      )}
      <button
        ref={rulingReceiptRetryButton}
        className="btn btn-ghost small"
        type="button"
        disabled={isSavingRulingRecord}
        onClick={() => void saveRuling(pendingRecord)}
      >
        {isSavingRulingRecord
          ? "Adding ruling to Record..."
          : "Finish adding ruling to Record"}
      </button>
    </div>
  );

  if (rulingRecorded || agreement.phase !== Phase.Disputed) {
    return (
      <div
        className="action-section"
        id={`agreement-${id.toString()}-resolution`}
        tabIndex={-1}
      >
        <h3>Ruling confirmed</h3>
        <p className="hint">
          The testnet ruling is confirmed. OpenEscrow will only finish the private Record update;
          it will not submit another ruling.
        </p>
        {recordRecovery}
      </div>
    );
  }

  return (
    <div className="action-section" id={`agreement-${id.toString()}-resolution`} tabIndex={-1}>
      <span className="eyebrow">Arbiter decision</span>
      <h3>Decide how the disputed balance is split</h3>
      <p className="hint">
        Review the submitted documentation, then enter how much of the {formatUSDC(disputed)} {amountUnit}
        disputed balance should go to the landlord. The rest returns to the tenant. You cannot
        award more than the disputed balance.
      </p>
      <EvidenceList id={id} negotiationAccess={negotiationAccess} />
      <label>
        Award to landlord ({amountUnit}, max {formatUSDC(disputed)})
        <input value={award} onChange={(e) => setAward(e.target.value)} type="number" min="0" step="0.000001" />
      </label>
      <label>
        Ruling note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Briefly explain how the submitted documentation supports this allocation."
          rows={3}
        />
      </label>
      <div className="button-row">
        <button className="btn btn-ghost" onClick={() => setAward("0")}>
          Set to 0 (all to tenant)
        </button>
        <button className="btn btn-ghost" onClick={() => setAward(formatUSDC(disputed))}>
          Set to full disputed amount (all to landlord)
        </button>
      </div>
      <TxButton
        address={OPEN_ESCROW_ADDRESS}
        abi={OpenEscrowABI}
        functionName="resolveDispute"
        args={[id, awardRaw ?? 0n]}
        label="Submit ruling"
        disabled={!valid}
        onSuccess={(transactionHash) => {
          if (!negotiationAccess || negotiationAccess.role !== "arbiter" || awardRaw === null) return;
          const action: ArbiterRulingReceiptAction = {
            type: "arbiter_ruling",
            awardToLandlord: formatUSDC(awardRaw),
            note: note.trim(),
            transactionHash,
          };
          setRulingRecorded(true);
          setPendingRecord(action);
          const storage = getBrowserRecoveryStorage("session");
          pendingRecordStored.current = Boolean(
            pendingRecordKey &&
              storage &&
              writeRecoveryJson(pendingRecordKey, action, storage),
          );
          void saveRuling(action);
        }}
      />
      {recordRecovery}
    </div>
  );
}
