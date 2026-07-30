import { useCallback, useEffect, useState } from "react";
import {
  readRecoveryJson,
  writeRecoveryJson,
} from "./browserRecovery";

const STORAGE_KEY = "openescrow.trackedAgreementIds";

function isTrackedAgreementIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 1_000 &&
    value.every((id) => typeof id === "string" && /^[0-9]+$/.test(id))
  );
}

/**
 * There is no indexer for this MVP (see docs/mvp-spec.md frontend journey note), so
 * "which agreements does this wallet care about" is tracked client-side: an id is
 * added automatically whenever this browser creates one, and can otherwise be added
 * manually (e.g. an arbiter or tenant pastes the id a landlord shared with them).
 */
export function useTrackedAgreements() {
  const [ids, setIds] = useState<bigint[]>([]);

  useEffect(() => {
    const saved = readRecoveryJson(STORAGE_KEY, isTrackedAgreementIdList);
    if (saved) setIds(saved.map((id) => BigInt(id)));
  }, []);

  const persist = useCallback((next: bigint[]) => {
    setIds(next);
    writeRecoveryJson(STORAGE_KEY, next.map((id) => id.toString()));
  }, []);

  const addId = useCallback(
    (id: bigint) => {
      setIds((prev) => {
        if (prev.some((p) => p === id)) return prev;
        const next = [...prev, id];
        writeRecoveryJson(STORAGE_KEY, next.map((savedId) => savedId.toString()));
        return next;
      });
    },
    [],
  );

  const removeId = useCallback(
    (id: bigint) => {
      setIds((prev) => {
        const next = prev.filter((p) => p !== id);
        writeRecoveryJson(STORAGE_KEY, next.map((savedId) => savedId.toString()));
        return next;
      });
    },
    [],
  );

  return { ids, addId, removeId, persist };
}
