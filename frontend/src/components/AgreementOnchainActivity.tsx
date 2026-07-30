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
import { ActivityProofVerifier } from "./ActivityProofVerifier";
import { PrivateActivityPublisher } from "./PrivateActivityPublisher";

const activityLabel: Record<number, string> = {
  1: "Private note hash published",
  2: "Document hash published",
  3: "Notice hash published",
  4: "Decision hash published",
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
      return;
    }
    try {
      const nextItems = await getActivityRegistryItems(
        publicClient as unknown as ActivityRegistryLogClient,
        [agreementId],
      );
      if (!activityScope.isCurrent(operationId)) return;
      setItems(nextItems);
      setError(null);
    } catch (cause) {
      if (!activityScope.isCurrent(operationId)) return;
      setError(
        cause instanceof Error
          ? cause.message.split("\n")[0]
          : "Onchain activity could not be loaded.",
      );
    }
  }, [activityScope, agreementId, publicClient, registry.isReady]);

  useVisiblePolling(refresh, 12_000, activityScope.key);

  return (
    <section className="onchain-record-tools" aria-label="Onchain record tools">
      {registry.isChecking && (
        <p className="field-help">Checking the onchain record service…</p>
      )}
      {!registry.isChecking && !registry.isReady && (
        <p className="tx-error" role="alert">
          Onchain record receipts are temporarily unavailable because the record service
          is not connected to this OpenEscrow release.
        </p>
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
      {registry.isReady && (items.length > 0 || error) && (
        <details className="technical-details onchain-activity">
          <summary>Onchain record receipts ({items.length})</summary>
          {items.map((item) => (
            <div className="onchain-activity-item" key={item.key}>
              <div>
                <strong>
                  {item.type === "snapshot"
                    ? "Agreement snapshot anchored"
                    : activityLabel[item.activityType || 0] || "Activity hash published"}
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
          {error && <p className="tx-error" role="alert">{error}</p>}
        </details>
      )}
    </section>
  );
}
