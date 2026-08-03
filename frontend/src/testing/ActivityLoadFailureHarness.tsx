/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ActivityLoadFailure } from "../components/ActivityLoadFailure";
import "../index.css";
import "../App.css";

function ActivityLoadFailureHarness() {
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("Simulated RPC gateway timeout");
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <main className="app-shell">
        <section className="card" role="status">
          <h1>Public receipts loaded</h1>
          <p>The retry reconnected without repeating an agreement action.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ActivityLoadFailure
        error={error}
        onRetry={async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 30));
          if (attempts === 0) {
            setAttempts(1);
            throw new Error("Simulated retry rejection");
          }
          if (attempts === 1) {
            setAttempts(2);
            setError("Simulated RPC gateway still unavailable (attempt 2)");
            return false;
          }
          setLoaded(true);
          return true;
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ActivityLoadFailureHarness />);
