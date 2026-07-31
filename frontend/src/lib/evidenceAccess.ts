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
