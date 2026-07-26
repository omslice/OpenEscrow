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

function evidenceUrl(uri: string, access?: NegotiationAccess | null) {
  const match = uri.match(/^openescrow:\/\/evidence\/([a-fA-F0-9-]+)$/);
  if (match && access) {
    return `/api/evidence/${encodeURIComponent(match[1])}?token=${encodeURIComponent(access.token)}`;
  }
  if (/^https:\/\//i.test(uri)) return uri;
  const ipfsPath = uri.match(/^ipfs:\/\/([a-zA-Z0-9._~/-]+)$/)?.[1];
  if (ipfsPath) {
    return `https://ipfs.io/ipfs/${ipfsPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }
  return null;
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
          const documentUrl = evidenceUrl(e.uri, negotiationAccess);
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
                {documentUrl ? (
                  <a href={documentUrl} target="_blank" rel="noreferrer">
                    Open supporting document
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
