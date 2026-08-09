import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";
import {
  agreementDiscoveryErrorMessage,
  discoverAgreementIds,
  type AgreementDiscoveryClient,
} from "./agreementDiscovery";

/**
 * There is no backend indexer in this MVP, so "which agreements involve me" is not a
 * single contract query. The current testnet contract exposes a bounded agreement count
 * and current participant records, so discovery enumerates those records directly instead
 * of walking hundreds of thousands of historical log blocks.
 *
 * This is intentionally capped and concurrency-bounded for a testnet demo with a handful
 * of agreements. A production release still needs an authenticated indexer.
 */
export function useDiscoverAgreements() {
  const publicClient = usePublicClient();
  const [isScanning, setIsScanning] = useState(false);

  const discover = useCallback(
    async (address: `0x${string}`): Promise<bigint[]> => {
      if (!publicClient) return [];
      setIsScanning(true);
      try {
        return await discoverAgreementIds(
          publicClient as unknown as AgreementDiscoveryClient,
          address,
          {
            contractAddress: OPEN_ESCROW_ADDRESS,
            abi: OpenEscrowABI,
          },
        );
      } catch {
        throw new Error(agreementDiscoveryErrorMessage());
      } finally {
        setIsScanning(false);
      }
    },
    [publicClient],
  );

  return { discover, isScanning };
}
