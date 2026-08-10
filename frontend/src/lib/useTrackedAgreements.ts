import { useCallback, useEffect, useState } from "react";
import {
  readRecoveryJson,
  writeRecoveryJson,
} from "./browserRecovery";
import { chain, OPEN_ESCROW_ADDRESS } from "../contracts/config";
import { trackedAgreementStorageKey } from "./trackedAgreementStorage";

const TRACKED_AGREEMENT_RELEASE_SCOPE = `${chain.id}:${OPEN_ESCROW_ADDRESS}`;

function isTrackedAgreementIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 1_000 &&
    value.every((id) => typeof id === "string" && /^[0-9]+$/.test(id))
  );
}

/**
 * Onchain ids that are useful before or outside account discovery are retained as
 * device-local recovery state. Authenticated ids are isolated by the stable Privy
 * account identity so switching accounts cannot expose a previous account's list.
 */
export function useTrackedAgreements(accountScope?: string | null) {
  const storageKey = trackedAgreementStorageKey(
    accountScope,
    TRACKED_AGREEMENT_RELEASE_SCOPE,
  );
  const [state, setState] = useState<{
    storageKey: string;
    ids: bigint[];
  }>(() => {
    const saved = readRecoveryJson(storageKey, isTrackedAgreementIdList);
    return {
      storageKey,
      ids: saved ? saved.map((id) => BigInt(id)) : [],
    };
  });

  useEffect(() => {
    const saved = readRecoveryJson(storageKey, isTrackedAgreementIdList);
    setState({
      storageKey,
      ids: saved ? saved.map((id) => BigInt(id)) : [],
    });
  }, [storageKey]);

  const ids = state.storageKey === storageKey ? state.ids : [];

  const persist = useCallback((next: bigint[]) => {
    setState({ storageKey, ids: next });
    writeRecoveryJson(storageKey, next.map((id) => id.toString()));
  }, [storageKey]);

  const addId = useCallback(
    (id: bigint) => {
      setState((current) => {
        const prev = current.storageKey === storageKey ? current.ids : [];
        if (prev.some((p) => p === id)) return current;
        const next = [...prev, id];
        writeRecoveryJson(storageKey, next.map((savedId) => savedId.toString()));
        return { storageKey, ids: next };
      });
    },
    [storageKey],
  );

  const removeId = useCallback(
    (id: bigint) => {
      setState((current) => {
        const prev = current.storageKey === storageKey ? current.ids : [];
        const next = prev.filter((p) => p !== id);
        writeRecoveryJson(storageKey, next.map((savedId) => savedId.toString()));
        return { storageKey, ids: next };
      });
    },
    [storageKey],
  );

  return { ids, addId, removeId, persist };
}
