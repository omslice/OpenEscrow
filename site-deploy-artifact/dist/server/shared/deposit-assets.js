export const DEPOSIT_ASSET_CATALOG_VERSION = "2026-07-26.1";

export const DEPOSIT_ASSET_IDS = Object.freeze({
  USDC: "usdc",
  AAVE_USDC: "aave-usdc",
  FRNT: "frnt",
  USDY: "usdy",
});

const assets = [
  {
    id: DEPOSIT_ASSET_IDS.USDC,
    displayName: "USDC",
    symbol: "USDC",
    testnetSymbol: "testUSDC",
    badge: "Standard · No yield",
    category: "stablecoin",
    underlyingAsset: "USDC",
    yieldType: "none",
    yieldSource: "None",
    yieldVariability: "none",
    settlementAsset: "USDC",
    supportedNetworks: ["base", "base-sepolia"],
    eligibility: "Available for the current U.S. testnet workflow.",
    liquidityRisk: "Normal stablecoin redemption and network liquidity risk.",
    mainRisk: "USDC issuer, smart-contract, and network risk.",
    disclosures: [
      "No yield is earned.",
      "The security deposit remains subject to USDC issuer, smart-contract, and network risk.",
      "This testnet implementation uses freely mintable testUSDC, not real USDC.",
    ],
    enabled: true,
    implementationStatus: "testnet",
    officialDocumentationUrl: "https://www.circle.com/usdc",
    consentRequired: false,
    adapterId: "escrow-erc20-direct",
    contractTokenChoice: "plain",
    fundingRoute: {
      onramp: "privy-usdc-base",
      conversion: "none",
      settlement: "direct-usdc",
    },
    unavailableReason: null,
  },
  {
    id: DEPOSIT_ASSET_IDS.AAVE_USDC,
    displayName: "USDC on Aave",
    symbol: "aUSDC",
    testnetSymbol: "ytUSDC",
    badge: "Variable yield · Simulated",
    category: "lending-receipt",
    underlyingAsset: "USDC",
    yieldType: "variable_lending",
    yieldSource: "Interest paid by borrowers in the Aave USDC market.",
    yieldVariability: "variable",
    settlementAsset: "USDC",
    supportedNetworks: ["base", "base-sepolia"],
    eligibility: "Available as a clearly labeled simulation in the current U.S. testnet workflow.",
    liquidityRisk: "Withdrawal depends on available USDC liquidity in the selected Aave market.",
    mainRisk: "Aave smart-contract, lending-market, rate, and withdrawal-liquidity risk.",
    disclosures: [
      "The supply rate is variable and can change at any time; no yield is guaranteed.",
      "A production integration would supply USDC directly to Aave and withdraw back to USDC without a market swap.",
      "The current testnet uses mock ytUSDC with accelerated display growth. It is not aUSDC, has no underlying USDC, and earns no real yield.",
    ],
    enabled: true,
    implementationStatus: "simulated",
    officialDocumentationUrl: "https://aave.com/help/supplying",
    consentRequired: true,
    adapterId: "simulated-aave-usdc",
    contractTokenChoice: "yield",
    fundingRoute: {
      onramp: "privy-usdc-base",
      conversion: "aave-direct-supply",
      settlement: "aave-direct-withdraw-usdc",
    },
    unavailableReason: null,
  },
  {
    id: DEPOSIT_ASSET_IDS.FRNT,
    displayName: "Wyoming FRNT",
    symbol: "FRNT",
    testnetSymbol: "tFRNT",
    badge: "State-issued · No holder yield",
    category: "public-entity-stable-token",
    underlyingAsset: "U.S. dollars and short-duration U.S. Treasuries held under the FRNT program",
    yieldType: "none",
    yieldSource: "None to the token holder.",
    yieldVariability: "none",
    settlementAsset: "FRNT",
    supportedNetworks: ["base", "base-sepolia"],
    eligibility: "Subject to issuer, service-provider, and applicable legal requirements.",
    liquidityRisk: "Newer token with materially less direct purchase and market liquidity than USDC.",
    mainRisk: "Issuer-program, liquidity, bridge, smart-contract, and network risk.",
    disclosures: [
      "FRNT does not pay yield to holders; reserve earnings support the program described by the Wyoming Stable Token Commission.",
      "State issuance does not mean FDIC insurance or an unconditional full-faith-and-credit guarantee.",
      "The official current purchase path begins on Solana through Kraken and uses Stargate for supported EVM networks, adding exchange and bridge dependencies.",
    ],
    enabled: false,
    implementationStatus: "testnet",
    officialDocumentationUrl: "https://stabletoken.wyo.gov/pages/FRNT",
    consentRequired: false,
    adapterId: "frnt-adapter-pending",
    contractTokenChoice: null,
    fundingRoute: {
      onramp: "external-kraken-solana",
      conversion: "stargate-bridge",
      settlement: "direct-frnt",
    },
    unavailableReason:
      "Not yet available in agreements. OpenEscrow needs a reviewed Base-native funding route, liquidity limits, and a new audited escrow deployment that accepts FRNT.",
  },
  {
    id: DEPOSIT_ASSET_IDS.USDY,
    displayName: "Ondo USDY",
    symbol: "USDY",
    testnetSymbol: "USDY",
    badge: "Treasury yield · Restricted",
    category: "tokenized-note",
    underlyingAsset: "Assets supporting the USDY tokenized note",
    yieldType: "accumulating_treasury",
    yieldSource: "Return on the assets supporting the USDY tokenized note.",
    yieldVariability: "variable",
    settlementAsset: "USDC",
    supportedNetworks: [],
    eligibility:
      "Unavailable to U.S. and Canadian persons or locations; other users require issuer eligibility and wallet registration.",
    liquidityRisk: "Issuer redemption, registration, transfer controls, rate limits, and available market liquidity apply.",
    mainRisk: "Securities, issuer, eligibility, oracle, liquidity, smart-contract, and total-loss risk.",
    disclosures: [
      "USDY is an accumulating token: quantity can remain constant while its official redemption price changes.",
      "Value must be calculated from token quantity multiplied by the current official oracle price, not by assuming one USDY equals one dollar.",
      "USDY is not FDIC insured. Eligibility, registration, blocklist, subscription, and redemption controls apply.",
      "OpenEscrow will not use a DEX or other route to bypass issuer restrictions.",
    ],
    enabled: false,
    implementationStatus: "production",
    officialDocumentationUrl: "https://docs.ondo.finance/general-access-products/usdy/eligibility",
    consentRequired: true,
    adapterId: "ondo-usdy-adapter-pending",
    contractTokenChoice: null,
    fundingRoute: {
      onramp: "privy-usdc-eligible-network",
      conversion: "ondo-direct-subscribe",
      settlement: "ondo-direct-redeem-usdc",
    },
    unavailableReason:
      "Unavailable for U.S. rental agreements. Ondo's current official deployment list also does not include Base.",
  },
];

export const DEPOSIT_ASSETS = Object.freeze(
  assets.map((asset) =>
    Object.freeze({
      ...asset,
      supportedNetworks: Object.freeze([...asset.supportedNetworks]),
      disclosures: Object.freeze([...asset.disclosures]),
      fundingRoute: Object.freeze({ ...asset.fundingRoute }),
    }),
  ),
);

export function getDepositAsset(assetId) {
  return DEPOSIT_ASSETS.find((asset) => asset.id === assetId) ?? null;
}

export function depositAssetIdFromTerms(terms) {
  if (getDepositAsset(terms?.depositAssetId)) return terms.depositAssetId;
  return terms?.tokenChoice === "yield"
    ? DEPOSIT_ASSET_IDS.AAVE_USDC
    : DEPOSIT_ASSET_IDS.USDC;
}

export function getDepositAssetForTerms(terms) {
  return getDepositAsset(depositAssetIdFromTerms(terms));
}

export function depositAssetAvailability(assetId, context = {}) {
  const asset = getDepositAsset(assetId);
  if (!asset) return { available: false, reason: "Unknown deposit asset." };
  const countryCode = String(context.countryCode || "").toUpperCase();
  if (
    assetId === DEPOSIT_ASSET_IDS.USDY &&
    (countryCode === "US" || countryCode === "CA")
  ) {
    return {
      available: false,
      reason: "Issuer rules prohibit USDY acquisition or redemption for U.S. and Canadian persons or locations.",
    };
  }
  if (!asset.enabled) {
    return {
      available: false,
      reason: asset.unavailableReason || "This deposit asset is not enabled.",
    };
  }
  return { available: true, reason: null };
}

export function createDepositAssetSnapshot(assetId) {
  const asset = getDepositAsset(assetId);
  if (!asset) return null;
  return {
    catalogVersion: DEPOSIT_ASSET_CATALOG_VERSION,
    id: asset.id,
    displayName: asset.displayName,
    symbol: asset.symbol,
    testnetSymbol: asset.testnetSymbol,
    badge: asset.badge,
    category: asset.category,
    underlyingAsset: asset.underlyingAsset,
    yieldType: asset.yieldType,
    yieldSource: asset.yieldSource,
    yieldVariability: asset.yieldVariability,
    settlementAsset: asset.settlementAsset,
    supportedNetworks: [...asset.supportedNetworks],
    eligibility: asset.eligibility,
    liquidityRisk: asset.liquidityRisk,
    mainRisk: asset.mainRisk,
    disclosures: [...asset.disclosures],
    enabled: asset.enabled,
    implementationStatus: asset.implementationStatus,
    officialDocumentationUrl: asset.officialDocumentationUrl,
    consentRequired: asset.consentRequired,
    adapterId: asset.adapterId,
    fundingRoute: { ...asset.fundingRoute },
  };
}

export function depositAssetSnapshotMatchesCatalog(snapshot, assetId) {
  const expected = createDepositAssetSnapshot(assetId);
  return Boolean(expected && snapshot && JSON.stringify(snapshot) === JSON.stringify(expected));
}

export function validateDepositAssetTerms(terms) {
  if (!terms?.depositAssetId && !terms?.depositAssetSnapshot) {
    return terms?.tokenChoice === "plain" || terms?.tokenChoice === "yield";
  }
  const asset = getDepositAsset(terms.depositAssetId);
  if (!asset) return false;
  if (terms.tokenChoice !== asset.contractTokenChoice) return false;
  if (!depositAssetSnapshotMatchesCatalog(terms.depositAssetSnapshot, asset.id)) return false;
  const availability = depositAssetAvailability(asset.id, {
    countryCode: terms.addressResolution?.countryCode || "US",
  });
  if (!availability.available) return false;
  return !asset.consentRequired || terms.yieldConsent === true;
}

export function calculateDepositAccounting({
  originalPrincipal,
  currentRedeemableValue,
  feesAndSlippage = 0n,
  finalDistributed = 0n,
}) {
  const accruedYield =
    currentRedeemableValue > originalPrincipal
      ? currentRedeemableValue - originalPrincipal
      : 0n;
  return {
    originalPrincipal,
    currentRedeemableValue,
    accruedYield,
    feesAndSlippage,
    finalDistributed,
  };
}
