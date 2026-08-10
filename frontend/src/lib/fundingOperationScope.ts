export type FundingOperationScopeInput = {
  proposalId?: string | null;
  role?: string | null;
  tenantId?: string | null;
  walletAddress: string;
  assetId?: string | null;
  amountMicros: bigint;
  environment?: string | null;
};

export function fundingOperationScopeKey({
  proposalId,
  role,
  tenantId,
  walletAddress,
  assetId,
  amountMicros,
  environment,
}: FundingOperationScopeInput) {
  return JSON.stringify([
    proposalId || null,
    role || null,
    tenantId || null,
    walletAddress.toLowerCase(),
    assetId || null,
    amountMicros.toString(),
    environment || null,
  ]);
}

export function fundingCheckoutRecoveryKey({
  proposalId,
  role,
  tenantId,
  walletAddress,
  assetId,
  amountMicros,
  environment,
}: FundingOperationScopeInput) {
  const normalizedProposalId = String(proposalId || "").trim();
  const normalizedTenantId = String(tenantId || "").trim();
  const normalizedWallet = String(walletAddress || "").trim().toLowerCase();
  const normalizedAssetId = String(assetId || "").trim();
  const normalizedEnvironment = String(environment || "").trim();
  if (
    role !== "tenant" ||
    !normalizedProposalId ||
    !normalizedTenantId ||
    !/^0x[a-f0-9]{40}$/.test(normalizedWallet) ||
    !normalizedAssetId ||
    amountMicros <= 0n ||
    !normalizedEnvironment
  ) {
    return null;
  }
  return `openescrow:funding-checkout:${JSON.stringify([
    normalizedProposalId,
    normalizedTenantId,
    normalizedWallet,
    normalizedAssetId,
    amountMicros.toString(),
    normalizedEnvironment,
  ])}`;
}
