import {
  DEPOSIT_ASSET_IDS,
  getDepositAsset,
} from "./deposit-assets.js";

export const FUNDING_ROUTE_CATALOG_VERSION = "2026-07-26.1";
export const ONRAMP_PROVIDER_CATALOG_VERSION = FUNDING_ROUTE_CATALOG_VERSION;
export const CONVERSION_ADAPTER_CATALOG_VERSION = FUNDING_ROUTE_CATALOG_VERSION;

const ONRAMP_PROVIDERS = Object.freeze({
  "privy-brokered-fiat": Object.freeze({
    id: "privy-brokered-fiat",
    name: "Privy (provider-managed)",
    providerSelection: "provider-managed",
    destinationAsset: "usdc",
    destinationChain: "eip155:8453",
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
    description: "Base USDC remains USDC from wallet funding through settlement.",
  }),
  "aave-direct-supply": Object.freeze({
    id: "aave-direct-supply",
    kind: "protocol-supply",
    enabled: false,
    status: "testnet_adapter_only",
    label: "Direct Aave supply",
    description:
      "Supply USDC directly through the reviewed Aave adapter and receive fixed strategy shares. Do not use a DEX swap.",
  }),
  "stargate-bridge": Object.freeze({
    id: "stargate-bridge",
    kind: "bridge",
    enabled: false,
    status: "not_approved",
    label: "External FRNT route",
    description:
      "No reviewed Base-native FRNT bridge and purchase route is approved for OpenEscrow.",
  }),
  "ondo-direct-subscribe": Object.freeze({
    id: "ondo-direct-subscribe",
    kind: "issuer-subscription",
    enabled: false,
    status: "restricted",
    label: "Ondo subscription",
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
    routeSteps:
      asset.id === DEPOSIT_ASSET_IDS.USDC
        ? ["USD", "Base USDC in user wallet", "OpenEscrow", "USDC settlement"]
        : asset.id === DEPOSIT_ASSET_IDS.AAVE_USDC
          ? [
              "USD",
              "Base USDC in user wallet",
              "direct Aave supply",
              "fixed strategy shares in OpenEscrow",
              "direct Aave withdrawal",
              "USDC settlement",
            ]
          : [],
  };
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
