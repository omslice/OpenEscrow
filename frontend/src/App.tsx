import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Layout } from "./components/Layout";
import { CreateAgreementForm } from "./components/CreateAgreementForm";
import { AgreementCard } from "./components/AgreementCard";
import { useTrackedAgreements } from "./lib/useTrackedAgreements";
import { useDiscoverAgreements } from "./lib/useDiscoverAgreements";
import { TestFunds } from "./components/TestFunds";
import { PublicIntro } from "./components/PublicIntro";
import "./App.css";

type Tab = "create" | "track";

function App() {
  const [tab, setTab] = useState<Tab>("track");
  const { ids, addId, removeId } = useTrackedAgreements();
  const { address } = useAccount();
  const { discover, isScanning, scanError } = useDiscoverAgreements();
  const [manualId, setManualId] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const startDemo = () => {
    setTab("create");
    window.requestAnimationFrame(() => {
      document.getElementById("demo-workspace")?.scrollIntoView({ behavior: "smooth" });
    });
  };

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
      <PublicIntro onStart={startDemo} />

      <nav className="tabs" id="demo-workspace">
        <button className={tab === "track" ? "tab active" : "tab"} onClick={() => setTab("track")}>
          My agreements
        </button>
        <button className={tab === "create" ? "tab active" : "tab"} onClick={() => setTab("create")}>
          Propose new agreement
        </button>
      </nav>

      <TestFunds />

      {tab === "create" && <CreateAgreementForm />}

      {tab === "track" && (
        <div>
          <div className="card">
            <h2>Find agreements involving you</h2>
            <p className="hint">
              Scan Base Sepolia for agreements where your connected wallet is the landlord, tenant,
              or arbiter. The demo reads contract events directly, so no account or backend is
              required.
            </p>
            <button
              className="btn btn-primary"
              disabled={!address || isScanning}
              onClick={async () => {
                if (!address) return;
                setScanMessage(null);
                const found = await discover(address);
                found.forEach(addId);
                setScanMessage(
                  found.length > 0
                    ? `Found ${found.length} agreement(s) involving your address.`
                    : "No agreements found involving your address on this contract.",
                );
              }}
            >
              {isScanning ? "Scanning..." : "Scan for my agreements"}
            </button>
            {scanMessage && <p className="tx-success">{scanMessage}</p>}
            {scanError && <p className="tx-error">{scanError}</p>}
          </div>

          <div className="card">
            <h2>Track an agreement by id</h2>
            <p className="hint">
              Or add one manually - useful if someone shared an id with you directly instead of a link.
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
