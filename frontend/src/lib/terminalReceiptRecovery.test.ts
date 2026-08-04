import assert from "node:assert/strict";
import test from "node:test";
import {
  isTimeoutReceiptAction,
  isWithdrawalReceiptAction,
  sameTerminalReceipt,
  terminalReceiptRecoveryKey,
} from "./terminalReceiptRecovery.ts";

const transactionHash = `0x${"ab".repeat(32)}`;
const withdrawal = {
  type: "withdrawal_completed",
  amount: "1200.000001",
  transactionHash,
} as const;
const timeout = {
  type: "timeout_executed",
  timeout: "no_claim_refund",
  transactionHash: `0x${"cd".repeat(32)}`,
} as const;

test("terminal receipt recovery accepts exact withdrawal and timeout payloads", () => {
  assert.equal(isWithdrawalReceiptAction(withdrawal), true);
  assert.equal(isTimeoutReceiptAction(timeout), true);
  assert.equal(sameTerminalReceipt(withdrawal, withdrawal), true);
  assert.equal(sameTerminalReceipt(withdrawal, timeout), false);
});

test("terminal receipt recovery rejects malformed and bearer-bearing data", () => {
  assert.equal(isWithdrawalReceiptAction({ ...withdrawal, amount: "0" }), false);
  assert.equal(isWithdrawalReceiptAction({ ...withdrawal, amount: "1.0000001" }), false);
  assert.equal(
    isWithdrawalReceiptAction({ ...withdrawal, token: "must-not-persist" }),
    false,
  );
  assert.equal(
    isTimeoutReceiptAction({ ...timeout, timeout: "automatic_refund" }),
    false,
  );
  assert.equal(
    isTimeoutReceiptAction({ ...timeout, transactionHash: "0x1234" }),
    false,
  );
  assert.equal(
    isTimeoutReceiptAction({ ...timeout, token: "must-not-persist" }),
    false,
  );
});

test("terminal recovery keys isolate action, agreement, role, and wallet", () => {
  const base = {
    receipt: "withdrawal",
    agreementId: "43",
    proposalId: "OE-P-RECOVERY",
    role: "tenant",
    address: "0xABCDEF",
  } as const;
  const key = terminalReceiptRecoveryKey(base);
  assert.match(key, /^openescrow:pending-terminal-receipt:/);
  assert.doesNotMatch(key, /token|secret|bearer/);
  assert.notEqual(
    key,
    terminalReceiptRecoveryKey({ ...base, receipt: "timeout" }),
  );
  assert.notEqual(
    key,
    terminalReceiptRecoveryKey({ ...base, agreementId: "44" }),
  );
  assert.notEqual(
    key,
    terminalReceiptRecoveryKey({ ...base, role: "landlord" }),
  );
  assert.notEqual(
    key,
    terminalReceiptRecoveryKey({ ...base, address: "0x123456" }),
  );
});
