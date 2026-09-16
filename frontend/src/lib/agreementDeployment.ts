type DeploymentRecord = {
  onchainAgreementId: string | null;
  onchainContractAddress?: string | null;
};

export function agreementContractAddress(record: DeploymentRecord): `0x${string}` | null {
  const address = record.onchainContractAddress;
  return typeof address === "string" && /^0x[0-9a-f]{40}$/i.test(address) &&
    !/^0x0{40}$/i.test(address)
    ? address.toLowerCase() as `0x${string}`
    : null;
}

export function isCurrentAgreement(record: DeploymentRecord, currentAddress: string) {
  return record.onchainAgreementId !== null &&
    /^\d+$/.test(record.onchainAgreementId) &&
    agreementContractAddress(record) === currentAddress.toLowerCase();
}

// Older app versions cached bare IDs from every release under the current release's key.
// Keep a colliding current ID only when a current record or wallet discovery confirms it.
export function filterTrackedAgreementIds(
  tracked: readonly bigint[],
  records: readonly DeploymentRecord[],
  currentAddress: string,
  walletConfirmed: readonly bigint[],
) {
  const current = new Set(records.filter((record) => isCurrentAgreement(record, currentAddress))
    .map((record) => BigInt(record.onchainAgreementId!).toString()));
  const historical = new Set(records.filter((record) => !isCurrentAgreement(record, currentAddress))
    .flatMap((record) => record.onchainAgreementId !== null && /^\d+$/.test(record.onchainAgreementId)
      ? [BigInt(record.onchainAgreementId).toString()] : []));
  return tracked.filter((id) => !historical.has(id.toString()) || current.has(id.toString()) ||
    walletConfirmed.some((candidate) => candidate === id));
}

export function isMissingAgreementError(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; cause && typeof cause === "object" && depth < 8; depth += 1) {
    const entry = cause as { data?: { errorName?: string }; cause?: unknown };
    if (entry.data?.errorName === "AgreementDoesNotExist") return true;
    cause = entry.cause;
  }
  return false;
}
