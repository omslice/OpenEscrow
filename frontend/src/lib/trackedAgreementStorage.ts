const STORAGE_KEY = "openescrow.trackedAgreementIds";

export function trackedAgreementStorageKey(accountScope?: string | null) {
  const normalizedScope = accountScope?.trim();
  return normalizedScope
    ? `${STORAGE_KEY}.account.${encodeURIComponent(normalizedScope)}`
    : STORAGE_KEY;
}
