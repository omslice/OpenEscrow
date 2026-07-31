import {
  DEPOSIT_ASSET_IDS,
  getDepositAsset,
} from "./deposit-assets.js";

export const FUNDING_ROUTE_CATALOG_VERSION = "2026-07-30.1";
export const ONRAMP_PROVIDER_CATALOG_VERSION = FUNDING_ROUTE_CATALOG_VERSION;
export const CONVERSION_ADAPTER_CATALOG_VERSION = FUNDING_ROUTE_CATALOG_VERSION;
export const FUNDING_CHECKOUT_SCHEMA = "openescrow.funding-checkout.v3";
export const FUNDING_CHECKOUT_EVENT_SOURCES = Object.freeze({
  BROWSER_CALLBACK: "browser_callback",
  PROVIDER_WEBHOOK: "provider_webhook",
  OPERATOR_RECONCILIATION: "operator_reconciliation",
});
export const FUNDING_CHECKOUT_EVENT_VERIFICATIONS = Object.freeze({
  UNVERIFIED: "unverified",
  PROVIDER_SIGNED: "provider_signed",
  OPERATOR_VERIFIED: "operator_verified",
});

const ONRAMP_PROVIDERS = Object.freeze({
  "privy-brokered-fiat": Object.freeze({
    id: "privy-brokered-fiat",
    name: "Privy (provider-managed)",
    providerSelection: "provider-managed",
    destinationAsset: "usdc",
    destinationChain: "eip155:8453",
    onrampStepLabel: "Base USDC in user wallet",
    enabled: true,
    status: "ready",
    description:
      "Privy presents an eligible regulated provider for the user's region and sends purchased Base USDC to the user's own wallet.",
    notes: Object.freeze([
      "Provider selection is delegated to Privy by region and provider coverage.",
      "OpenEscrow never stores payment card or bank credentials.",
    ]),
  }),
  "kraken-swap-external": Object.freeze({
    id: "kraken-swap-external",
    name: "Kraken + Stargate bridge",
    providerSelection: "external-bridge",
    destinationAsset: "usdc",
    destinationChain: "eip155:8453",
    onrampStepLabel: "USDC through disabled FRNT on-ramp",
    enabled: false,
    status: "not_approved",
    description:
      "FRNT requires a reviewed Base-native purchase route; this external bridge path is intentionally blocked until approval.",
  }),
});

const ONRAMP_PROVIDER_ALIASES = Object.freeze({
  "privy-usdc-base": "privy-brokered-fiat",
  "privy-usdc-eligible-network": "privy-brokered-fiat",
  "external-kraken-solana": "kraken-swap-external",
});

const ONRAMP_UNKNOWN = Object.freeze({
  id: "unknown-onramp",
  name: "Unknown provider",
  providerSelection: "unknown",
  destinationAsset: "usdc",
  destinationChain: "eip155:8453",
  enabled: false,
  status: "unknown",
  description: "The configured on-ramp alias is not recognized in this build.",
});

const SWAP_CONVERSION_PROVIDERS = Object.freeze({
  none: Object.freeze({
    id: "none",
    kind: "none",
    enabled: true,
    status: "ready",
    label: "No conversion",
    routeSteps: Object.freeze(["OpenEscrow", "USDC settlement"]),
    description: "Base USDC remains USDC from wallet funding through settlement.",
  }),
  "aave-direct-supply": Object.freeze({
    id: "aave-direct-supply",
    kind: "protocol-supply",
    enabled: false,
    status: "testnet_adapter_only",
    label: "Direct Aave supply",
    routeSteps: Object.freeze([
      "direct Aave supply",
      "fixed strategy shares in OpenEscrow",
      "direct Aave withdrawal",
      "USDC settlement",
    ]),
    description:
      "Supply USDC directly through the reviewed Aave adapter and receive fixed strategy shares. Do not use a DEX swap.",
  }),
  "stargate-bridge": Object.freeze({
    id: "stargate-bridge",
    kind: "bridge",
    enabled: false,
    status: "not_approved",
    label: "External FRNT route",
    routeSteps: Object.freeze([
      "external Solana bridge",
      "FRNT in your wallet",
      "OpenEscrow",
    ]),
    description:
      "No reviewed Base-native FRNT bridge and purchase route is approved for OpenEscrow.",
  }),
  "ondo-direct-subscribe": Object.freeze({
    id: "ondo-direct-subscribe",
    kind: "issuer-subscription",
    enabled: false,
    status: "restricted",
    label: "Ondo subscription",
    routeSteps: Object.freeze([
      "disabled USDY provider",
      "Ondo note-token",
      "OpenEscrow",
    ]),
    description:
      "Issuer eligibility, wallet registration, network support, and current official terms are required.",
  }),
});

function resolveOnrampProvider(inputId) {
  const providerId =
    ONRAMP_PROVIDER_ALIASES[String(inputId || "").trim()] ||
    String(inputId || "").trim();
  return ONRAMP_PROVIDERS[providerId] || ONRAMP_UNKNOWN;
}

function resolveConversionProvider(inputId) {
  const conversionId = String(inputId || "").trim();
  return (
    SWAP_CONVERSION_PROVIDERS[conversionId] ||
    Object.freeze({
      id: conversionId,
      kind: "unknown",
      enabled: false,
      status: "unknown",
      label: "Unreviewed conversion",
      description: "This conversion route has not been modeled or approved.",
    })
  );
}

function normalizeEnvironment(value) {
  return value === "production" ? "production" : "sandbox";
}

export const ONRAMP_STRATEGY = ONRAMP_PROVIDERS["privy-brokered-fiat"];

export function getFundingRouteServices(assetId) {
  const asset = getDepositAsset(assetId);
  if (!asset) return null;
  return {
    onramp: resolveOnrampProvider(asset.fundingRoute.onramp),
    conversion: resolveConversionProvider(asset.fundingRoute.conversion),
  };
}

export function listFundingProviders() {
  return {
    version: ONRAMP_PROVIDER_CATALOG_VERSION,
    onramp: ONRAMP_PROVIDERS,
    aliases: ONRAMP_PROVIDER_ALIASES,
    conversion: SWAP_CONVERSION_PROVIDERS,
  };
}

export function validateFiatOnrampConfig(input = {}) {
  const enabled = input.enabled === true;
  const environment = normalizeEnvironment(input.environment);
  const asset = String(input.asset || "").trim().toLowerCase();
  const chain = String(input.chain || "").trim().toLowerCase();
  const productionApproved = input.productionApproved === true;

  if (!enabled) {
    return {
      enabled: false,
      environment,
      reason: "Fiat funding is disabled for this build.",
      config: null,
    };
  }
  if (asset !== ONRAMP_STRATEGY.destinationAsset) {
    return {
      enabled: false,
      environment,
      reason:
        "Fiat funding must deliver USDC; token addresses and alternate assets are rejected.",
      config: null,
    };
  }
  if (chain !== ONRAMP_STRATEGY.destinationChain) {
    return {
      enabled: false,
      environment,
      reason: "Fiat funding must deliver USDC on Base mainnet.",
      config: null,
    };
  }
  if (environment === "production" && !productionApproved) {
    return {
      enabled: false,
      environment,
      reason:
        "Production fiat funding needs the separate production-approval build flag after legal, provider, contract, and security review.",
      config: null,
    };
  }

  return {
    enabled: true,
    environment,
    reason: null,
    config: {
      asset,
      chain,
      environment,
      providerStrategy: ONRAMP_STRATEGY.id,
      providerCatalogVersion: ONRAMP_PROVIDER_CATALOG_VERSION,
      conversionCatalogVersion: CONVERSION_ADAPTER_CATALOG_VERSION,
    },
  };
}

export function createFundingPlan(
  assetId,
  {
    onrampEnabled = false,
    environment = "sandbox",
    productionApproved = false,
  } = {},
) {
  const asset = getDepositAsset(assetId);
  if (!asset) {
    return {
      assetId: String(assetId || ""),
      status: "blocked",
      checkoutAvailable: false,
      checkoutMode: null,
      reason: "Unknown deposit asset.",
      onramp: ONRAMP_UNKNOWN,
      onrampProvider: ONRAMP_UNKNOWN,
      conversion: null,
      settlementAsset: null,
      routeSteps: [],
    };
  }

  const normalizedEnvironment = normalizeEnvironment(environment);
  const onramp = resolveOnrampProvider(asset.fundingRoute.onramp);
  const conversion = resolveConversionProvider(asset.fundingRoute.conversion);
  const sandboxPreviewEligible =
    asset.id === DEPOSIT_ASSET_IDS.USDC || asset.id === DEPOSIT_ASSET_IDS.AAVE_USDC;
  const checkoutMode =
    onrampEnabled &&
    normalizedEnvironment === "sandbox" &&
    sandboxPreviewEligible &&
    onramp.enabled
      ? "sandbox_preview"
      : onrampEnabled &&
          normalizedEnvironment === "production" &&
          productionApproved &&
          asset.id === DEPOSIT_ASSET_IDS.USDC &&
          onramp.enabled
        ? "production"
        : null;

  let status = "blocked";
  let reason = asset.unavailableReason || null;
  if (checkoutMode === "sandbox_preview") {
    status = "sandbox_preview";
    reason =
      asset.id === DEPOSIT_ASSET_IDS.USDC
        ? "The provider sandbox previews Base USDC purchase without moving money."
        : "The provider sandbox previews a Base USDC purchase only. It cannot create this agreement's selected test or strategy asset.";
  } else if (checkoutMode === "production") {
    status = "ready";
    reason = null;
  } else if (!onramp.enabled) {
    reason = onramp.description || "The selected funding provider is unavailable.";
  } else if (!sandboxPreviewEligible) {
    reason =
      asset.unavailableReason ||
      "This asset does not have an approved OpenEscrow funding route.";
  } else if (!onrampEnabled) {
    reason = "Fiat funding is disabled for this build.";
  } else if (normalizedEnvironment === "production" && !productionApproved) {
    reason = "Production fiat funding has not passed its release gate.";
  } else if (asset.id !== DEPOSIT_ASSET_IDS.USDC) {
    reason =
      "Production checkout is limited to direct USDC until the selected asset adapter and its settlement path are approved.";
  }

  return {
    assetId: asset.id,
    status,
    checkoutAvailable: checkoutMode !== null,
    checkoutMode,
    reason,
    onramp: onramp,
    onrampProvider: onramp,
    conversion,
    settlementAsset: asset.settlementAsset,
    routeSteps: buildRouteSteps({ onramp, conversion, asset }),
  };
}

function buildRouteSteps({ onramp, conversion, asset }) {
  const settlementStep = `${asset.settlementAsset} settlement`;
  if (conversion.id === "none") {
    return [
      "USD",
      onramp.onrampStepLabel || "Base USDC in user wallet",
      "OpenEscrow",
      settlementStep,
    ];
  }
  const conversionSteps = conversion.routeSteps || [];
  return ["USD", onramp.onrampStepLabel || "Base USDC in user wallet", ...conversionSteps];
}

export function createFundingIntent({
  assetId,
  walletAddress,
  amountMicros,
  environment = "sandbox",
  onrampEnabled = false,
  productionApproved = false,
}) {
  const plan = createFundingPlan(assetId, {
    onrampEnabled,
    environment,
    productionApproved,
  });
  if (!plan.checkoutAvailable) {
    throw new Error(plan.reason || "This funding route is unavailable.");
  }
  const services = getFundingRouteServices(assetId);
  if (!services || !services.onramp.enabled) {
    throw new Error("No active on-ramp provider is configured for this asset.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress || ""))) {
    throw new Error("A valid EVM destination wallet is required.");
  }
  if (typeof amountMicros !== "bigint" || amountMicros <= 0n) {
    throw new Error("The funding amount must be greater than zero.");
  }

  const onrampProvider = services.onramp;

  return Object.freeze({
    schema: "openescrow.funding-intent.v1",
    routeCatalogVersion: FUNDING_ROUTE_CATALOG_VERSION,
    assetId: plan.assetId,
    environment: normalizeEnvironment(environment),
    providerStrategy: onrampProvider.id,
    source: Object.freeze({
      assets: Object.freeze(["usd"]),
      defaultAsset: "usd",
    }),
    destination: Object.freeze({
      asset: ONRAMP_STRATEGY.destinationAsset,
      chain: ONRAMP_STRATEGY.destinationChain,
      address: walletAddress,
    }),
    amountMicros,
    checkoutMode: plan.checkoutMode,
    conversionKind: services.conversion.id,
  });
}

function rawFundingProviderStatus(result) {
  return result && typeof result === "object" && typeof result.status === "string"
    ? result.status.trim().toLowerCase()
    : "unknown";
}

function rawFundingEventVerification(result) {
  return result &&
    typeof result === "object" &&
    typeof result.verification === "string"
    ? result.verification.trim().toLowerCase()
    : FUNDING_CHECKOUT_EVENT_VERIFICATIONS.UNVERIFIED;
}

function rawFundingEventSource(result) {
  return result && typeof result === "object" && typeof result.source === "string"
    ? result.source.trim().toLowerCase()
    : FUNDING_CHECKOUT_EVENT_SOURCES.BROWSER_CALLBACK;
}

function validSha256Digest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function trustedFundingEventProvenance(
  source,
  verification,
  reconciliationKey,
  payloadDigest,
) {
  return (
    validSha256Digest(reconciliationKey) &&
    validSha256Digest(payloadDigest) &&
    ((source === FUNDING_CHECKOUT_EVENT_SOURCES.PROVIDER_WEBHOOK &&
      verification === FUNDING_CHECKOUT_EVENT_VERIFICATIONS.PROVIDER_SIGNED) ||
      (source === FUNDING_CHECKOUT_EVENT_SOURCES.OPERATOR_RECONCILIATION &&
        verification === FUNDING_CHECKOUT_EVENT_VERIFICATIONS.OPERATOR_VERIFIED))
  );
}

export function normalizeFundingCheckoutState(status) {
  switch (String(status || "").trim().toLowerCase()) {
    case "created":
    case "opened":
    case "opening":
      return "opening";
    case "pending":
    case "processing":
    case "requires_action":
    case "submitted":
      return "submitted";
    case "complete":
    case "completed":
    case "confirmed":
    case "succeeded":
    case "success":
      return "confirmed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "declined":
    case "expired":
    case "failed":
    case "rejected":
      return "failed";
    case "refund_pending":
    case "refunding":
      return "refund_pending";
    case "refunded":
    case "reversed":
      return "refunded";
    default:
      return "unknown";
  }
}

export function fundingIntentKey(intent) {
  const validAmount =
    typeof intent?.amountMicros === "bigint"
      ? intent.amountMicros > 0n
      : /^[1-9][0-9]*$/.test(String(intent?.amountMicros || ""));
  if (
    !intent ||
    intent.schema !== "openescrow.funding-intent.v1" ||
    intent.routeCatalogVersion !== FUNDING_ROUTE_CATALOG_VERSION ||
    !["sandbox", "production"].includes(intent.environment) ||
    !Object.values(DEPOSIT_ASSET_IDS).includes(intent.assetId) ||
    intent.providerStrategy !== ONRAMP_STRATEGY.id ||
    intent.destination?.chain !== ONRAMP_STRATEGY.destinationChain ||
    intent.destination?.asset !== ONRAMP_STRATEGY.destinationAsset ||
    !/^0x[a-fA-F0-9]{40}$/.test(String(intent.destination?.address || "")) ||
    !validAmount
  ) {
    throw new Error("A valid funding intent is required.");
  }
  return [
    intent.schema,
    intent.routeCatalogVersion,
    intent.environment,
    intent.assetId,
    intent.providerStrategy,
    intent.destination.chain,
    intent.destination.asset,
    intent.destination.address.toLowerCase(),
    intent.amountMicros.toString(),
  ].join("|");
}

function validAttemptId(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 160 &&
    /^[a-zA-Z0-9._:-]+$/.test(value)
  );
}

function validTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validProviderStatus(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value.trim() === value
  );
}

function validFundingCheckoutEventProvenance(
  source,
  verification,
  reconciliationKey,
  payloadDigest,
) {
  return (
    (source === FUNDING_CHECKOUT_EVENT_SOURCES.BROWSER_CALLBACK &&
      verification === FUNDING_CHECKOUT_EVENT_VERIFICATIONS.UNVERIFIED &&
      reconciliationKey === null &&
      payloadDigest === null) ||
    trustedFundingEventProvenance(
      source,
      verification,
      reconciliationKey,
      payloadDigest,
    )
  );
}

function validFundingCheckoutEventForEnvironment(
  environment,
  status,
  source,
  verification,
  reconciliationKey,
  payloadDigest,
) {
  return (
    environment !== "production" ||
    ["opening", "submitted", "unknown"].includes(status) ||
    trustedFundingEventProvenance(
      source,
      verification,
      reconciliationKey,
      payloadDigest,
    )
  );
}

function freezeFundingCheckout(checkout) {
  return Object.freeze({
    ...checkout,
    events: Object.freeze(
      checkout.events.map((event) => Object.freeze({ ...event })),
    ),
  });
}

export function createFundingCheckoutAttempt(
  intent,
  { attemptId, createdAt = new Date().toISOString() } = {},
) {
  if (!validAttemptId(attemptId)) {
    throw new Error("A unique checkout attempt ID is required.");
  }
  if (!validTimestamp(createdAt)) {
    throw new Error("A valid checkout creation timestamp is required.");
  }
  const intentKey = fundingIntentKey(intent);
  return freezeFundingCheckout({
    schema: FUNDING_CHECKOUT_SCHEMA,
    intentKey,
    attemptId,
    environment: intent.environment,
    assetId: intent.assetId,
    providerStrategy: intent.providerStrategy,
    walletAddress: intent.destination.address.toLowerCase(),
    amountMicros: intent.amountMicros.toString(),
    status: "opening",
    providerStatus: "opening",
    createdAt,
    updatedAt: createdAt,
    events: [],
  });
}

const CHECKOUT_TRANSITIONS = Object.freeze({
  opening: Object.freeze([
    "opening",
    "submitted",
    "confirmed",
    "cancelled",
    "failed",
    "unknown",
  ]),
  submitted: Object.freeze([
    "submitted",
    "confirmed",
    "cancelled",
    "failed",
    "unknown",
  ]),
  confirmed: Object.freeze(["confirmed", "refund_pending", "refunded"]),
  cancelled: Object.freeze(["cancelled"]),
  failed: Object.freeze(["failed"]),
  unknown: Object.freeze([
    "unknown",
    "submitted",
    "confirmed",
    "cancelled",
    "failed",
    "refund_pending",
    "refunded",
  ]),
  refund_pending: Object.freeze(["refund_pending", "refunded"]),
  refunded: Object.freeze(["refunded"]),
});

export function isFundingCheckoutLifecycle(value) {
  if (!value || typeof value !== "object") return false;
  const intentParts =
    typeof value.intentKey === "string" ? value.intentKey.split("|") : [];
  if (
    value.schema !== FUNDING_CHECKOUT_SCHEMA ||
    intentParts.length !== 9 ||
    intentParts[0] !== "openescrow.funding-intent.v1" ||
    intentParts[1] !== FUNDING_ROUTE_CATALOG_VERSION ||
    intentParts[2] !== value.environment ||
    intentParts[3] !== value.assetId ||
    intentParts[4] !== value.providerStrategy ||
    intentParts[5] !== ONRAMP_STRATEGY.destinationChain ||
    intentParts[6] !== ONRAMP_STRATEGY.destinationAsset ||
    intentParts[7] !== value.walletAddress ||
    intentParts[8] !== value.amountMicros ||
    !validAttemptId(value.attemptId) ||
    !["sandbox", "production"].includes(value.environment) ||
    !Object.values(DEPOSIT_ASSET_IDS).includes(value.assetId) ||
    value.providerStrategy !== ONRAMP_STRATEGY.id ||
    !/^0x[a-fA-F0-9]{40}$/.test(String(value.walletAddress || "")) ||
    !/^[1-9][0-9]*$/.test(String(value.amountMicros || "")) ||
    !Object.hasOwn(CHECKOUT_TRANSITIONS, value.status) ||
    !validProviderStatus(value.providerStatus) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt) ||
    !Array.isArray(value.events) ||
    value.events.length > 64
  ) {
    return false;
  }
  let status = "opening";
  let providerStatus = "opening";
  let updatedAt = value.createdAt;
  let previousTime = Date.parse(value.createdAt);
  const eventIds = new Set();
  const reconciliationKeys = new Set();
  for (const event of value.events) {
    if (
      !event ||
      typeof event !== "object" ||
      !validAttemptId(event.id) ||
      eventIds.has(event.id) ||
      !Object.hasOwn(CHECKOUT_TRANSITIONS, event.status) ||
      !validProviderStatus(event.providerStatus) ||
      !validFundingCheckoutEventProvenance(
        event.source,
        event.verification,
        event.reconciliationKey,
        event.payloadDigest,
      ) ||
      !validFundingCheckoutEventForEnvironment(
        value.environment,
        event.status,
        event.source,
        event.verification,
        event.reconciliationKey,
        event.payloadDigest,
      ) ||
      (event.reconciliationKey !== null &&
        reconciliationKeys.has(event.reconciliationKey)) ||
      !validTimestamp(event.occurredAt) ||
      Date.parse(event.occurredAt) < previousTime ||
      !CHECKOUT_TRANSITIONS[status].includes(event.status)
    ) {
      return false;
    }
    eventIds.add(event.id);
    if (event.reconciliationKey !== null) {
      reconciliationKeys.add(event.reconciliationKey);
    }
    status = event.status;
    providerStatus = event.providerStatus;
    updatedAt = event.occurredAt;
    previousTime = Date.parse(event.occurredAt);
  }
  return (
    value.status === status &&
    value.providerStatus === providerStatus &&
    value.updatedAt === updatedAt
  );
}

export function canCloseInterruptedSandboxCheckout(checkout) {
  return (
    isFundingCheckoutLifecycle(checkout) &&
    checkout.environment === "sandbox" &&
    checkout.status === "unknown"
  );
}

export function applyFundingCheckoutEvent(
  checkout,
  {
    eventId,
    status,
    providerStatus = status,
    source = FUNDING_CHECKOUT_EVENT_SOURCES.BROWSER_CALLBACK,
    verification = FUNDING_CHECKOUT_EVENT_VERIFICATIONS.UNVERIFIED,
    reconciliationKey = null,
    payloadDigest = null,
    occurredAt = new Date().toISOString(),
  } = {},
) {
  if (!isFundingCheckoutLifecycle(checkout)) {
    throw new Error("A valid funding checkout lifecycle is required.");
  }
  if (!validAttemptId(eventId)) {
    throw new Error("A unique provider event ID is required.");
  }
  if (!validTimestamp(occurredAt)) {
    throw new Error("A valid provider event timestamp is required.");
  }
  const normalizedProviderStatus = String(providerStatus || "unknown")
    .trim()
    .toLowerCase();
  const nextStatus = normalizeFundingCheckoutState(status);
  if (!validProviderStatus(normalizedProviderStatus)) {
    throw new Error("A valid provider status is required.");
  }
  if (
    !validFundingCheckoutEventProvenance(
      source,
      verification,
      reconciliationKey,
      payloadDigest,
    )
  ) {
    throw new Error("A valid checkout event provenance is required.");
  }
  if (
    !validFundingCheckoutEventForEnvironment(
      checkout.environment,
      nextStatus,
      source,
      verification,
      reconciliationKey,
      payloadDigest,
    )
  ) {
    throw new Error(
      "Production checkout outcomes require verified provider or operator reconciliation provenance.",
    );
  }
  const duplicate = checkout.events.find((event) => event.id === eventId);
  if (duplicate) {
    if (
      duplicate.status !== nextStatus ||
      duplicate.providerStatus !== normalizedProviderStatus ||
      duplicate.source !== source ||
      duplicate.verification !== verification ||
      duplicate.reconciliationKey !== reconciliationKey ||
      duplicate.payloadDigest !== payloadDigest
    ) {
      throw new Error("A duplicate provider event conflicts with the saved checkout state.");
    }
    return checkout;
  }
  if (
    reconciliationKey !== null &&
    checkout.events.some((event) => event.reconciliationKey === reconciliationKey)
  ) {
    throw new Error("That reconciliation event was already applied.");
  }
  if (Date.parse(occurredAt) < Date.parse(checkout.updatedAt)) {
    throw new Error("A provider event cannot predate the saved checkout state.");
  }
  if (checkout.events.length >= 64) {
    throw new Error("The funding checkout event history limit was reached.");
  }
  if (!CHECKOUT_TRANSITIONS[checkout.status].includes(nextStatus)) {
    throw new Error(
      `Funding checkout cannot move from ${checkout.status} to ${nextStatus}.`,
    );
  }
  const event = {
    id: eventId,
    status: nextStatus,
    providerStatus: normalizedProviderStatus,
    source,
    verification,
    reconciliationKey,
    payloadDigest,
    occurredAt,
  };
  return freezeFundingCheckout({
    ...checkout,
    status: nextStatus,
    providerStatus: normalizedProviderStatus,
    updatedAt: occurredAt,
    events: [...checkout.events, event],
  });
}

export function reconcileFundingCheckoutResult(
  result,
  environment = "sandbox",
) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const providerStatus = rawFundingProviderStatus(result);
  const state = normalizeFundingCheckoutState(providerStatus);
  const source = rawFundingEventSource(result);
  const verification = rawFundingEventVerification(result);
  const reconciliationKey =
    result && typeof result === "object" ? result.reconciliationKey : null;
  const payloadDigest =
    result && typeof result === "object" ? result.payloadDigest : null;

  if (
    normalizedEnvironment === "production" &&
    !["opening", "submitted", "unknown"].includes(state) &&
    !trustedFundingEventProvenance(
      source,
      verification,
      reconciliationKey,
      payloadDigest,
    )
  ) {
    return Object.freeze({
      state: "unknown",
      providerStatus,
      severity: "error",
      shouldRefreshBalance: false,
      retryAllowed: false,
      message:
        "The checkout window returned a result, but OpenEscrow has not received a verified provider or operator reconciliation event. No agreement funding was recorded; do not retry until the provider status is reconciled.",
    });
  }

  if (state === "opening") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: false,
      retryAllowed: false,
      message: "Opening secure checkout...",
    });
  }

  if (state === "confirmed") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: normalizedEnvironment === "production",
      retryAllowed: false,
      message:
        normalizedEnvironment === "sandbox"
          ? "Sandbox checkout completed. No real funds moved; claim free test tokens below to fund this agreement."
          : "Provider confirmation received. Refreshing your available balance...",
    });
  }

  if (state === "submitted") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: false,
      retryAllowed: false,
      message:
        normalizedEnvironment === "sandbox"
          ? "Sandbox checkout submitted. No real funds moved and this agreement is not funded."
          : "Payment submitted to the provider. OpenEscrow will not treat the agreement as funded until the wallet balance is confirmed.",
    });
  }

  if (state === "cancelled") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: false,
      retryAllowed: true,
      message:
        "Checkout was closed before confirmation. No agreement funding was recorded.",
    });
  }

  if (state === "failed") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "error",
      shouldRefreshBalance: false,
      retryAllowed: true,
      message:
        "The provider did not confirm this checkout. No agreement funding was recorded; you can try again.",
    });
  }

  if (state === "refund_pending") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: normalizedEnvironment === "production",
      retryAllowed: false,
      message:
        normalizedEnvironment === "sandbox"
          ? "The sandbox reports a refund in progress. No real funds moved and no agreement funding was recorded."
          : "The provider reports a refund in progress. Refresh the wallet balance and do not start another purchase yet.",
    });
  }

  if (state === "refunded") {
    return Object.freeze({
      state,
      providerStatus,
      severity: "info",
      shouldRefreshBalance: normalizedEnvironment === "production",
      retryAllowed: true,
      message:
        normalizedEnvironment === "sandbox"
          ? "The sandbox refund completed. No real funds moved and no agreement funding was recorded."
          : "The provider reports that the purchase was refunded. Refresh the wallet balance before starting another checkout.",
    });
  }

  return Object.freeze({
    state: "unknown",
    providerStatus,
    severity: "error",
    shouldRefreshBalance: false,
    retryAllowed: false,
    message:
      "OpenEscrow could not verify the checkout result. No agreement funding was recorded; check your provider activity and refresh your wallet before starting another purchase.",
  });
}

export function reconcileFundingCheckoutError() {
  return Object.freeze({
    state: "unknown",
    providerStatus: "error",
    severity: "error",
    shouldRefreshBalance: false,
    retryAllowed: false,
    message:
      "Checkout did not return a verifiable result. No agreement funding was recorded; check your provider activity and refresh your wallet before starting another purchase.",
  });
}
