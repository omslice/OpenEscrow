import { useEffect, useState } from "react";
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
  readRecoveryTransaction,
  writeRecoveryValue,
} from "../lib/browserRecovery";
import {
  loadNegotiationSnapshot,
  negotiationReportDownloadUrl,
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
  onAnchored: () => void;
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

  function clear() {
    setPendingTransaction(null);
    if (storageKey) clearRecoveryValue(storageKey);
  }

  return { pendingTransaction, remember, clear };
}

function StandardAnchorAction({
  access,
  agreementId,
  snapshot,
  onAnchored,
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
      recovery.clear();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The anchor succeeded, but the activity record could not be updated: ${cause.message}`
          : "The anchor succeeded, but the activity record could not be updated.",
      );
    }
  }

  if (anchored.data === true) {
    return (
      <>
        <p className="tx-success">This wallet has anchored this exact snapshot onchain.</p>
        {recovery.pendingTransaction && (
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => void recordReceipt(recovery.pendingTransaction!)}
          >
            Retry saving the transaction receipt
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
        label="Anchor this snapshot onchain"
        onSuccess={(transactionHash) => {
          recovery.remember(transactionHash);
          void recordReceipt(transactionHash)
            .then(() => {
              void anchored.refetch();
              onAnchored();
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
          Retry saving the transaction receipt
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
  onAnchored,
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
      recovery.clear();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `The anchor succeeded, but the activity record could not be updated: ${cause.message}`
          : "The anchor succeeded, but the activity record could not be updated.",
      );
    }
  }

  if (anchored.data === true) {
    return (
      <>
        <p className="tx-success">This wallet has anchored this exact snapshot onchain.</p>
        {recovery.pendingTransaction && (
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => void recordReceipt(recovery.pendingTransaction!)}
          >
            Retry saving the transaction receipt
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
            await publicClient.waitForTransactionReceipt({ hash: result.hash });
            recovery.remember(result.hash);
            await recordReceipt(result.hash);
            await anchored.refetch();
            onAnchored();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message.split("\n")[0]
                : "The sponsored anchor transaction failed.",
            );
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? "Anchoring with gas covered..." : "Anchor this snapshot—gas covered"}
      </button>
      {recovery.pendingTransaction && (
        <button
          className="btn btn-ghost small"
          type="button"
          onClick={() => void recordReceipt(recovery.pendingTransaction!)}
        >
          Retry saving the transaction receipt
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
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function downloadContent(content: string, type: string, filename: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadEncryptedRecord() {
    setLoading(true);
    setStatus(null);
    try {
      const next = await loadNegotiationSnapshot(access);
      const encrypted = await encryptRecordSnapshot(
        next,
        access.proposalId,
        agreementId,
      );
      setSnapshot(next);
      setEncryptedExport(encrypted);
      downloadContent(
        JSON.stringify(encrypted.archive, null, 2),
        "application/json",
        `openescrow-${access.proposalId}-${next.hash.slice(2, 10)}.encrypted.json`,
      );
      setStatus(
        "Encrypted record downloaded. Save the verification key separately before leaving this page.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The encrypted record could not be generated.",
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadVerificationKey() {
    if (!encryptedExport) return;
    downloadContent(
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
  }

  return (
    <div className="record-snapshot">
      <section className="record-export-step">
        <div>
          <span className="eyebrow">1 · Readable report</span>
          <strong>Download the complete timestamped record</strong>
          <p className="field-help">
            Includes the parties, approved terms and revisions, itemized claims, transaction
            receipts, and every timestamped activity recorded for this agreement.
          </p>
        </div>
        <a
          className="btn btn-secondary"
          href={negotiationReportDownloadUrl(access)}
        >
          Download complete record report
        </a>
      </section>

      <section className="record-export-step">
        <div>
          <span className="eyebrow">2 · Encrypted evidence copy</span>
          <strong>Download the encrypted record and verification key</strong>
          <p className="field-help">
            The complete canonical JSON is encrypted in this browser with a new AES-256-GCM key.
            The plaintext record is not uploaded during export.
          </p>
        </div>
        <div className="button-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void downloadEncryptedRecord()}
            disabled={loading}
          >
            {loading ? "Preparing encrypted record..." : "Download encrypted record"}
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
                onClick={() =>
                  void navigator.clipboard.writeText(encryptedExport.verificationKey)
                }
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
              OpenEscrow cannot recover it. Keep it private and separate from the encrypted JSON.
            </span>
          </div>
        )}
      </section>

      {snapshot && (
        <section className="record-export-step snapshot-anchor">
          <div>
            <span className="eyebrow">3 · Onchain integrity receipt</span>
            <strong>Save this record hash onchain</strong>
          </div>
          <p className="field-help">
            Only the SHA-256 hash and the anchoring wallet are public. Names, emails, notes,
            documents, the encrypted file, and its verification key stay private.
          </p>
          <code className="snapshot-hash" title={snapshot.hash}>
            {snapshot.algorithm}: {snapshot.hash}
          </code>
          {agreementId !== undefined && registry.isReady ? (
            <AnchorAction
              access={access}
              agreementId={agreementId}
              snapshot={snapshot}
              onAnchored={() => setStatus("Record hash anchored onchain.")}
            />
          ) : agreementId === undefined ? (
            <p className="field-help">
              Finalize this proposal before saving its record hash onchain.
            </p>
          ) : registry.isChecking ? (
            <p className="field-help">Checking the onchain record service…</p>
          ) : (
            <p className="tx-error" role="alert">
              Onchain anchoring is temporarily unavailable because the record service
              is not connected to this OpenEscrow release.
            </p>
          )}
        </section>
      )}

      <section className="record-export-step">
        <span className="eyebrow">4 · Independent verification</span>
        <RecordSnapshotVerifier
          proposalId={access.proposalId}
          agreementId={agreementId}
          registryReady={registry.isReady}
          registryChecking={registry.isChecking}
        />
      </section>
      {status && (
        <p
          className={
            status.includes("could not") || status.includes("invalid")
              ? "tx-error"
              : "tx-success"
          }
        >
          {status}
        </p>
      )}
    </div>
  );
}
