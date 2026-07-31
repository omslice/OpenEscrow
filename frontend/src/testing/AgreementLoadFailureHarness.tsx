/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AgreementLoadFailure } from "../components/AgreementLoadFailure";
import "../index.css";
import "../App.css";
import "../components/AgreementCard.css";

function AgreementLoadFailureHarness() {
  const [attempts, setAttempts] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <main className="app-shell">
        <section className="card" role="status">
          <h1>Deposit loaded</h1>
          <p>The recovery retry reconnected without repeating a deposit action.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <AgreementLoadFailure
        id={42n}
        retrying={retrying}
        onRetry={async () => {
          setRetrying(true);
          await new Promise((resolve) => window.setTimeout(resolve, 30));
          setRetrying(false);
          if (attempts === 0) {
            setAttempts(1);
            throw new Error("Simulated connection failure");
          }
          setLoaded(true);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<AgreementLoadFailureHarness />);
