import assert from "node:assert/strict";
import test from "node:test";
import { isAgreementComplete } from "./agreementCompletion.ts";
import type { Agreement } from "./useAgreement.ts";

const agreement = {
  phase: 6,
  locked: 0n,
  tenantWithdrawable: 0n,
  landlordWithdrawable: 0n,
} as Agreement;

test("only a closed agreement with no remaining balance is complete", () => {
  assert.equal(isAgreementComplete(agreement), true);
  assert.equal(isAgreementComplete({ ...agreement, locked: 1n }), false);
  assert.equal(isAgreementComplete({ ...agreement, tenantWithdrawable: 1n }), false);
  assert.equal(isAgreementComplete({ ...agreement, landlordWithdrawable: 1n }), false);
  assert.equal(isAgreementComplete({ ...agreement, phase: 3 }), false);
});
