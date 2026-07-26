import { useEffect, useMemo, useState } from "react";
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

type PublishActionProps = {
  agreementId: bigint;
  activityType: number;
  contentHash: `0x${string}`;
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

  return (
    <>
      <button
        className="btn btn-primary"
        type="button"
        disabled={!address || !publicClient || working}
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
                  functionName: "publishActivity",
                  args: [props.agreementId, props.activityType, props.contentHash],
                }),
                chainId: 84532,
              },
              { address, sponsor: true },
            );
            await publicClient.waitForTransactionReceipt({ hash: result.hash });
            props.onSuccess(result.hash);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message.split("\n")[0]
                : "The sponsored activity transaction failed.",
            );
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? "Publishing with gas covered..." : "Publish proof hash—gas covered"}
      </button>
      {error && <p className="tx-error">{error}</p>}
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
  const [pendingRecord, setPendingRecord] = useState<ActivityReceiptAction | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const pendingRecordKey = negotiationAccess && address
    ? `openescrow:pending-activity-receipt:${negotiationAccess.proposalId}:${negotiationAccess.role}:${address.toLowerCase()}`
    : null;
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

  async function saveActivityRecord(action: ActivityReceiptAction) {
    if (!negotiationAccess) {
      setPendingRecord(null);
      return;
    }
    setRecordError(null);
    try {
      await negotiationAction(negotiationAccess, action);
      setPendingRecord(null);
      if (pendingRecordKey) window.localStorage.removeItem(pendingRecordKey);
    } catch (cause) {
      setRecordError(
        cause instanceof Error
          ? `The onchain receipt succeeded, but its agreement record still needs to be saved: ${cause.message}`
          : "The onchain receipt succeeded, but its agreement record still needs to be saved.",
      );
    }
  }

  useEffect(() => {
    if (!pendingRecordKey) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(pendingRecordKey) || "null");
      if (
        stored?.type === "activity_hash_published" &&
        [1, 2, 3, 4].includes(Number(stored.activityType)) &&
        /^0x[a-fA-F0-9]{64}$/.test(stored.contentHash || "") &&
        /^0x[a-fA-F0-9]{64}$/.test(stored.transactionHash || "")
      ) {
        setPendingRecord(stored as ActivityReceiptAction);
      }
    } catch {
      window.localStorage.removeItem(pendingRecordKey);
    }
  }, [pendingRecordKey]);

  function downloadProof() {
    if (!proof) return;
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
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openescrow-activity-${agreementId}-${proof.contentHash.slice(2, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <details className="technical-details private-activity-publisher">
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
          onChange={(event) => {
            setActivityType(Number(event.target.value) as 1 | 2 | 3 | 4);
            setProof(null);
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
          maxLength={2_000}
          rows={4}
          placeholder="Enter the note or document description you want to prove existed…"
          onChange={(event) => {
            setContent(event.target.value);
            setProof(null);
          }}
        />
      </label>
      {contentHash && (
        <>
          <code className="snapshot-hash" title={contentHash}>
            keccak256: {contentHash}
          </code>
          <PublishAction
            agreementId={agreementId}
            activityType={activityType}
            contentHash={contentHash}
            onSuccess={(transactionHash) => {
              setProof({ algorithm: "keccak256", canonical, contentHash, transactionHash });
              const action: ActivityReceiptAction = {
                type: "activity_hash_published",
                activityType,
                contentHash,
                transactionHash,
              };
              setPendingRecord(action);
              if (pendingRecordKey) {
                window.localStorage.setItem(pendingRecordKey, JSON.stringify(action));
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
          <p className="tx-success">
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
        </div>
      )}
      {pendingRecord && (
        <div className="receipt-recovery">
          {recordError && <p className="tx-error">{recordError}</p>}
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => void saveActivityRecord(pendingRecord)}
          >
            Retry saving activity receipt
          </button>
        </div>
      )}
    </details>
  );
}
