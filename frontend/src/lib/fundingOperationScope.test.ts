import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAsyncOperationScope } from "./asyncOperationScope.ts";
import { fundingOperationScopeKey } from "./fundingOperationScope.ts";

const baseScope = {
  proposalId: "proposal-a",
  role: "tenant",
  walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  assetId: "usdc",
  amountMicros: 1_250_000n,
  environment: "sandbox",
};

test("funding operation scope normalizes the wallet and remains deterministic", () => {
  assert.equal(
    fundingOperationScopeKey(baseScope),
    fundingOperationScopeKey({
      ...baseScope,
      walletAddress: baseScope.walletAddress.toLowerCase(),
    }),
  );
});

test("funding completion cannot cross an agreement, wallet, asset, amount, or environment change", () => {
  const firstKey = fundingOperationScopeKey(baseScope);
  const changedKeys = [
    fundingOperationScopeKey({ ...baseScope, proposalId: "proposal-b" }),
    fundingOperationScopeKey({ ...baseScope, role: "landlord" }),
    fundingOperationScopeKey({
      ...baseScope,
      walletAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    }),
    fundingOperationScopeKey({ ...baseScope, assetId: "aave-usdc" }),
    fundingOperationScopeKey({ ...baseScope, amountMicros: 2_000_000n }),
    fundingOperationScopeKey({ ...baseScope, environment: "production" }),
  ];
  assert.equal(new Set([firstKey, ...changedKeys]).size, changedKeys.length + 1);

  const firstScope = createAsyncOperationScope(firstKey);
  const pending = firstScope.start();
  firstScope.close();
  const nextScope = createAsyncOperationScope(changedKeys[0]);
  nextScope.open();

  assert.equal(firstScope.isCurrent(pending), false);
  assert.equal(nextScope.key, changedKeys[0]);
});

test("funding operation scope is recreated without storing tenant bearer access in its key", () => {
  const source = readFileSync(
    new URL("../components/FiatFundingOption.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const accessSessionToken = negotiationAccess\?\.token;[\s\S]*\[accessSessionToken, operationScopeKey\]/,
  );
  assert.doesNotMatch(source, /accessToken:\s*negotiationAccess\?\.token/);
});
