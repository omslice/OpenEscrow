import { useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS } from "../contracts/config";
import { formatTimestamp, shortAddr } from "../lib/format";

interface EvidenceEntry {
  contentHash: `0x${string}`;
  uri: string;
  evidenceType: number;
  timestamp: bigint;
  submittedBy: `0x${string}`;
}

const TYPE_LABEL: Record<number, string> = { 0: "Claim", 1: "Amendment", 2: "Response/rebuttal" };

export function EvidenceList({ id }: { id: bigint }) {
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
        {entries.map((e, i) => (
          <li key={i}>
            <strong>{TYPE_LABEL[e.evidenceType] ?? `Type ${e.evidenceType}`}</strong> by{" "}
            {shortAddr(e.submittedBy)} at {formatTimestamp(e.timestamp)}
            <br />
            hash: <code>{e.contentHash}</code>
            {e.uri && (
              <>
                <br />
                pointer: <code>{e.uri}</code>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
