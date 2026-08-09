const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const EXTERNAL_COMPLIANCE_ATTESTATION_SCHEMA = 1;
export const EXTERNAL_COMPLIANCE_ATTESTATION_FUTURE_SKEW_MS = 5 * 60 * 1000;

function cleanString(value, maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function validHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function validateExternalComplianceMonitor(item) {
  const monitor = item?.externalMonitor;
  const url = validHttpsUrl(monitor?.url);
  const expectedBodySha256 = cleanString(monitor?.expectedBodySha256, 64).toLowerCase();
  const maximumAgeMs = Number(monitor?.maximumAgeMs);
  const requiredMarkers = Array.isArray(monitor?.requiredMarkers)
    ? monitor.requiredMarkers.map((marker) => cleanString(marker, 300)).filter(Boolean)
    : [];
  if (
    !monitor ||
    monitor.kind !== "github-source-attestation" ||
    !url ||
    !SHA256_PATTERN.test(expectedBodySha256) ||
    !Number.isSafeInteger(maximumAgeMs) ||
    maximumAgeMs < 60 * 60 * 1000 ||
    maximumAgeMs > 7 * 24 * 60 * 60 * 1000 ||
    requiredMarkers.length === 0 ||
    new Set(requiredMarkers).size !== requiredMarkers.length
  ) {
    throw new Error("External compliance-source monitoring is misconfigured.");
  }
  return { url, expectedBodySha256, maximumAgeMs, requiredMarkers };
}

export function validateExternalComplianceAttestation(
  payload,
  sourceItem,
  now = new Date(),
) {
  const monitor = validateExternalComplianceMonitor(sourceItem);
  if (!payload || payload.schemaVersion !== EXTERNAL_COMPLIANCE_ATTESTATION_SCHEMA) {
    throw new Error("External compliance-source attestation has an unsupported schema.");
  }
  const checkedAt = cleanString(payload.checkedAt, 40);
  const checkedAtMs = ISO_INSTANT_PATTERN.test(checkedAt)
    ? Date.parse(checkedAt)
    : Number.NaN;
  const nowMs = now.getTime();
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(checkedAtMs) ||
    checkedAtMs > nowMs + EXTERNAL_COMPLIANCE_ATTESTATION_FUTURE_SKEW_MS ||
    nowMs - checkedAtMs > monitor.maximumAgeMs
  ) {
    throw new Error("External compliance-source attestation is stale or future-dated.");
  }
  if (
    cleanString(payload.sourceKey, 200) !== sourceItem.key ||
    cleanString(payload.profileVersion, 200) !== sourceItem.version ||
    validHttpsUrl(payload.sourceUrl) !== validHttpsUrl(sourceItem.url) ||
    validHttpsUrl(payload.finalUrl) !== validHttpsUrl(sourceItem.url)
  ) {
    throw new Error("External compliance-source attestation does not match the registered source.");
  }
  const httpStatus = Number(payload.httpStatus);
  const bodySha256 = cleanString(payload.bodySha256, 64).toLowerCase();
  const markerChecks = Array.isArray(payload.markerChecks)
    ? payload.markerChecks.map((entry) => ({
        marker: cleanString(entry?.marker, 300),
        present: entry?.present === true,
      }))
    : [];
  const markerByText = new Map(markerChecks.map((entry) => [entry.marker, entry.present]));
  if (
    httpStatus !== 200 ||
    !SHA256_PATTERN.test(bodySha256) ||
    monitor.requiredMarkers.some((marker) => markerByText.get(marker) !== true)
  ) {
    throw new Error("External compliance-source attestation did not verify the expected official document.");
  }
  const signatureMatches = bodySha256 === monitor.expectedBodySha256;
  if (
    payload.status !== (signatureMatches ? "unchanged" : "changed")
  ) {
    throw new Error("External compliance-source attestation status does not match its content hash.");
  }
  return {
    checkedAt,
    httpStatus,
    bodySha256,
    status: signatureMatches ? "unchanged" : "changed",
  };
}
