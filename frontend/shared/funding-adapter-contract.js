import {
  FUNDING_CHECKOUT_EVENT_SOURCES,
  FUNDING_CHECKOUT_EVENT_VERIFICATIONS,
  applyFundingCheckoutEvent,
  isFundingCheckoutLifecycle,
} from "./funding-routes.js";

const ADAPTER_METHODS = Object.freeze([
  "checkEligibility",
  "openCheckout",
  "cancelCheckout",
  "requestRefund",
  "reconcileCheckout",
  "verifyWebhook",
]);

const OPERATION_METHODS = Object.freeze({
  open: "openCheckout",
  cancel: "cancelCheckout",
  refund: "requestRefund",
  reconcile: "reconcileCheckout",
});

const ADAPTER_EVENT_FIELDS = new Set([
  "providerId",
  "attemptId",
  "eventId",
  "status",
  "providerStatus",
  "source",
  "verification",
  "reconciliationKey",
  "payloadDigest",
  "occurredAt",
]);

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  try {
    return new Date(value).toISOString() === value ? value : null;
  } catch {
    return null;
  }
}

function providerId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(normalized) &&
    normalized.length >= 3 &&
    normalized.length <= 100
    ? normalized
    : null;
}

function assertExactFields(value, allowed, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error(`${label} has an invalid shape.`);
  }
}

export function assertFundingProviderAdapter(adapter) {
  if (
    !adapter ||
    typeof adapter !== "object" ||
    providerId(adapter.id) !== adapter.id ||
    typeof adapter.version !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(adapter.version) ||
    ADAPTER_METHODS.some((method) => typeof adapter[method] !== "function")
  ) {
    throw new Error("A complete versioned funding provider adapter is required.");
  }
  return adapter;
}

function eligibilityRequest(input) {
  const amountMicros =
    typeof input?.amountMicros === "bigint"
      ? input.amountMicros
      : /^[1-9][0-9]*$/.test(String(input?.amountMicros || ""))
        ? BigInt(input.amountMicros)
        : 0n;
  if (
    !input ||
    !["sandbox", "production"].includes(input.environment) ||
    !/^[a-z0-9][a-z0-9._-]{1,99}$/.test(String(input.assetId || "")) ||
    !/^0x[a-fA-F0-9]{40}$/.test(String(input.walletAddress || "")) ||
    !/^[A-Z]{2}$/.test(String(input.countryCode || "")) ||
    amountMicros <= 0n
  ) {
    throw new Error("A complete funding eligibility request is required.");
  }
  return Object.freeze({
    environment: input.environment,
    assetId: input.assetId,
    walletAddress: input.walletAddress.toLowerCase(),
    countryCode: input.countryCode,
    amountMicros: amountMicros.toString(),
  });
}

export async function checkFundingProviderEligibility(adapterValue, input) {
  const adapter = assertFundingProviderAdapter(adapterValue);
  const result = await adapter.checkEligibility(eligibilityRequest(input));
  assertExactFields(
    result,
    new Set(["eligible", "reasonCode", "checkedAt", "expiresAt"]),
    "The funding eligibility result",
  );
  const checkedAt = canonicalTimestamp(result.checkedAt);
  const expiresAt = canonicalTimestamp(result.expiresAt);
  const lifetime = checkedAt && expiresAt
    ? Date.parse(expiresAt) - Date.parse(checkedAt)
    : 0;
  const now = Date.now();
  const reasonCode = result.reasonCode === null
    ? null
    : String(result.reasonCode || "");
  if (
    typeof result.eligible !== "boolean" ||
    !checkedAt ||
    !expiresAt ||
    lifetime <= 0 ||
    lifetime > 24 * 60 * 60 * 1000 ||
    Date.parse(expiresAt || "") <= now ||
    Date.parse(checkedAt || "") > now + 5 * 60 * 1000 ||
    (result.eligible && reasonCode !== null) ||
    (!result.eligible && !/^[a-z][a-z0-9_]{2,79}$/.test(reasonCode || ""))
  ) {
    throw new Error("The funding eligibility result is invalid or expired.");
  }
  return Object.freeze({
    providerId: adapter.id,
    eligible: result.eligible,
    reasonCode,
    checkedAt,
    expiresAt,
  });
}

function checkoutContext(adapter, checkout) {
  if (!isFundingCheckoutLifecycle(checkout)) {
    throw new Error("A valid funding checkout lifecycle is required.");
  }
  if (checkout.providerStrategy !== adapter.id) {
    throw new Error("The funding adapter does not match this checkout.");
  }
  return Object.freeze({
    providerId: adapter.id,
    adapterVersion: adapter.version,
    attemptId: checkout.attemptId,
    intentKey: checkout.intentKey,
    environment: checkout.environment,
    assetId: checkout.assetId,
    walletAddress: checkout.walletAddress,
    amountMicros: checkout.amountMicros,
    status: checkout.status,
    providerStatus: checkout.providerStatus,
  });
}

function applyAdapterEvent(adapter, checkout, value, requireVerifiedWebhook = false) {
  assertExactFields(value, ADAPTER_EVENT_FIELDS, "The funding provider event");
  if (
    value.providerId !== adapter.id ||
    value.attemptId !== checkout.attemptId ||
    !canonicalTimestamp(value.occurredAt)
  ) {
    throw new Error("The funding provider event is not bound to this checkout.");
  }
  if (
    requireVerifiedWebhook &&
    (value.source !== FUNDING_CHECKOUT_EVENT_SOURCES.PROVIDER_WEBHOOK ||
      value.verification !==
        FUNDING_CHECKOUT_EVENT_VERIFICATIONS.PROVIDER_SIGNED)
  ) {
    throw new Error("A webhook outcome must have verified provider provenance.");
  }
  return applyFundingCheckoutEvent(checkout, {
    eventId: value.eventId,
    status: value.status,
    providerStatus: value.providerStatus,
    source: value.source,
    verification: value.verification,
    reconciliationKey: value.reconciliationKey,
    payloadDigest: value.payloadDigest,
    occurredAt: value.occurredAt,
  });
}

export async function applyFundingProviderOperation(
  adapterValue,
  operation,
  checkout,
  input = {},
) {
  const adapter = assertFundingProviderAdapter(adapterValue);
  const method = OPERATION_METHODS[operation];
  if (!method) throw new Error("An approved funding provider operation is required.");
  const result = await adapter[method](checkoutContext(adapter, checkout), input);
  return applyAdapterEvent(adapter, checkout, result);
}

export async function applyFundingProviderWebhook(
  adapterValue,
  checkout,
  envelope,
) {
  const adapter = assertFundingProviderAdapter(adapterValue);
  const result = await adapter.verifyWebhook(
    checkoutContext(adapter, checkout),
    envelope,
  );
  return applyAdapterEvent(adapter, checkout, result, true);
}
