import { useState } from "react";
import {
  loadNegotiationSnapshot,
  type AgreementSnapshot,
  type NegotiationAccess,
} from "../lib/negotiations";

export function RecordSnapshotControls({
  access,
}: {
  access: NegotiationAccess;
}) {
  const [snapshot, setSnapshot] = useState<AgreementSnapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateSnapshot() {
    setLoading(true);
    setStatus(null);
    try {
      const next = await loadNegotiationSnapshot(access);
      setSnapshot(next);
      setStatus("Canonical snapshot generated and hashed.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The snapshot could not be generated.",
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadSnapshot() {
    if (!snapshot) return;
    const blob = new Blob([snapshot.canonical], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openescrow-${access.proposalId}-${snapshot.hash.slice(2, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="record-snapshot">
      <div>
        <strong>Verifiable record snapshot</strong>
        <p className="field-help">
          Generate a deterministic JSON copy of the parties, terms, approvals, itemized claims,
          and activity. Identical content always produces the same SHA-256 hash.
        </p>
      </div>
      <div className="button-row">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => void generateSnapshot()}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate record snapshot"}
        </button>
        {snapshot && (
          <>
            <button className="btn btn-ghost" type="button" onClick={downloadSnapshot}>
              Download JSON
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void navigator.clipboard.writeText(snapshot.hash)}
            >
              Copy hash
            </button>
          </>
        )}
      </div>
      {snapshot && (
        <code className="snapshot-hash" title={snapshot.hash}>
          {snapshot.algorithm}: {snapshot.hash}
        </code>
      )}
      {status && (
        <p className={status.includes("could not") ? "tx-error" : "tx-success"}>{status}</p>
      )}
    </div>
  );
}
