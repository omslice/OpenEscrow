import { useCallback, useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import {
  ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "../contracts/config";
import { formatTimestamp, shortAddr } from "../lib/format";

type ActivityItem = {
  key: string;
  type: "snapshot" | "activity";
  actor: `0x${string}`;
  contentHash: `0x${string}`;
  activityType?: number;
  timestamp: bigint;
  transactionHash: `0x${string}`;
};

const snapshotEvent = parseAbiItem(
  "event RecordSnapshotAnchored(uint256 indexed agreementId, bytes32 indexed snapshotHash, address indexed party, uint64 timestamp)",
);
const activityEvent = parseAbiItem(
  "event ActivityPublished(uint256 indexed agreementId, uint8 indexed activityType, address indexed party, bytes32 contentHash, uint64 timestamp)",
);

const activityLabel: Record<number, string> = {
  1: "Private note hash published",
  2: "Document hash published",
  3: "Notice hash published",
  4: "Decision hash published",
};

export function AgreementOnchainActivity({ agreementId }: { agreementId: bigint }) {
  const publicClient = usePublicClient();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient) return;
    try {
      const [snapshots, activities] = await Promise.all([
        publicClient.getLogs({
          address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
          event: snapshotEvent,
          args: { agreementId },
          fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
          event: activityEvent,
          args: { agreementId },
          fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
          toBlock: "latest",
        }),
      ]);
      setItems(
        [
          ...snapshots.map((log) => ({
            key: `${log.transactionHash}-${log.logIndex}`,
            type: "snapshot" as const,
            actor: log.args.party,
            contentHash: log.args.snapshotHash,
            timestamp: log.args.timestamp,
            transactionHash: log.transactionHash,
          })),
          ...activities.map((log) => ({
            key: `${log.transactionHash}-${log.logIndex}`,
            type: "activity" as const,
            actor: log.args.party,
            contentHash: log.args.contentHash,
            activityType: log.args.activityType,
            timestamp: log.args.timestamp,
            transactionHash: log.transactionHash,
          })),
        ].sort((left, right) => Number(right.timestamp - left.timestamp)),
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.split("\n")[0]
          : "Onchain activity could not be loaded.",
      );
    }
  }, [agreementId, publicClient]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!items.length && !error) return null;

  return (
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
      {error && <p className="tx-error">{error}</p>}
    </details>
  );
}
