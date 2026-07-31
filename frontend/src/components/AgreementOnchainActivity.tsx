import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { usePublicClient } from "wagmi";
import {
  getActivityRegistryItems,
  type ActivityRegistryLogClient,
  type RegistryActivityItem,
} from "../lib/activityRegistryLogs";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import { formatTimestamp, shortAddr } from "../lib/format";
import type { NegotiationAccess } from "../lib/negotiations";
import { useActivityRegistryReadiness } from "../lib/useActivityRegistryReadiness";
import { useVisiblePolling } from "../lib/visiblePolling";
import { ActivityLoadFailure } from "./ActivityLoadFailure";
import { ActivityProofVerifier } from "./ActivityProofVerifier";
import { PrivateActivityPublisher } from "./PrivateActivityPublisher";

const activityLabel: Record<number, string> = {
  1: "Private note proof saved",
  2: "Document proof saved",
  3: "Notice proof saved",
  4: "Decision proof saved",
};

export function AgreementOnchainActivity({
  agreementId,
  isParty,
  negotiationAccess,
}: {
  agreementId: bigint;
  isParty: boolean;
  negotiationAccess?: NegotiationAccess | null;
}) {
  const publicClient = usePublicClient();
  const registry = useActivityRegistryReadiness();
  const [items, setItems] = useState<RegistryActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activityScopeKey = JSON.stringify([
    agreementId.toString(),
    publicClient?.chain.id ?? null,
    Boolean(publicClient),
    registry.isReady,
  ]);
  const activityScope = useMemo(
    () => createAsyncOperationScope(activityScopeKey),
    [activityScopeKey],
  );

  useLayoutEffect(() => {
    activityScope.open();
    setItems([]);
    setError(null);
    return () => activityScope.close();
  }, [activityScope]);

  const refresh = useCallback(async () => {
    const operationId = activityScope.start();
    if (!publicClient || !registry.isReady) {
      if (activityScope.isCurrent(operationId)) {
        setItems([]);
        setError(null);
      }
      return false;
    }
    try {
      const nextItems = await getActivityRegistryItems(
        publicClient as unknown as ActivityRegistryLogClient,
        [agreementId],
      );
      if (!activityScope.isCurrent(operationId)) return false;
      setItems(nextItems);
      setError(null);
      return true;
    } catch (cause) {
      if (!activityScope.isCurrent(operationId)) return false;
      setError(
        cause instanceof Error
          ? cause.message.split("\n")[0]
          : "The public receipt service did not respond.",
      );
      return false;
    }
  }, [activityScope, agreementId, publicClient, registry.isReady]);

  const pollActivity = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useVisiblePolling(pollActivity, 12_000, activityScope.key);

  return (
    <section className="onchain-record-tools" aria-label="Agreement public record tools">
      {registry.isChecking && (
        <p className="field-help">Checking the public receipt service…</p>
      )}
      {!registry.isChecking && !registry.isReady && (
        <p className="tx-error" role="alert">
          Public record receipts are temporarily unavailable because the record service is not
          connected to this OpenEscrow release.
        </p>
      )}
      {registry.isReady && error && (
        <ActivityLoadFailure error={error} onRetry={refresh} />
      )}
      {registry.isReady && isParty && (
        <PrivateActivityPublisher
          key={agreementId.toString()}
          agreementId={agreementId}
          negotiationAccess={negotiationAccess}
          onPublished={() => void refresh()}
        />
      )}
      {registry.isReady && isParty && <ActivityProofVerifier agreementId={agreementId} />}
      {registry.isReady && items.length > 0 && (
        <details className="technical-details onchain-activity">
          <summary>Public record receipts ({items.length})</summary>
          {items.map((item) => (
            <div className="onchain-activity-item" key={item.key}>
              <div>
                <strong>
                  {item.type === "snapshot"
                    ? "Agreement record proof saved"
                    : activityLabel[item.activityType || 0] || "Activity proof saved"}
                </strong>
                <span>
                  {formatTimestamp(item.timestamp)} · {shortAddr(item.actor)}
                </span>
              </div>
              <code title={item.contentHash}>{shortAddr(item.contentHash)}</code>
              <a
                href={`https://sepolia.basescan.org/tx/${item.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Receipt
              </a>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
