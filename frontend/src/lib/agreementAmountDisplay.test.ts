import assert from "node:assert/strict";
import test from "node:test";
import {
  agreementAmountUnit,
  claimAmountUnit,
  payoutAmountUnit,
} from "./agreementAmountDisplay.ts";

const plain = "0x1111111111111111111111111111111111111111";
const yieldToken = "0x2222222222222222222222222222222222222222";

test("standard reviewer amounts are labeled as testUSDC", () => {
  assert.equal(agreementAmountUnit(plain, yieldToken), "testUSDC");
});

test("bounded yield positions retain their fixed-share label", () => {
  assert.equal(
    agreementAmountUnit(yieldToken.toUpperCase(), yieldToken),
    "taUSDC shares",
  );
});

test("yield deductions are denominated in testUSDC value", () => {
  assert.equal(claimAmountUnit(yieldToken, yieldToken), "testUSDC value");
  assert.equal(claimAmountUnit(plain, yieldToken), "testUSDC");
});

test("a settled yield payout is labeled as testUSDC", () => {
  assert.equal(
    payoutAmountUnit({
      tokenAddress: yieldToken,
      yieldTokenAddress: yieldToken,
      yieldSettled: false,
    }),
    "taUSDC shares",
  );
  assert.equal(
    payoutAmountUnit({
      tokenAddress: yieldToken,
      yieldTokenAddress: yieldToken,
      yieldSettled: true,
    }),
    "testUSDC",
  );
});
