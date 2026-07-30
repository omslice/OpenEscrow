import { useEffect, useRef } from "react";

export interface VisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface IntervalTimers {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(timer: unknown): void;
}

export function startVisibilityAwarePolling({
  callback,
  intervalMs,
  visibilityTarget,
  timers,
}: {
  callback: () => void | Promise<void>;
  intervalMs: number;
  visibilityTarget: VisibilityTarget;
  timers: IntervalTimers;
}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("A positive polling interval is required.");
  }

  let timer: unknown;
  let running = false;
  let stopped = false;

  function run() {
    if (running || stopped || visibilityTarget.hidden) return;
    running = true;
    let result: void | Promise<void>;
    try {
      result = callback();
    } catch {
      running = false;
      return;
    }
    Promise.resolve(result)
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  }

  function stopTimer() {
    if (timer === undefined) return;
    timers.clearInterval(timer);
    timer = undefined;
  }

  function startTimer() {
    if (stopped || visibilityTarget.hidden || timer !== undefined) return;
    run();
    timer = timers.setInterval(run, intervalMs);
  }

  function handleVisibilityChange() {
    if (visibilityTarget.hidden) {
      stopTimer();
      return;
    }
    startTimer();
  }

  visibilityTarget.addEventListener("visibilitychange", handleVisibilityChange);
  startTimer();

  return () => {
    stopped = true;
    stopTimer();
    visibilityTarget.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  restartKey: string | number | boolean | null = null,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    return startVisibilityAwarePolling({
      callback: () => callbackRef.current(),
      intervalMs,
      visibilityTarget: document,
      timers: window,
    });
  }, [intervalMs, restartKey]);
}

export function createSharedVisibilityClock({
  nowSeconds,
  intervalMs,
  visibilityTarget,
  timers,
}: {
  nowSeconds: () => number;
  intervalMs: number;
  visibilityTarget: VisibilityTarget;
  timers: IntervalTimers;
}) {
  let snapshot = nowSeconds();
  let stopPolling: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function tick() {
    snapshot = nowSeconds();
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!stopPolling) {
        stopPolling = startVisibilityAwarePolling({
          callback: tick,
          intervalMs,
          visibilityTarget,
          timers,
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stopPolling) {
          stopPolling();
          stopPolling = null;
        }
      };
    },
  };
}
