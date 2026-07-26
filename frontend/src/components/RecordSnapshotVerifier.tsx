import { useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import {
  ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { formatTimestamp, shortAddr } from "../lib/format";

type SnapshotAnchor = {
  party: `0x${string}`;
  transactionHash: `0x${string}`;
  timestamp: bigint;
};

type SnapshotVerification = {
  hash: `0x${string}`;
  anchors: SnapshotAnchor[];
};

const snapshotEvent = parseAbiItem(
  "event RecordSnapshotAnchored(uint256 indexed agreementId, bytes32 indexed snapshotHash, address indexed party, uint64 timestamp)",
);

async function sha256Hex(content: string): Promise<`0x${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return `0x${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function RecordSnapshotVerifier({
  proposalId,
  agreementId,
}: {
  proposalId: string;
  agreementId?: bigint;
}) {
  const publicClient = usePublicClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SnapshotVerification | null>(null);

  async function verify(file: File) {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (file.size > 5_000_000) {
        throw new Error("Record snapshots must be smaller than 5 MB.");
      }
      const canonical = await file.text();
      const parsed = JSON.parse(canonical) as {
        schema?: string;
        proposalId?: string;
        onchain?: { agreementId?: string | null };
      };
      if (
        parsed.schema !== "openescrow.agreement-record.v1" ||
        parsed.proposalId !== proposalId
      ) {
        throw new Error("This is not a snapshot for the current OpenEscrow proposal.");
      }
      if (
        agreementId !== undefined &&
        parsed.onchain?.agreementId &&
        BigInt(parsed.onchain.agreementId) !== agreementId
      ) {
        throw new Error(
          `This snapshot references ${agreementReference(parsed.onchain.agreementId)}.`,
        );
      }

      const hash = await sha256Hex(canonical);
      let anchors: SnapshotAnchor[] = [];
      if (agreementId !== undefined) {
        if (!publicClient) throw new Error("The Base Sepolia connection is not ready.");
        const logs = await publicClient.getLogs({
          address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
          event: snapshotEvent,
          args: { agreementId, snapshotHash: hash },
          fromBlock: ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
          toBlock: "latest",
        });
        anchors = logs.map((log) => ({
          party: log.args.party,
          transactionHash: log.transactionHash,
          timestamp: log.args.timestamp,
        }));
      }
      setResult({ hash, anchors });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The record snapshot could not be verified.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <details className="technical-details record-snapshot-verifier">
      <summary>Verify a downloaded record snapshot</summary>
      <p className="field-help">
        The selected JSON stays in this browser. OpenEscrow hashes its exact bytes and looks for
        matching Base Sepolia anchors when this proposal has been finalized.
      </p>
      <label>
        Record snapshot JSON
        <input
          type="file"
          accept="application/json,.json"
          disabled={working}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void verify(file);
            event.target.value = "";
          }}
        />
      </label>
      {working && <p className="field-help">Hashing the record and checking anchors…</p>}
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div
          className={
            agreementId === undefined || result.anchors.length
              ? "proof-verification-success"
              : "proof-verification-warning"
          }
          role="status"
        >
          <strong>
            {agreementId === undefined
              ? "Snapshot structure verified"
              : result.anchors.length
                ? "Snapshot hash verified onchain"
                : "Snapshot hash computed—no matching anchor found"}
          </strong>
          <code title={result.hash}>{result.hash}</code>
          {result.anchors.map((anchor) => (
            <span key={`${anchor.transactionHash}-${anchor.party}`}>
              Anchored by {shortAddr(anchor.party)} on {formatTimestamp(anchor.timestamp)} ·{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${anchor.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                BaseScan receipt
              </a>
            </span>
          ))}
          {agreementId === undefined && (
            <span>Finalize the proposal before checking for an onchain anchor.</span>
          )}
          {agreementId !== undefined && result.anchors.length === 0 && (
            <span>
              The file may be an unanchored or older snapshot. Compare the hash with your records.
            </span>
          )}
        </div>
      )}
    </details>
  );
}
