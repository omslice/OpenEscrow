import { useCallback, useState } from "react";
import { parseAbiItem } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "../contracts/config";
import type { AppNotification } from "../components/Layout";
import { agreementReference } from "./displayIds";
import { shortAddr } from "./format";
import { useActivityRegistryReadiness } from "./useActivityRegistryReadiness";
import { useVisiblePolling } from "./visiblePolling";

const snapshotEvent = parseAbiItem(
  "event RecordSnapshotAnchored(uint256 indexed agreementId, bytes32 indexed snapshotHash, address indexed party, uint64 timestamp)",
);
const activityEvent = parseAbiItem(
  "event ActivityPublished(uint256 indexed agreementId, uint8 indexed activityType, address indexed party, bytes32 contentHash, uint64 timestamp)",
);

const activityLabel: Record<number, string> = {
  1: "private note proof published",
  2: "document receipt published",
  3: "formal notice proof published",
  4: "decision proof published",
};

export function useOnchainActivityNotifications(agreementIds: readonly bigint[]) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const registry = useActivityRegistryReadiness();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const agreementIdsKey = Array.from(new Set(agreementIds.map((id) => id.toString())))
    .sort((left, right) => Number(BigInt(left) - BigInt(right)))
    .join(",");

  const refresh = useCallback(async () => {
    if (!address || !publicClient || !agreementIdsKey || !registry.isReady) {
      setNotifications([]);
      return;
    }
    try {
      const ids = agreementIdsKey.split(",").map((id) => BigInt(id));
      const [snapshotGroups, activityGroups] = await Promise.all([
        Promise.all(
          ids.map((agreementId) =>
            publicClient.getLogs({
              address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
              event: snapshotEvent,
              args: { agreementId },
              fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
              toBlock: "latest",
            }),
          ),
        ),
        Promise.all(
          ids.map((agreementId) =>
            publicClient.getLogs({
              address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
              event: activityEvent,
              args: { agreementId },
              fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
              toBlock: "latest",
            }),
          ),
        ),
      ]);
      const snapshots = snapshotGroups.flat();
      const activities = activityGroups.flat();
      setNotifications(
        [
          ...snapshots.map((log) => ({
            id: `onchain-${log.transactionHash}-${log.logIndex}`,
            createdAt: new Date(Number(log.args.timestamp) * 1_000).toISOString(),
            actor: "Onchain receipt",
            summary: `${agreementReference(log.args.agreementId)}: snapshot anchored by ${shortAddr(log.args.party)}`,
            href: `https://sepolia.basescan.org/tx/${log.transactionHash}`,
            agreementId: log.args.agreementId.toString(),
          })),
          ...activities.map((log) => ({
            id: `onchain-${log.transactionHash}-${log.logIndex}`,
            createdAt: new Date(Number(log.args.timestamp) * 1_000).toISOString(),
            actor: "Onchain receipt",
            summary: `${agreementReference(log.args.agreementId)}: ${
              activityLabel[Number(log.args.activityType)] || "activity proof published"
            } by ${shortAddr(log.args.party)}`,
            href: `https://sepolia.basescan.org/tx/${log.transactionHash}`,
            agreementId: log.args.agreementId.toString(),
          })),
        ].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
    } catch {
      // Agreement dashboards surface RPC errors. Keep the global bell quiet on transient
      // provider failures so it does not obscure the rest of the account experience.
    }
  }, [address, agreementIdsKey, publicClient, registry.isReady]);

  useVisiblePolling(refresh, 15_000);

  return notifications;
}
