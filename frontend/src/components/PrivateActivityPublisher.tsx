import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  AgreementActivityRegistryABI,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  clearRecoveryValueIfMatches,
  isTransactionHash,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import { downloadTextFile } from "../lib/browserActions";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import { waitForSuccessfulTransactionReceipt } from "../lib/successfulTransactionReceipt";
import {
  canonicalActivityEnvelope,
  createActivityEnvelopeV2,
  hashActivityEnvelope,
} from "../lib/activityProof";
import {
  negotiationAction,
  type NegotiationAction,
  type NegotiationAccess,
} from "../lib/negotiations";
import { TxButton } from "./TxButton";

const activityTypes = [
  { value: 1, label: "Private note", help: "A note about an agreement action or conversation." },
  { value: 2, label: "Document receipt", help: "Proof that a particular document existed." },
  { value: 3, label: "Formal notice", help: "Proof that a notice was prepared or delivered." },
  { value: 4, label: "Decision", help: "Proof of an approval, response, or ruling." },
] as const;

type ActivityProof = {
  algorithm: "keccak256";
  canonical: string;
  contentHash: `0x${string}`;
  transactionHash: `0x${string}`;
};

type ActivityReceiptAction = Extract<
  NegotiationAction,
  { type: "activity_hash_published" }
>;

function isActivityReceiptAction(
  value: unknown,
): value is ActivityReceiptAction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "activity_hash_published" &&
    [1, 2, 3, 4].includes(Number(candidate.activityType)) &&
    isTransactionHash(candidate.contentHash) &&
    isTransactionHash(candidate.transactionHash)
  );
}

function sameActivityReceipt(
  left: ActivityReceiptAction | null,
  right: ActivityReceiptAction,
) {
  return (
    left?.activityType === right.activityType &&
    left.contentHash.toLowerCase() === right.contentHash.toLowerCase() &&
    left.transactionHash.toLowerCase() === right.transactionHash.toLowerCase()
  );
}

type PublishActionProps = {
  agreementId: bigint;
  activityType: number;
  contentHash: `0x${string}`;
  onSubmit: () => void;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (transactionHash: `0x${string}`) => void;
};

function StandardPublishAction(props: PublishActionProps) {
  return (
    <TxButton
      address={AGREEMENT_ACTIVITY_REGISTRY_ADDRESS}
      abi={AgreementActivityRegistryABI}
      functionName="publishActivity"
      args={[props.agreementId, props.activityType, props.contentHash]}
      label="Publish proof hash onchain"
      onSubmit={props.onSubmit}
      onBusyChange={props.onBusyChange}
      onSuccess={props.onSuccess}
    />
  );
}

function SponsoredPublishAction(props: PublishActionProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onBusyChange = props.onBusyChange;

  useEffect(
    () => () => {
      onBusyChange(false);
    },
    [onBusyChange],
  );

  return (
    <>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!address || !publicClient || working}
        onClick={async () => {
          if (!address || !publicClient) return;
          props.onSubmit();
          props.onBusyChange(true);
          setWorking(true);
          setError(null);
          try {
            const result = await sendTransaction(
              {
                to: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
                data: encodeFunctionData({
                  abi: AgreementActivityRegistryABI,
                  functionName: "publishActivity",
                  args: [props.agreementId, props.activityType, props.contentHash],
                }),
                chainId: 84532,
              },
              { address, sponsor: true },
            );
            await waitForSuccessfulTransactionReceipt(
              () => publicClient.waitForTransactionReceipt({ hash: result.hash }),
              "The activity proof transaction reached the test network but did not complete. No public proof or activity receipt was recorded. Refresh the agreement and try again.",
            );
            props.onSuccess(result.hash);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message.split("\n")[0]
                : "The sponsored activity transaction failed.",
            );
          } finally {
            setWorking(false);
            props.onBusyChange(false);
          }
        }}
      >
        {working ? "Publishing with gas covered..." : "Publish proof hash—gas covered"}
      </button>
      {error && <p className="tx-error" role="alert">{error}</p>}
    </>
  );
}

function PrivyPublishAction(props: PublishActionProps) {
  const { address } = useAccount();
  const { ready, wallets } = useWallets();
  if (!ready) return null;
  const activeWallet = wallets.find(
    (wallet) => wallet.address.toLowerCase() === address?.toLowerCase(),
  );
  return activeWallet?.walletClientType === "privy" ? (
    <SponsoredPublishAction {...props} />
  ) : (
    <StandardPublishAction {...props} />
  );
}

function PublishAction(props: PublishActionProps) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyPublishAction {...props} />
  ) : (
    <StandardPublishAction {...props} />
  );
}

export function PrivateActivityPublisher({
  agreementId,
  negotiationAccess,
  onPublished,
}: {
  agreementId: bigint;
  negotiationAccess?: NegotiationAccess | null;
  onPublished: () => void;
}) {
  const { address } = useAccount();
  const [activityType, setActivityType] = useState<1 | 2 | 3 | 4>(1);
  const [content, setContent] = useState("");
  const [proof, setProof] = useState<ActivityProof | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [proofDownloadStatus, setProofDownloadStatus] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [pendingRecord, setPendingRecord] = useState<ActivityReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const recordSaveInFlight = useRef<symbol | null>(null);
  const recordRetryButton = useRef<HTMLButtonElement>(null);
  const pendingRecordKey = negotiationAccess && address
    ? `openescrow:pending-activity-receipt:${negotiationAccess.proposalId}:${agreementId.toString()}:${negotiationAccess.role}:${address.toLowerCase()}`
    : null;
  const publisherScopeKey = JSON.stringify([
    agreementId.toString(),
    pendingRecordKey,
  ]);
  const publisherScope = useMemo(
    () => createAsyncOperationScope(publisherScopeKey),
    [publisherScopeKey],
  );
  const publicationOperation = useRef<number | null>(null);
  const trimmedContent = content.trim();
  const envelope = useMemo(
    () =>
      createActivityEnvelopeV2({
        escrowAddress: OPEN_ESCROW_ADDRESS,
        registryAddress: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
        agreementId,
        activityType,
        content: trimmedContent,
      }),
    [activityType, agreementId, trimmedContent],
  );
  const canonical = useMemo(
    () => canonicalActivityEnvelope(envelope),
    [envelope],
  );
  const contentHash =
    trimmedContent.length >= 4 ? hashActivityEnvelope(envelope) : undefined;
  const selectedType = activityTypes.find((option) => option.value === activityType);

  useLayoutEffect(() => {
    publisherScope.open();
    publicationOperation.current = null;
    recordSaveInFlight.current = null;
    setActivityType(1);
    setContent("");
    setProof(null);
    setPublishing(false);
    setIsSavingRecord(false);
    setProofDownloadStatus(null);
    const recoveredRecord =
      pendingRecordKey
        ? readRecoveryJson(pendingRecordKey, isActivityReceiptAction)
        : null;
    setPendingRecord(recoveredRecord);
    setDetailsOpen(Boolean(recoveredRecord));
    setRecordError(
      recoveredRecord
        ? "OpenEscrow recovered a confirmed testnet activity proof whose agreement receipt still needs to be saved. Retry the record save; do not publish the proof again."
        : null,
    );
    return () => publisherScope.close();
  }, [pendingRecordKey, publisherScope]);

  useLayoutEffect(() => {
    if (detailsOpen && pendingRecord && recordError && !isSavingRecord) {
      recordRetryButton.current?.focus({ preventScroll: true });
    }
  }, [detailsOpen, isSavingRecord, pendingRecord, recordError]);

  async function saveActivityRecord(action: ActivityReceiptAction) {
    if (recordSaveInFlight.current) return;
    const saveToken = Symbol("activity-record-save");
    recordSaveInFlight.current = saveToken;
    const operationId = publisherScope.start();
    setIsSavingRecord(true);
    if (!negotiationAccess) {
      if (publisherScope.isCurrent(operationId)) {
        setPendingRecord((current) =>
          sameActivityReceipt(current, action) ? null : current,
        );
      }
      if (recordSaveInFlight.current === saveToken) {
        recordSaveInFlight.current = null;
      }
      if (publisherScope.isCurrent(operationId)) setIsSavingRecord(false);
      return;
    }
    setRecordError(null);
    try {
      await negotiationAction(negotiationAccess, action);
      if (pendingRecordKey) {
        clearRecoveryValueIfMatches(
          pendingRecordKey,
          JSON.stringify(action),
        );
      }
      if (!publisherScope.isCurrent(operationId)) return;
      setPendingRecord((current) =>
        sameActivityReceipt(current, action) ? null : current,
      );
    } catch (cause) {
      if (!publisherScope.isCurrent(operationId)) return;
      setRecordError(
        cause instanceof Error
          ? `The onchain receipt succeeded, but its agreement record still needs to be saved: ${cause.message}`
          : "The onchain receipt succeeded, but its agreement record still needs to be saved.",
      );
    } finally {
      if (recordSaveInFlight.current === saveToken) {
        recordSaveInFlight.current = null;
      }
      if (publisherScope.isCurrent(operationId)) setIsSavingRecord(false);
    }
  }

  function downloadProof() {
    if (!proof) return;
    setProofDownloadStatus(null);
    const payload = JSON.stringify(
      {
        algorithm: proof.algorithm,
        contentHash: proof.contentHash,
        transactionHash: proof.transactionHash,
        envelope: JSON.parse(proof.canonical),
      },
      null,
      2,
    );
    try {
      downloadTextFile(
        payload,
        "application/json",
        `openescrow-activity-${agreementId}-${proof.contentHash.slice(2, 10)}.json`,
      );
      setProofDownloadStatus({
        message: "Private proof downloaded. Keep it with the matching transaction receipt.",
        error: false,
      });
    } catch (error) {
      setProofDownloadStatus({
        message:
          error instanceof Error ? error.message : "The private proof could not be downloaded.",
        error: true,
      });
    }
  }

  return (
    <details
      className="technical-details private-activity-publisher"
      open={detailsOpen}
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
    >
      <summary>Publish a privacy-safe activity receipt</summary>
      <p className="field-help">
        The app hashes the text in this browser. Only the agreement number, activity type, your
        wallet, timestamp, and hash are public. The readable text is not uploaded or sent to the
        server.
      </p>
      <label>
        Activity type
        <select
          value={activityType}
          disabled={publishing}
          onChange={(event) => {
            setActivityType(Number(event.target.value) as 1 | 2 | 3 | 4);
            setProof(null);
            setProofDownloadStatus(null);
          }}
        >
          {activityTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">{selectedType?.help}</p>
      <label>
        Private content to hash
        <textarea
          value={content}
          disabled={publishing}
          maxLength={2_000}
          rows={4}
          placeholder="Enter the note or document description you want to prove existed…"
          onChange={(event) => {
            setContent(event.target.value);
            setProof(null);
            setProofDownloadStatus(null);
          }}
        />
      </label>
      {contentHash && !proof && !pendingRecord && (
        <>
          <code className="snapshot-hash" title={contentHash}>
            keccak256: {contentHash}
          </code>
          <PublishAction
            agreementId={agreementId}
            activityType={activityType}
            contentHash={contentHash}
            onSubmit={() => {
              publicationOperation.current = publisherScope.start();
            }}
            onBusyChange={setPublishing}
            onSuccess={(transactionHash) => {
              const operationId = publicationOperation.current;
              if (
                operationId === null ||
                !publisherScope.isCurrent(operationId)
              ) {
                return;
              }
              publicationOperation.current = null;
              setProof({ algorithm: "keccak256", canonical, contentHash, transactionHash });
              setProofDownloadStatus(null);
              const action: ActivityReceiptAction = {
                type: "activity_hash_published",
                activityType,
                contentHash,
                transactionHash,
              };
              setPendingRecord(action);
              if (pendingRecordKey) {
                writeRecoveryJson(pendingRecordKey, action);
              }
              void saveActivityRecord(action);
              onPublished();
            }}
          />
        </>
      )}
      {!contentHash && (
        <p className="field-help">Enter at least four non-space characters to create a proof.</p>
      )}
      {proof && (
        <div className="private-proof-success">
          <p className="tx-success" role="status">
            Receipt published. Download the private proof file while this text is still available.
          </p>
          <button className="btn btn-ghost small" type="button" onClick={downloadProof}>
            Download private proof JSON
          </button>
          <a
            href={`https://sepolia.basescan.org/tx/${proof.transactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Open transaction receipt
          </a>
          {proofDownloadStatus && (
            <p
              className={proofDownloadStatus.error ? "tx-error" : "tx-success"}
              role={proofDownloadStatus.error ? "alert" : "status"}
              aria-live={proofDownloadStatus.error ? "assertive" : "polite"}
            >
              {proofDownloadStatus.message}
            </p>
          )}
        </div>
      )}
      {pendingRecord && (
        <div className="receipt-recovery" aria-busy={isSavingRecord}>
          {isSavingRecord && (
            <p className="hint" role="status" aria-live="polite">
              Saving the activity receipt to this agreement...
            </p>
          )}
          {recordError && <p className="tx-error" role="alert">{recordError}</p>}
          <button
            ref={recordRetryButton}
            className="btn btn-ghost small"
            type="button"
            disabled={isSavingRecord}
            onClick={() => void saveActivityRecord(pendingRecord)}
          >
            {isSavingRecord
              ? "Saving activity receipt..."
              : "Retry saving activity receipt"}
          </button>
        </div>
      )}
    </details>
  );
}
