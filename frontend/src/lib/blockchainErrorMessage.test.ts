import assert from "node:assert/strict";
import test from "node:test";
import { blockchainErrorMessage } from "./blockchainErrorMessage.ts";

test("RPC rate-limit diagnostics become short consumer guidance", () => {
  const raw = new Error(
    'RPC Request failed. URL: https://sepolia.base.org/ Request body: {"method":"eth_getLogs"} Details: over rate limit',
  );
  const message = blockchainErrorMessage(raw);
  assert.equal(
    message,
    "Base Sepolia is busy right now. Wait a moment, then try again.",
  );
  assert.doesNotMatch(message, /https:|eth_getLogs|request body/i);
});

test("wallet cancellation and funding problems explain the next step", () => {
  assert.equal(
    blockchainErrorMessage({ shortMessage: "User rejected the request." }),
    "The wallet request was canceled. No transaction was submitted.",
  );
  assert.match(
    blockchainErrorMessage({ cause: new Error("insufficient funds for gas") }),
    /more Base Sepolia ETH/,
  );
});

test("unknown provider failures use the caller's safe fallback", () => {
  assert.equal(
    blockchainErrorMessage(new Error("provider-specific internal code"), "Try again later."),
    "Try again later.",
  );
});
