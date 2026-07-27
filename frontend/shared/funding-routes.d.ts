import type { DepositAssetId } from "./deposit-assets.js";

export type FundingEnvironment = "sandbox" | "production";
export type FundingCheckoutMode = "sandbox_preview" | "production";

export interface ValidatedFiatOnrampConfig {
  asset: "usdc";
  chain: "eip155:8453";
  environment: FundingEnvironment;
  providerStrategy: "privy-brokered-fiat";
}

export interface FundingPlan {
  assetId: string;
  status: string;
  checkoutAvailable: boolean;
  checkoutMode: FundingCheckoutMode | null;
  reason: string | null;
  onramp: {
    id: string;
    providerSelection: string;
    destinationAsset: string;
    destinationChain: string;
    description: string;
  };
  conversion: {
    id: string;
    kind: string;
    enabled: boolean;
    status: string;
    label: string;
    description: string;
  } | null;
  settlementAsset: string | null;
  routeSteps: string[];
}

export const FUNDING_ROUTE_CATALOG_VERSION: string;
export const ONRAMP_STRATEGY: Readonly<{
  id: "privy-brokered-fiat";
  providerSelection: "provider-managed";
  destinationAsset: "usdc";
  destinationChain: "eip155:8453";
  description: string;
}>;

export function validateFiatOnrampConfig(input?: {
  enabled?: boolean;
  environment?: unknown;
  asset?: unknown;
  chain?: unknown;
  productionApproved?: boolean;
}): {
  enabled: boolean;
  environment: FundingEnvironment;
  reason: string | null;
  config: ValidatedFiatOnrampConfig | null;
};

export function createFundingPlan(
  assetId: unknown,
  options?: {
    onrampEnabled?: boolean;
    environment?: FundingEnvironment;
    productionApproved?: boolean;
  },
): FundingPlan;

export function createFundingIntent(input: {
  assetId: DepositAssetId;
  walletAddress: string;
  amountMicros: bigint;
  environment?: FundingEnvironment;
  onrampEnabled?: boolean;
  productionApproved?: boolean;
}): Readonly<{
  schema: "openescrow.funding-intent.v1";
  routeCatalogVersion: string;
  assetId: string;
  environment: FundingEnvironment;
  providerStrategy: "privy-brokered-fiat";
  source: Readonly<{
    assets: readonly ["usd"];
    defaultAsset: "usd";
  }>;
  destination: Readonly<{
    asset: "usdc";
    chain: "eip155:8453";
    address: string;
  }>;
  amountMicros: bigint;
  checkoutMode: FundingCheckoutMode;
}>;
