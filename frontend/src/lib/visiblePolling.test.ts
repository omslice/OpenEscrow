import assert from "node:assert/strict";
import test from "node:test";
import {
  createSharedVisibilityClock,
  startVisibilityAwarePolling,
  type IntervalTimers,
  type VisibilityTarget,
} from "./visiblePolling.ts";

class FakeVisibilityTarget implements VisibilityTarget {
  hidden = false;
  private listeners = new Set<() => void>();

  addEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.delete(listener);
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    for (const listener of this.listeners) listener();
  }
}

class FakeTimers implements IntervalTimers {
  private nextId = 1;
  readonly intervals = new Map<number, () => void>();

  setInterval(callback: () => void) {
    const id = this.nextId++;
    this.intervals.set(id, callback);
    return id;
  }

  clearInterval(timer: unknown) {
    this.intervals.delete(Number(timer));
  }

  tick() {
    for (const callback of [...this.intervals.values()]) callback();
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test("visibility-aware polling pauses while hidden and refreshes on return", async () => {
  const visibilityTarget = new FakeVisibilityTarget();
  const timers = new FakeTimers();
  let calls = 0;
  const stop = startVisibilityAwarePolling({
    callback: () => {
      calls += 1;
    },
    intervalMs: 15_000,
    visibilityTarget,
    timers,
  });

  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(timers.intervals.size, 1);

  timers.tick();
  await flushPromises();
  assert.equal(calls, 2);

  visibilityTarget.setHidden(true);
  assert.equal(timers.intervals.size, 0);
  timers.tick();
  await flushPromises();
  assert.equal(calls, 2);

  visibilityTarget.setHidden(false);
  await flushPromises();
  assert.equal(calls, 3);
  assert.equal(timers.intervals.size, 1);

  stop();
  assert.equal(timers.intervals.size, 0);
});

test("visibility changes never create duplicate polling timers", async () => {
  const visibilityTarget = new FakeVisibilityTarget();
  const timers = new FakeTimers();
  const stop = startVisibilityAwarePolling({
    callback: () => undefined,
    intervalMs: 1_000,
    visibilityTarget,
    timers,
  });

  await flushPromises();
  visibilityTarget.setHidden(false);
  visibilityTarget.setHidden(false);
  assert.equal(timers.intervals.size, 1);

  visibilityTarget.setHidden(true);
  visibilityTarget.setHidden(true);
  assert.equal(timers.intervals.size, 0);

  visibilityTarget.setHidden(false);
  await flushPromises();
  assert.equal(timers.intervals.size, 1);
  stop();
});

test("slow and rejected polls do not overlap or stop later refreshes", async () => {
  const visibilityTarget = new FakeVisibilityTarget();
  const timers = new FakeTimers();
  let calls = 0;
  let releaseFirst: (() => void) | undefined;
  const stop = startVisibilityAwarePolling({
    callback: () => {
      calls += 1;
      if (calls === 1) {
        return new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (calls === 2) return Promise.reject(new Error("transient"));
    },
    intervalMs: 1_000,
    visibilityTarget,
    timers,
  });

  timers.tick();
  assert.equal(calls, 1);
  releaseFirst?.();
  await flushPromises();

  timers.tick();
  await flushPromises();
  assert.equal(calls, 2);
  timers.tick();
  await flushPromises();
  assert.equal(calls, 3);
  stop();
});

test("the shared clock uses one timer for every subscriber", async () => {
  const visibilityTarget = new FakeVisibilityTarget();
  const timers = new FakeTimers();
  let now = 100;
  const clock = createSharedVisibilityClock({
    nowSeconds: () => now,
    intervalMs: 1_000,
    visibilityTarget,
    timers,
  });
  let firstUpdates = 0;
  let secondUpdates = 0;
  const unsubscribeFirst = clock.subscribe(() => {
    firstUpdates += 1;
  });
  const unsubscribeSecond = clock.subscribe(() => {
    secondUpdates += 1;
  });

  await flushPromises();
  assert.equal(timers.intervals.size, 1);
  assert.equal(clock.getSnapshot(), 100);

  now = 101;
  timers.tick();
  await flushPromises();
  assert.equal(clock.getSnapshot(), 101);
  assert.equal(firstUpdates, 2);
  assert.equal(secondUpdates, 1);

  unsubscribeFirst();
  assert.equal(timers.intervals.size, 1);
  unsubscribeSecond();
  assert.equal(timers.intervals.size, 0);
});
