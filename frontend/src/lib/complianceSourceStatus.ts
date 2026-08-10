export type ComplianceSourceEntry = {
  key: string;
  scope: string;
  jurisdiction: string;
  citation: string;
  url: string;
  status:
    | "pending"
    | "unchanged"
    | "changed"
    | "unreachable"
    | "manual-review-current";
  lastCheckedAt: string | null;
  lastVerifiedAt: string | null;
  requiresReview: boolean;
  monitoringException: {
    kind: "reviewed-origin-incompatibility";
    reviewedAt: string;
    expiresAt: string;
    note: string;
  } | null;
};

export type ComplianceOverlayVersion = {
  id: string;
  version: string;
};

export type ComplianceSourceStatus = {
  jurisdiction: string;
  profileVersion: string;
  overlays: readonly ComplianceOverlayVersion[];
  source: ComplianceSourceEntry;
  sources: readonly ComplianceSourceEntry[];
  immutableSnapshotNotice: string;
};

export type ExpectedComplianceSource = {
  citation: string;
  url: string;
};

const SOURCE_STATUSES = new Set([
  "pending",
  "unchanged",
  "changed",
  "unreachable",
  "manual-review-current",
]);
const INVALID_SOURCE_RESPONSE =
  "OpenEscrow could not verify that this source check matches the selected compliance profile. Try again.";

function isNullableTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isTimestamp(value: unknown): value is string {
  return value !== null && isNullableTimestamp(value);
}

function hasValidMonitoringException(source: ComplianceSourceEntry): boolean {
  const exception = source.monitoringException;
  if (source.status !== "manual-review-current") return exception === null;
  if (
    !exception ||
    exception.kind !== "reviewed-origin-incompatibility" ||
    typeof exception.note !== "string" ||
    !exception.note.trim() ||
    !isTimestamp(exception.reviewedAt) ||
    !isTimestamp(exception.expiresAt)
  ) {
    return false;
  }
  const reviewedAt = Date.parse(exception.reviewedAt);
  const expiresAt = Date.parse(exception.expiresAt);
  const checkedAt = source.lastCheckedAt ? Date.parse(source.lastCheckedAt) : Number.NaN;
  return reviewedAt < expiresAt && checkedAt >= reviewedAt && checkedAt <= expiresAt;
}

function isConsistentSourceState(
  source: ComplianceSourceEntry,
): boolean {
  const lastCheckedAt = source.lastCheckedAt
    ? Date.parse(source.lastCheckedAt)
    : null;
  const lastVerifiedAt = source.lastVerifiedAt
    ? Date.parse(source.lastVerifiedAt)
    : null;
  const reviewIsCurrent = source.status === "manual-review-current";
  if (
    source.requiresReview !==
    (source.status !== "unchanged" && !reviewIsCurrent)
  ) {
    return false;
  }
  if (!hasValidMonitoringException(source)) return false;
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
  if (reviewIsCurrent) return lastCheckedAt !== null;
  return true;
}

function isExactComplianceSourceStatus(
  value: unknown,
  jurisdiction: string,
  profileVersion: string,
  expectedSources: readonly ExpectedComplianceSource[],
  expectedOverlays: readonly ComplianceOverlayVersion[],
): value is ComplianceSourceStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ComplianceSourceStatus>;
  const source = candidate.source;
  const sources = candidate.sources;
  const overlays = candidate.overlays;
  return Boolean(
    candidate.jurisdiction === jurisdiction &&
      candidate.profileVersion === profileVersion &&
      typeof candidate.immutableSnapshotNotice === "string" &&
      candidate.immutableSnapshotNotice.trim() &&
      source &&
      Array.isArray(sources) &&
      sources.length === expectedSources.length &&
      sources.length > 0 &&
      sources.every((item, index) => {
        const expected = expectedSources[index];
        return Boolean(
          item &&
            typeof item.key === "string" &&
            item.key.trim() &&
            typeof item.scope === "string" &&
            item.scope.trim() &&
            typeof item.jurisdiction === "string" &&
            item.jurisdiction.trim() &&
            item.citation === expected.citation &&
            item.url === expected.url &&
            SOURCE_STATUSES.has(item.status) &&
            isNullableTimestamp(item.lastCheckedAt) &&
            isNullableTimestamp(item.lastVerifiedAt) &&
            typeof item.requiresReview === "boolean" &&
            Object.prototype.hasOwnProperty.call(item, "monitoringException") &&
            isConsistentSourceState(item),
        );
      }) &&
      source.key === sources[0]?.key &&
      Array.isArray(overlays) &&
      overlays.length === expectedOverlays.length &&
      overlays.every(
        (overlay, index) =>
          overlay?.id === expectedOverlays[index]?.id &&
          overlay?.version === expectedOverlays[index]?.version,
      ),
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
  expectedSources: readonly ExpectedComplianceSource[],
  overlays: readonly ComplianceOverlayVersion[] = [],
): Promise<ComplianceSourceStatus> {
  const response = await fetch("/api/compliance/source-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jurisdiction, profileVersion, overlays }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(INVALID_SOURCE_RESPONSE);
  }
  if (
    !isExactComplianceSourceStatus(
      result,
      jurisdiction,
      profileVersion,
      expectedSources,
      overlays,
    )
  ) {
    throw new Error(INVALID_SOURCE_RESPONSE);
  }
  return result;
}

export function complianceSourceStatusMessage(
  source: ComplianceSourceEntry,
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
  if (source.status === "manual-review-current") {
    return "OpenEscrow reviewed this official source manually because its website blocks automated checks. The recorded profile remains unchanged.";
  }
  return "The official source still needs its first successful check.";
}

export function complianceSourceStatusSummary(
  sources: readonly ComplianceSourceEntry[],
): string {
  if (sources.every((source) => source.status === "unchanged")) {
    return sources.length === 1
      ? "The official source matches the reviewed requirements."
      : `All ${sources.length} official sources match the reviewed requirements.`;
  }
  if (sources.some((source) => source.status === "changed")) {
    return "At least one official source appears to have changed. OpenEscrow will not rewrite the requirements automatically; this version needs review.";
  }
  if (sources.some((source) => source.status === "pending")) {
    return "Some official sources still need their first successful check.";
  }
  if (
    sources.every(
      (source) =>
        source.status === "unchanged" || source.status === "manual-review-current",
    )
  ) {
    const manualSource = sources.find(
      (source) => source.status === "manual-review-current",
    );
    const reviewDue = manualSource?.monitoringException?.expiresAt
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(new Date(manualSource.monitoringException.expiresAt))
      : "the recorded expiry date";
    return `The reviewed requirements are current. One official website blocks automated checks, so OpenEscrow is using a time-limited manual review for that source. Recheck due ${reviewDue}.`;
  }
  return "Some official sources could not be reached. The recorded requirements remain unchanged.";
}
