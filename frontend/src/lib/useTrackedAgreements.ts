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
  const archivedStorageKey = `${storageKey}.archived`;
  const [state, setState] = useState<{
    storageKey: string;
    ids: bigint[];
    archivedIds: bigint[];
  }>(() => {
    const saved = readRecoveryJson(storageKey, isTrackedAgreementIdList);
    const archived = readRecoveryJson(archivedStorageKey, isTrackedAgreementIdList);
    return {
      storageKey,
      ids: saved ? saved.map((id) => BigInt(id)) : [],
      archivedIds: archived ? archived.map((id) => BigInt(id)) : [],
    };
  });

  useEffect(() => {
    const saved = readRecoveryJson(storageKey, isTrackedAgreementIdList);
    const archived = readRecoveryJson(archivedStorageKey, isTrackedAgreementIdList);
    setState({
      storageKey,
      ids: saved ? saved.map((id) => BigInt(id)) : [],
      archivedIds: archived ? archived.map((id) => BigInt(id)) : [],
    });
  }, [archivedStorageKey, storageKey]);

  const ids = state.storageKey === storageKey ? state.ids : [];
  const archivedIds = state.storageKey === storageKey ? state.archivedIds : [];

  const persist = useCallback((next: bigint[]) => {
    setState((current) => ({
      storageKey,
      ids: next,
      archivedIds: current.storageKey === storageKey ? current.archivedIds : [],
    }));
    writeRecoveryJson(storageKey, next.map((id) => id.toString()));
  }, [storageKey]);

  const addId = useCallback(
    (id: bigint) => {
      setState((current) => {
        const prev = current.storageKey === storageKey ? current.ids : [];
        if (prev.some((p) => p === id)) return current;
        const next = [...prev, id];
        writeRecoveryJson(storageKey, next.map((savedId) => savedId.toString()));
        return {
          storageKey,
          ids: next,
          archivedIds: current.storageKey === storageKey ? current.archivedIds : [],
        };
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
        return {
          storageKey,
          ids: next,
          archivedIds: current.storageKey === storageKey ? current.archivedIds : [],
        };
      });
    },
    [storageKey],
  );

  const archiveId = useCallback(
    (id: bigint) => {
      setState((current) => {
        const previous =
          current.storageKey === storageKey ? current.archivedIds : [];
        if (previous.some((candidate) => candidate === id)) return current;
        const next = [...previous, id];
        writeRecoveryJson(
          archivedStorageKey,
          next.map((savedId) => savedId.toString()),
        );
        return {
          storageKey,
          ids: current.storageKey === storageKey ? current.ids : [],
          archivedIds: next,
        };
      });
    },
    [archivedStorageKey, storageKey],
  );

  const restoreId = useCallback(
    (id: bigint) => {
      setState((current) => {
        const previous =
          current.storageKey === storageKey ? current.archivedIds : [];
        const next = previous.filter((candidate) => candidate !== id);
        writeRecoveryJson(
          archivedStorageKey,
          next.map((savedId) => savedId.toString()),
        );
        return {
          storageKey,
          ids: current.storageKey === storageKey ? current.ids : [],
          archivedIds: next,
        };
      });
    },
    [archivedStorageKey, storageKey],
  );

  return { ids, archivedIds, addId, removeId, archiveId, restoreId, persist };
}
