import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { CreateAgreementForm } from "./components/CreateAgreementForm";
import { AgreementCard } from "./components/AgreementCard";
import { useTrackedAgreements } from "./lib/useTrackedAgreements";
import "./App.css";

type Tab = "create" | "track";

function App() {
  const [tab, setTab] = useState<Tab>("track");
  const { ids, addId, removeId } = useTrackedAgreements();
  const [manualId, setManualId] = useState("");

  // A landlord's shared link (?id=X) should land directly on that agreement.
  useEffect(() => {
    const idParam = new URLSearchParams(window.location.search).get("id");
    if (idParam === null) return;
    try {
      addId(BigInt(idParam));
      setTab("track");
    } catch {
      // ignore malformed id in the URL
    }
    // Intentionally runs once on mount only - this is a one-time "arrived via link" check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <nav className="tabs">
        <button className={tab === "track" ? "tab active" : "tab"} onClick={() => setTab("track")}>
          My agreements
        </button>
        <button className={tab === "create" ? "tab active" : "tab"} onClick={() => setTab("create")}>
          Propose new agreement
        </button>
      </nav>

      {tab === "create" && <CreateAgreementForm />}

      {tab === "track" && (
        <div>
          <div className="card">
            <h2>Track an agreement by id</h2>
            <p className="hint">
              There's no indexer in this MVP (spec §14) - agreements you create are tracked
              automatically in this browser; if you're an arbiter or tenant, ask the landlord for the
              agreement id and add it here.
            </p>
            <div className="button-row">
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Agreement id, e.g. 0"
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (manualId.trim() === "") return;
                  try {
                    addId(BigInt(manualId.trim()));
                    setManualId("");
                  } catch {
                    // ignore invalid input
                  }
                }}
              >
                Track
              </button>
            </div>
          </div>

          {ids.length === 0 && <p className="hint">No agreements tracked yet in this browser.</p>}
          {ids.map((id) => (
            <AgreementCard key={id.toString()} id={id} onRemove={() => removeId(id)} />
          ))}
        </div>
      )}
    </Layout>
  );
}

export default App;
