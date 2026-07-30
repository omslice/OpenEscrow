import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFundingCheckoutEvent,
  createFundingCheckoutAttempt,
  createFundingIntent,
  createFundingPlan,
  fundingIntentKey,
  getFundingRouteServices,
  isFundingCheckoutLifecycle,
  normalizeFundingCheckoutState,
  reconcileFundingCheckoutError,
  reconcileFundingCheckoutResult,
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

test("fiat config fails closed when disabled, misrouted, or given an unknown environment", () => {
  assert.equal(
    validateFiatOnrampConfig({
      enabled: false,
      environment: "production",
      productionApproved: true,
      asset: "usdc",
      chain: "eip155:8453",
    }).enabled,
    false,
  );
  assert.match(
    validateFiatOnrampConfig({
      enabled: true,
      environment: "sandbox",
      asset: "usdc",
      chain: "eip155:84532",
    }).reason || "",
    /Base mainnet/i,
  );
  const unknownEnvironment = validateFiatOnrampConfig({
    enabled: true,
    environment: "anything-else",
    asset: "usdc",
    chain: "eip155:8453",
  });
  assert.equal(unknownEnvironment.enabled, true);
  assert.equal(unknownEnvironment.environment, "sandbox");
});

test("provider and conversion aliases resolve through the catalog", () => {
  const directory = listFundingProviders();
  assert.equal(directory.version, "2026-07-30.1");
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

test("routing steps are assembled from on-ramp and conversion catalog metadata", () => {
  const usdc = createFundingPlan("usdc", {
    onrampEnabled: true,
    environment: "sandbox",
  });
  assert.deepEqual(usdc.routeSteps, [
    "USD",
    "Base USDC in user wallet",
    "OpenEscrow",
    "USDC settlement",
  ]);

  const usdy = createFundingPlan("usdy", {
    onrampEnabled: true,
    environment: "sandbox",
  });
  assert.equal(usdy.routeSteps[0], "USD");
  assert.match(usdy.routeSteps[1] || "", /Base USDC in user wallet|USDC/);
  assert.equal(usdy.routeSteps.includes("OpenEscrow"), true);
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

test("funding intents cannot bypass the production approval gate", () => {
  assert.throws(
    () =>
      createFundingIntent({
        assetId: "usdc",
        walletAddress: wallet,
        amountMicros: 1_000_000n,
        environment: "production",
        onrampEnabled: true,
        productionApproved: false,
      }),
    /production.*release gate/i,
  );
});

test("checkout reconciliation refreshes only after production confirmation", () => {
  const productionConfirmed = reconcileFundingCheckoutResult(
    { status: "confirmed" },
    "production",
  );
  assert.equal(productionConfirmed.state, "confirmed");
  assert.equal(productionConfirmed.shouldRefreshBalance, true);
  assert.equal(productionConfirmed.retryAllowed, false);

  const productionSubmitted = reconcileFundingCheckoutResult(
    { status: "submitted" },
    "production",
  );
  assert.equal(productionSubmitted.state, "submitted");
  assert.equal(productionSubmitted.shouldRefreshBalance, false);
  assert.equal(productionSubmitted.retryAllowed, false);
  assert.match(productionSubmitted.message, /will not treat.*funded/i);

  const sandboxConfirmed = reconcileFundingCheckoutResult(
    { status: "confirmed" },
    "sandbox",
  );
  assert.equal(sandboxConfirmed.shouldRefreshBalance, false);
  assert.match(sandboxConfirmed.message, /No real funds moved/i);
});

test("checkout reconciliation fails closed for cancellation, failure, and unknown results", () => {
  const cancelled = reconcileFundingCheckoutResult(
    { status: "cancelled" },
    "production",
  );
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.severity, "info");
  assert.equal(cancelled.shouldRefreshBalance, false);
  assert.equal(cancelled.retryAllowed, true);

  for (const status of ["failed", "rejected", "unexpected"]) {
    const outcome = reconcileFundingCheckoutResult({ status }, "production");
    assert.equal(outcome.severity, "error");
    assert.equal(outcome.shouldRefreshBalance, false);
    assert.equal(outcome.retryAllowed, status !== "unexpected");
    assert.match(outcome.message, /No agreement funding was recorded/i);
  }

  const malformed = reconcileFundingCheckoutResult(null, "production");
  assert.equal(malformed.state, "unknown");
  assert.equal(malformed.shouldRefreshBalance, false);
  assert.equal(malformed.retryAllowed, false);

  const rejected = reconcileFundingCheckoutError();
  assert.equal(rejected.state, "unknown");
  assert.equal(rejected.shouldRefreshBalance, false);
  assert.equal(rejected.retryAllowed, false);
  assert.match(rejected.message, /check your provider activity/i);
});

test("provider status aliases normalize without weakening retry gates", () => {
  assert.equal(normalizeFundingCheckoutState("processing"), "submitted");
  assert.equal(normalizeFundingCheckoutState("succeeded"), "confirmed");
  assert.equal(normalizeFundingCheckoutState("expired"), "failed");
  assert.equal(normalizeFundingCheckoutState("refunding"), "refund_pending");
  assert.equal(normalizeFundingCheckoutState("reversed"), "refunded");
  assert.equal(normalizeFundingCheckoutState("unrecognized"), "unknown");

  const pending = reconcileFundingCheckoutResult(
    { status: "processing" },
    "production",
  );
  assert.equal(pending.state, "submitted");
  assert.equal(pending.retryAllowed, false);

  const expired = reconcileFundingCheckoutResult(
    { status: "expired" },
    "production",
  );
  assert.equal(expired.state, "failed");
  assert.equal(expired.retryAllowed, true);
});

test("checkout lifecycle reconciles delayed confirmation idempotently", () => {
  const intent = createFundingIntent({
    assetId: "usdc",
    walletAddress: wallet,
    amountMicros: 1_250_000n,
    environment: "sandbox",
    onrampEnabled: true,
  });
  const opened = createFundingCheckoutAttempt(intent, {
    attemptId: "attempt-0001",
    createdAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(opened.intentKey, fundingIntentKey(intent));
  assert.equal(opened.status, "opening");
  assert.equal(isFundingCheckoutLifecycle(opened), true);

  const submitted = applyFundingCheckoutEvent(opened, {
    eventId: "provider-event-001",
    status: "processing",
    providerStatus: "processing",
    occurredAt: "2026-07-30T00:01:00.000Z",
  });
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.events.length, 1);

  const duplicate = applyFundingCheckoutEvent(submitted, {
    eventId: "provider-event-001",
    status: "processing",
    providerStatus: "processing",
    occurredAt: "2026-07-30T00:01:00.000Z",
  });
  assert.equal(duplicate, submitted);

  assert.throws(
    () =>
      applyFundingCheckoutEvent(submitted, {
        eventId: "provider-event-001",
        status: "confirmed",
        occurredAt: "2026-07-30T00:02:00.000Z",
      }),
    /conflicts with the saved checkout state/i,
  );

  const confirmed = applyFundingCheckoutEvent(submitted, {
    eventId: "provider-event-002",
    status: "completed",
    providerStatus: "completed",
    occurredAt: "2026-07-30T00:03:00.000Z",
  });
  assert.equal(confirmed.status, "confirmed");
  assert.equal(isFundingCheckoutLifecycle(confirmed), true);
  assert.throws(
    () =>
      applyFundingCheckoutEvent(confirmed, {
        eventId: "provider-event-003",
        status: "confirmed",
        occurredAt: "2026-07-30T00:02:00.000Z",
      }),
    /cannot predate/i,
  );
});

test("checkout lifecycle models cancellation, uncertainty recovery, and refunds", () => {
  const intent = createFundingIntent({
    assetId: "usdc",
    walletAddress: wallet,
    amountMicros: 2_000_000n,
    environment: "production",
    onrampEnabled: true,
    productionApproved: true,
  });
  const opened = createFundingCheckoutAttempt(intent, {
    attemptId: "attempt-0002",
    createdAt: "2026-07-30T01:00:00.000Z",
  });
  const uncertain = applyFundingCheckoutEvent(opened, {
    eventId: "provider-event-101",
    status: "unexpected",
    occurredAt: "2026-07-30T01:01:00.000Z",
  });
  assert.equal(uncertain.status, "unknown");
  assert.equal(
    reconcileFundingCheckoutResult(
      { status: uncertain.providerStatus },
      "production",
    ).retryAllowed,
    false,
  );

  const confirmed = applyFundingCheckoutEvent(uncertain, {
    eventId: "provider-event-102",
    status: "success",
    occurredAt: "2026-07-30T01:02:00.000Z",
  });
  const refundPending = applyFundingCheckoutEvent(confirmed, {
    eventId: "provider-event-103",
    status: "refunding",
    occurredAt: "2026-07-30T01:03:00.000Z",
  });
  assert.equal(refundPending.status, "refund_pending");
  assert.equal(
    reconcileFundingCheckoutResult(
      { status: refundPending.providerStatus },
      "production",
    ).retryAllowed,
    false,
  );

  const refunded = applyFundingCheckoutEvent(refundPending, {
    eventId: "provider-event-104",
    status: "refunded",
    occurredAt: "2026-07-30T01:04:00.000Z",
  });
  const refundOutcome = reconcileFundingCheckoutResult(
    { status: refunded.providerStatus },
    "production",
  );
  assert.equal(refundOutcome.state, "refunded");
  assert.equal(refundOutcome.retryAllowed, true);
  assert.equal(refundOutcome.shouldRefreshBalance, true);
  assert.throws(
    () =>
      applyFundingCheckoutEvent(refunded, {
        eventId: "provider-event-105",
        status: "submitted",
        occurredAt: "2026-07-30T01:05:00.000Z",
      }),
    /cannot move from refunded to submitted/i,
  );

  const cancelled = applyFundingCheckoutEvent(opened, {
    eventId: "provider-event-106",
    status: "cancelled",
    occurredAt: "2026-07-30T01:01:00.000Z",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(
    reconcileFundingCheckoutResult(
      { status: cancelled.providerStatus },
      "production",
    ).retryAllowed,
    true,
  );
});

test("persisted checkout lifecycle rejects tampering and impossible history", () => {
  const intent = createFundingIntent({
    assetId: "usdc",
    walletAddress: wallet,
    amountMicros: 3_000_000n,
    environment: "sandbox",
    onrampEnabled: true,
  });
  const opened = createFundingCheckoutAttempt(intent, {
    attemptId: "attempt-0003",
    createdAt: "2026-07-30T02:00:00.000Z",
  });
  const tampered = {
    ...opened,
    walletAddress: "0x2222222222222222222222222222222222222222",
  };
  assert.equal(isFundingCheckoutLifecycle(tampered), false);
  assert.equal(
    isFundingCheckoutLifecycle({
      ...opened,
      assetId: "invented-asset",
      intentKey: opened.intentKey.replace("|usdc|", "|invented-asset|"),
    }),
    false,
  );
  assert.equal(
    isFundingCheckoutLifecycle({
      ...opened,
      intentKey: opened.intentKey.replace("eip155:8453", "eip155:1"),
    }),
    false,
  );
  assert.throws(
    () =>
      fundingIntentKey({
        ...intent,
        amountMicros: 0n,
      }),
    /valid funding intent/i,
  );

  const impossible = {
    ...opened,
    status: "refunded",
    providerStatus: "refunded",
  };
  assert.equal(isFundingCheckoutLifecycle(impossible), false);
});
