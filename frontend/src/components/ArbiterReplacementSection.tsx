import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  DEPLOYMENT_BLOCK,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  Phase,
  ZERO_ADDRESS,
} from "../contracts/config";
import {
  findArbiterReplacementTransaction,
  type ArbiterReplacementRecoveryClient,
} from "../lib/arbiterReplacementTransaction";
import { copyTextToClipboard } from "../lib/browserActions";
import { shortAddr } from "../lib/format";
import {
  arbiterReplacementAction,
  buildNegotiationInviteUrl,
  type ArbiterReplacementAction,
  type ArbiterReplacementActionResult,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

const REPLACEABLE = new Set<number>([Phase.Active, Phase.ClaimOpen, Phase.Disputed]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mutual-consent arbiter replacement. Hosted agreements mirror every handshake
 * receipt so the prior arbiter keeps access until acceptance, the nominee gains
 * access only after both parties confirm, and the prior access is then revoked.
 */
export function ArbiterReplacementSection({
  id,
  agreement,
  negotiationAccess,
  participantRecord,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  onRefetch?: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [candidate, setCandidate] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [recoveryTransactionHash, setRecoveryTransactionHash] = useState("");
  const [pendingRecord, setPendingRecord] = useState<ArbiterReplacementAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [replacementRecord, setReplacementRecord] = useState(
    participantRecord?.arbiterReplacement || null,
  );
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isRecoveringConfirmation, setIsRecoveringConfirmation] = useState(false);

  useEffect(() => {
    setReplacementRecord(participantRecord?.arbiterReplacement || null);
  }, [participantRecord?.arbiterReplacement]);

  if (!REPLACEABLE.has(agreement.phase)) return null;

  const normalizedAddress = address?.toLowerCase();
  const isLandlord = normalizedAddress === agreement.landlord.toLowerCase();
  const isTenant = normalizedAddress === agreement.tenant.toLowerCase();
  const isArbiter = normalizedAddress === agreement.arbiter.toLowerCase();
  if (!isLandlord && !isTenant && !isArbiter) return null;

  const hasPending = agreement.pendingArbiter !== ZERO_ADDRESS;
  const isInitialAppointment = agreement.arbiter === ZERO_ADDRESS;
  const isProposer = normalizedAddress === agreement.pendingArbiterProposer.toLowerCase();
  const isPendingArbiter = normalizedAddress === agreement.pendingArbiter.toLowerCase();
  const hostedRecord = Boolean(participantRecord);
  const canSyncParty =
    negotiationAccess?.role === "landlord" || negotiationAccess?.role === "tenant";
  const canSyncNominee = negotiationAccess?.role === "arbiter";
  const hostedWalletMatchesChain =
    !replacementRecord ||
    !hasPending ||
    replacementRecord.wallet.toLowerCase() === agreement.pendingArbiter.toLowerCase();
  const replacementAcceptedOnchain = Boolean(
    replacementRecord &&
      !hasPending &&
      agreement.arbiter.toLowerCase() === replacementRecord.wallet.toLowerCase(),
  );
  const replacementClearedWithoutAcceptance = Boolean(
    replacementRecord && !hasPending && !replacementAcceptedOnchain,
  );
  const recoveryActorIsAllowed =
    replacementAcceptedOnchain ||
    (replacementClearedWithoutAcceptance &&
      negotiationAccess?.role === replacementRecord?.proposedByRole);
  const canRecoverAutomatically = Boolean(
    publicClient &&
      negotiationAccess &&
      replacementRecord &&
      isAddress(replacementRecord.wallet) &&
      recoveryActorIsAllowed,
  );
  const canSaveRecovery =
    /^0x[a-fA-F0-9]{64}$/.test(recoveryTransactionHash.trim()) &&
    Boolean(negotiationAccess) &&
    recoveryActorIsAllowed;

  async function saveReplacementRecord(action: ArbiterReplacementAction) {
    if (!negotiationAccess) return false;
    setIsSavingRecord(true);
    setRecordError(null);
    setRecordStatus(null);
    try {
      const result: ArbiterReplacementActionResult = await arbiterReplacementAction(
        negotiationAccess,
        action,
      );
      setReplacementRecord(result.record.arbiterReplacement || null);
      if (result.invite) {
        setInviteUrl(
          buildNegotiationInviteUrl(
            "arbiter",
            negotiationAccess.proposalId,
            result.invite.token,
          ),
        );
        setRecordStatus(
          result.record.arbiterReplacement?.status === "confirmed"
            ? "A fresh replacement-arbiter invitation is ready to send."
            : "Invitation prepared. It will open the private Record only after the other party confirms on the test network.",
        );
      } else if (action.type === "arbiter_replacement_accepted") {
        setInviteUrl(null);
        setRecordStatus("The new arbiter now has record access. The former arbiter's access was revoked.");
      } else if (action.type === "arbiter_replacement_cancelled") {
        setInviteUrl(null);
        setRecordStatus("The pending invitation was revoked.");
      } else {
        setRecordStatus("The test-network step and private Record now match.");
      }
      setPendingRecord(null);
      onRefetch?.();
      return true;
    } catch (cause) {
      setRecordError(
        cause instanceof Error
          ? `The test-network step succeeded, but its private Record still needs to be updated: ${cause.message}`
          : "The test-network step succeeded, but its private Record still needs to be updated.",
      );
      return false;
    } finally {
      setIsSavingRecord(false);
    }
  }

  async function recoverReplacementConfirmation() {
    if (
      !publicClient ||
      !negotiationAccess ||
      !replacementRecord ||
      !isAddress(replacementRecord.wallet) ||
      !recoveryActorIsAllowed
    ) {
      return;
    }
    setIsRecoveringConfirmation(true);
    setRecordError(null);
    setRecordStatus(null);
    try {
      const transactionHash = await findArbiterReplacementTransaction(
        publicClient as unknown as ArbiterReplacementRecoveryClient,
        {
          deploymentBlock: DEPLOYMENT_BLOCK,
          contractAddress: OPEN_ESCROW_ADDRESS,
          abi: OpenEscrowABI,
          agreementId: id,
          replacementWallet: replacementRecord.wallet,
          proposedAt: replacementRecord.proposedAt,
          outcome: replacementAcceptedOnchain ? "accepted" : "cancelled",
        },
      );
      if (!transactionHash) {
        setRecordError(
          "OpenEscrow could not find the matching test-network confirmation. Try again, or open Technical recovery below if you have the transaction hash.",
        );
        return;
      }
      setRecoveryTransactionHash(transactionHash);
      const saved = await saveReplacementRecord({
        type: replacementAcceptedOnchain
          ? "arbiter_replacement_accepted"
          : "arbiter_replacement_cancelled",
        transactionHash,
      });
      if (saved) setRecoveryTransactionHash("");
    } catch {
      setRecordError(
        "OpenEscrow could not search the test network right now. Try again, or use Technical recovery below if you have the transaction hash.",
      );
    } finally {
      setIsRecoveringConfirmation(false);
    }
  }

  function recordAfterSuccess(action: ArbiterReplacementAction) {
    setPendingRecord(action);
    void saveReplacementRecord(action);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await copyTextToClipboard(inviteUrl);
      setRecordStatus("Replacement-arbiter invitation copied.");
    } catch {
      setRecordError("The browser could not copy the invitation. Select and copy the link below.");
    }
  }

  return (
    <div className="action-section">
      <h3>
        {isInitialAppointment
          ? "Appoint an arbiter (mutual consent)"
          : "Replace the arbiter (mutual consent)"}
      </h3>
      {isInitialAppointment && (
        <p className="hint">
          Either party can propose an arbiter and the other must confirm. If a dispute is
          already open, changing the arbiter never extends the ruling deadline.
        </p>
      )}
      {hostedRecord && (
        <p className="hint">
          OpenEscrow keeps private-record access with the current arbiter until the replacement
          accepts. It then activates the nominee and revokes the former arbiter automatically.
        </p>
      )}
      {isArbiter && !hasPending && (
        <p className="hint">You may resign; a replacement still requires both parties' agreement.</p>
      )}
      {isArbiter && !hasPending && (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="resignAsArbiter"
          args={[id]}
          label="Resign as arbiter"
          className="btn btn-ghost"
          onSuccess={onRefetch}
        />
      )}

      {!hasPending && !replacementRecord && (isLandlord || isTenant) && (
        <>
          <p className="hint">
            Propose a new arbiter. The other party—not you—must confirm before it can take effect.
          </p>
          <label>
            New arbiter wallet
            <input
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              placeholder="0x..."
            />
          </label>
          {hostedRecord && (
            <label>
              New arbiter email
              <input
                value={candidateEmail}
                onChange={(event) => setCandidateEmail(event.target.value)}
                type="email"
                placeholder="arbiter@example.com"
                autoComplete="email"
              />
              <span className="field-help">
                Used only for their private agreement-record invitation.
              </span>
            </label>
          )}
          {hostedRecord && !canSyncParty && (
            <p className="tx-error" role="alert">
              Open this agreement through your landlord or tenant record access before proposing
              a replacement, so private access can stay synchronized.
            </p>
          )}
          <TxButton
            address={OPEN_ESCROW_ADDRESS}
            abi={OpenEscrowABI}
            functionName="proposeArbiterReplacement"
            args={[id, candidate]}
            label={isInitialAppointment ? "Propose arbiter" : "Propose replacement"}
            disabled={
              !isAddress(candidate) ||
              candidate.toLowerCase() === agreement.landlord.toLowerCase() ||
              candidate.toLowerCase() === agreement.tenant.toLowerCase() ||
              (hostedRecord &&
                (!canSyncParty || !EMAIL_PATTERN.test(candidateEmail.trim())))
            }
            onSuccess={(transactionHash) => {
              if (!hostedRecord || !negotiationAccess) {
                onRefetch?.();
                return;
              }
              recordAfterSuccess({
                type: "arbiter_replacement_proposed",
                newArbiterEmail: candidateEmail.trim(),
                newArbiterWallet: candidate,
                transactionHash,
              });
            }}
          />
        </>
      )}

      {hasPending && (
        <div>
          <p className="hint">
            Pending replacement: {shortAddr(agreement.pendingArbiter)}, proposed by{" "}
            {shortAddr(agreement.pendingArbiterProposer)}
            {agreement.pendingArbiterConfirmed
              ? " — confirmed, awaiting the nominee's acceptance."
              : " — awaiting the other party's confirmation."}
          </p>
          {!hostedWalletMatchesChain && (
            <p className="tx-error" role="alert">
              The hosted nominee does not match the onchain nominee. Do not continue until the
              private record is refreshed and corrected.
            </p>
          )}
          <div className="button-row">
            {(isLandlord || isTenant) &&
              !isProposer &&
              !agreement.pendingArbiterConfirmed && (
                <TxButton
                  address={OPEN_ESCROW_ADDRESS}
                  abi={OpenEscrowABI}
                  functionName="confirmArbiterReplacement"
                  args={[id]}
                  label="Confirm replacement"
                  disabled={hostedRecord && (!canSyncParty || !hostedWalletMatchesChain)}
                  onSuccess={(transactionHash) => {
                    if (!hostedRecord || !negotiationAccess) {
                      onRefetch?.();
                      return;
                    }
                    recordAfterSuccess({
                      type: "arbiter_replacement_confirmed",
                      transactionHash,
                    });
                  }}
                />
              )}
            {isProposer && (
              <TxButton
                address={OPEN_ESCROW_ADDRESS}
                abi={OpenEscrowABI}
                functionName="cancelArbiterReplacementProposal"
                args={[id]}
                label="Cancel proposal"
                className="btn btn-ghost"
                disabled={hostedRecord && (!canSyncParty || !hostedWalletMatchesChain)}
                onSuccess={(transactionHash) => {
                  if (!hostedRecord || !negotiationAccess) {
                    onRefetch?.();
                    return;
                  }
                  recordAfterSuccess({
                    type: "arbiter_replacement_cancelled",
                    transactionHash,
                  });
                }}
              />
            )}
            {isPendingArbiter && agreement.pendingArbiterConfirmed && (
              <TxButton
                address={OPEN_ESCROW_ADDRESS}
                abi={OpenEscrowABI}
                functionName="acceptArbiterRole"
                args={[id]}
                label="Accept arbiter role"
                disabled={hostedRecord && (!canSyncNominee || !hostedWalletMatchesChain)}
                onSuccess={(transactionHash) => {
                  if (!hostedRecord || !negotiationAccess) {
                    onRefetch?.();
                    return;
                  }
                  recordAfterSuccess({
                    type: "arbiter_replacement_accepted",
                    transactionHash,
                  });
                }}
              />
            )}
          </div>
        </div>
      )}

      {hostedRecord && replacementRecord && !hasPending && (
        <div className="record-link-block">
          <p className="hint">
            {replacementAcceptedOnchain
              ? "The replacement is confirmed on the test network, but the private Record still needs its acceptance confirmation before access can rotate."
              : "The replacement is no longer pending on the test network, but the private Record still needs its cancellation confirmation before the nominee's access can be revoked."}
          </p>
          {replacementClearedWithoutAcceptance &&
            negotiationAccess?.role !== replacementRecord.proposedByRole && (
              <p className="field-help">
                The {replacementRecord.proposedByRole} who proposed this nominee must finish
                recording the cancellation.
              </p>
            )}
          <button
            type="button"
            className="btn btn-secondary small"
            disabled={
              !canRecoverAutomatically || isSavingRecord || isRecoveringConfirmation
            }
            onClick={() => void recoverReplacementConfirmation()}
          >
            {isRecoveringConfirmation || isSavingRecord
              ? "Finding and verifying confirmation..."
              : "Find confirmation and finish Record update"}
          </button>
          {!publicClient && (
            <p className="field-help">
              Connect to Base Sepolia before asking OpenEscrow to find the confirmation.
            </p>
          )}
          <details className="technical-details">
            <summary>Technical recovery</summary>
            <p className="field-help">
              If automatic recovery cannot find the confirmation, paste its Base Sepolia
              transaction hash. OpenEscrow will verify the agreement, event, wallet, and sender
              before changing private-record access.
            </p>
            <label>
              {replacementAcceptedOnchain ? "Acceptance" : "Cancellation"} transaction hash
              <input
                value={recoveryTransactionHash}
                onChange={(event) => setRecoveryTransactionHash(event.target.value)}
                placeholder="0x..."
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost small"
              disabled={!canSaveRecovery || isSavingRecord || isRecoveringConfirmation}
              onClick={() =>
                void saveReplacementRecord({
                  type: replacementAcceptedOnchain
                    ? "arbiter_replacement_accepted"
                    : "arbiter_replacement_cancelled",
                  transactionHash: recoveryTransactionHash.trim(),
                })
              }
            >
              {isSavingRecord
                ? "Verifying..."
                : "Use transaction hash to finish Record update"}
            </button>
          </details>
        </div>
      )}

      {hostedRecord && replacementRecord && hasPending && canSyncParty && (
        <div className="button-row">
          <button
            type="button"
            className="btn btn-ghost small"
            disabled={isSavingRecord}
            onClick={() =>
              void saveReplacementRecord({
                type: "arbiter_replacement_invite_reset",
              })
            }
          >
            {isSavingRecord ? "Preparing..." : "Create fresh nominee invite"}
          </button>
        </div>
      )}

      {inviteUrl && (
        <div className="record-link-block">
          <p className="field-help">
            Send this private link to {replacementRecord?.email || candidateEmail}. It opens only
            after both agreement parties confirm the nominee.
          </p>
          <div className="button-row">
            <button type="button" className="btn btn-secondary small" onClick={() => void copyInvite()}>
              Copy nominee invite
            </button>
          </div>
          <code className="record-link-preview">{inviteUrl}</code>
        </div>
      )}

      {pendingRecord && recordError && (
        <button
          className="btn btn-ghost small"
          type="button"
          disabled={isSavingRecord}
          onClick={() => void saveReplacementRecord(pendingRecord)}
        >
          Finish adding replacement to Record
        </button>
      )}
      {recordStatus && <p className="tx-success" role="status">{recordStatus}</p>}
      {recordError && <p className="tx-error" role="alert">{recordError}</p>}
    </div>
  );
}
