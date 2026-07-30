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
