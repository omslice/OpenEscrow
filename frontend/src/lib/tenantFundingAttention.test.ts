import assert from "node:assert/strict";
import test from "node:test";
import { tenantFundingAttentionIds } from "./tenantFundingAttention.ts";

function success(result: unknown) {
  return { status: "success", result };
}

test("ready-to-fund tenant shares are returned as attention items", () => {
  assert.deepEqual(
    tenantFundingAttentionIds([4n], [
      success({ phase: 2 }),
      success(5_000n),
      success(0n),
    ], 2),
    [4n],
  );
});

test("funded, unrelated, and not-yet-ready agreements do not need funding attention", () => {
  assert.deepEqual(
    tenantFundingAttentionIds(
      [1n, 2n, 3n],
      [
        success({ phase: 2 }),
        success(5_000n),
        success(50_000_000n),
        success({ phase: 2 }),
        success(0n),
        success(0n),
        success({ phase: 1 }),
        success(5_000n),
        success(0n),
      ],
      2,
    ),
    [],
  );
});

test("partial or failed reads fail closed without inventing an action", () => {
  assert.deepEqual(
    tenantFundingAttentionIds([9n], [
      success({ phase: 2 }),
      { status: "error" },
      success(0n),
    ], 2),
    [],
  );
});
