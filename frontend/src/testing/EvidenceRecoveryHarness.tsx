/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useEvidenceInputs } from "../components/EvidenceInputs";
import type { NegotiationAccess } from "../lib/negotiations";
import "../index.css";
import "../App.css";

const ACCESS: Record<"a" | "b", NegotiationAccess> = {
  a: {
    proposalId: "proposal-a",
    role: "landlord",
    token: "access-a",
  },
  b: {
    proposalId: "proposal-b",
    role: "landlord",
    token: "access-b",
  },
};

function EvidenceRecoveryHarness() {
  const [scope, setScope] = useState<"a" | "b">("a");
  const evidence = useEvidenceInputs(ACCESS[scope]);

  return (
    <main className="app-shell">
      <section className="card" aria-labelledby="evidence-recovery-title">
        <span className="eyebrow">Rendered regression</span>
        <h1 id="evidence-recovery-title">Supporting-file recovery</h1>
        <div className="action-row" aria-label="Evidence agreement scopes">
          <button
            className="btn btn-ghost"
            type="button"
            aria-pressed={scope === "a"}
            onClick={() => setScope("a")}
          >
            Use agreement A
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            aria-pressed={scope === "b"}
            onClick={() => setScope("b")}
          >
            Use agreement B
          </button>
        </div>
        <p aria-live="polite">
          Current agreement: <strong>{scope.toUpperCase()}</strong>
        </p>
        {evidence.fields}
        <output data-testid="evidence-state" hidden>
          {JSON.stringify({
            scope,
            valid: evidence.valid,
            uri: evidence.uri,
            contentHash: evidence.contentHash,
          })}
        </output>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<EvidenceRecoveryHarness />);
