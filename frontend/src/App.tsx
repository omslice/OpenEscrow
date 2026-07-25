import { useEffect, useState } from "react";
import { useIdentityToken } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Layout, type AppNotification } from "./components/Layout";
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
  discoverNegotiationsForAccount,
  listNegotiationAccesses,
  loadNegotiation,
  readNegotiationAccess,
  type NegotiationAccess,
  type NegotiationRecord,
} from "./lib/negotiations";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { useOnchainActivityNotifications } from "./lib/useOnchainActivityNotifications";
import "./App.css";

type Tab = "create" | "track";
type SavedProposal = { access: NegotiationAccess; record: NegotiationRecord };

function AppView({ identityToken = null }: { identityToken?: string | null }) {
  const [initialCapturedAccess] = useState(() => captureNegotiationAccessFromUrl());
  const [tab, setTab] = useState<Tab>("track");
  const { ids, addId, removeId } = useTrackedAgreements();
  const { address } = useAccount();
  const { discover, isScanning, scanError } = useDiscoverAgreements();
  const [manualId, setManualId] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const notificationAgreementIds = [
    ...ids,
    ...savedProposals.flatMap(({ record }) =>
      record.onchainAgreementId ? [BigInt(record.onchainAgreementId)] : [],
    ),
  ];
  const onchainNotifications =
    useOnchainActivityNotifications(notificationAgreementIds);
  const [activeLandlordAccess, setActiveLandlordAccess] =
    useState<NegotiationAccess | null>(
      initialCapturedAccess?.role === "landlord" ? initialCapturedAccess : null,
    );
  const inviteRole = useInviteRole();
  const workspaceRole = useWorkspaceRole();
  const [proposalAccess, setProposalAccess] = useState<NegotiationAccess | null>(() => {
    if (initialCapturedAccess && initialCapturedAccess.role !== "landlord") {
      return initialCapturedAccess;
    }
    const params = new URLSearchParams(window.location.search);
    const proposalId = params.get("proposal");
    const role = params.get("invite");
    return proposalId
      ? readNegotiationAccess(
          proposalId,
          role === "tenant" || role === "arbiter" ? role : undefined,
        )
      : null;
  });

  useEffect(() => {
    if (initialCapturedAccess?.role !== "landlord") return;
    selectWorkspaceRole("landlord");
    setTab("create");
  }, [initialCapturedAccess]);
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
    setSavedProposals([]);
    setScanMessage(null);
    setFindError(null);
    if (inviteRole) {
      setTab("track");
    } else if (
      workspaceRole === "landlord" &&
      !new URLSearchParams(window.location.search).has("id")
    ) {
      setTab("create");
    }
  }, [inviteRole, workspaceRole]);

  useEffect(() => {
    if (
      !inviteRole &&
      proposalAccess &&
      proposalAccess.role !== "landlord" &&
      !new URLSearchParams(window.location.search).has("invite")
    ) {
      setProposalAccess(null);
    }
  }, [inviteRole, proposalAccess]);

  useEffect(() => {
    if (!workspaceRole) return;
    let active = true;

    async function refreshSavedProposals() {
      try {
        const localAccesses = listNegotiationAccesses(workspaceRole || undefined);
        const accountAccesses =
          identityToken && workspaceRole
            ? await discoverNegotiationsForAccount(workspaceRole, identityToken)
            : [];
        const accesses = [...localAccesses, ...accountAccesses].filter(
          (access, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.proposalId === access.proposalId &&
                candidate.role === access.role,
            ) === index,
        );
        const loaded = await Promise.allSettled(
          accesses.map(async (access) => ({
            access,
            record: await loadNegotiation(access),
          })),
        );
        if (!active) return;
        setSavedProposals(
          loaded
            .filter(
              (result): result is PromiseFulfilledResult<SavedProposal> =>
                result.status === "fulfilled",
            )
            .map((result) => result.value)
            .sort(
              (a, b) =>
                new Date(b.record.updatedAt).getTime() -
                new Date(a.record.updatedAt).getTime(),
            ),
        );
      } catch {
        // Manual search below presents discovery errors. Background refresh preserves the last
        // known records instead of turning a transient identity failure into persistent UI noise.
      }
    }

    void refreshSavedProposals();
    const timer = window.setInterval(() => void refreshSavedProposals(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [identityToken, workspaceRole]);

  async function findProposalsAndAgreements() {
    setScanMessage(null);
    setIsFinding(true);
    try {
      const localAccesses = listNegotiationAccesses(workspaceRole || undefined);
      const accountAccesses =
        identityToken && workspaceRole
          ? await discoverNegotiationsForAccount(workspaceRole, identityToken)
          : [];
      const accesses = [...localAccesses, ...accountAccesses].filter(
        (access, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.proposalId === access.proposalId && candidate.role === access.role,
          ) === index,
      );
      const loaded = await Promise.allSettled(
        accesses.map(async (access) => ({
          access,
          record: await loadNegotiation(access),
        })),
      );
      const proposals = loaded
        .filter(
          (result): result is PromiseFulfilledResult<SavedProposal> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value)
        .sort(
          (a, b) =>
            new Date(b.record.updatedAt).getTime() -
            new Date(a.record.updatedAt).getTime(),
        );
      setSavedProposals(proposals);

      let onchainCount = 0;
      if (address) {
        const found = await discover(address);
        found.forEach(addId);
        onchainCount = found.length;
      }
      const skipped = loaded.length - proposals.length;
      setScanMessage(
        `Found ${proposals.length} saved proposal(s) and ${onchainCount} onchain agreement(s).${
          skipped ? ` ${skipped} unavailable saved link(s) were skipped.` : ""
        }`,
      );
    } catch (error) {
      setFindError(
        error instanceof Error
          ? error.message
          : "Your proposals and agreements could not be searched.",
      );
    } finally {
      setIsFinding(false);
    }
  }

  function openSavedProposal(item: SavedProposal) {
    if (item.access.role === "landlord") {
      setActiveLandlordAccess(item.access);
      setTab("create");
      window.requestAnimationFrame(() => {
        document.getElementById("proposal-builder")?.scrollIntoView({ behavior: "smooth" });
      });
      return;
    }
    setProposalAccess(item.access);
  }

  function closeProposalReview() {
    setProposalAccess(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("proposal");
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.toString());
  }

  const notifications: AppNotification[] = [
    ...savedProposals.flatMap(({ record }) =>
      record.events
        .filter((event) => event.action !== "record_snapshot_anchored")
        .map((event) => ({
          id: `${record.id}-${event.id}`,
          createdAt: event.createdAt,
          actor: roleLabel[event.actorRole as keyof typeof roleLabel] || "System",
          summary: event.summary,
        })),
    ),
    ...onchainNotifications,
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 10);

  return (
    <Layout notifications={notifications}>
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
                setActiveLandlordAccess(null);
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
          {workspaceRole === "landlord" && !inviteRole && (
            <button className={tab === "create" ? "tab active" : "tab"} onClick={() => setTab("create")}>
              Set up agreement proposal
            </button>
          )}
          <button className={tab === "track" ? "tab active" : "tab"} onClick={() => setTab("track")}>
            {proposalAccess
              ? "Agreement review"
              : workspaceRole === "landlord"
                ? "Agreements & deductions"
                : workspaceRole === "arbiter"
                  ? "Reviews & rulings"
                  : "Deposits & responses"}
          </button>
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

      {workspaceRole === "landlord" && !inviteRole && tab === "create" && (
        <CreateAgreementForm
          key={activeLandlordAccess?.proposalId || "latest-landlord-proposal"}
          initialAccess={activeLandlordAccess}
        />
      )}

      {workspaceRole && tab === "track" && (
        <div>
          {proposalAccess ? (
            <>
              <button className="btn btn-ghost review-back" onClick={closeProposalReview}>
                Back to proposals and agreements
              </button>
              <AgreementNegotiation access={proposalAccess} />
            </>
          ) : (
            <>
          <div className="card">
            <h2>
              {workspaceRole === "landlord"
                ? "Find proposals, agreements, and deduction work"
                : workspaceRole === "arbiter"
                  ? "Find proposals and agreements assigned to you"
                  : "Find proposals and deposit agreements associated with you"}
            </h2>
            <p className="hint">
              {workspaceRole === "landlord"
                ? "Open saved proposals awaiting review or finalization, then scan Base Sepolia for agreements where you can submit documented deductions, resolve claims, and withdraw available funds."
                : "Open saved proposals you were invited to review, then scan Base Sepolia for finalized agreements involving your connected wallet."}
            </p>
            <button
              className="btn btn-primary"
              disabled={isScanning || isFinding}
              onClick={() => void findProposalsAndAgreements()}
            >
              {isScanning || isFinding ? "Searching..." : "Find my proposals & agreements"}
            </button>
            {!address && (
              <p className="field-help">
                Saved proposals can be found now. Connect your wallet to scan for finalized onchain agreements too.
              </p>
            )}
            {scanMessage && <p className="tx-success">{scanMessage}</p>}
            {findError && <p className="tx-error">{findError}</p>}
            {scanError && <p className="tx-error">{scanError}</p>}
          </div>

          {savedProposals.map((item) => {
            const counterpart =
              item.access.role === "landlord"
                ? item.record.tenantEmail
                : item.record.landlordEmail;
            const isReadyForLandlord =
              item.access.role === "landlord" && item.record.status === "ready";
            return (
              <article
                className={`card saved-proposal-card${isReadyForLandlord ? " ready-to-finalize" : ""}`}
                key={`${item.access.proposalId}-${item.access.role}`}
              >
                <div className="proposal-builder-heading">
                  <div>
                    <span className="eyebrow">
                      Saved offchain proposal · {roleLabel[item.access.role]} access
                    </span>
                    <h2>Proposal {item.record.id}</h2>
                  </div>
                  <span className={`negotiation-status status-${item.record.status}`}>
                    {item.record.status} · revision {item.record.revision}
                  </span>
                </div>
                <p className="hint">
                  {item.access.role === "landlord" ? "Tenant" : "Landlord"}: {counterpart}
                  {item.record.arbiterEmail ? ` · Arbiter: ${item.record.arbiterEmail}` : " · No arbiter"}
                </p>
                {isReadyForLandlord && (
                  <div className="finalization-notice" role="status">
                    <strong>All required approvals are complete.</strong>
                    <span>
                      Open this proposal to submit the approved terms onchain. It remains a saved
                      proposal until you complete that transaction.
                    </span>
                  </div>
                )}
                <div className="button-row">
                  <button
                    className={isReadyForLandlord ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => openSavedProposal(item)}
                  >
                    {isReadyForLandlord
                      ? "Finalize approved proposal onchain"
                      : item.record.status === "finalized"
                        ? "Open agreement workspace"
                        : "Open proposal"}
                  </button>
                </div>
              </article>
            );
          })}

          <div className="card">
            <h2>Track an agreement by id</h2>
            <p className="hint">
              Add a finalized onchain agreement manually if someone shared its id directly.
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
          {ids.map((id) => {
            const proposal = savedProposals.find(
              (item) => item.record.onchainAgreementId === id.toString(),
            );
            return (
              <AgreementCard
                key={id.toString()}
                id={id}
                onRemove={() => removeId(id)}
                negotiationAccess={proposal?.access}
                participantRecord={proposal?.record}
              />
            );
          })}
          {workspaceRole === "tenant" && <TestFunds />}
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

function AuthenticatedApp() {
  const { identityToken } = useIdentityToken();
  return <AppView identityToken={identityToken} />;
}

function App() {
  return ACCOUNT_AUTH_ENABLED ? <AuthenticatedApp /> : <AppView />;
}

export default App;
