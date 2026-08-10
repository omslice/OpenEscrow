import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAsyncOperationScope } from "./asyncOperationScope.ts";
import {
  fundingCheckoutRecoveryKey,
  fundingOperationScopeKey,
} from "./fundingOperationScope.ts";

const baseScope = {
  proposalId: "proposal-a",
  role: "tenant",
  tenantId: "tenant-a",
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

test("funding completion cannot cross an agreement, tenant, wallet, asset, amount, or environment change", () => {
  const firstKey = fundingOperationScopeKey(baseScope);
  const changedKeys = [
    fundingOperationScopeKey({ ...baseScope, proposalId: "proposal-b" }),
    fundingOperationScopeKey({ ...baseScope, role: "landlord" }),
    fundingOperationScopeKey({ ...baseScope, tenantId: "tenant-b" }),
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

test("browser checkout recovery is isolated by agreement and tenant without storing bearer access", () => {
  const firstKey = fundingCheckoutRecoveryKey(baseScope);
  assert.ok(firstKey);
  assert.equal(
    firstKey,
    fundingCheckoutRecoveryKey({
      ...baseScope,
      walletAddress: baseScope.walletAddress.toLowerCase(),
    }),
  );
  assert.notEqual(
    firstKey,
    fundingCheckoutRecoveryKey({ ...baseScope, proposalId: "proposal-b" }),
  );
  assert.notEqual(
    firstKey,
    fundingCheckoutRecoveryKey({ ...baseScope, tenantId: "tenant-b" }),
  );
  assert.equal(
    fundingCheckoutRecoveryKey({ ...baseScope, proposalId: null }),
    null,
  );
  assert.equal(
    fundingCheckoutRecoveryKey({ ...baseScope, tenantId: null }),
    null,
  );
  assert.equal(
    fundingCheckoutRecoveryKey({ ...baseScope, role: "landlord" }),
    null,
  );
  assert.doesNotMatch(firstKey, /tenant-access-token/i);
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
  assert.match(
    source,
    /fundingCheckoutRecoveryKey\(\{[\s\S]*proposalId:\s*negotiationAccess\?\.proposalId,[\s\S]*tenantId,/,
  );
  assert.doesNotMatch(source, /accessToken:\s*negotiationAccess\?\.token/);
  assert.doesNotMatch(
    source,
    /openescrow:funding-checkout",[\s\S]*walletAddress\.toLowerCase\(\)/,
  );
});

test("tenant funding passes the authorized tenant identity into checkout recovery", () => {
  const source = readFileSync(
    new URL("../components/TenantFundAction.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /<FiatFundingOption[\s\S]*tenantId=\{participantRecord\?\.viewerTenantId\}/,
  );
});
