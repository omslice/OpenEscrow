import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { DEPLOYMENT_BLOCK, OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";

// The public Base Sepolia RPC caps eth_getLogs at a 2000-block range per call. Since
// this contract has been deployed for a while, [DEPLOYMENT_BLOCK, latest] is already
// far wider than that - every query here must be chunked, not issued as one call.
const MAX_BLOCK_RANGE = 1900n;

type EventName = "AgreementProposed" | "TenantParticipantAdded" | "ArbiterReplaced";
type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/**
 * There's no backend indexer in this MVP (spec §14), so "which agreements involve me"
 * isn't a query the contract can answer directly. This scans event logs client-side
 * instead of requiring the user to already know an agreement id:
 *  - AgreementProposed, filtered by landlord == me
 *  - TenantParticipantAdded, filtered by tenant == me (covers every co-tenant)
 *  - AgreementProposed, unfiltered, then matched against arbiter == me client-side
 *    (arbiter isn't an indexed topic, so it can't be filtered server-side)
 *  - ArbiterReplaced, filtered by newArbiter == me (covers arbiters who joined later
 *    via the mutual-consent replacement flow, not just the original nomination)
 *
 * This is a reasonable trade-off for a testnet demo with a handful of agreements; it
 * is not how a production version should discover agreements at scale (see
 * frontend/README.md's "what's here vs. what isn't").
 */
export function useDiscoverAgreements() {
  const publicClient = usePublicClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const getChunkedEvents = useCallback(
    async (client: PublicClient, eventName: EventName, args: Record<string, `0x${string}`> | undefined) => {
      const latest = await client.getBlockNumber();
      const idsAndArbiters: Array<{ id: bigint; arbiter?: `0x${string}` }> = [];
      for (let from = DEPLOYMENT_BLOCK; from <= latest; from += MAX_BLOCK_RANGE + 1n) {
        const to = from + MAX_BLOCK_RANGE > latest ? latest : from + MAX_BLOCK_RANGE;
        const chunk = await client.getContractEvents({
          address: OPEN_ESCROW_ADDRESS,
          abi: OpenEscrowABI,
          eventName,
          args,
          fromBlock: from,
          toBlock: to,
        });
        for (const log of chunk) {
          const decoded = (log as unknown as { args: { id?: bigint; arbiter?: `0x${string}` } }).args;
          if (decoded?.id !== undefined) idsAndArbiters.push({ id: decoded.id, arbiter: decoded.arbiter });
        }
      }
      return idsAndArbiters;
    },
    [],
  );

  const discover = useCallback(
    async (address: `0x${string}`): Promise<bigint[]> => {
      if (!publicClient) return [];
      setIsScanning(true);
      setScanError(null);
      try {
        const [asLandlord, asTenant, allProposed, asNewArbiter] = await Promise.all([
          getChunkedEvents(publicClient, "AgreementProposed", { landlord: address }),
          getChunkedEvents(publicClient, "TenantParticipantAdded", { tenant: address }),
          getChunkedEvents(publicClient, "AgreementProposed", undefined),
          getChunkedEvents(publicClient, "ArbiterReplaced", { newArbiter: address }),
        ]);

        const ids = new Set<bigint>();
        for (const entry of asLandlord) ids.add(entry.id);
        for (const entry of asTenant) ids.add(entry.id);
        for (const entry of allProposed) {
          if (entry.arbiter?.toLowerCase() === address.toLowerCase()) ids.add(entry.id);
        }
        for (const entry of asNewArbiter) ids.add(entry.id);

        return Array.from(ids);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Scan failed.");
        return [];
      } finally {
        setIsScanning(false);
      }
    },
    [publicClient, getChunkedEvents],
  );

  return { discover, isScanning, scanError };
}
