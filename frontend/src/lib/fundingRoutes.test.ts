import assert from "node:assert/strict";
import test from "node:test";
import {
  createFundingIntent,
  createFundingPlan,
  getFundingRouteServices,
  validateFiatOnrampConfig,
  listFundingProviders,
} from "../../shared/funding-routes.js";

const wallet = "0x1111111111111111111111111111111111111111";

test("fiat config accepts only Base USDC and separately gates production", () => {
  assert.equal(
    validateFiatOnrampConfig({
      enabled: true,
      environment: "sandbox",
      asset: "usdc",
      chain: "eip155:8453",
    }).enabled,
    true,
  );
  assert.match(
    validateFiatOnrampConfig({
      enabled: true,
      environment: "sandbox",
      asset: "0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913",
      chain: "eip155:8453",
    }).reason || "",
    /must deliver USDC/i,
  );
  assert.match(
    validateFiatOnrampConfig({
      enabled: true,
      environment: "production",
      productionApproved: false,
      asset: "usdc",
      chain: "eip155:8453",
    }).reason || "",
    /production-approval/i,
  );
});

test("provider and conversion aliases resolve through the catalog", () => {
  const directory = listFundingProviders();
  assert.equal(directory.version, "2026-07-26.1");
  assert.equal(directory.onramp["privy-brokered-fiat"]?.enabled, true);
  assert.equal(directory.onramp["kraken-swap-external"]?.enabled, false);
  assert.equal(directory.aliases["privy-usdc-base"], "privy-brokered-fiat");
  assert.equal(directory.aliases["external-kraken-solana"], "kraken-swap-external");
});

test("USDC is the only production-ready direct funding route", () => {
  const usdc = createFundingPlan("usdc", {
    onrampEnabled: true,
    environment: "production",
    productionApproved: true,
  });
  assert.equal(usdc.checkoutAvailable, true);
  assert.equal(usdc.checkoutMode, "production");
  assert.equal(usdc.conversion?.id, "none");
  assert.equal(usdc.onrampProvider.id, "privy-brokered-fiat");
  assert.equal(usdc.onrampProvider.enabled, true);

  for (const assetId of ["aave-usdc", "frnt", "usdy"]) {
    const plan = createFundingPlan(assetId, {
      onrampEnabled: true,
      environment: "production",
      productionApproved: true,
    });
    assert.equal(plan.checkoutAvailable, false);
    if (assetId === "frnt") {
      assert.equal(plan.onrampProvider.id, "kraken-swap-external");
      continue;
    }
    assert.equal(plan.onrampProvider.id, "privy-brokered-fiat");
  }
});

test("Aave funding is modeled as direct supply and direct withdrawal, not a swap", () => {
  const plan = createFundingPlan("aave-usdc", {
    onrampEnabled: true,
    environment: "sandbox",
  });
  assert.equal(plan.checkoutMode, "sandbox_preview");
  assert.equal(plan.conversion?.id, "aave-direct-supply");
  assert.equal(plan.conversion?.enabled, false);
  assert.equal(plan.conversion?.kind, "protocol-supply");
  assert.deepEqual(plan.routeSteps, [
    "USD",
    "Base USDC in user wallet",
    "direct Aave supply",
    "fixed strategy shares in OpenEscrow",
    "direct Aave withdrawal",
    "USDC settlement",
  ]);
});

test("FRNT-specific on-ramp and conversion remain disabled until approved", () => {
  const frnt = createFundingPlan("frnt", {
    onrampEnabled: true,
    environment: "sandbox",
  });
  assert.equal(frnt.conversion?.id, "stargate-bridge");
  assert.equal(frnt.conversion?.enabled, false);
  assert.equal(frnt.conversion?.status, "not_approved");
  assert.equal(frnt.onrampProvider.id, "kraken-swap-external");
  assert.equal(frnt.onrampProvider.enabled, false);
  assert.match(frnt.reason || "", /blocked|restricted|not approved/i);
});

test("asset-level service resolution includes explicit catalog references", () => {
  const services = getFundingRouteServices("aave-usdc");
  assert.ok(services);
  assert.equal(services.onramp.id, "privy-brokered-fiat");
  assert.equal(services.conversion.id, "aave-direct-supply");
});

test("sandbox checkout cannot make restricted or unapproved assets appear fundable", () => {
  for (const assetId of ["frnt", "usdy"]) {
    const plan = createFundingPlan(assetId, {
      onrampEnabled: true,
      environment: "sandbox",
    });
    assert.equal(plan.checkoutAvailable, false);
    assert.equal(plan.checkoutMode, null);
  }
});

test("funding intents pin provider strategy, Base USDC, wallet, and amount", () => {
  const intent = createFundingIntent({
    assetId: "usdc",
    walletAddress: wallet,
    amountMicros: 1_250_000n,
    environment: "sandbox",
    onrampEnabled: true,
  });
  assert.equal(intent.schema, "openescrow.funding-intent.v1");
  assert.equal(intent.providerStrategy, "privy-brokered-fiat");
  assert.equal(intent.conversionKind, "none");
  assert.deepEqual(intent.destination, {
    asset: "usdc",
    chain: "eip155:8453",
    address: wallet,
  });
  assert.equal(intent.amountMicros, 1_250_000n);
});

test("funding intents reject invalid wallets and non-positive amounts", () => {
  assert.throws(
    () =>
      createFundingIntent({
        assetId: "usdc",
        walletAddress: "not-a-wallet",
        amountMicros: 1n,
        onrampEnabled: true,
      }),
    /valid EVM destination wallet/i,
  );
  assert.throws(
    () =>
      createFundingIntent({
        assetId: "usdc",
        walletAddress: wallet,
        amountMicros: 0n,
        onrampEnabled: true,
      }),
    /greater than zero/i,
  );
});
