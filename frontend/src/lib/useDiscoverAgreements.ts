import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import {
  DEPLOYMENT_BLOCK,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";
import {
  discoverAgreementIds,
  type AgreementDiscoveryClient,
} from "./agreementDiscovery";

/**
 * There's no backend indexer in this MVP (spec §14), so "which agreements involve me"
 * isn't a query the contract can answer directly. This scans event logs client-side
 * instead of requiring the user to already know an agreement id:
 *  - AgreementProposed, matched against landlord or arbiter == me client-side
 *  - TenantParticipantAdded, filtered by tenant == me (covers every co-tenant)
 *  - ArbiterReplaced, filtered by newArbiter == me (covers arbiters who joined later
 *    via the mutual-consent replacement flow, not just the original nomination)
 *
 * The scan snapshots the latest block once and reads AgreementProposed once. Arbiter
 * isn't indexed, so using that same unfiltered stream for landlord matching avoids a
 * second full proposal-history scan.
 *
 * This is a reasonable trade-off for a testnet demo with a handful of agreements; it
 * is not how a production version should discover agreements at scale (see
 * frontend/README.md's "what's here vs. what isn't").
 */
export function useDiscoverAgreements() {
  const publicClient = usePublicClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const discover = useCallback(
    async (address: `0x${string}`): Promise<bigint[]> => {
      if (!publicClient) return [];
      setIsScanning(true);
      setScanError(null);
      try {
        return await discoverAgreementIds(
          publicClient as unknown as AgreementDiscoveryClient,
          address,
          {
            deploymentBlock: DEPLOYMENT_BLOCK,
            contractAddress: OPEN_ESCROW_ADDRESS,
            abi: OpenEscrowABI,
          },
        );
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Scan failed.");
        return [];
      } finally {
        setIsScanning(false);
      }
    },
    [publicClient],
  );

  return { discover, isScanning, scanError };
}
