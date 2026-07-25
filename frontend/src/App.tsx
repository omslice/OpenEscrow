import { useEffect, useState } from "react";
import { useIdentityToken } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Layout, type AppNotification } from "./components/Layout";
import { CreateAgreementForm } from "./components/CreateAgreementForm";
import {
  AgreementCard,
  type AgreementFocusRequest,
  type AgreementPanel,
} from "./components/AgreementCard";
import { useTrackedAgreements } from "./lib/useTrackedAgreements";
import { useDiscoverAgreements } from "./lib/useDiscoverAgreements";
import { TestFunds } from "./components/TestFunds";
import { PublicIntro } from "./components/PublicIntro";
import { AccountCenter } from "./components/AccountCenter";
import { AgreementNegotiation } from "./components/AgreementNegotiation";
import { TenantLandlordInvite } from "./components/TenantLandlordInvite";
import { isJurisdictionCode, rememberJurisdiction } from "./lib/jurisdictions";
import {
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
import { ARBITER_UI_ENABLED } from "./lib/featureFlags";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { useOnchainActivityNotifications } from "./lib/useOnchainActivityNotifications";
import "./App.css";

type WorkspaceTab = "overview" | "proposals" | "agreements";
type SavedProposal = { access: NegotiationAccess; record: NegotiationRecord };

function panelForAgreementAction(action: string): AgreementPanel | null {
  if (
    action === "deduction_claim_submitted" ||
    action === "deduction_claim_amended" ||
    action === "claim_notification_prepared" ||
    action === "claim_notification_sent" ||
    action === "claim_response_submitted" ||
    action === "arbiter_ruling_submitted" ||
    action === "claim_period_started" ||
    action === "claim_period_ended" ||
    action === "timeout_executed"
  ) {
    return "claims";
  }
  if (
    action === "operations_reserve_paid" ||
    action === "agreement_funded" ||
    action === "tenant_share_funded" ||
    action === "withdrawal_completed" ||
    action === "posted_onchain"
  ) {
    return "funds";
  }
  if (
    action === "record_snapshot_anchored" ||
    action === "activity_hash_published"
  ) {
    return "record";
  }
  return null;
}

function isSameAgreementFamily(left: SavedProposal, right: SavedProposal): boolean {
  if (left.access.role !== right.access.role) return false;
  const leftProperty = left.record.terms.propertyAddress?.trim().toLowerCase();
  const rightProperty = right.record.terms.propertyAddress?.trim().toLowerCase();
  if (leftProperty && rightProperty && leftProperty === rightProperty) return true;
  const leftTenantEmails = new Set(
    left.record.tenants.map((tenant) => tenant.email.trim().toLowerCase()),
  );
  return right.record.tenants.some((tenant) =>
    leftTenantEmails.has(tenant.email.trim().toLowerCase()),
  );
}

function compactActiveProposals(items: SavedProposal[]): SavedProposal[] {
  const active = items
    .filter(
      (item) =>
        item.record.status !== "cancelled" && item.record.status !== "superseded",
    )
    .sort(
      (a, b) =>
        new Date(b.record.updatedAt).getTime() -
        new Date(a.record.updatedAt).getTime(),
    );
  const kept: SavedProposal[] = [];
  for (const item of active) {
    if (!kept.some((candidate) => isSameAgreementFamily(item, candidate))) {
      kept.push(item);
    }
  }
  return kept;
}

function AppView({ identityToken = null }: { identityToken?: string | null }) {
  const [initialCapturedAccess] = useState(() => captureNegotiationAccessFromUrl());
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const { ids, addId, removeId } = useTrackedAgreements();
  const { address } = useAccount();
  const { discover, isScanning, scanError } = useDiscoverAgreements();
  const [manualId, setManualId] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const [agreementPanels, setAgreementPanels] = useState<
    Record<string, AgreementPanel>
  >({});
  const [agreementFocusRequests, setAgreementFocusRequests] = useState<
    Record<string, AgreementFocusRequest>
  >({});
  const participantAgreementIds = savedProposals.flatMap(({ record }) =>
    record.onchainAgreementId ? [BigInt(record.onchainAgreementId)] : [],
  );
  const displayedIds = ACCOUNT_AUTH_ENABLED
    ? ids.filter((id) =>
        participantAgreementIds.some((participantId) => participantId === id),
      )
    : ids;
  const notificationAgreementIds = ACCOUNT_AUTH_ENABLED
    ? participantAgreementIds
    : displayedIds;
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
    setTab("proposals");
  }, [initialCapturedAccess]);
  const startDemo = () => {
    setTab("overview");
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
      setTab("agreements");
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
      setTab("proposals");
    } else if (
      workspaceRole === "landlord" &&
      !new URLSearchParams(window.location.search).has("id")
    ) {
      setTab("overview");
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
        const localAccesses = identityToken
          ? []
          : listNegotiationAccesses(workspaceRole || undefined);
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
          compactActiveProposals(
            loaded
            .filter(
              (result): result is PromiseFulfilledResult<SavedProposal> =>
                result.status === "fulfilled",
            )
            .map((result) => result.value),
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
      const localAccesses = identityToken
        ? []
        : listNegotiationAccesses(workspaceRole || undefined);
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
      const proposals = compactActiveProposals(loaded
        .filter(
          (result): result is PromiseFulfilledResult<SavedProposal> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value));
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
      setTab("proposals");
      window.requestAnimationFrame(() => {
        document.getElementById("proposal-builder")?.scrollIntoView({ behavior: "smooth" });
      });
      return;
    }
    setProposalAccess(item.access);
    setTab("proposals");
  }

  function scrollToNotificationTarget(targetId: string, fallbackId: string) {
    window.setTimeout(() => {
      const target =
        document.getElementById(targetId) || document.getElementById(fallbackId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    }, 80);
  }

  function openProposalNotification(item: SavedProposal, action: string) {
    const agreementId = item.record.onchainAgreementId;
    const requestedPanel =
      panelForAgreementAction(action) ||
      (agreementId && item.record.status === "finalized" ? "summary" : null);
    if (agreementId && requestedPanel) {
      addId(BigInt(agreementId));
      setProposalAccess(null);
      setTab("agreements");
      setAgreementPanels((current) => ({
        ...current,
        [agreementId]: requestedPanel,
      }));
      const targetId =
        action === "deduction_claim_submitted" ||
        action === "deduction_claim_amended" ||
        action === "claim_notification_prepared"
          ? `agreement-${agreementId}-claim`
          : action === "claim_response_submitted"
            ? `agreement-${agreementId}-response`
            : action === "arbiter_ruling_submitted"
              ? `agreement-${agreementId}-resolution`
              : `agreement-${agreementId}-panel-${requestedPanel}`;
      setAgreementFocusRequests((current) => ({
        ...current,
        [agreementId]: {
          targetId,
          nonce: (current[agreementId]?.nonce || 0) + 1,
        },
      }));
      return;
    } else {
      openSavedProposal(item);
    }
    scrollToNotificationTarget(
      item.access.role === "landlord" ? "proposal-builder" : "proposal-review-title",
      item.access.role === "landlord" ? "proposal-builder" : "proposal-review-title",
    );
  }

  function openOnchainNotification(agreementId?: string) {
    if (!agreementId) return;
    addId(BigInt(agreementId));
    setProposalAccess(null);
    setTab("agreements");
    setAgreementPanels((current) => ({
      ...current,
      [agreementId]: "record",
    }));
    setAgreementFocusRequests((current) => ({
      ...current,
      [agreementId]: {
        targetId: `agreement-${agreementId}-panel-record`,
        nonce: (current[agreementId]?.nonce || 0) + 1,
      },
    }));
  }

  function closeProposalReview() {
    setProposalAccess(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("proposal");
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.toString());
  }

  const notifications: AppNotification[] = [
    ...savedProposals.flatMap((item) =>
      item.record.events
        .filter((event) => event.action !== "record_snapshot_anchored")
        .map((event) => ({
          id: `${item.record.id}-${event.id}`,
          createdAt: event.createdAt,
          actor: roleLabel[event.actorRole as keyof typeof roleLabel] || "System",
          summary: event.summary,
          onOpen: () => openProposalNotification(item, event.action),
        })),
    ),
    ...onchainNotifications.map((notification) => ({
      ...notification,
      onOpen: () => openOnchainNotification(notification.agreementId),
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 10);

  const activeProposals = savedProposals.filter(
    (item) => item.record.status !== "finalized",
  );
  const readyProposals = activeProposals.filter(
    (item) =>
      (item.access.role === "landlord" && item.record.status === "ready") ||
      (item.access.role !== "landlord" && item.record.status === "draft"),
  );
  const workspaceTabLabels =
    workspaceRole === "landlord"
      ? {
          overview: "Overview",
          proposals: "Proposals",
          agreements: "Agreements",
        }
      : workspaceRole === "tenant"
        ? {
            overview: "Overview",
            proposals: "Proposals",
            agreements: "Deposits",
          }
        : {
            overview: "Overview",
            proposals: "Reviews",
            agreements: "Cases",
          };

  function renderDiscoveryCard(scope: "proposals" | "agreements") {
    return (
      <section className="card workspace-discovery">
        <div>
          <span className="eyebrow">
            {scope === "proposals" ? "Account proposals" : "Onchain workspace"}
          </span>
          <h2>
            {scope === "proposals"
              ? "Refresh proposals associated with this account"
              : "Find finalized agreements associated with this account"}
          </h2>
          <p className="hint">
            {scope === "proposals"
              ? "Saved invitations and current proposal revisions are matched to your signed-in email."
              : "OpenEscrow scans Base Sepolia for agreements involving your connected wallet."}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={isScanning || isFinding}
          onClick={() => void findProposalsAndAgreements()}
        >
          {isScanning || isFinding
            ? "Searching..."
            : scope === "proposals"
              ? "Refresh my proposals"
              : "Find my agreements"}
        </button>
        {!address && scope === "agreements" && (
          <p className="field-help">
            Connect your wallet to scan for finalized onchain agreements.
          </p>
        )}
        {scanMessage && <p className="tx-success">{scanMessage}</p>}
        {findError && <p className="tx-error">{findError}</p>}
        {scanError && <p className="tx-error">{scanError}</p>}
      </section>
    );
  }

  function renderSavedProposalCards() {
    if (activeProposals.length === 0) {
      return (
        <div className="workspace-empty">
          <strong>No active proposals found.</strong>
          <span>
            {workspaceRole === "landlord"
              ? "Start a proposal above or refresh after another party responds."
              : "Accepted invitations and proposals awaiting your review will appear here."}
          </span>
        </div>
      );
    }
    return activeProposals.map((item) => {
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
                Current proposal · {roleLabel[item.access.role]} access
              </span>
              <h2>Proposal {item.record.id}</h2>
            </div>
            <span className={`negotiation-status status-${item.record.status}`}>
              {item.record.status} · revision {item.record.revision}
            </span>
          </div>
          <p className="hint">
            {item.access.role === "landlord" ? "Tenant" : "Landlord"}: {counterpart}
            {item.record.arbiterEmail ? ` · Arbiter: ${item.record.arbiterEmail}` : ""}
          </p>
          {isReadyForLandlord && (
            <div className="finalization-notice" role="status">
              <strong>All required approvals are complete.</strong>
              <span>
                Review the approved terms, then submit this agreement onchain.
              </span>
            </div>
          )}
          <div className="button-row">
            <button
              className={isReadyForLandlord ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => openSavedProposal(item)}
            >
              {isReadyForLandlord ? "Review and finalize" : "Open proposal"}
            </button>
          </div>
        </article>
      );
    });
  }

  function renderAgreementWorkspace() {
    return (
      <>
        {renderDiscoveryCard("agreements")}
        <section className="card compact-manual-tracker">
          <div>
            <h2>Track an agreement by id</h2>
            <p className="hint">
              Add an onchain agreement manually if someone shared its id directly.
            </p>
          </div>
          <div className="button-row">
            <input
              value={manualId}
              onChange={(event) => setManualId(event.target.value)}
              placeholder="Agreement id, e.g. 0"
              inputMode="numeric"
            />
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (manualId.trim() === "") return;
                try {
                  addId(BigInt(manualId.trim()));
                  setManualId("");
                } catch {
                  // Invalid ids remain in the field so the user can correct them.
                }
              }}
            >
              Track
            </button>
          </div>
        </section>
        {displayedIds.length === 0 && (
          <div className="workspace-empty">
            <strong>No finalized security deposits tracked yet.</strong>
            <span>
              Finalized agreements will appear here with the actions available to your role.
            </span>
          </div>
        )}
        {displayedIds.map((id) => {
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
              activePanel={agreementPanels[id.toString()]}
              focusRequest={agreementFocusRequests[id.toString()]}
              onPanelChange={(panel) =>
                setAgreementPanels((current) => ({
                  ...current,
                  [id.toString()]: panel,
                }))
              }
            />
          );
        })}
        {workspaceRole === "tenant" && <TestFunds />}
      </>
    );
  }

  function renderOverview() {
    return (
      <div className="workspace-overview">
        <section className="workspace-welcome">
          <span className="eyebrow">{roleLabel[workspaceRole!]} workspace</span>
          <h2>
            {workspaceRole === "landlord"
              ? "Manage proposals, deposits, and deductions"
              : workspaceRole === "tenant"
                ? "Review invitations and monitor your deposits"
                : "Review invitations and open disputes"}
          </h2>
          <p>
            Start with anything requiring action, or jump directly to the part of the
            agreement lifecycle you need.
          </p>
        </section>
        <div className="workspace-stat-grid">
          <button
            className={`workspace-stat${readyProposals.length > 0 ? " has-action" : ""}`}
            onClick={() => setTab("proposals")}
          >
            <span>Needs attention</span>
            <strong>{readyProposals.length}</strong>
            <small>
              {workspaceRole === "landlord"
                ? "approved or updated proposals"
                : "invitations or proposals to review"}
            </small>
          </button>
          <button className="workspace-stat" onClick={() => setTab("proposals")}>
            <span>Active proposals</span>
            <strong>{activeProposals.length}</strong>
            <small>current revisions only</small>
          </button>
          <button className="workspace-stat" onClick={() => setTab("agreements")}>
            <span>Finalized agreements</span>
            <strong>{displayedIds.length}</strong>
            <small>
              {workspaceRole === "landlord"
                ? "deposits and deduction work"
                : "deposits and claim activity"}
            </small>
          </button>
        </div>
        {readyProposals.length > 0 && (
          <section className="card urgent-work">
            <span className="eyebrow">Action queue</span>
            <h2>
              {readyProposals.length} proposal{readyProposals.length === 1 ? "" : "s"} need
              {readyProposals.length === 1 ? "s" : ""} your attention
            </h2>
            <p className="hint">
              {workspaceRole === "landlord"
                ? "A proposal may be ready for final onchain submission."
                : "Review the current revision before approving or proposing changes."}
            </p>
            <button className="btn btn-primary" onClick={() => setTab("proposals")}>
              Review now
            </button>
          </section>
        )}
        <div className="workspace-route-grid">
          <button onClick={() => setTab("proposals")}>
            <span className="route-icon" aria-hidden="true">1</span>
            <span>
              <strong>{workspaceTabLabels.proposals}</strong>
              <small>
                {workspaceRole === "landlord"
                  ? "Create, edit, invite, approve, and finalize."
                  : "Review terms, propose changes, and approve."}
              </small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
          <button onClick={() => setTab("agreements")}>
            <span className="route-icon" aria-hidden="true">2</span>
            <span>
              <strong>{workspaceTabLabels.agreements}</strong>
              <small>
                {workspaceRole === "landlord"
                  ? "Monitor funding, submit deductions, and withdraw."
                  : "Fund shares, monitor yield, and respond to claims."}
              </small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </div>
      </div>
    );
  }

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
          <p className="field-help">
            This role cannot be changed from an invitation. If the invitation belongs to someone
            else, sign out and use the Google account named in the invitation.
          </p>
        </section>
      )}
      {!inviteRole && workspaceRole && !isChangingRole && (
        <section className="card active-role-summary" id="role-workspace">
          <div>
            <span className="eyebrow">Active workspace role</span>
            <h2>{roleLabel[workspaceRole]} workspace</h2>
            <p>
              Existing agreement roles are fixed by their participant record. This setting only
              controls which account tools are shown.
            </p>
          </div>
          <button
            className="btn btn-ghost small"
            type="button"
            onClick={() => setIsChangingRole(true)}
          >
            Change workspace role
          </button>
        </section>
      )}
      {!inviteRole && (!workspaceRole || isChangingRole) && (
        <section className="card role-selector" id="role-workspace" aria-labelledby="role-selector-title">
          <span className="eyebrow">{workspaceRole ? "Change workspace role" : "Choose your workspace"}</span>
          <h2 id="role-selector-title">
            {workspaceRole
              ? "Switch the tools shown for this signed-in session"
              : "How are you using OpenEscrow today?"}
          </h2>
          <p>
            This controls the tools shown in this session. Your legal role for each agreement is
            determined separately by its participant record and on-chain wallet assignments.
          </p>
          <div className="role-choice-grid">
            <button
              className={`role-choice${workspaceRole === "landlord" ? " selected" : ""}`}
              aria-pressed={workspaceRole === "landlord"}
              onClick={() => {
                selectWorkspaceRole("landlord");
                setActiveLandlordAccess(null);
                setTab("overview");
                setIsChangingRole(false);
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
                setTab("overview");
                setIsChangingRole(false);
              }}
            >
              <strong>I am a tenant</strong>
              <span>Find, fund, monitor, and respond within your deposit agreements.</span>
            </button>
            {ARBITER_UI_ENABLED && <button
              className={`role-choice${workspaceRole === "arbiter" ? " selected" : ""}`}
              aria-pressed={workspaceRole === "arbiter"}
              onClick={() => {
                selectWorkspaceRole("arbiter");
                setTab("overview");
                setIsChangingRole(false);
              }}
            >
              <strong>I am an arbiter</strong>
              <span>Find invitations, review evidence, and rule when mutually appointed.</span>
            </button>}
          </div>
          {workspaceRole && (
            <button
              className="btn btn-ghost small"
              type="button"
              onClick={() => setIsChangingRole(false)}
            >
              Keep {roleLabel[workspaceRole].toLowerCase()} workspace
            </button>
          )}
        </section>
      )}
      <AccountCenter />

      {workspaceRole && (
        <nav
          className="tabs workspace-tabs"
          id="demo-workspace"
          aria-label={`${roleLabel[workspaceRole]} workspace`}
        >
          {(["overview", "proposals", "agreements"] as WorkspaceTab[]).map(
            (workspaceTab) => (
              <button
                key={workspaceTab}
                className={tab === workspaceTab ? "tab active" : "tab"}
                aria-current={tab === workspaceTab ? "page" : undefined}
                onClick={() => setTab(workspaceTab)}
              >
                {workspaceTabLabels[workspaceTab]}
                {workspaceTab === "proposals" && readyProposals.length > 0 && (
                  <span
                    className="tab-count"
                    aria-label={`${readyProposals.length} need attention`}
                  >
                    {readyProposals.length}
                  </span>
                )}
              </button>
            ),
          )}
          {inviteRole && (
            <span className="invitation-tab-note">
              {roleLabel[inviteRole]} invitation · role locked
            </span>
          )}
        </nav>
      )}

      {workspaceRole && (
        <div hidden={tab !== "overview"}>{renderOverview()}</div>
      )}

      {workspaceRole && (
        <div
          className="workspace-panel"
          aria-label={workspaceTabLabels.proposals}
          hidden={tab !== "proposals"}
        >
          {proposalAccess ? (
            <>
              <button className="btn btn-ghost review-back" onClick={closeProposalReview}>
                Back to invitations and proposals
              </button>
              <AgreementNegotiation access={proposalAccess} />
            </>
          ) : (
            <>
              {workspaceRole === "landlord" && !inviteRole && (
                <CreateAgreementForm
                  key={activeLandlordAccess?.proposalId || "latest-landlord-proposal"}
                  initialAccess={activeLandlordAccess}
                />
              )}
              {workspaceRole === "tenant" && !inviteRole && <TenantLandlordInvite />}
              {renderDiscoveryCard("proposals")}
              <section className="workspace-section-heading">
                <span className="eyebrow">Current records</span>
                <h2>
                  {workspaceRole === "landlord"
                    ? "Your active proposals"
                    : "Invitations and proposals awaiting completion"}
                </h2>
                <p>
                  Only the latest active revision is shown. Earlier revisions remain in the
                  permanent activity record.
                </p>
              </section>
              {renderSavedProposalCards()}
            </>
          )}
        </div>
      )}

      {workspaceRole && tab === "agreements" && (
        <div className="workspace-panel" aria-label={workspaceTabLabels.agreements}>
          {renderAgreementWorkspace()}
        </div>
      )}

      {/*
      {workspaceRole && (
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
          {workspaceRole === "tenant" && !inviteRole && <TenantLandlordInvite />}
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
                      ? "Review approved proposal"
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

          {displayedIds.length === 0 && <p className="hint">No security deposits tracked for this account yet.</p>}
          {displayedIds.map((id) => {
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
      */}
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
