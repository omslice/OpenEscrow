import assert from "node:assert/strict";
import test from "node:test";
import {
  landlordClaimAttentionIds,
  tenantClaimAttentionIds,
} from "./claimAttention.ts";

function success(result: unknown) {
  return { status: "success", result };
}

const agreement = (phase: number, claimedAmount = 0n, landlordWithdrawable = 0n) => ({
  phase,
  claimedAmount,
  landlordWithdrawable,
});

test("an unanswered open claim needs the tenant's attention", () => {
  assert.deepEqual(
    tenantClaimAttentionIds(
      [2n, 3n],
      [success(agreement(4, 50n)), success(false), success(agreement(4, 50n)), success(true)],
      4,
    ),
    [2n],
  );
});

test("tenant responses and resulting landlord allocations need landlord attention", () => {
  assert.deepEqual(
    landlordClaimAttentionIds(
      [1n, 2n, 3n, 4n],
      [
        success(agreement(4, 50n)), success(1n),
        success(agreement(5, 50n)), success(1n),
        success(agreement(6, 50n, 50n)), success(2n),
        success(agreement(6, 50n, 0n)), success(2n),
      ],
      { claimOpen: 4, disputed: 5, closed: 6 },
    ),
    [1n, 2n, 3n],
  );
});

test("claim attention fails closed for missing or failed reads", () => {
  assert.deepEqual(tenantClaimAttentionIds([1n], [success(agreement(4))], 4), []);
  assert.deepEqual(
    landlordClaimAttentionIds(
      [1n],
      [success(agreement(4, 10n)), { status: "error" }],
      { claimOpen: 4, disputed: 5, closed: 6 },
    ),
    [],
  );
});
