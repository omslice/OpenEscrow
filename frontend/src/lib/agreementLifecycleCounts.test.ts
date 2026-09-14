import assert from "node:assert/strict";
import test from "node:test";
import { agreementLifecycleCounts } from "./agreementLifecycleCounts.ts";

const success = (
  phase: number,
  tenantWithdrawable = 0n,
  landlordWithdrawable = 0n,
) => ({ status: "success", result: { phase, tenantWithdrawable, landlordWithdrawable } });

test("counts active deposits, active claims, and fully withdrawn outcomes", () => {
  assert.deepEqual(
    agreementLifecycleCounts(
      [success(3), success(4), success(5), success(6), success(6, 10n), { status: "error" }],
      { active: 3, claimOpen: 4, disputed: 5, closed: 6 },
    ),
    { activeDeposits: 1, activeClaims: 2, completedRefunds: 1 },
  );
});
