const PRIVATE_EVIDENCE_ID = /^[a-fA-F0-9-]+$/;

export function privateEvidencePath(uri: string) {
  const privateEvidence = uri.match(
    /^openescrow:\/\/evidence\/([a-fA-F0-9-]+)$/,
  );
  const encryptedIpfs = uri.match(
    /^openescrow\+ipfs:\/\/[a-zA-Z0-9._~-]+\/([a-fA-F0-9-]+)$/,
  );
  const evidenceId = privateEvidence?.[1] || encryptedIpfs?.[1];
  if (!evidenceId || !PRIVATE_EVIDENCE_ID.test(evidenceId)) return null;
  return `/api/evidence/${encodeURIComponent(evidenceId)}`;
}

export function publicEvidenceUrl(uri: string) {
  if (/^https:\/\//i.test(uri)) return uri;
  const ipfsPath = uri.match(/^ipfs:\/\/([a-zA-Z0-9._~/-]+)$/)?.[1];
  if (!ipfsPath) return null;
  return `https://ipfs.io/ipfs/${ipfsPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export async function loadPrivateEvidenceDocument(path: string, token: string) {
  const form = new FormData();
  form.set("token", token);
  const response = await fetch(path, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    headers: { accept: "application/pdf,image/*,application/octet-stream" },
  });
  if (!response.ok) {
    let message = "The supporting file could not be opened.";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      }
    } catch {
      // Keep the consistent consumer-facing fallback above.
    }
    throw new Error(message);
  }
  return response.blob();
}
