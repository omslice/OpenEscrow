export type DepositAssetId = "usdc" | "aave-usdc" | "frnt" | "usdy";
export type YieldType = "none" | "variable_lending" | "accumulating_treasury";
export type ImplementationStatus = "simulated" | "testnet" | "production";

export interface DepositAssetFundingRoute {
  onramp: string;
  conversion: string;
  settlement: string;
}

export interface DepositAssetConfig {
  id: DepositAssetId;
  displayName: string;
  symbol: string;
  testnetSymbol: string;
  badge: string;
  badge: string;
  category: string;
  underlyingAsset: string;
  yieldType: YieldType;
  yieldSource: string;
  yieldVariability: "none" | "variable";
  settlementAsset: string;
  supportedNetworks: readonly string[];
  eligibility: string;
  liquidityRisk: string;
  mainRisk: string;
  disclosures: readonly string[];
  enabled: boolean;
  implementationStatus: ImplementationStatus;
  officialDocumentationUrl: string;
  consentRequired: boolean;
  adapterId: string;
  contractTokenChoice: "plain" | "yield" | null;
  fundingRoute: Readonly<DepositAssetFundingRoute>;
  unavailableReason: string | null;
}

export interface DepositAssetSnapshot {
  catalogVersion: string;
  id: DepositAssetId;
  displayName: string;
  symbol: string;
  testnetSymbol: string;
  category: string;
  underlyingAsset: string;
  yieldType: YieldType;
  yieldSource: string;
  yieldVariability: "none" | "variable";
  settlementAsset: string;
  supportedNetworks: string[];
  eligibility: string;
  liquidityRisk: string;
  mainRisk: string;
  disclosures: string[];
  enabled: boolean;
  implementationStatus: ImplementationStatus;
  officialDocumentationUrl: string;
  consentRequired: boolean;
  adapterId: string;
  fundingRoute: DepositAssetFundingRoute;
}

export const DEPOSIT_ASSET_CATALOG_VERSION: string;
export const DEPOSIT_ASSET_IDS: Readonly<{
  USDC: "usdc";
  AAVE_USDC: "aave-usdc";
  FRNT: "frnt";
  USDY: "usdy";
}>;
export const DEPOSIT_ASSETS: readonly DepositAssetConfig[];

export function getDepositAsset(assetId: unknown): DepositAssetConfig | null;
export function depositAssetIdFromTerms(terms: {
  depositAssetId?: unknown;
  tokenChoice?: unknown;
} | null | undefined): DepositAssetId;
export function getDepositAssetForTerms(terms: {
  depositAssetId?: unknown;
  tokenChoice?: unknown;
} | null | undefined): DepositAssetConfig | null;
export function depositAssetAvailability(
  assetId: unknown,
  context?: { countryCode?: string | null },
): { available: boolean; reason: string | null };
export function createDepositAssetSnapshot(assetId: unknown): DepositAssetSnapshot | null;
export function depositAssetSnapshotMatchesCatalog(
  snapshot: unknown,
  assetId: unknown,
): boolean;
export function validateDepositAssetTerms(terms: unknown): boolean;
export function calculateDepositAccounting(input: {
  originalPrincipal: bigint;
  currentRedeemableValue: bigint;
  feesAndSlippage?: bigint;
  finalDistributed?: bigint;
}): {
  originalPrincipal: bigint;
  currentRedeemableValue: bigint;
  accruedYield: bigint;
  feesAndSlippage: bigint;
  finalDistributed: bigint;
};
