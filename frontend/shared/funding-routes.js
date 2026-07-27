import {
  DEPOSIT_ASSET_IDS,
  getDepositAsset,
} from "./deposit-assets.js";

export const FUNDING_ROUTE_CATALOG_VERSION = "2026-07-26.1";

export const ONRAMP_STRATEGY = Object.freeze({
  id: "privy-brokered-fiat",
  providerSelection: "provider-managed",
  destinationAsset: "usdc",
  destinationChain: "eip155:8453",
  description:
    "Privy presents an eligible regulated provider for the user's region and sends purchased Base USDC to the user's own wallet.",
});

const conversionAdapters = Object.freeze({
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
      "No reviewed Base-native FRNT purchase and bridge route is approved for OpenEscrow.",
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

function normalizeEnvironment(value) {
  return value === "production" ? "production" : "sandbox";
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
      reason: "Fiat funding must deliver USDC; token addresses and alternate assets are rejected.",
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
      onramp: ONRAMP_STRATEGY,
      conversion: null,
      settlementAsset: null,
      routeSteps: [],
    };
  }

  const normalizedEnvironment = normalizeEnvironment(environment);
  const conversion =
    conversionAdapters[asset.fundingRoute.conversion] ||
    Object.freeze({
      id: asset.fundingRoute.conversion,
      kind: "unknown",
      enabled: false,
      status: "unknown",
      label: "Unreviewed conversion",
      description: "This conversion route has not been modeled or approved.",
    });
  const sandboxPreviewEligible =
    asset.id === DEPOSIT_ASSET_IDS.USDC ||
    asset.id === DEPOSIT_ASSET_IDS.AAVE_USDC;
  const checkoutMode =
    onrampEnabled && normalizedEnvironment === "sandbox" && sandboxPreviewEligible
      ? "sandbox_preview"
      : onrampEnabled &&
          normalizedEnvironment === "production" &&
          productionApproved &&
          asset.id === DEPOSIT_ASSET_IDS.USDC
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
    onramp: ONRAMP_STRATEGY,
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
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress || ""))) {
    throw new Error("A valid EVM destination wallet is required.");
  }
  if (typeof amountMicros !== "bigint" || amountMicros <= 0n) {
    throw new Error("The funding amount must be greater than zero.");
  }

  return Object.freeze({
    schema: "openescrow.funding-intent.v1",
    routeCatalogVersion: FUNDING_ROUTE_CATALOG_VERSION,
    assetId: plan.assetId,
    environment: normalizeEnvironment(environment),
    providerStrategy: ONRAMP_STRATEGY.id,
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
  });
}
