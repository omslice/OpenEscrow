import { useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";
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

function privateEvidenceUrl(uri: string, access?: NegotiationAccess | null) {
  const match = uri.match(/^openescrow:\/\/evidence\/([a-fA-F0-9-]+)$/);
  return match && access
    ? `/api/evidence/${encodeURIComponent(match[1])}?token=${encodeURIComponent(access.token)}`
    : null;
}

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
      <h4>Evidence trail ({entries.length})</h4>
      <p className="hint">
        Only a hash and pointer are ever stored on-chain - the contract never sees or validates the
        underlying content.
      </p>
      <ul>
        {entries.map((e, i) => {
          const privateUrl = privateEvidenceUrl(e.uri, negotiationAccess);
          return (
          <li key={i}>
            <strong>{TYPE_LABEL[e.evidenceType] ?? `Type ${e.evidenceType}`}</strong> by{" "}
            {shortAddr(e.submittedBy)} at {formatTimestamp(e.timestamp)}
            <br />
            hash: <code>{e.contentHash}</code>
            {e.uri && (
              <>
                <br />
                pointer:{" "}
                {privateUrl ? (
                  <a href={privateUrl} target="_blank" rel="noreferrer">
                    Open private evidence
                  </a>
                ) : (
                  <code>{e.uri}</code>
                )}
              </>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
