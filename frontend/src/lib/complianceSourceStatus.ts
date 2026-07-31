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
): Promise<ComplianceSourceStatus> {
  const response = await fetch("/api/compliance/source-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jurisdiction, profileVersion }),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json()) as ComplianceSourceStatus;
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
