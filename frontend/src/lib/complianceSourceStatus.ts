export type ComplianceSourceStatus = {
  jurisdiction: string;
  profileVersion: string;
  source: {
    citation: string;
    url: string;
    status: "pending" | "unchanged" | "changed" | "unreachable";
    lastCheckedAt: string | null;
    lastVerifiedAt: string | null;
    requiresReview: boolean;
  };
  immutableSnapshotNotice: string;
};

export type ExpectedComplianceSource = {
  citation: string;
  url: string;
};

const SOURCE_STATUSES = new Set(["pending", "unchanged", "changed", "unreachable"]);
const INVALID_SOURCE_RESPONSE =
  "OpenEscrow could not verify that this source check matches the selected compliance profile. Try again.";

function isNullableTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isConsistentSourceState(
  source: ComplianceSourceStatus["source"],
): boolean {
  const lastCheckedAt = source.lastCheckedAt
    ? Date.parse(source.lastCheckedAt)
    : null;
  const lastVerifiedAt = source.lastVerifiedAt
    ? Date.parse(source.lastVerifiedAt)
    : null;
  if (source.requiresReview !== (source.status !== "unchanged")) return false;
  if (lastVerifiedAt !== null && lastCheckedAt === null) return false;
  if (
    lastCheckedAt !== null &&
    lastVerifiedAt !== null &&
    lastVerifiedAt > lastCheckedAt
  ) {
    return false;
  }
  if (source.status === "unchanged") {
    return (
      lastCheckedAt !== null &&
      lastVerifiedAt !== null &&
      lastCheckedAt === lastVerifiedAt
    );
  }
  if (source.status === "changed" || source.status === "unreachable") {
    return lastCheckedAt !== null;
  }
  return true;
}

function isExactComplianceSourceStatus(
  value: unknown,
  jurisdiction: string,
  profileVersion: string,
  expectedSource: ExpectedComplianceSource,
): value is ComplianceSourceStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ComplianceSourceStatus>;
  const source = candidate.source;
  return Boolean(
    candidate.jurisdiction === jurisdiction &&
      candidate.profileVersion === profileVersion &&
      typeof candidate.immutableSnapshotNotice === "string" &&
      candidate.immutableSnapshotNotice.trim() &&
      source &&
      source.citation === expectedSource.citation &&
      source.url === expectedSource.url &&
      SOURCE_STATUSES.has(source.status) &&
      isNullableTimestamp(source.lastCheckedAt) &&
      isNullableTimestamp(source.lastVerifiedAt) &&
      typeof source.requiresReview === "boolean" &&
      isConsistentSourceState(source),
  );
}

async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Use the safe fallback below.
  }
  return "OpenEscrow could not check the official source right now. Try again later.";
}

export async function checkComplianceSourceStatus(
  jurisdiction: string,
  profileVersion: string,
  expectedSource: ExpectedComplianceSource,
): Promise<ComplianceSourceStatus> {
  const response = await fetch("/api/compliance/source-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jurisdiction, profileVersion }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(INVALID_SOURCE_RESPONSE);
  }
  if (!isExactComplianceSourceStatus(result, jurisdiction, profileVersion, expectedSource)) {
    throw new Error(INVALID_SOURCE_RESPONSE);
  }
  return result;
}

export function complianceSourceStatusMessage(
  source: ComplianceSourceStatus["source"],
): string {
  if (source.status === "unchanged") {
    return "The official source matches the reviewed profile baseline.";
  }
  if (source.status === "changed") {
    return "The official source appears to have changed. OpenEscrow will not rewrite the profile automatically; this version requires review.";
  }
  if (source.status === "unreachable") {
    return "The official source could not be reached. The recorded profile remains unchanged.";
  }
  return "The official source still needs its first successful check.";
}
