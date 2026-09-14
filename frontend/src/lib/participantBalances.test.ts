import assert from "node:assert/strict";
import test from "node:test";
import { participantDepositTokenBalance } from "./participantBalances.ts";
import type { Agreement } from "./useAgreement.ts";

const activeAgreement = {
  phase: 2,
  locked: 1_000n,
  tenantWithdrawable: 0n,
  landlordWithdrawable: 0n,
} as Agreement;

test("tenant balance follows contribution until settlement and then withdrawable credit", () => {
  assert.equal(
    participantDepositTokenBalance({
      agreement: activeAgreement,
      role: "tenant",
      tenantContribution: 500n,
    }),
    500n,
  );
  assert.equal(
    participantDepositTokenBalance({
      agreement: { ...activeAgreement, phase: 6, locked: 0n },
      role: "tenant",
      tenantContribution: 500n,
      tenantCredit: 420n,
    }),
    420n,
  );
});

test("landlord view reports all tokens remaining in the funded deposit", () => {
  assert.equal(
    participantDepositTokenBalance({
      agreement: {
        ...activeAgreement,
        locked: 600n,
        tenantWithdrawable: 300n,
        landlordWithdrawable: 100n,
      },
      role: "landlord",
    }),
    1_000n,
  );
});
