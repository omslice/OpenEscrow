import { useState } from "react";
import { useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";
import {
  loadPrivateEvidenceDocument,
  privateEvidencePath,
  publicEvidenceUrl,
} from "../lib/evidenceAccess";
import { formatTimestamp, shortAddr } from "../lib/format";
import type { NegotiationAccess } from "../lib/negotiations";

interface EvidenceEntry {
  contentHash: `0x${string}`;
  uri: string;
  evidenceType: number;
  timestamp: bigint;
  submittedBy: `0x${string}`;
}

const TYPE_LABEL: Record<number, string> = {
  0: "Claim",
  1: "Amendment",
  2: "Response/rebuttal",
  10: "Claim—unpaid rent",
  11: "Claim—damage beyond ordinary wear",
  12: "Claim—cleaning",
  13: "Claim—utilities or unpaid charges",
  14: "Claim—other",
};

export function EvidenceList({
  id,
  negotiationAccess,
}: {
  id: bigint;
  negotiationAccess?: NegotiationAccess | null;
}) {
  const [openingEvidence, setOpeningEvidence] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const { data } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "getEvidence",
    args: [id],
    query: { refetchInterval: 6000 },
  });

  const entries = (data as EvidenceEntry[] | undefined) ?? [];
  if (entries.length === 0) return null;

  async function openPrivateEvidence(path: string, token: string, key: string) {
    if (openingEvidence) return;
    setEvidenceError(null);
    const preview = window.open("about:blank", "_blank");
    if (!preview) {
      setEvidenceError(
        "Your browser blocked the supporting-file window. Allow pop-ups for OpenEscrow and try again.",
      );
      return;
    }
    preview.opener = null;
    try {
      preview.document.title = "Opening supporting file...";
      preview.document.body.textContent = "Opening supporting file...";
      setOpeningEvidence(key);
      const blob = await loadPrivateEvidenceDocument(path, token);
      const objectUrl = URL.createObjectURL(blob);
      preview.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      preview.close();
      setEvidenceError(
        error instanceof Error
          ? error.message
          : "The supporting file could not be opened.",
      );
    } finally {
      setOpeningEvidence(null);
    }
  }

  return (
    <div className="evidence-list">
      <h4>Supporting files ({entries.length})</h4>
      <p className="hint">
        This list shows when supporting documentation was added. The public agreement record keeps
        a digital fingerprint and protected file reference, but it does not inspect or judge the
        file itself.
      </p>
      <ul>
        {entries.map((e, i) => {
          const typeLabel = TYPE_LABEL[e.evidenceType] ?? "Supporting record";
          const privatePath = negotiationAccess
            ? privateEvidencePath(e.uri)
            : null;
          const documentUrl = publicEvidenceUrl(e.uri);
          return (
            <li key={`${e.contentHash}:${e.timestamp.toString()}:${i}`}>
              <div className="evidence-entry-summary">
                <strong>{typeLabel}</strong>
                <span>Added {formatTimestamp(e.timestamp)}</span>
              </div>
              {privatePath && negotiationAccess ? (
                <button
                  className="evidence-document-link"
                  type="button"
                  disabled={Boolean(openingEvidence)}
                  aria-label={`View supporting file for ${typeLabel}`}
                  onClick={() =>
                    void openPrivateEvidence(
                      privatePath,
                      negotiationAccess.token,
                      `${e.contentHash}:${e.timestamp.toString()}:${i}`,
                    )
                  }
                >
                  {openingEvidence ===
                  `${e.contentHash}:${e.timestamp.toString()}:${i}`
                    ? "Opening supporting file..."
                    : "View supporting file"}
                </button>
              ) : documentUrl ? (
                <a
                  className="evidence-document-link"
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View supporting file for ${typeLabel}`}
                >
                  View supporting file
                </a>
              ) : (
                <span className="hint">Supporting file access is unavailable from this view.</span>
              )}
              <details className="technical-details evidence-verification-details">
                <summary>Verification details</summary>
                <span>Submitted by wallet: {shortAddr(e.submittedBy)}</span>
                <code title={e.contentHash}>Digital fingerprint: {e.contentHash}</code>
                {TYPE_LABEL[e.evidenceType] === undefined && (
                  <span>Record category code: {e.evidenceType}</span>
                )}
              </details>
            </li>
          );
        })}
      </ul>
      {evidenceError && (
        <p className="tx-error" role="alert">
          {evidenceError}
        </p>
      )}
    </div>
  );
}
