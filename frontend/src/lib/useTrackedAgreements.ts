import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "openescrow.trackedAgreementIds";

/**
 * There is no indexer for this MVP (see docs/mvp-spec.md frontend journey note), so
 * "which agreements does this wallet care about" is tracked client-side: an id is
 * added automatically whenever this browser creates one, and can otherwise be added
 * manually (e.g. an arbiter or tenant pastes the id a landlord shared with them).
 */
export function useTrackedAgreements() {
  const [ids, setIds] = useState<bigint[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setIds(JSON.parse(raw).map((s: string) => BigInt(s)));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const persist = useCallback((next: bigint[]) => {
    setIds(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((n) => n.toString())));
  }, []);

  const addId = useCallback(
    (id: bigint) => {
      setIds((prev) => {
        if (prev.some((p) => p === id)) return prev;
        const next = [...prev, id];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((n) => n.toString())));
        return next;
      });
    },
    [],
  );

  const removeId = useCallback(
    (id: bigint) => {
      setIds((prev) => {
        const next = prev.filter((p) => p !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((n) => n.toString())));
        return next;
      });
    },
    [],
  );

  return { ids, addId, removeId, persist };
}
