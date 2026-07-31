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
      <h4>Evidence trail ({entries.length})</h4>
      <p className="hint">
        Only a cryptographic hash and encrypted content reference are stored on-chain - the contract
        never sees or validates the underlying supporting file.
      </p>
      <ul>
        {entries.map((e, i) => {
          const privatePath = negotiationAccess
            ? privateEvidencePath(e.uri)
            : null;
          const documentUrl = publicEvidenceUrl(e.uri);
          return (
          <li key={i}>
            <strong>{TYPE_LABEL[e.evidenceType] ?? `Type ${e.evidenceType}`}</strong> by{" "}
            {shortAddr(e.submittedBy)} at {formatTimestamp(e.timestamp)}
            <br />
            hash: <code>{e.contentHash}</code>
            {privatePath && negotiationAccess ? (
              <>
                <br />
                <form
                  className="evidence-document-form"
                  action={privatePath}
                  method="post"
                  target="_blank"
                >
                  <input
                    type="hidden"
                    name="token"
                    value={negotiationAccess.token}
                    readOnly
                  />
                  <button className="evidence-document-link" type="submit">
                    Open supporting document
                  </button>
                </form>
              </>
            ) : documentUrl ? (
              <>
                <br />
                <a href={documentUrl} target="_blank" rel="noreferrer">
                  Open supporting document
                </a>
              </>
            ) : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
