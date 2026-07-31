export type FundingOperationScopeInput = {
  proposalId?: string | null;
  role?: string | null;
  walletAddress: string;
  assetId?: string | null;
  amountMicros: bigint;
  environment?: string | null;
};

export function fundingOperationScopeKey({
  proposalId,
  role,
  walletAddress,
  assetId,
  amountMicros,
  environment,
}: FundingOperationScopeInput) {
  return JSON.stringify([
    proposalId || null,
    role || null,
    walletAddress.toLowerCase(),
    assetId || null,
    amountMicros.toString(),
    environment || null,
  ]);
}
