import { useSyncExternalStore } from "react";
import { createSharedVisibilityClock } from "./visiblePolling";

type SharedClock = ReturnType<typeof createSharedVisibilityClock>;

const serverSnapshot = Math.floor(Date.now() / 1_000);
let browserClock: SharedClock | null = null;

function getBrowserClock() {
  if (
    !browserClock &&
    typeof document !== "undefined" &&
    typeof window !== "undefined"
  ) {
    browserClock = createSharedVisibilityClock({
      nowSeconds: () => Math.floor(Date.now() / 1_000),
      intervalMs: 1_000,
      visibilityTarget: document,
      timers: window,
    });
  }
  return browserClock;
}

function subscribe(listener: () => void) {
  return getBrowserClock()?.subscribe(listener) || (() => undefined);
}

function getSnapshot() {
  return getBrowserClock()?.getSnapshot() ?? serverSnapshot;
}

/** Ticks once a second so deadline countdowns and "action now available" flips update live. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
