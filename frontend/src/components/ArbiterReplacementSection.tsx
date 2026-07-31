import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, ZERO_ADDRESS } from "../contracts/config";
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
  const canSaveRecovery =
    /^0x[a-fA-F0-9]{64}$/.test(recoveryTransactionHash.trim()) &&
    Boolean(negotiationAccess) &&
    (replacementAcceptedOnchain ||
      (replacementClearedWithoutAcceptance &&
        negotiationAccess?.role === replacementRecord?.proposedByRole));

  async function saveReplacementRecord(action: ArbiterReplacementAction) {
    if (!negotiationAccess) return;
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
            : "Invitation prepared. It will open the private record only after the other party confirms onchain.",
        );
      } else if (action.type === "arbiter_replacement_accepted") {
        setInviteUrl(null);
        setRecordStatus("The new arbiter now has record access. The former arbiter's access was revoked.");
      } else if (action.type === "arbiter_replacement_cancelled") {
        setInviteUrl(null);
        setRecordStatus("The pending invitation was revoked.");
      } else {
        setRecordStatus("The onchain step and private agreement record now match.");
      }
      setPendingRecord(null);
      onRefetch?.();
    } catch (cause) {
      setRecordError(
        cause instanceof Error
          ? `The onchain step succeeded, but its private record still needs to be saved: ${cause.message}`
          : "The onchain step succeeded, but its private record still needs to be saved.",
      );
    } finally {
      setIsSavingRecord(false);
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
              ? "The replacement is complete onchain, but the private record still needs its verified acceptance receipt before access can rotate."
              : "The replacement is no longer pending onchain, but the private record still needs the verified cancellation receipt before the nominee's access can be revoked."}
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
            disabled={!canSaveRecovery || isSavingRecord}
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
              : replacementAcceptedOnchain
                ? "Finish updating arbiter access"
                : "Finish revoking nominee access"}
          </button>
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
          Retry saving replacement receipt
        </button>
      )}
      {recordStatus && <p className="tx-success" role="status">{recordStatus}</p>}
      {recordError && <p className="tx-error" role="alert">{recordError}</p>}
    </div>
  );
}
