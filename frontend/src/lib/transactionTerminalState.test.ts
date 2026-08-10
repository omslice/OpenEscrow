import assert from "node:assert/strict";
import test from "node:test";
import { transactionTerminalState } from "./transactionTerminalState.ts";

test("write and mined-receipt failures both terminate a pending transaction", () => {
  assert.equal(transactionTerminalState(null, null, false), "pending");
  assert.equal(
    transactionTerminalState(new Error("wallet rejected"), null, false),
    "failed",
  );
  assert.equal(
    transactionTerminalState(null, new Error("transaction reverted"), false),
    "failed",
  );
  assert.equal(transactionTerminalState(null, null, true), "succeeded");
});
