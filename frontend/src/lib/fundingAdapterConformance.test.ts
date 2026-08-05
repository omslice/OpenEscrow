import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFundingProviderOperation,
  applyFundingProviderWebhook,
  assertFundingProviderAdapter,
  checkFundingProviderEligibility,
} from "../../shared/funding-adapter-contract.js";
import {
  createFundingCheckoutAttempt,
  createFundingIntent,
  fundingIntentKey,
  isFundingCheckoutLifecycle,
} from "../../shared/funding-routes.js";

const wallet = "0x1111111111111111111111111111111111111111";
const digest = (value: number) =>
  `sha256:${value.toString(16).padStart(64, "0")}`;

type AdapterMethod =
  | "checkEligibility"
  | "openCheckout"
  | "cancelCheckout"
  | "requestRefund"
  | "reconcileCheckout"
  | "verifyWebhook";

type ScriptValue = unknown | Error | ((...args: unknown[]) => unknown);

function scriptedAdapter(
  id: string,
  script: Partial<Record<AdapterMethod, ScriptValue[]>>,
) {
  const invoke = (method: AdapterMethod) => async (...args: unknown[]) => {
    const value = script[method]?.shift();
    if (value instanceof Error) throw value;
    if (typeof value === "function") return value(...args);
    if (value === undefined) {
      throw new Error(`No scripted ${method} result.`);
    }
    return value;
  };
  return {
    id,
    version: "mock-v1",
    checkEligibility: invoke("checkEligibility"),
    openCheckout: invoke("openCheckout"),
    cancelCheckout: invoke("cancelCheckout"),
    requestRefund: invoke("requestRefund"),
    reconcileCheckout: invoke("reconcileCheckout"),
    verifyWebhook: invoke("verifyWebhook"),
  };
}

function productionCheckout(providerId: string, attemptId: string) {
  const baseIntent = createFundingIntent({
    assetId: "usdc",
    walletAddress: wallet,
    amountMicros: 2_000_000n,
    environment: "production",
    onrampEnabled: true,
    productionApproved: true,
  });
  const intent = Object.freeze({ ...baseIntent, providerStrategy: providerId });
  return createFundingCheckoutAttempt(intent, {
    attemptId,
    createdAt: "2026-08-05T00:00:00.000Z",
  });
}

function providerEvent(
  providerId: string,
  attemptId: string,
  value: number,
  status: string,
  occurredAt: string,
) {
  return {
    providerId,
    attemptId,
    eventId: `provider-event-${value}`,
    status,
    providerStatus: status,
    source: "provider_webhook",
    verification: "provider_signed",
    reconciliationKey: digest(value),
    payloadDigest: digest(value + 10_000),
    occurredAt,
  };
}

function operatorEvent(
  providerId: string,
  attemptId: string,
  value: number,
  status: string,
  occurredAt: string,
) {
  return {
    ...providerEvent(providerId, attemptId, value, status, occurredAt),
    source: "operator_reconciliation",
    verification: "operator_verified",
  };
}

function browserEvent(
  providerId: string,
  attemptId: string,
  eventId: string,
  status: string,
  occurredAt: string,
) {
  return {
    providerId,
    attemptId,
    eventId,
    status,
    providerStatus: status,
    source: "browser_callback",
    verification: "unverified",
    reconciliationKey: null,
    payloadDigest: null,
    occurredAt,
  };
}

test("provider-neutral eligibility is bounded, exact, and fails closed", async () => {
  const checkedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const adapter = scriptedAdapter("mock-bank-alpha", {
    checkEligibility: [
      (request: unknown) => {
        assert.deepEqual(Object.keys(request as object).sort(), [
          "amountMicros",
          "assetId",
          "countryCode",
          "environment",
          "walletAddress",
        ]);
        assert.equal(Object.isFrozen(request), true);
        return { eligible: true, reasonCode: null, checkedAt, expiresAt };
      },
      {
        eligible: false,
        reasonCode: "unsupported_region",
        checkedAt,
        expiresAt,
      },
      {
        eligible: true,
        reasonCode: null,
        checkedAt,
        expiresAt,
        providerToken: "must-not-cross-boundary",
      },
    ],
  });
  const request = {
    environment: "production",
    assetId: "usdc",
    walletAddress: wallet,
    countryCode: "US",
    amountMicros: 2_000_000n,
  };

  assert.equal(assertFundingProviderAdapter(adapter), adapter);
  assert.deepEqual(await checkFundingProviderEligibility(adapter, request), {
    providerId: "mock-bank-alpha",
    eligible: true,
    reasonCode: null,
    checkedAt,
    expiresAt,
  });
  assert.equal(
    (await checkFundingProviderEligibility(adapter, request)).reasonCode,
    "unsupported_region",
  );
  await assert.rejects(
    checkFundingProviderEligibility(adapter, request),
    /invalid shape/i,
  );
  await assert.rejects(
    checkFundingProviderEligibility(
      scriptedAdapter("mock-bank-expired", {
        checkEligibility: [{
          eligible: true,
          reasonCode: null,
          checkedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-01T01:00:00.000Z",
        }],
      }),
      request,
    ),
    /invalid or expired/i,
  );
});

test("a provider-neutral checkout survives timeout, uncertainty, late confirmation, and replay", async () => {
  const providerId = "mock-bank-alpha";
  const attemptId = "adapter-attempt-recovery";
  const checkout = productionCheckout(providerId, attemptId);
  assert.equal(isFundingCheckoutLifecycle(checkout), true);
  assert.match(fundingIntentKey({
    ...createFundingIntent({
      assetId: "usdc",
      walletAddress: wallet,
      amountMicros: 1n,
      environment: "production",
      onrampEnabled: true,
      productionApproved: true,
    }),
    providerStrategy: providerId,
  }), new RegExp(`\\|${providerId}\\|`));
  assert.throws(
    () => fundingIntentKey({
      ...createFundingIntent({
        assetId: "usdc",
        walletAddress: wallet,
        amountMicros: 1n,
        environment: "production",
        onrampEnabled: true,
        productionApproved: true,
      }),
      providerStrategy: "UPPER CASE",
    }),
    /valid funding intent/i,
  );

  const confirmation = providerEvent(
    providerId,
    attemptId,
    102,
    "confirmed",
    "2026-08-05T00:03:00.000Z",
  );
  const conflictingConfirmation = {
    ...confirmation,
    occurredAt: "2026-08-05T00:04:00.000Z",
  };
  const replayedReconciliation = {
    ...providerEvent(
      providerId,
      attemptId,
      103,
      "confirmed",
      "2026-08-05T00:04:00.000Z",
    ),
    reconciliationKey: confirmation.reconciliationKey,
  };
  const adapter = scriptedAdapter(providerId, {
    openCheckout: [
      (context: unknown) => {
        assert.deepEqual(Object.keys(context as object).sort(), [
          "adapterVersion",
          "amountMicros",
          "assetId",
          "attemptId",
          "environment",
          "intentKey",
          "providerId",
          "providerStatus",
          "status",
          "walletAddress",
        ]);
        assert.equal(Object.isFrozen(context), true);
        return browserEvent(
          providerId,
          attemptId,
          "browser-open-recovery",
          "processing",
          "2026-08-05T00:01:00.000Z",
        );
      },
    ],
    reconcileCheckout: [
      new Error("provider timeout"),
      operatorEvent(
        providerId,
        attemptId,
        101,
        "unknown",
        "2026-08-05T00:02:00.000Z",
      ),
    ],
    verifyWebhook: [
      confirmation,
      confirmation,
      conflictingConfirmation,
      replayedReconciliation,
    ],
  });

  const submitted = await applyFundingProviderOperation(
    adapter,
    "open",
    checkout,
  );
  assert.equal(submitted.status, "submitted");
  await assert.rejects(
    applyFundingProviderOperation(adapter, "reconcile", submitted),
    /provider timeout/i,
  );
  assert.equal(submitted.events.length, 1);
  assert.equal(Object.isFrozen(submitted), true);

  const uncertain = await applyFundingProviderOperation(
    adapter,
    "reconcile",
    submitted,
  );
  assert.equal(uncertain.status, "unknown");
  const confirmed = await applyFundingProviderWebhook(adapter, uncertain, {});
  assert.equal(confirmed.status, "confirmed");
  assert.equal(await applyFundingProviderWebhook(adapter, confirmed, {}), confirmed);
  await assert.rejects(
    applyFundingProviderWebhook(adapter, confirmed, {}),
    /duplicate provider event conflicts/i,
  );
  await assert.rejects(
    applyFundingProviderWebhook(adapter, confirmed, {}),
    /reconciliation event was already applied/i,
  );
});

test("provider-neutral operations cover refunds, cancellation, failure, and operator recovery", async () => {
  const providerId = "mock-bank-alpha";

  const refundAttempt = "adapter-attempt-refund";
  const refundAdapter = scriptedAdapter(providerId, {
    openCheckout: [providerEvent(providerId, refundAttempt, 201, "confirmed", "2026-08-05T00:01:00.000Z")],
    requestRefund: [providerEvent(providerId, refundAttempt, 202, "refunding", "2026-08-05T00:02:00.000Z")],
    verifyWebhook: [providerEvent(providerId, refundAttempt, 203, "refunded", "2026-08-05T00:03:00.000Z")],
  });
  const funded = await applyFundingProviderOperation(
    refundAdapter,
    "open",
    productionCheckout(providerId, refundAttempt),
  );
  const refundPending = await applyFundingProviderOperation(
    refundAdapter,
    "refund",
    funded,
  );
  assert.equal(refundPending.status, "refund_pending");
  assert.equal(
    (await applyFundingProviderWebhook(refundAdapter, refundPending, {})).status,
    "refunded",
  );

  const cancelAttempt = "adapter-attempt-cancel";
  const cancelAdapter = scriptedAdapter(providerId, {
    cancelCheckout: [providerEvent(providerId, cancelAttempt, 204, "cancelled", "2026-08-05T00:01:00.000Z")],
  });
  assert.equal(
    (await applyFundingProviderOperation(
      cancelAdapter,
      "cancel",
      productionCheckout(providerId, cancelAttempt),
    )).status,
    "cancelled",
  );

  const failedAttempt = "adapter-attempt-failure";
  const failedAdapter = scriptedAdapter(providerId, {
    openCheckout: [providerEvent(providerId, failedAttempt, 205, "failed", "2026-08-05T00:01:00.000Z")],
    verifyWebhook: [providerEvent(providerId, failedAttempt, 206, "confirmed", "2026-08-05T00:02:00.000Z")],
  });
  const failed = await applyFundingProviderOperation(
    failedAdapter,
    "open",
    productionCheckout(providerId, failedAttempt),
  );
  assert.equal(failed.status, "failed");
  await assert.rejects(
    applyFundingProviderWebhook(failedAdapter, failed, {}),
    /cannot move from failed to confirmed/i,
  );

  const recoveryAttempt = "adapter-attempt-operator";
  const recoveryAdapter = scriptedAdapter(providerId, {
    openCheckout: [browserEvent(providerId, recoveryAttempt, "browser-open-operator", "processing", "2026-08-05T00:01:00.000Z")],
    reconcileCheckout: [
      operatorEvent(providerId, recoveryAttempt, 207, "unknown", "2026-08-05T00:02:00.000Z"),
      operatorEvent(providerId, recoveryAttempt, 208, "confirmed", "2026-08-05T00:03:00.000Z"),
    ],
  });
  const pending = await applyFundingProviderOperation(
    recoveryAdapter,
    "open",
    productionCheckout(providerId, recoveryAttempt),
  );
  const unknown = await applyFundingProviderOperation(
    recoveryAdapter,
    "reconcile",
    pending,
  );
  const recovered = await applyFundingProviderOperation(
    recoveryAdapter,
    "reconcile",
    unknown,
  );
  assert.equal(recovered.status, "confirmed");
  assert.equal(recovered.events.at(-1)?.verification, "operator_verified");
});

test("production terminal outcomes remain provenance-gated across providers", async () => {
  const providerId = "mock-bank-beta";
  const attemptId = "adapter-attempt-beta";
  const adapter = scriptedAdapter(providerId, {
    openCheckout: [browserEvent(providerId, attemptId, "browser-open-beta", "processing", "2026-08-05T00:01:00.000Z")],
    cancelCheckout: [
      browserEvent(providerId, attemptId, "browser-cancel-beta", "cancelled", "2026-08-05T00:02:00.000Z"),
      {
        ...providerEvent(providerId, attemptId, 300, "cancelled", "2026-08-05T00:02:00.000Z"),
        paymentToken: "must-not-cross-boundary",
      },
      providerEvent(providerId, attemptId, 301, "cancelled", "2026-08-05T00:02:00.000Z"),
    ],
  });
  const pending = await applyFundingProviderOperation(
    adapter,
    "open",
    productionCheckout(providerId, attemptId),
  );
  await assert.rejects(
    applyFundingProviderOperation(adapter, "cancel", pending),
    /require verified provider or operator reconciliation/i,
  );
  await assert.rejects(
    applyFundingProviderOperation(adapter, "cancel", pending),
    /invalid shape/i,
  );
  assert.equal(
    (await applyFundingProviderOperation(adapter, "cancel", pending)).status,
    "cancelled",
  );
});
