const STORAGE_KEY = "openescrow.trackedAgreementIds";

export function trackedAgreementStorageKey(
  accountScope: string | null | undefined,
  releaseScope: string,
) {
  const normalizedScope = accountScope?.trim();
  const normalizedReleaseScope = releaseScope.trim().toLowerCase();
  if (!normalizedReleaseScope) {
    throw new Error("Tracked agreement storage requires a contract release scope.");
  }
  const releaseKey = `${STORAGE_KEY}.release.${encodeURIComponent(normalizedReleaseScope)}`;
  return normalizedScope
    ? `${releaseKey}.account.${encodeURIComponent(normalizedScope)}`
    : releaseKey;
}
