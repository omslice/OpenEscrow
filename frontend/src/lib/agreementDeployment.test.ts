import assert from "node:assert/strict";
import test from "node:test";
import { agreementContractAddress, filterTrackedAgreementIds, isCurrentAgreement, isMissingAgreementError } from "./agreementDeployment.ts";

const active = `0x${"a".repeat(40)}`;
const old = `0x${"b".repeat(40)}`;
const historical = { onchainAgreementId: "1", onchainContractAddress: old };
const current = { onchainAgreementId: "1", onchainContractAddress: active };

test("the same agreement ID in two deployments never identifies the same deposit", () => {
  assert.equal(isCurrentAgreement(historical, active), false);
  assert.equal(isCurrentAgreement(current, active), true);
  assert.equal(isCurrentAgreement({ ...current, onchainContractAddress: active.toUpperCase().replace("0X", "0x") }, active), true);
});
test("missing, malformed and zero deployment addresses do not default to the active contract", () => {
  for (const address of [undefined, null, "", "not-an-address", `0x${"0".repeat(40)}`]) {
    const record = { onchainAgreementId: "0", onchainContractAddress: address };
    assert.equal(agreementContractAddress(record), null);
    assert.equal(isCurrentAgreement(record, active), false);
  }
  assert.equal(isCurrentAgreement({ ...current, onchainAgreementId: "invalid" }, active), false);
});
test("legacy IDs cached by the old UI cannot generate phantom active deposits", () => {
  assert.deepEqual(filterTrackedAgreementIds([0n, 1n, 2n], [historical, { onchainAgreementId: "0" }], active, []), [2n]);
});
test("a verified current record or wallet discovery preserves a real colliding ID", () => {
  assert.deepEqual(filterTrackedAgreementIds([1n], [historical, current], active, []), [1n]);
  assert.deepEqual(filterTrackedAgreementIds([1n], [historical], active, [1n]), [1n]);
  assert.deepEqual(filterTrackedAgreementIds([1n], [historical], active, []), []);
});
test("contract not-found errors are distinguished from temporary transport errors", () => {
  assert.equal(isMissingAgreementError({ cause: { cause: { data: { errorName: "AgreementDoesNotExist" } } } }), true);
  assert.equal(isMissingAgreementError(new Error("connection timed out")), false);
  assert.equal(isMissingAgreementError({ data: { errorName: "Unauthorized" } }), false);
  const cycle: { cause?: unknown } = {};
  cycle.cause = cycle;
  assert.equal(isMissingAgreementError(cycle), false);
});
