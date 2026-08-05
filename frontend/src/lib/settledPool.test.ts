import assert from "node:assert/strict";
import test from "node:test";
import { mapSettledWithConcurrency } from "./settledPool.ts";

test("settled pool keeps result order while bounding concurrent work", async () => {
  let active = 0;
  let maximumActive = 0;
  const releases: Array<() => void> = [];
  const work = mapSettledWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    return item * 10;
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(active, 2);
  while (releases.length > 0) {
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(maximumActive, 2);
  assert.deepEqual(await work, [
    { status: "fulfilled", value: 0 },
    { status: "fulfilled", value: 10 },
    { status: "fulfilled", value: 20 },
    { status: "fulfilled", value: 30 },
    { status: "fulfilled", value: 40 },
  ]);
});

test("settled pool isolates a rejected item and validates its bound", async () => {
  const results = await mapSettledWithConcurrency(["ok", "bad", "after"], 1, async (item) => {
    if (item === "bad") throw new Error("expected failure");
    return item.toUpperCase();
  });

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
  await assert.rejects(
    () => mapSettledWithConcurrency([1], 0, async (item) => item),
    /positive integer/,
  );
});
