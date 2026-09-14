import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  AgreementActivityRegistryABI,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  clearRecoveryValue,
  clearRecoveryValueIfMatches,
  readRecoveryTransaction,
  writeRecoveryValue,
} from "../lib/browserRecovery";
import {
  copyTextToClipboard,
  downloadTextFile,
} from "../lib/browserActions";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import { blockchainErrorMessage } from "../lib/blockchainErrorMessage";
import { waitForSuccessfulTransactionReceipt } from "../lib/successfulTransactionReceipt";
import {
  loadNegotiationSnapshot,
  loadNegotiationReport,
  negotiationAction,
  type AgreementSnapshot,
  type NegotiationAccess,
} from "../lib/negotiations";
import {
  encryptRecordSnapshot,
  type EncryptedRecordArchive,
} from "../lib/recordArchive";
import { useActivityRegistryReadiness } from "../lib/useActivityRegistryReadiness";
import { TxButton } from "./TxButton";
import { RecordSnapshotVerifier } from "./RecordSnapshotVerifier";

type AnchorProps = {
  access: NegotiationAccess;
  agreementId: bigint;
  snapshot: AgreementSnapshot;
};

type RecordExportFeedback = {
  tone: "success" | "error";
  message: string;
};

function useAnchorRecovery(
  access: NegotiationAccess,
  snapshot: AgreementSnapshot,
  address?: `0x${string}`,
) {
  const storageKey = address
    ? `openescrow:pending-anchor:${access.proposalId}:${access.role}:${snapshot.hash}:${address.toLowerCase()}`
    : null;
  const [pendingTransaction, setPendingTransaction] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setPendingTransaction(null);
      return;
    }
    setPendingTransaction(readRecoveryTransaction(storageKey));
  }, [storageKey]);

  function remember(transactionHash: `0x${string}`) {
    setPendingTransaction(transactionHash);
    if (storageKey) writeRecoveryValue(storageKey, transactionHash);
  }

  function clear(transactionHash?: `0x${string}`) {
    setPendingTransaction((current) =>
      transactionHash && current !== transactionHash ? current : null,
    );
    if (storageKey) {
      if (transactionHash) {
        clearRecoveryValueIfMatches(storageKey, transactionHash);
      } else {
        clearRecoveryValue(storageKey);
      }
    }
  }

  return { pendingTransaction, remember, clear };
}

function StandardAnchorAction({
  access,
  agreementId,
  snapshot,
}: AnchorProps) {
  const { address } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const recovery = useAnchorRecovery(access, snapshot, address);
  const anchored = useReadContract({
    address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
    abi: AgreementActivityRegistryABI,
    functionName: "anchoredBy",
    args: address ? [agreementId, snapshot.hash, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  async function recordReceipt(transactionHash: `0x${string}`) {
    setError(null);
    try {
      await negotiationAction(access, {
        type: "record_snapshot_anchored",
        snapshotHash: snapshot.hash,
        transactionHash,
      });
      recovery.clear(transactionHash);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The public proof was saved, but its confirmation could not be added to the private Record: ${cause.message}`
          : "The public proof was saved, but its confirmation could not be added to the private Record.",
      );
    }
  }

  if (anchored.data === true) {
    return (
      <>
        <p className="tx-success" role="status">
          This wallet has saved proof of this exact record on the test network.
        </p>
        {recovery.pendingTransaction && (
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => void recordReceipt(recovery.pendingTransaction!)}
          >
            Finish adding proof to Record
          </button>
        )}
        {error && <p className="tx-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      <TxButton
        address={AGREEMENT_ACTIVITY_REGISTRY_ADDRESS}
        abi={AgreementActivityRegistryABI}
        functionName="anchorSnapshot"
        args={[agreementId, snapshot.hash]}
        label="Save public proof of this record"
        onSuccess={(transactionHash) => {
          recovery.remember(transactionHash);
          void recordReceipt(transactionHash)
            .then(() => {
              void anchored.refetch();
            })
            .catch(() => undefined);
        }}
      />
      {recovery.pendingTransaction && (
        <button
          className="btn btn-ghost small"
          type="button"
          onClick={() => void recordReceipt(recovery.pendingTransaction!)}
        >
          Finish adding proof to Record
        </button>
      )}
      {error && <p className="tx-error" role="alert">{error}</p>}
    </>
  );
}

function SponsoredAnchorAction({
  access,
  agreementId,
  snapshot,
}: AnchorProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recovery = useAnchorRecovery(access, snapshot, address);
  const anchored = useReadContract({
    address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
    abi: AgreementActivityRegistryABI,
    functionName: "anchoredBy",
    args: address ? [agreementId, snapshot.hash, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  async function recordReceipt(transactionHash: `0x${string}`) {
    setError(null);
    try {
      await negotiationAction(access, {
        type: "record_snapshot_anchored",
        snapshotHash: snapshot.hash,
        transactionHash,
      });
      recovery.clear(transactionHash);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The public proof was saved, but its confirmation could not be added to the private Record: ${cause.message}`
          : "The public proof was saved, but its confirmation could not be added to the private Record.",
      );
    }
  }

  if (anchored.data === true) {
    return (
      <>
        <p className="tx-success" role="status">
          This wallet has saved proof of this exact record on the test network.
        </p>
        {recovery.pendingTransaction && (
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => void recordReceipt(recovery.pendingTransaction!)}
          >
            Finish adding proof to Record
          </button>
        )}
        {error && <p className="tx-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!address || working}
        onClick={async () => {
          if (!address || !publicClient) return;
          setWorking(true);
          setError(null);
          try {
            const result = await sendTransaction(
              {
                to: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
                data: encodeFunctionData({
                  abi: AgreementActivityRegistryABI,
                  functionName: "anchorSnapshot",
                  args: [agreementId, snapshot.hash],
                }),
                chainId: 84532,
              },
              { address, sponsor: true },
            );
            await waitForSuccessfulTransactionReceipt(
              () => publicClient.waitForTransactionReceipt({ hash: result.hash }),
              "The public-proof action reached the test network but did not complete. No public proof was recorded. Refresh the Record and try again.",
            );
            recovery.remember(result.hash);
            await recordReceipt(result.hash);
            await anchored.refetch();
          } catch (cause) {
            setError(
              blockchainErrorMessage(
                cause,
                "The public proof could not be saved. Refresh the Record before trying again.",
              ),
            );
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? "Saving public proof..." : "Save public proof—network fee covered"}
      </button>
      {recovery.pendingTransaction && (
        <button
          className="btn btn-ghost small"
          type="button"
          onClick={() => void recordReceipt(recovery.pendingTransaction!)}
        >
          Finish adding proof to Record
        </button>
      )}
      {error && <p className="tx-error" role="alert">{error}</p>}
    </>
  );
}

function PrivyAnchorAction(props: AnchorProps) {
  const { address } = useAccount();
  const { ready, wallets } = useWallets();
  if (!ready) return null;
  const activeWallet = wallets.find(
    (wallet) => wallet.address.toLowerCase() === address?.toLowerCase(),
  );
  return activeWallet?.walletClientType === "privy" ? (
    <SponsoredAnchorAction {...props} />
  ) : (
    <StandardAnchorAction {...props} />
  );
}

function AnchorAction(props: AnchorProps) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyAnchorAction {...props} />
  ) : (
    <StandardAnchorAction {...props} />
  );
}

export function RecordSnapshotControls({
  access,
  agreementId,
}: {
  access: NegotiationAccess;
  agreementId?: bigint;
}) {
  const registry = useActivityRegistryReadiness();
  const [snapshot, setSnapshot] = useState<AgreementSnapshot | null>(null);
  const [encryptedExport, setEncryptedExport] = useState<{
    archive: EncryptedRecordArchive;
    verificationKey: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<RecordExportFeedback | null>(null);
  const [loading, setLoading] = useState<"report" | "encrypted" | null>(null);
  const reportButtonRef = useRef<HTMLButtonElement>(null);
  const encryptedButtonRef = useRef<HTMLButtonElement>(null);
  const exportScopeKey = JSON.stringify([
    access.proposalId,
    access.role,
    access.token,
    agreementId?.toString() ?? null,
  ]);
  const exportScope = useMemo(
    () => createAsyncOperationScope(exportScopeKey),
    [exportScopeKey],
  );

  useLayoutEffect(() => {
    exportScope.open();
    setSnapshot(null);
    setEncryptedExport(null);
    setFeedback(null);
    setLoading(null);
    return () => exportScope.close();
  }, [exportScope]);

  async function downloadReadableReport() {
    const operationId = exportScope.start();
    const actionButton = reportButtonRef.current;
    const restoreFocus = document.activeElement === actionButton;
    setLoading("report");
    setFeedback(null);
    try {
      const report = await loadNegotiationReport(access);
      if (!exportScope.isCurrent(operationId)) return;
      downloadTextFile(report.content, report.contentType, report.filename);
      setFeedback({
        tone: "success",
        message: "Complete timestamped record downloaded.",
      });
    } catch (error) {
      if (!exportScope.isCurrent(operationId)) return;
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The complete record report could not be downloaded.",
      });
    } finally {
      if (exportScope.isCurrent(operationId)) {
        setLoading(null);
        if (restoreFocus) {
          window.requestAnimationFrame(() => {
            if (exportScope.isCurrent(operationId) && actionButton?.isConnected) {
              actionButton.focus({ preventScroll: true });
            }
          });
        }
      }
    }
  }

  async function downloadEncryptedRecord() {
    const operationId = exportScope.start();
    const actionButton = encryptedButtonRef.current;
    const restoreFocus = document.activeElement === actionButton;
    setLoading("encrypted");
    setFeedback(null);
    try {
      const next = await loadNegotiationSnapshot(access);
      const encrypted = await encryptRecordSnapshot(
        next,
        access.proposalId,
        agreementId,
      );
      if (!exportScope.isCurrent(operationId)) return;
      downloadTextFile(
        JSON.stringify(encrypted.archive, null, 2),
        "application/json",
        `openescrow-${access.proposalId}-${next.hash.slice(2, 10)}.encrypted.json`,
      );
      setSnapshot(next);
      setEncryptedExport(encrypted);
      setFeedback({
        tone: "success",
        message:
          "Encrypted record downloaded. Save the verification key separately before leaving this page.",
      });
    } catch (error) {
      if (!exportScope.isCurrent(operationId)) return;
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The encrypted record could not be generated.",
      });
    } finally {
      if (exportScope.isCurrent(operationId)) {
        setLoading(null);
        if (restoreFocus) {
          window.requestAnimationFrame(() => {
            if (exportScope.isCurrent(operationId) && actionButton?.isConnected) {
              actionButton.focus({ preventScroll: true });
            }
          });
        }
      }
    }
  }

  function downloadVerificationKey() {
    if (!encryptedExport) return;
    setFeedback(null);
    try {
      downloadTextFile(
        [
          "OpenEscrow encrypted record verification key",
          "",
          encryptedExport.verificationKey,
          "",
          `Record SHA-256: ${encryptedExport.archive.integrity.canonicalRecordHash}`,
          "Keep this key private and separate from the encrypted JSON.",
        ].join("\n"),
        "text/plain",
        `openescrow-${access.proposalId}-verification-key.txt`,
      );
      setFeedback({
        tone: "success",
        message:
          "Verification key downloaded. Keep it private and separate from the encrypted JSON.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The verification key could not be downloaded.",
      });
    }
  }

  async function copyVerificationKey() {
    if (!encryptedExport) return;
    const operationId = exportScope.start();
    setFeedback(null);
    try {
      await copyTextToClipboard(encryptedExport.verificationKey);
      if (!exportScope.isCurrent(operationId)) return;
      setFeedback({
        tone: "success",
        message:
          "Verification key copied. Keep it private and separate from the encrypted JSON.",
      });
    } catch (error) {
      if (!exportScope.isCurrent(operationId)) return;
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The verification key could not be copied.",
      });
    }
  }

  return (
    <div className="record-snapshot">
      <section className="record-export-step">
        <div>
          <span className="eyebrow">1 · Readable report</span>
          <strong>Download the complete timestamped record</strong>
          <p className="field-help">
            Includes the parties, approved terms and revisions, itemized claims, test-network
            confirmations, and every timestamped activity recorded for this agreement.
          </p>
        </div>
        <button
          ref={reportButtonRef}
          className="btn btn-secondary"
          type="button"
          onClick={() => void downloadReadableReport()}
          disabled={loading !== null}
        >
          {loading === "report"
            ? "Preparing complete record..."
            : "Download complete record report"}
        </button>
      </section>

      <section className="record-export-step">
        <div>
          <span className="eyebrow">2 · Private backup</span>
          <strong>Download an encrypted backup and its key</strong>
          <p className="field-help">
            The backup is locked in this browser before it downloads. OpenEscrow does not receive
            the readable record during export.
          </p>
          <details className="technical-details">
            <summary>Technical details</summary>
            <p>
              The complete canonical JSON is encrypted locally with a new AES-256-GCM key. The
              readable JSON is not uploaded during export.
            </p>
          </details>
        </div>
        <div className="button-row">
          <button
            ref={encryptedButtonRef}
            className="btn btn-primary"
            type="button"
            onClick={() => void downloadEncryptedRecord()}
            disabled={loading !== null}
          >
            {loading === "encrypted"
              ? "Preparing encrypted record..."
              : "Download encrypted record"}
          </button>
          {encryptedExport && (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={downloadVerificationKey}
              >
                Download verification key
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void copyVerificationKey()}
              >
                Copy verification key
              </button>
            </>
          )}
        </div>
        {encryptedExport && (
          <div className="record-key-warning" role="status">
            <strong>Save the verification key now.</strong>
            <span>
              You need both the encrypted record and this key to open or verify the backup.
              OpenEscrow cannot recover the key.
            </span>
          </div>
        )}
      </section>

      <section className="record-export-step snapshot-anchor">
        <div>
          <span className="eyebrow">3 · Optional public proof</span>
          <strong>Save proof that this record has not changed</strong>
        </div>
        <p className="field-help">
          The test network stores a digital fingerprint and the saving wallet—not the record
          itself. Names, emails, notes, documents, the encrypted file, and its key stay private.
        </p>
        {snapshot ? (
          <>
            <details className="technical-details record-proof-details">
              <summary>View technical fingerprint</summary>
              <code className="snapshot-hash" title={snapshot.hash}>
                {snapshot.algorithm}: {snapshot.hash}
              </code>
            </details>
            {agreementId !== undefined && registry.isReady ? (
              <AnchorAction
                key={snapshot.hash}
                access={access}
                agreementId={agreementId}
                snapshot={snapshot}
              />
            ) : agreementId === undefined ? (
              <p className="field-help">
                Finalize this proposal before saving a public proof.
              </p>
            ) : registry.isChecking ? (
              <p className="field-help">Checking the public proof service…</p>
            ) : (
              <p className="tx-error" role="alert">
                Public proof is temporarily unavailable because the record service is not
                connected to this OpenEscrow release.
              </p>
            )}
          </>
        ) : (
          <p className="field-help">
            Download the encrypted record above to prepare the fingerprint for this optional
            test-network check.
          </p>
        )}
      </section>

      <section className="record-export-step">
        <span className="eyebrow">4 · Independent check</span>
        <RecordSnapshotVerifier
          proposalId={access.proposalId}
          agreementId={agreementId}
          registryReady={registry.isReady}
          registryChecking={registry.isChecking}
        />
      </section>
      {feedback && (
        <p
          className={feedback.tone === "error" ? "tx-error" : "tx-success"}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
