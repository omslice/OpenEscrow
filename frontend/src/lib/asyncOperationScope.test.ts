import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncOperationScope } from "./asyncOperationScope.ts";

test("a newer scoped operation invalidates an older completion", () => {
  const scope = createAsyncOperationScope();
  const first = scope.start();
  const second = scope.start();

  assert.equal(scope.isCurrent(first), false);
  assert.equal(scope.isCurrent(second), true);
});

test("closing an operation scope rejects every pending completion", () => {
  const scope = createAsyncOperationScope();
  const pending = scope.start();

  scope.close();

  assert.equal(scope.isCurrent(pending), false);
  assert.equal(scope.isCurrent(scope.start()), false);
});

test("reopening a scope accepts new work without reviving old completions", () => {
  const scope = createAsyncOperationScope();
  const oldOperation = scope.start();

  scope.close();
  scope.open();
  const newOperation = scope.start();

  assert.equal(scope.isCurrent(oldOperation), false);
  assert.equal(scope.isCurrent(newOperation), true);
});

test("a delayed verification cannot cross into a differently keyed record view", () => {
  const firstRecord = createAsyncOperationScope("proposal-1:agreement-1");
  const delayedVerification = firstRecord.start();

  firstRecord.close();
  const nextRecord = createAsyncOperationScope("proposal-2:agreement-2");
  nextRecord.open();
  const currentVerification = nextRecord.start();

  assert.equal(firstRecord.key, "proposal-1:agreement-1");
  assert.equal(nextRecord.key, "proposal-2:agreement-2");
  assert.equal(firstRecord.isCurrent(delayedVerification), false);
  assert.equal(nextRecord.isCurrent(currentVerification), true);
});
