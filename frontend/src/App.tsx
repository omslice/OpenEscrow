import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Layout } from "./components/Layout";
import { CreateAgreementForm } from "./components/CreateAgreementForm";
import { AgreementCard } from "./components/AgreementCard";
import { useTrackedAgreements } from "./lib/useTrackedAgreements";
import { useDiscoverAgreements } from "./lib/useDiscoverAgreements";
import { TestFunds } from "./components/TestFunds";
import { PublicIntro } from "./components/PublicIntro";
import { AccountCenter } from "./components/AccountCenter";
import { AgreementNegotiation } from "./components/AgreementNegotiation";
import { isJurisdictionCode, rememberJurisdiction } from "./lib/jurisdictions";
import {
  clearInviteRole,
  roleLabel,
  selectWorkspaceRole,
  useInviteRole,
  useWorkspaceRole,
} from "./lib/inviteContext";
import {
  captureNegotiationAccessFromUrl,
  readNegotiationAccess,
} from "./lib/negotiations";
import "./App.css";

type Tab = "create" | "track";

function App() {
  const [tab, setTab] = useState<Tab>("track");
  const { ids, addId, removeId } = useTrackedAgreements();
  const { address } = useAccount();
  const { discover, isScanning, scanError } = useDiscoverAgreements();
  const [manualId, setManualId] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const inviteRole = useInviteRole();
  const workspaceRole = useWorkspaceRole();
  const [proposalAccess] = useState(() => {
    const captured = captureNegotiationAccessFromUrl();
    if (captured) return captured;
    const proposalId = new URLSearchParams(window.location.search).get("proposal");
    return proposalId ? readNegotiationAccess(proposalId) : null;
  });
  const startDemo = () => {
    setTab(workspaceRole === "landlord" ? "create" : "track");
    window.requestAnimationFrame(() => {
      document.getElementById("role-workspace")?.scrollIntoView({ behavior: "smooth" });
    });
  };

  // A landlord's shared link (?id=X) should land directly on that agreement.
  useEffect(() => {
    const idParam = new URLSearchParams(window.location.search).get("id");
    if (idParam === null) return;
    try {
      const id = BigInt(idParam);
      addId(id);
      const jurisdictionParam = new URLSearchParams(window.location.search).get("jurisdiction");
      if (jurisdictionParam && isJurisdictionCode(jurisdictionParam)) {
        rememberJurisdiction(id, jurisdictionParam);
      }
      setTab("track");
    } catch {
      // ignore malformed id in the URL
    }
    // Intentionally runs once on mount only - this is a one-time "arrived via link" check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inviteRole) setTab("track");
  }, [inviteRole]);

  return (
    <Layout>
      <PublicIntro onStart={startDemo} />
      {inviteRole && (
        <section className="card invite-landing-notice" aria-labelledby="invite-landing-title">
          <span className="eyebrow">{roleLabel[inviteRole]} invitation · role locked</span>
          <h2 id="invite-landing-title">You are joining as the {inviteRole}.</h2>
          <p>
            Continue with the Google account that received this invitation. You can review the
            landlord’s saved terms, propose changes, and approve the current revision as the{" "}
            {inviteRole}. This invitation does not provide landlord proposal tools.
          </p>
          <button className="btn btn-ghost" onClick={clearInviteRole}>
            This invitation is for someone else
          </button>
        </section>
      )}
      {!inviteRole && (
        <section className="card role-selector" id="role-workspace" aria-labelledby="role-selector-title">
          <span className="eyebrow">Choose your workspace</span>
          <h2 id="role-selector-title">How are you using OpenEscrow today?</h2>
          <p>
            This controls the tools shown in this session. Your legal role for each agreement is
            determined separately by its on-chain wallet assignments.
          </p>
          <div className="role-choice-grid">
            <button
              className={`role-choice${workspaceRole === "landlord" ? " selected" : ""}`}
              aria-pressed={workspaceRole === "landlord"}
              onClick={() => {
                selectWorkspaceRole("landlord");
                setTab("create");
              }}
            >
              <strong>I am a landlord</strong>
              <span>Propose an agreement, invite a tenant, and manage deduction claims.</span>
            </button>
            <button
              className={`role-choice${workspaceRole === "tenant" ? " selected" : ""}`}
              aria-pressed={workspaceRole === "tenant"}
              onClick={() => {
                selectWorkspaceRole("tenant");
                setTab("track");
              }}
            >
              <strong>I am a tenant</strong>
              <span>Find, fund, monitor, and respond within your deposit agreements.</span>
            </button>
          </div>
        </section>
      )}
      <AccountCenter />

      {workspaceRole && (
        <nav className="tabs" id="demo-workspace">
          <button className={tab === "track" ? "tab active" : "tab"} onClick={() => setTab("track")}>
            {proposalAccess ? "Agreement review" : "Deposit dashboard"}
          </button>
          {workspaceRole === "landlord" && !inviteRole && (
            <button className={tab === "create" ? "tab active" : "tab"} onClick={() => setTab("create")}>
              Propose new agreement
            </button>
          )}
          {inviteRole && (
            <span className="invitation-tab-note">
              {roleLabel[inviteRole]} invitation · role locked
            </span>
          )}
          {!inviteRole && workspaceRole === "tenant" && (
            <span className="invitation-tab-note">Tenant workspace</span>
          )}
        </nav>
      )}

      {workspaceRole && !proposalAccess && <TestFunds />}

      {workspaceRole === "landlord" && !inviteRole && tab === "create" && <CreateAgreementForm />}

      {workspaceRole && tab === "track" && (
        <div>
          {proposalAccess ? (
            <AgreementNegotiation access={proposalAccess} />
          ) : (
            <>
          <div className="card">
            <h2>Find agreements involving you</h2>
            <p className="hint">
              Scan Base Sepolia for agreements where your connected wallet is the landlord, tenant,
              or arbiter. Track custody, test yield, deduction claims, disputes, deadlines, and
              resolution from one place.
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

          {ids.length === 0 && <p className="hint">No security deposits tracked yet in this browser.</p>}
          {ids.map((id) => (
            <AgreementCard key={id.toString()} id={id} onRemove={() => removeId(id)} />
          ))}
            </>
          )}
        </div>
      )}
      {!workspaceRole && (
        <p className="role-selection-prompt">Choose landlord or tenant above to open the demo workspace.</p>
      )}
    </Layout>
  );
}

export default App;
