import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { AppNotification } from "../components/Layout";
import {
  getActivityRegistryItems,
  type ActivityRegistryLogClient,
} from "./activityRegistryLogs";
import { agreementReference } from "./displayIds";
import { shortAddr } from "./format";
import { useActivityRegistryReadiness } from "./useActivityRegistryReadiness";
import { useVisiblePolling } from "./visiblePolling";

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
      const items = await getActivityRegistryItems(
        publicClient as unknown as ActivityRegistryLogClient,
        ids,
      );
      setNotifications(
        items.map((item) =>
          item.type === "snapshot"
            ? {
                id: `onchain-${item.key}`,
                createdAt: new Date(Number(item.timestamp) * 1_000).toISOString(),
                actor: "Onchain receipt",
                summary: `${agreementReference(item.agreementId)}: snapshot anchored by ${shortAddr(item.actor)}`,
                href: `https://sepolia.basescan.org/tx/${item.transactionHash}`,
                agreementId: item.agreementId.toString(),
              }
            : {
                id: `onchain-${item.key}`,
                createdAt: new Date(Number(item.timestamp) * 1_000).toISOString(),
                actor: "Onchain receipt",
                summary: `${agreementReference(item.agreementId)}: ${
                  activityLabel[item.activityType || 0] ||
                  "activity proof published"
                } by ${shortAddr(item.actor)}`,
                href: `https://sepolia.basescan.org/tx/${item.transactionHash}`,
                agreementId: item.agreementId.toString(),
              },
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
