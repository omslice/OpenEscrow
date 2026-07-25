import { useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  AgreementActivityRegistryABI,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  loadNegotiationSnapshot,
  negotiationAction,
  type AgreementSnapshot,
  type NegotiationAccess,
} from "../lib/negotiations";
import { TxButton } from "./TxButton";

type AnchorProps = {
  access: NegotiationAccess;
  agreementId: bigint;
  snapshot: AgreementSnapshot;
  onAnchored: () => void;
};

function StandardAnchorAction({
  access,
  agreementId,
  snapshot,
  onAnchored,
}: AnchorProps) {
  const { address } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const anchored = useReadContract({
    address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
    abi: AgreementActivityRegistryABI,
    functionName: "anchoredBy",
    args: address ? [agreementId, snapshot.hash, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  if (anchored.data === true) {
    return <p className="tx-success">This wallet has anchored this exact snapshot onchain.</p>;
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
          setError(null);
          void negotiationAction(access, {
            type: "record_snapshot_anchored",
            snapshotHash: snapshot.hash,
            transactionHash,
          })
            .then(() => {
              void anchored.refetch();
              onAnchored();
            })
            .catch((cause) =>
              setError(
                cause instanceof Error
                  ? `The anchor succeeded, but the activity record could not be updated: ${cause.message}`
                  : "The anchor succeeded, but the activity record could not be updated.",
              ),
            );
        }}
      />
      {error && <p className="tx-error">{error}</p>}
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
  const anchored = useReadContract({
    address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
    abi: AgreementActivityRegistryABI,
    functionName: "anchoredBy",
    args: address ? [agreementId, snapshot.hash, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  if (anchored.data === true) {
    return <p className="tx-success">This wallet has anchored this exact snapshot onchain.</p>;
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
            try {
              await negotiationAction(access, {
                type: "record_snapshot_anchored",
                snapshotHash: snapshot.hash,
                transactionHash: result.hash,
              });
            } catch (recordError) {
              setError(
                recordError instanceof Error
                  ? `The anchor succeeded, but the activity record could not be updated: ${recordError.message}`
                  : "The anchor succeeded, but the activity record could not be updated.",
              );
            }
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
      {error && <p className="tx-error">{error}</p>}
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
  const [snapshot, setSnapshot] = useState<AgreementSnapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateSnapshot() {
    setLoading(true);
    setStatus(null);
    try {
      const next = await loadNegotiationSnapshot(access);
      setSnapshot(next);
      setStatus("Canonical snapshot generated and hashed.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The snapshot could not be generated.",
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadSnapshot() {
    if (!snapshot) return;
    const blob = new Blob([snapshot.canonical], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openescrow-${access.proposalId}-${snapshot.hash.slice(2, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="record-snapshot">
      <div>
        <strong>Verifiable record snapshot</strong>
        <p className="field-help">
          Generate a deterministic JSON copy of the parties, terms, approvals, itemized claims,
          and activity. Identical content always produces the same SHA-256 hash.
        </p>
      </div>
      <div className="button-row">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => void generateSnapshot()}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate record snapshot"}
        </button>
        {snapshot && (
          <>
            <button className="btn btn-ghost" type="button" onClick={downloadSnapshot}>
              Download JSON
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void navigator.clipboard.writeText(snapshot.hash)}
            >
              Copy hash
            </button>
          </>
        )}
      </div>
      {snapshot && (
        <code className="snapshot-hash" title={snapshot.hash}>
          {snapshot.algorithm}: {snapshot.hash}
        </code>
      )}
      {snapshot && agreementId !== undefined && (
        <div className="snapshot-anchor">
          <p className="field-help">
            Anchoring stores only this hash and your wallet address on Base Sepolia. Use the wallet
            assigned to this agreement; no names, emails, notes, or documents are published.
          </p>
          <AnchorAction
            access={access}
            agreementId={agreementId}
            snapshot={snapshot}
            onAnchored={() => setStatus("Snapshot anchored onchain.")}
          />
        </div>
      )}
      {status && (
        <p className={status.includes("could not") ? "tx-error" : "tx-success"}>{status}</p>
      )}
    </div>
  );
}
