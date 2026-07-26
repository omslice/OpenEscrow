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
import { AgreementOnchainActivity } from "./components/AgreementOnchainActivity";
import { RecordSnapshotControls } from "./components/RecordSnapshotControls";
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
import { agreementReference, proposalReference } from "./lib/displayIds";
import { ARBITER_UI_ENABLED } from "./lib/featureFlags";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { useOnchainActivityNotifications } from "./lib/useOnchainActivityNotifications";
import "./App.css";

type WorkspaceTab = "overview" | "proposals" | "agreements" | "record";
type SavedProposal = { access: NegotiationAccess; record: NegotiationRecord };

function isRecordAction(action: string) {
  return (
    action === "record_snapshot_anchored" ||
    action === "activity_hash_published"
  );
}

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
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const [savedRecords, setSavedRecords] = useState<SavedProposal[]>([]);
  const [agreementPanels, setAgreementPanels] = useState<
    Record<string, AgreementPanel>
  >({});
  const [agreementFocusRequests, setAgreementFocusRequests] = useState<
    Record<string, AgreementFocusRequest>
  >({});
  const finalizedProposals = compactActiveProposals(
    savedRecords.filter((item) => item.record.status === "finalized"),
  );
  const participantAgreementIds = finalizedProposals.flatMap(({ record }) =>
    record.onchainAgreementId ? [BigInt(record.onchainAgreementId)] : [],
  );
  const displayedIds = ACCOUNT_AUTH_ENABLED
    ? participantAgreementIds
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
  const [isProposalComposerOpen, setIsProposalComposerOpen] = useState(
    initialCapturedAccess?.role === "landlord",
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
    setIsProposalComposerOpen(true);
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
    setSavedRecords([]);
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
        const records = loaded
          .filter(
            (result): result is PromiseFulfilledResult<SavedProposal> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value);
        setSavedRecords(records);
        setSavedProposals(compactActiveProposals(records));
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
      const records = loaded
        .filter(
          (result): result is PromiseFulfilledResult<SavedProposal> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);
      const proposals = compactActiveProposals(records);
      setSavedRecords(records);
      setSavedProposals(proposals);

      const accountAgreementIds = records.flatMap(({ record }) =>
        record.status === "finalized" && record.onchainAgreementId
          ? [BigInt(record.onchainAgreementId)]
          : [],
      );
      accountAgreementIds.forEach(addId);
      let onchainCount = accountAgreementIds.length;
      if (!ACCOUNT_AUTH_ENABLED && address) {
        const found = await discover(address);
        found.forEach(addId);
        onchainCount = found.length;
      }
      const skipped = loaded.filter((result) => result.status === "rejected").length;
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
      setIsProposalComposerOpen(true);
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
    if (isRecordAction(action)) {
      if (agreementId) addId(BigInt(agreementId));
      setProposalAccess(null);
      setTab("record");
      scrollToNotificationTarget(
        agreementId
          ? `record-agreement-${agreementId}`
          : `record-proposal-${item.record.id}`,
        "record-workspace",
      );
      return;
    }
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
    setTab("record");
    scrollToNotificationTarget(
      `record-agreement-${agreementId}`,
      "record-workspace",
    );
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
          record: "Record",
        }
      : workspaceRole === "tenant"
        ? {
            overview: "Overview",
            proposals: "Proposals",
            agreements: "Deposits",
            record: "Record",
          }
        : {
            overview: "Overview",
            proposals: "Reviews",
            agreements: "Cases",
            record: "Record",
          };

  function renderAgreementDiscovery() {
    return (
      <section className="card workspace-discovery">
        <div>
          <span className="eyebrow">Account deposits</span>
          <h2>Active security deposit agreements</h2>
          <p className="hint">
            Finalized agreements associated with this signed-in account load automatically.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={isScanning || isFinding}
          onClick={() => void findProposalsAndAgreements()}
        >
          {isScanning || isFinding ? "Refreshing..." : "Refresh deposits"}
        </button>
        {!ACCOUNT_AUTH_ENABLED && !address && (
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
              ? "Use Start a new proposal below, or refresh after another party responds."
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
          className={`saved-proposal-card${isReadyForLandlord ? " ready-to-finalize" : ""}`}
          key={`${item.access.proposalId}-${item.access.role}`}
        >
          <div className="proposal-builder-heading">
            <div>
              <span className="eyebrow">
                Current proposal · {roleLabel[item.access.role]} access
              </span>
              <h2>{proposalReference(item.record.id)}</h2>
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
        {renderAgreementDiscovery()}
        {displayedIds.length === 0 && (
          <div className="workspace-empty">
            <strong>No finalized security deposits tracked yet.</strong>
            <span>
              Finalized agreements will appear here with the actions available to your role.
            </span>
          </div>
        )}
        {displayedIds.map((id) => {
          const proposal = finalizedProposals.find(
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

  function renderRecordWorkspace() {
    const linkedAgreementIds = new Set(
      savedRecords.flatMap((item) =>
        item.record.onchainAgreementId ? [item.record.onchainAgreementId] : [],
      ),
    );
    const unlinkedAgreementIds = displayedIds.filter(
      (id) => !linkedAgreementIds.has(id.toString()),
    );

    return (
      <section className="record-workspace" id="record-workspace">
        <div className="workspace-section-heading">
          <span className="eyebrow">Audit trail</span>
          <h2>Proposal and agreement record</h2>
          <p>
            Download the complete timestamped report, preserve an encrypted evidence copy,
            and verify its integrity hash onchain.
          </p>
        </div>
        {savedRecords.length === 0 && unlinkedAgreementIds.length === 0 && (
          <div className="workspace-empty">
            <strong>No account records found.</strong>
            <span>
              Proposal history and finalized agreement activity will appear here.
            </span>
          </div>
        )}
        {savedRecords.map((item) => {
          const agreementId = item.record.onchainAgreementId;
          const isFinalized =
            item.record.status === "finalized" && Boolean(agreementId);
          return (
            <article
              className="card record-workspace-card"
              id={
                agreementId
                  ? `record-agreement-${agreementId}`
                  : `record-proposal-${item.record.id}`
              }
              key={`${item.access.proposalId}-${item.access.role}`}
              tabIndex={-1}
            >
              <header className="record-workspace-header">
                <div>
                  <span className="eyebrow">
                    {isFinalized ? "Finalized agreement record" : "Proposal record"}
                  </span>
                  <h3>
                    {agreementId
                      ? agreementReference(agreementId)
                      : proposalReference(item.record.id)}
                  </h3>
                  {agreementId && (
                    <small>
                      Originated as {proposalReference(item.record.id)} · onchain ID{" "}
                      {agreementId}
                    </small>
                  )}
                </div>
                <div className="record-workspace-actions">
                  <span className={`negotiation-status status-${item.record.status}`}>
                    {item.record.status} · revision {item.record.revision}
                  </span>
                </div>
              </header>
              <RecordSnapshotControls
                access={item.access}
                agreementId={agreementId ? BigInt(agreementId) : undefined}
              />
              <details className="technical-details agreement-activity">
                <summary>View timestamped activity ({item.record.events.length})</summary>
                <ol className="activity-timeline">
                  {[...item.record.events].reverse().map((event) => (
                    <li key={event.id}>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString()}
                      </time>
                      <strong>
                        {roleLabel[event.actorRole as keyof typeof roleLabel] || "System"}
                      </strong>
                      <span>{event.summary}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          );
        })}
        {unlinkedAgreementIds.map((id) => (
          <article
            className="card record-workspace-card"
            id={`record-agreement-${id.toString()}`}
            key={`unlinked-${id.toString()}`}
            tabIndex={-1}
          >
            <header className="record-workspace-header">
              <div>
                <span className="eyebrow">Onchain-only record</span>
                <h3>{agreementReference(id)}</h3>
                <small>Onchain agreement ID {id.toString()}</small>
              </div>
            </header>
            <AgreementOnchainActivity agreementId={id} isParty={false} />
          </article>
        ))}
      </section>
    );
  }

  function renderOverview() {
    return (
      <div className="workspace-overview">
        <section className="workspace-welcome">
          <div>
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
          </div>
          <button
            className="refresh-icon-button overview-refresh"
            type="button"
            aria-label="Refresh overview counts and agreements"
            title="Refresh overview"
            disabled={isScanning || isFinding}
            onClick={() => void findProposalsAndAgreements()}
          >
            <span aria-hidden="true">↻</span>
          </button>
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
          <button onClick={() => setTab("record")}>
            <span className="route-icon" aria-hidden="true">3</span>
            <span>
              <strong>{workspaceTabLabels.record}</strong>
              <small>Review the complete timestamped history and reports.</small>
            </span>
            <b aria-hidden="true">→</b>
          </button>
        </div>
        {workspaceRole === "tenant" && !inviteRole && <TenantLandlordInvite />}
      </div>
    );
  }

  return (
    <Layout notifications={notifications}>
      <PublicIntro onStart={startDemo} />
      {!inviteRole && workspaceRole && !isChangingRole && (
        <details className="card account-workspace-disclosure" id="role-workspace">
          <summary>
            <span>
              <span className="eyebrow">Account and workspace</span>
              <strong>{roleLabel[workspaceRole]} workspace</strong>
              <small>Identity, wallet, email preferences, and workspace tools</small>
            </span>
            <span className="disclosure-cue" aria-hidden="true" />
          </summary>
          <div className="account-workspace-content">
            <AccountCenter
              embedded
              workspaceRole={roleLabel[workspaceRole]}
              onChangeWorkspaceRole={() => setIsChangingRole(true)}
            />
          </div>
        </details>
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
                setIsProposalComposerOpen(false);
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
      {(inviteRole || !workspaceRole || isChangingRole) && <AccountCenter />}

      {workspaceRole && (
        <nav
          className="tabs workspace-tabs"
          id="demo-workspace"
          aria-label={`${roleLabel[workspaceRole]} workspace`}
        >
          {(["overview", "proposals", "agreements", "record"] as WorkspaceTab[]).map(
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
              <section className="card active-proposals-section">
                <div className="active-proposals-header">
                  <div>
                    <span className="eyebrow">Account proposals</span>
                    <h2>
                      {workspaceRole === "landlord"
                        ? "Your active proposals"
                        : "Invitations and proposals awaiting completion"}
                    </h2>
                    <p>
                      Only the latest active revision is shown. Earlier revisions remain in
                      the Record tab.
                    </p>
                  </div>
                  <button
                    className="refresh-icon-button"
                    type="button"
                    aria-label="Refresh account proposals"
                    title="Refresh account proposals"
                    disabled={isScanning || isFinding}
                    onClick={() => void findProposalsAndAgreements()}
                  >
                    <span aria-hidden="true">↻</span>
                  </button>
                </div>
                {renderSavedProposalCards()}
                {scanMessage && <p className="tx-success">{scanMessage}</p>}
                {findError && <p className="tx-error">{findError}</p>}
                {scanError && <p className="tx-error">{scanError}</p>}
              </section>
              {workspaceRole === "landlord" && !inviteRole && (
                <section className="proposal-composer-launcher">
                  {!isProposalComposerOpen ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => {
                        setActiveLandlordAccess(null);
                        setIsProposalComposerOpen(true);
                        window.requestAnimationFrame(() => {
                          document
                            .getElementById("proposal-builder")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        });
                      }}
                    >
                      Start a new proposal
                    </button>
                  ) : (
                    <>
                      <div className="proposal-composer-toolbar">
                        <span>
                          {activeLandlordAccess
                            ? "Editing the selected proposal"
                            : "Creating a new proposal"}
                        </span>
                        <button
                          className="btn btn-ghost small"
                          type="button"
                          onClick={() => {
                            setActiveLandlordAccess(null);
                            setIsProposalComposerOpen(false);
                          }}
                        >
                          Close proposal editor
                        </button>
                      </div>
                      <CreateAgreementForm
                        key={activeLandlordAccess?.proposalId || "new-landlord-proposal"}
                        initialAccess={activeLandlordAccess}
                      />
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {workspaceRole && tab === "agreements" && (
        <div className="workspace-panel" aria-label={workspaceTabLabels.agreements}>
          {renderAgreementWorkspace()}
        </div>
      )}

      {workspaceRole && tab === "record" && (
        <div className="workspace-panel" aria-label={workspaceTabLabels.record}>
          {renderRecordWorkspace()}
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
