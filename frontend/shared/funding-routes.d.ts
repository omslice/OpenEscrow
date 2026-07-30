import type { DepositAssetId } from "./deposit-assets.js";

export type FundingEnvironment = "sandbox" | "production";
export type FundingCheckoutMode = "sandbox_preview" | "production";
export type FundingCheckoutState =
  | "opening"
  | "submitted"
  | "confirmed"
  | "cancelled"
  | "failed"
  | "refund_pending"
  | "refunded"
  | "unknown";

export interface FundingProviderCatalogEntry {
  id: string;
  name: string;
  providerSelection: string;
  destinationAsset: "usdc";
  destinationChain: "eip155:8453";
  enabled: boolean;
  status: string;
  description: string;
  notes?: readonly string[];
}

export interface ConversionCatalogEntry {
  id: string;
  kind: string;
  enabled: boolean;
  status: string;
  label: string;
  description: string;
}

export interface ValidatedFiatOnrampConfig {
  asset: "usdc";
  chain: "eip155:8453";
  environment: FundingEnvironment;
  providerStrategy: string;
  providerCatalogVersion: string;
  conversionCatalogVersion: string;
}

export interface FundingPlan {
  assetId: string;
  status: string;
  checkoutAvailable: boolean;
  checkoutMode: FundingCheckoutMode | null;
  reason: string | null;
  onramp: FundingProviderCatalogEntry;
  onrampProvider: FundingProviderCatalogEntry;
  conversion: ConversionCatalogEntry | null;
  settlementAsset: string | null;
  routeSteps: string[];
}

export const FUNDING_ROUTE_CATALOG_VERSION: string;
export const ONRAMP_PROVIDER_CATALOG_VERSION: string;
export const CONVERSION_ADAPTER_CATALOG_VERSION: string;
export const FUNDING_CHECKOUT_SCHEMA: "openescrow.funding-checkout.v1";
export const ONRAMP_STRATEGY: Readonly<FundingProviderCatalogEntry>;

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

export function listFundingProviders(): {
  version: string;
  onramp: Record<string, Readonly<FundingProviderCatalogEntry>>;
  aliases: Record<string, string>;
  conversion: Record<string, Readonly<ConversionCatalogEntry>>;
};

export function getFundingRouteServices(assetId: unknown):
  | {
      onramp: FundingProviderCatalogEntry;
      conversion: ConversionCatalogEntry;
    }
  | null;

export function createFundingPlan(
  assetId: unknown,
  options?: {
    onrampEnabled?: boolean;
    environment?: FundingEnvironment;
    productionApproved?: boolean;
  },
): FundingPlan;

export interface FundingIntent {
  schema: "openescrow.funding-intent.v1";
  routeCatalogVersion: string;
  assetId: string;
  environment: FundingEnvironment;
  providerStrategy: string;
  conversionKind: string;
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
}

export function createFundingIntent(input: {
  assetId: DepositAssetId;
  walletAddress: string;
  amountMicros: bigint;
  environment?: FundingEnvironment;
  onrampEnabled?: boolean;
  productionApproved?: boolean;
}): Readonly<FundingIntent>;

export interface FundingCheckoutOutcome {
  state: FundingCheckoutState;
  providerStatus: string;
  severity: "info" | "error";
  shouldRefreshBalance: boolean;
  retryAllowed: boolean;
  message: string;
}

export interface FundingCheckoutEvent {
  id: string;
  status: FundingCheckoutState;
  providerStatus: string;
  occurredAt: string;
}

export interface FundingCheckoutLifecycle {
  schema: "openescrow.funding-checkout.v1";
  intentKey: string;
  attemptId: string;
  environment: FundingEnvironment;
  assetId: string;
  providerStrategy: string;
  walletAddress: string;
  amountMicros: string;
  status: FundingCheckoutState;
  providerStatus: string;
  createdAt: string;
  updatedAt: string;
  events: readonly Readonly<FundingCheckoutEvent>[];
}

export function normalizeFundingCheckoutState(
  status: unknown,
): FundingCheckoutState;

export function fundingIntentKey(intent: {
  schema: "openescrow.funding-intent.v1";
  routeCatalogVersion: string;
  assetId: string;
  environment: FundingEnvironment;
  providerStrategy: string;
  destination: {
    asset: string;
    chain: string;
    address: string;
  };
  amountMicros: bigint | string;
}): string;

export function createFundingCheckoutAttempt(
  intent: ReturnType<typeof createFundingIntent>,
  options: {
    attemptId: string;
    createdAt?: string;
  },
): Readonly<FundingCheckoutLifecycle>;

export function isFundingCheckoutLifecycle(
  value: unknown,
): value is FundingCheckoutLifecycle;

export function applyFundingCheckoutEvent(
  checkout: FundingCheckoutLifecycle,
  event: {
    eventId: string;
    status: unknown;
    providerStatus?: unknown;
    occurredAt?: string;
  },
): Readonly<FundingCheckoutLifecycle>;

export function reconcileFundingCheckoutResult(
  result: unknown,
  environment?: unknown,
): Readonly<FundingCheckoutOutcome>;

export function reconcileFundingCheckoutError(
  error?: unknown,
): Readonly<FundingCheckoutOutcome>;
