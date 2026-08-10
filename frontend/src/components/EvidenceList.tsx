import { useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";
import {
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
  const { data } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "getEvidence",
    args: [id],
    query: { refetchInterval: 6000 },
  });

  const entries = (data as EvidenceEntry[] | undefined) ?? [];
  if (entries.length === 0) return null;

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
                <form
                  className="evidence-document-form"
                  action={privatePath}
                  method="post"
                  target="_blank"
                  rel="noreferrer"
                >
                  <input
                    type="hidden"
                    name="token"
                    value={negotiationAccess.token}
                    readOnly
                  />
                  <button
                    className="evidence-document-link"
                    type="submit"
                    aria-label={`View supporting file for ${typeLabel}`}
                  >
                    View supporting file
                  </button>
                </form>
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
    </div>
  );
}
