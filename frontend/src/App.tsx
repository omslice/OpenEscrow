import {
  lazy,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useIdentityToken } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Layout, type AppNotification } from "./components/Layout";
import type {
  AgreementFocusRequest,
  AgreementPanel,
} from "./components/AgreementCard";
import { useTrackedAgreements } from "./lib/useTrackedAgreements";
import { useDiscoverAgreements } from "./lib/useDiscoverAgreements";
import { PublicIntro } from "./components/PublicIntro";
import { AccountCenter } from "./components/AccountCenter";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
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
  updateRecordArchivePreference,
  type NegotiationAccess,
  type NegotiationRecord,
} from "./lib/negotiations";
import { agreementReference, proposalReference } from "./lib/displayIds";
import { ARBITER_UI_ENABLED } from "./lib/featureFlags";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { useOnchainActivityNotifications } from "./lib/useOnchainActivityNotifications";
import { preferredScrollBehavior } from "./lib/accessibility";
import { startVisibilityAwarePolling } from "./lib/visiblePolling";
import "./App.css";

const AgreementCard = lazy(() =>
  import("./components/AgreementCard").then((module) => ({
    default: module.AgreementCard,
  })),
);
const AgreementNegotiation = lazy(() =>
  import("./components/AgreementNegotiation").then((module) => ({
    default: module.AgreementNegotiation,
  })),
);
const AgreementOnchainActivity = lazy(() =>
  import("./components/AgreementOnchainActivity").then((module) => ({
    default: module.AgreementOnchainActivity,
  })),
);
const CreateAgreementForm = lazy(() =>
  import("./components/CreateAgreementForm").then((module) => ({
    default: module.CreateAgreementForm,
  })),
);
const RecordSnapshotControls = lazy(() =>
  import("./components/RecordSnapshotControls").then((module) => ({
    default: module.RecordSnapshotControls,
  })),
);
const TenantLandlordInvite = lazy(() =>
  import("./components/TenantLandlordInvite").then((module) => ({
    default: module.TenantLandlordInvite,
  })),
);
const TestFunds = lazy(() =>
  import("./components/TestFunds").then((module) => ({
    default: module.TestFunds,
  })),
);

type WorkspaceTab = "overview" | "proposals" | "agreements" | "record";
type SavedProposal = { access: NegotiationAccess; record: NegotiationRecord };
const WORKSPACE_TABS: WorkspaceTab[] = [
  "overview",
  "proposals",
  "agreements",
  "record",
];

function savedRecordKey(item: SavedProposal) {
  return `proposal:${item.access.proposalId}:${item.access.role}`;
}

function onchainRecordKey(agreementId: bigint | string) {
  return `onchain:${agreementId.toString()}`;
}

function WorkspaceToolFallback({ label }: { label: string }) {
  return (
    <p className="field-help workspace-tool-loading" role="status">
      {label}
    </p>
  );
}

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

function mergeAgreementIds(primary: bigint[], secondary: bigint[]) {
  const ids = [...primary];
  for (const id of secondary) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function AppView({ identityToken = null }: { identityToken?: string | null }) {
  const [initialCapturedAccess] = useState(() => captureNegotiationAccessFromUrl());
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const workspaceTabRefs = useRef<Partial<Record<WorkspaceTab, HTMLButtonElement | null>>>(
    {},
  );
  const proposalOpenerRef = useRef<HTMLElement | null>(null);
  const { ids, addId, removeId } = useTrackedAgreements();
  const { address } = useAccount();
  const { discover, isScanning, scanError } = useDiscoverAgreements();
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const [savedRecords, setSavedRecords] = useState<SavedProposal[]>([]);
  const [expandedRecordKeys, setExpandedRecordKeys] = useState<Record<string, boolean>>(
    {},
  );
  const [isRecordArchiveOpen, setIsRecordArchiveOpen] = useState(false);
  const [isProposalArchiveOpen, setIsProposalArchiveOpen] = useState(false);
  const [recordArchivePendingKey, setRecordArchivePendingKey] = useState<string | null>(
    null,
  );
  const [recordArchiveError, setRecordArchiveError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [recordArchiveAnnouncement, setRecordArchiveAnnouncement] = useState<
    string | null
  >(null);
  const [agreementPanels, setAgreementPanels] = useState<
    Record<string, AgreementPanel>
  >({});
  const [agreementFocusRequests, setAgreementFocusRequests] = useState<
    Record<string, AgreementFocusRequest>
  >({});
  const [unavailableAgreementIds, setUnavailableAgreementIds] = useState<
    Set<string>
  >(() => new Set());
  const finalizedProposals = compactActiveProposals(
    savedRecords.filter((item) => item.record.status === "finalized"),
  );
  const participantAgreementIds = finalizedProposals.flatMap(({ record }) =>
    record.onchainAgreementId ? [BigInt(record.onchainAgreementId)] : [],
  );
  const discoveredAgreementIds = ACCOUNT_AUTH_ENABLED
    ? mergeAgreementIds(participantAgreementIds, ids)
    : ids;
  const displayedIds = discoveredAgreementIds.filter(
    (id) => !unavailableAgreementIds.has(id.toString()),
  );
  const notificationAgreementIds = displayedIds;
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
      const targetId = workspaceRole ? "demo-workspace" : "role-workspace";
      document.getElementById(targetId)?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: "start",
      });
    });
  };

  function handleWorkspaceTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: WorkspaceTab,
  ) {
    const currentIndex = WORKSPACE_TABS.indexOf(currentTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = WORKSPACE_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = WORKSPACE_TABS[nextIndex];
    setTab(nextTab);
    window.requestAnimationFrame(() => workspaceTabRefs.current[nextTab]?.focus());
  }

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
    setExpandedRecordKeys({});
    setIsRecordArchiveOpen(false);
    setRecordArchivePendingKey(null);
    setRecordArchiveError(null);
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

    const stopPolling = startVisibilityAwarePolling({
      callback: refreshSavedProposals,
      intervalMs: 15_000,
      visibilityTarget: document,
      timers: window,
    });
    return () => {
      active = false;
      stopPolling();
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

  function refreshOverviewData() {
    void findProposalsAndAgreements();
  }

  function openSavedProposal(item: SavedProposal) {
    if (
      item.record.status === "finalized" &&
      item.record.onchainAgreementId
    ) {
      const agreementId = item.record.onchainAgreementId;
      addId(BigInt(agreementId));
      setProposalAccess(null);
      setActiveLandlordAccess(null);
      setIsProposalComposerOpen(false);
      setTab("agreements");
      setAgreementPanels((current) => ({
        ...current,
        [agreementId]: "summary",
      }));
      setAgreementFocusRequests((current) => ({
        ...current,
        [agreementId]: {
          targetId: `agreement-${agreementId}-panel-summary`,
          nonce: (current[agreementId]?.nonce || 0) + 1,
        },
      }));
      return;
    }
    if (item.access.role === "landlord") {
      if (document.activeElement instanceof HTMLElement) {
        proposalOpenerRef.current = document.activeElement;
      }
      setActiveLandlordAccess(item.access);
      setIsProposalComposerOpen(true);
      setTab("proposals");
      window.requestAnimationFrame(() => {
        const builder = document.getElementById("proposal-builder");
        builder?.scrollIntoView({ behavior: preferredScrollBehavior() });
        builder?.focus({ preventScroll: true });
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
      target?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: "start",
      });
      target?.focus({ preventScroll: true });
    }, 80);
  }

  function openProposalNotification(item: SavedProposal, action: string) {
    const agreementId = item.record.onchainAgreementId;
    if (isRecordAction(action)) {
      if (agreementId) addId(BigInt(agreementId));
      setExpandedRecordKeys((current) => ({
        ...current,
        [savedRecordKey(item)]: true,
      }));
      if (item.access.archived) setIsRecordArchiveOpen(true);
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
    setExpandedRecordKeys((current) => ({
      ...current,
      [onchainRecordKey(agreementId)]: true,
    }));
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

  async function setRecordArchived(item: SavedProposal, archived: boolean) {
    if (!identityToken) {
      setRecordArchiveError({
        key: savedRecordKey(item),
        message: "Sign in with Google or a wallet to save record archive preferences.",
      });
      return;
    }
    const key = savedRecordKey(item);
    setRecordArchivePendingKey(key);
    setRecordArchiveError(null);
    setRecordArchiveAnnouncement(null);
    try {
      const result = await updateRecordArchivePreference(
        identityToken,
        item.access,
        archived,
      );
      setSavedRecords((current) =>
        current.map((candidate) =>
          savedRecordKey(candidate) === key
            ? {
                ...candidate,
                access: { ...candidate.access, archived: result.archived },
              }
          : candidate,
        ),
      );
      setSavedProposals((current) =>
        current.map((candidate) =>
          savedRecordKey(candidate) === key
            ? {
                ...candidate,
                access: { ...candidate.access, archived: result.archived },
              }
            : candidate,
        ),
      );
      if (archived) {
        setExpandedRecordKeys((current) => ({ ...current, [key]: false }));
        if (tab === "record") {
          setIsRecordArchiveOpen(true);
        } else if (tab === "proposals") {
          setIsProposalArchiveOpen(true);
        }
      }
      setRecordArchiveAnnouncement(
        `${proposalReference(item.record.id)} ${archived ? "archived" : "restored"}.`,
      );
      window.requestAnimationFrame(() => {
        const activePanel = document.getElementById(`workspace-panel-${tab}`);
        const restoredCard = Array.from(
          activePanel?.querySelectorAll<HTMLElement>("[data-record-key]") || [],
        ).find((element) => element.dataset.recordKey === key);
        const archiveSummary =
          tab === "record"
            ? document.getElementById("record-archive-summary")
            : document.getElementById("proposal-archive-summary");
        const focusTarget = archived ? archiveSummary : restoredCard;
        focusTarget?.focus({ preventScroll: true });
        focusTarget?.scrollIntoView({
          behavior: preferredScrollBehavior(),
          block: "nearest",
        });
      });
    } catch (error) {
      setRecordArchiveError({
        key,
        message:
          error instanceof Error
            ? error.message
            : "This item could not be moved between current and archived views.",
      });
    } finally {
      setRecordArchivePendingKey(null);
    }
  }

  const notifications: AppNotification[] = [
    ...savedProposals.filter((item) => !item.access.archived).flatMap((item) =>
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

  const currentSavedProposals = savedProposals.filter(
    (item) => !item.access.archived,
  );
  const activeProposals = currentSavedProposals.filter(
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
          agreements: "Deposits",
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
  const sortedAccountProposals = [...savedRecords].sort(
    (left, right) =>
      new Date(right.record.updatedAt).getTime() -
      new Date(left.record.updatedAt).getTime(),
  );
  const currentAccountProposals = sortedAccountProposals.filter(
    (item) =>
      !item.access.archived &&
      item.record.status !== "cancelled" &&
      item.record.status !== "superseded",
  );
  const archivedAccountProposals = sortedAccountProposals.filter(
    (item) => item.access.archived,
  );
  const workspaceTabIcons = {
    overview: "🏠",
    proposals:
      workspaceRole === "landlord"
        ? "📝"
        : workspaceRole === "tenant"
          ? "📬"
          : "📂",
    agreements:
      workspaceRole === "landlord" ? "💼" : workspaceRole === "tenant" ? "🏦" : "⚖️",
    record: "📜",
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
        {scanMessage && (
          <p className="tx-success" role="status">
            {scanMessage}
          </p>
        )}
        {findError && (
          <p className="tx-error" role="alert">
            {findError}
          </p>
        )}
        {scanError && (
          <p className="tx-error" role="alert">
            {scanError}
          </p>
        )}
      </section>
    );
  }

  function renderSavedProposalCards(
    accountProposals: SavedProposal[],
    archived = false,
  ) {
    if (accountProposals.length === 0) {
      return (
        <div className="workspace-empty">
          <strong>
            {archivedAccountProposals.length
              ? "All active and finalized proposals are archived."
              : "No active or finalized proposals found."}
          </strong>
          <span>
            {archivedAccountProposals.length
              ? "Open Archived proposals below to review or restore them."
              : workspaceRole === "landlord"
                ? "Use Start a new proposal below, or refresh after another party responds."
                : "Accepted invitations and proposals associated with this account will appear here."}
          </span>
        </div>
      );
    }
    return accountProposals.map((item) => {
      const counterpart =
        item.access.role === "landlord"
          ? item.record.tenantEmail
          : item.record.landlordEmail;
      const isFinalized =
        item.record.status === "finalized" &&
        Boolean(item.record.onchainAgreementId);
      const isReadyForLandlord =
        item.access.role === "landlord" && item.record.status === "ready";
      return (
        <article
          className={`saved-proposal-card${
            isReadyForLandlord ? " ready-to-finalize" : ""
          }${isFinalized ? " is-finalized" : ""}${
            archived ? " is-archived" : ""
          }`}
          key={`${item.access.proposalId}-${item.access.role}`}
          data-record-key={savedRecordKey(item)}
          tabIndex={-1}
        >
          <div className="proposal-builder-heading">
            <div>
              <span className="eyebrow">
                {isFinalized ? "Finalized proposal" : "Current proposal"} ·{" "}
                {roleLabel[item.access.role]} access
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
              {isFinalized
                ? "Open active deposit"
                : isReadyForLandlord
                  ? "Review and finalize"
                  : "Open proposal"}
            </button>
            {identityToken && (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={recordArchivePendingKey === savedRecordKey(item)}
                onClick={() => void setRecordArchived(item, !archived)}
              >
                {recordArchivePendingKey === savedRecordKey(item)
                  ? archived
                    ? "Restoring..."
                    : "Archiving..."
                  : archived
                    ? "Restore"
                    : "Archive"}
              </button>
            )}
          </div>
          {recordArchiveError?.key === savedRecordKey(item) && (
            <p className="tx-error record-archive-error" role="alert">
              {recordArchiveError.message}
            </p>
          )}
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
            <DeferredLoadBoundary
              area="workspace"
              key={id.toString()}
              fallback={<WorkspaceToolFallback label="Loading deposit details..." />}
            >
              <AgreementCard
                id={id}
                onRemove={() => removeId(id)}
                onUnavailable={() => {
                  removeId(id);
                  setUnavailableAgreementIds((current) => {
                    const key = id.toString();
                    if (current.has(key)) return current;
                    const next = new Set(current);
                    next.add(key);
                    return next;
                  });
                }}
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
            </DeferredLoadBoundary>
          );
        })}
        {workspaceRole === "tenant" && (
          <DeferredLoadBoundary
            area="workspace"
            fallback={<WorkspaceToolFallback label="Loading test funding..." />}
          >
            <TestFunds />
          </DeferredLoadBoundary>
        )}
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
    const sortedRecords = [...savedRecords].sort(
      (left, right) =>
        new Date(right.record.updatedAt).getTime() -
        new Date(left.record.updatedAt).getTime(),
    );
    const currentRecords = sortedRecords.filter((item) => !item.access.archived);
    const archivedRecords = sortedRecords.filter((item) => item.access.archived);
    const currentRecordKeys = [
      ...currentRecords.map(savedRecordKey),
      ...unlinkedAgreementIds.map((id) => onchainRecordKey(id)),
    ];
    const hasCurrentRecord = currentRecordKeys.length > 0;
    const allCurrentRecordsExpanded = hasCurrentRecord
      ? currentRecordKeys.every((key) => Boolean(expandedRecordKeys[key]))
      : false;

    function setCurrentRecordListExpanded(expanded: boolean) {
      setExpandedRecordKeys((current) => {
        const next = { ...current };
        if (!expanded) {
          for (const key of currentRecordKeys) {
            delete next[key];
          }
          return next;
        }
        for (const key of currentRecordKeys) {
          next[key] = true;
        }
        return next;
      });
    }

    function renderSavedRecordCard(item: SavedProposal, archived: boolean) {
      const agreementId = item.record.onchainAgreementId;
      const isFinalized =
        item.record.status === "finalized" && Boolean(agreementId);
      const key = savedRecordKey(item);
      const expanded = Boolean(expandedRecordKeys[key]);
      const contentId = `record-content-${item.record.id}-${item.access.role}`;
      return (
        <article
          className={`card record-workspace-card record-list-item${
            archived ? " is-archived" : ""
          }`}
          id={
            agreementId
              ? `record-agreement-${agreementId}`
              : `record-proposal-${item.record.id}`
          }
          key={`${item.access.proposalId}-${item.access.role}`}
          role="listitem"
          data-record-key={key}
          tabIndex={-1}
        >
          <header className="record-workspace-header record-list-row">
            <button
              className="record-expand-button"
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() =>
                setExpandedRecordKeys((current) => ({
                  ...current,
                  [key]: !expanded,
                }))
              }
            >
              <span className="record-list-identity">
                <span className="eyebrow">
                  {isFinalized ? "Finalized agreement record" : "Proposal record"}
                </span>
                <strong>
                  {agreementId
                    ? agreementReference(agreementId)
                    : proposalReference(item.record.id)}
                </strong>
                <small>
                  {agreementId
                    ? `${proposalReference(item.record.id)} · onchain ID ${agreementId}`
                    : `Updated ${new Date(item.record.updatedAt).toLocaleDateString()}`}
                </small>
              </span>
              <span className="record-expand-label" aria-hidden="true">
                {expanded ? "Hide details" : "Show details"}
                <span className="record-expand-chevron">⌄</span>
              </span>
            </button>
            <div className="record-workspace-actions">
              <span className={`negotiation-status status-${item.record.status}`}>
                {item.record.status} · revision {item.record.revision}
              </span>
              {identityToken && (
                <button
                  className="btn btn-ghost small"
                  type="button"
                  disabled={recordArchivePendingKey === key}
                  onClick={() => void setRecordArchived(item, !archived)}
                >
                  {recordArchivePendingKey === key
                    ? archived
                      ? "Restoring..."
                      : "Archiving..."
                    : archived
                      ? "Restore"
                      : "Archive"}
                </button>
              )}
            </div>
          </header>
          {recordArchiveError?.key === key && (
            <p className="tx-error record-archive-error" role="alert">
              {recordArchiveError.message}
            </p>
          )}
          {expanded && (
            <div className="record-workspace-body" id={contentId}>
              <DeferredLoadBoundary
                area="workspace"
                fallback={<WorkspaceToolFallback label="Loading record tools..." />}
              >
                <RecordSnapshotControls
                  access={item.access}
                  agreementId={agreementId ? BigInt(agreementId) : undefined}
                />
              </DeferredLoadBoundary>
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
            </div>
          )}
        </article>
      );
    }

    function renderOnchainRecordCard(id: bigint) {
      const key = onchainRecordKey(id);
      const expanded = Boolean(expandedRecordKeys[key]);
      const contentId = `record-content-onchain-${id.toString()}`;
      return (
        <article
          className="card record-workspace-card record-list-item"
          id={`record-agreement-${id.toString()}`}
          key={`unlinked-${id.toString()}`}
          role="listitem"
          tabIndex={-1}
        >
          <header className="record-workspace-header record-list-row">
            <button
              className="record-expand-button"
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() =>
                setExpandedRecordKeys((current) => ({
                  ...current,
                  [key]: !expanded,
                }))
              }
            >
              <span className="record-list-identity">
                <span className="eyebrow">Onchain-only record</span>
                <strong>{agreementReference(id)}</strong>
                <small>Onchain agreement ID {id.toString()}</small>
              </span>
              <span className="record-expand-label" aria-hidden="true">
                {expanded ? "Hide details" : "Show details"}
                <span className="record-expand-chevron">⌄</span>
              </span>
            </button>
          </header>
          {expanded && (
            <div className="record-workspace-body" id={contentId}>
              <DeferredLoadBoundary
                area="workspace"
                fallback={<WorkspaceToolFallback label="Loading onchain record..." />}
              >
                <AgreementOnchainActivity agreementId={id} isParty={false} />
              </DeferredLoadBoundary>
            </div>
          )}
        </article>
      );
    }

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
        {currentRecords.length === 0 && unlinkedAgreementIds.length === 0 && (
          <div className="workspace-empty">
            <strong>
              {archivedRecords.length
                ? "All account records are archived."
                : "No account records found."}
            </strong>
            <span>
              {archivedRecords.length
                ? "Open Archived records below to review or restore them."
                : "Proposal history and finalized agreement activity will appear here."}
            </span>
          </div>
        )}
        {(currentRecords.length > 0 || unlinkedAgreementIds.length > 0) && (
          <div className="record-list-heading">
            <h3>Current records</h3>
            <span>
              {currentRecords.length + unlinkedAgreementIds.length}{" "}
              {currentRecords.length + unlinkedAgreementIds.length === 1
                ? "record"
                : "records"}
            </span>
            <div className="record-list-toolbar">
              <button
                className="btn btn-ghost small"
                type="button"
                onClick={() => setCurrentRecordListExpanded(true)}
                disabled={allCurrentRecordsExpanded || !hasCurrentRecord}
              >
                Expand all
              </button>
              <button
                className="btn btn-ghost small"
                type="button"
                onClick={() => setCurrentRecordListExpanded(false)}
                disabled={!allCurrentRecordsExpanded || !hasCurrentRecord}
              >
                Collapse all
              </button>
            </div>
          </div>
        )}
        <div className="record-list" role="list">
          {currentRecords.map((item) => renderSavedRecordCard(item, false))}
          {unlinkedAgreementIds.map(renderOnchainRecordCard)}
        </div>
        {archivedRecords.length > 0 && (
          <details
            className="record-archive-section"
            open={isRecordArchiveOpen}
            onToggle={(event) => setIsRecordArchiveOpen(event.currentTarget.open)}
          >
            <summary id="record-archive-summary">
              Archived records ({archivedRecords.length})
            </summary>
            <p>
              Archiving only removes a record from your current list. It does not delete
              the agreement, its audit trail, or another participant’s access.
            </p>
            <div className="record-list" role="list">
              {archivedRecords.map((item) => renderSavedRecordCard(item, true))}
            </div>
          </details>
        )}
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
            onClick={() => void refreshOverviewData()}
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
        {currentSavedProposals.length > 0 && (
          <section className="card overview-quick-access">
            <div className="workspace-section-heading">
              <span className="eyebrow">Quick start</span>
              <h2>Recent workspace items</h2>
              <p>
                Jump directly to the agreement or proposal that needs your next action.
              </p>
            </div>
            <div className="overview-quick-list">
              {currentSavedProposals.slice(0, 4).map((item) => (
                <button
                  key={item.record.id}
                  className="overview-quick-item"
                  type="button"
                  onClick={() => openSavedProposal(item)}
                >
                  <div>
                    <strong>
                      {item.record.terms.propertyAddress?.trim() || "Agreement draft"}
                    </strong>
                    <small>
                      {item.access.role === workspaceRole
                        ? `Your ${roleLabel[item.access.role]} view`
                        : `${roleLabel[item.access.role]} view`}
                      {" · "}
                      {item.record.status}
                    </small>
                  </div>
                  <span aria-hidden="true">Open</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {notifications.length > 0 && (
          <section className="card overview-quick-access">
            <div className="workspace-section-heading">
              <span className="eyebrow">Live updates</span>
              <h2>Recent agreement activity</h2>
              <p>Open notifications directly from the stream below.</p>
            </div>
            <div className="overview-quick-list">
              {notifications.slice(0, 4).map((notification) => (
                <button
                  key={notification.id}
                  className="overview-quick-item"
                  type="button"
                  onClick={() => notification.onOpen?.()}
                >
                  <div>
                    <strong>{notification.actor}</strong>
                    <small>{notification.summary}</small>
                  </div>
                  <span aria-hidden="true">Open</span>
                </button>
              ))}
            </div>
          </section>
        )}
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
        {workspaceRole === "tenant" && !inviteRole && (
          <div className="overview-invite-section">
            <DeferredLoadBoundary
              area="workspace"
              fallback={<WorkspaceToolFallback label="Loading invitation tools..." />}
            >
              <TenantLandlordInvite />
            </DeferredLoadBoundary>
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout notifications={notifications}>
      <PublicIntro onStart={startDemo} />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {recordArchiveAnnouncement}
      </p>
      {!inviteRole && workspaceRole && !isChangingRole && (
        <AccountCenter
          workspaceRole={roleLabel[workspaceRole]}
          onChangeWorkspaceRole={() => setIsChangingRole(true)}
        />
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
      {(inviteRole || !workspaceRole || isChangingRole) && (
        <AccountCenter />
      )}

      {workspaceRole && (
        <nav
          className="tabs workspace-tabs"
          id="demo-workspace"
          role="tablist"
          aria-label={`${roleLabel[workspaceRole]} workspace`}
        >
          {WORKSPACE_TABS.map((workspaceTab) => (
              <button
                key={workspaceTab}
                ref={(element) => {
                  workspaceTabRefs.current[workspaceTab] = element;
                }}
                type="button"
                role="tab"
                id={`workspace-tab-${workspaceTab}`}
                className={tab === workspaceTab ? "tab active" : "tab"}
                aria-selected={tab === workspaceTab}
                aria-controls={`workspace-panel-${workspaceTab}`}
                tabIndex={tab === workspaceTab ? 0 : -1}
                title={`${workspaceTabLabels[workspaceTab]} tab`}
                onClick={() => setTab(workspaceTab)}
                onKeyDown={(event) =>
                  handleWorkspaceTabKeyDown(event, workspaceTab)
                }
              >
                <span className="tab-icon" aria-hidden="true">
                  {workspaceTabIcons[workspaceTab]}
                </span>
                <span className="tab-label">{workspaceTabLabels[workspaceTab]}</span>
                {workspaceTab === "proposals" && readyProposals.length > 0 && (
                  <span
                    className="tab-count"
                    aria-label={`${readyProposals.length} need attention`}
                  >
                    {readyProposals.length}
                  </span>
                )}
              </button>
            ))}
          {inviteRole && (
            <span className="invitation-tab-note">
              {roleLabel[inviteRole]} invitation · role locked
            </span>
          )}
        </nav>
      )}

      {workspaceRole && (
        <div
          id="workspace-panel-overview"
          role="tabpanel"
          aria-labelledby="workspace-tab-overview"
          tabIndex={0}
          hidden={tab !== "overview"}
        >
          {renderOverview()}
        </div>
      )}

      {workspaceRole && (
        <div
          id="workspace-panel-proposals"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-tab-proposals"
          tabIndex={0}
          hidden={tab !== "proposals"}
        >
          {proposalAccess ? (
            <>
              <button className="btn btn-ghost review-back" onClick={closeProposalReview}>
                Back to invitations and proposals
              </button>
              <DeferredLoadBoundary
                area="workspace"
                fallback={<WorkspaceToolFallback label="Loading proposal review..." />}
              >
                <AgreementNegotiation access={proposalAccess} />
              </DeferredLoadBoundary>
            </>
          ) : (
            <>
              <section className="card active-proposals-section">
                <div className="active-proposals-header">
                  <div>
                    <span className="eyebrow">Account proposals</span>
                    <h2>
                      {workspaceRole === "landlord"
                        ? "Your proposals"
                        : "Your invitations and proposals"}
                    </h2>
                    <p>
                      Pending and finalized proposals are listed here. Finalized proposals
                      open their active deposit; the complete revision history remains in the
                      Record tab.
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
                {renderSavedProposalCards(currentAccountProposals)}
                {archivedAccountProposals.length > 0 && (
                  <details
                    className="record-archive-section proposal-archive-section"
                    open={isProposalArchiveOpen}
                    onToggle={(event) =>
                      setIsProposalArchiveOpen(event.currentTarget.open)
                    }
                  >
                    <summary id="proposal-archive-summary">
                      Archived proposals ({archivedAccountProposals.length})
                    </summary>
                    <p>
                      Archived proposals stay available to you and can be restored at any
                      time. Archiving does not delete the proposal, deposit, or audit trail.
                    </p>
                    <div className="record-list proposal-archive-list">
                      {renderSavedProposalCards(archivedAccountProposals, true)}
                    </div>
                  </details>
                )}
                {scanMessage && (
                  <p className="tx-success" role="status">
                    {scanMessage}
                  </p>
                )}
                {findError && (
                  <p className="tx-error" role="alert">
                    {findError}
                  </p>
                )}
                {scanError && (
                  <p className="tx-error" role="alert">
                    {scanError}
                  </p>
                )}
              </section>
              {workspaceRole === "landlord" && !inviteRole && (
                <section className="proposal-composer-launcher">
                  {!isProposalComposerOpen ? (
                    <button
                      id="start-proposal-button"
                      className="btn btn-primary"
                      type="button"
                      onClick={(event) => {
                        proposalOpenerRef.current = event.currentTarget;
                        setActiveLandlordAccess(null);
                        setIsProposalComposerOpen(true);
                        window.requestAnimationFrame(() => {
                          const builder = document.getElementById("proposal-builder");
                          builder?.scrollIntoView({
                            behavior: preferredScrollBehavior(),
                            block: "start",
                          });
                          builder?.focus({ preventScroll: true });
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
                            const opener = proposalOpenerRef.current;
                            setActiveLandlordAccess(null);
                            setIsProposalComposerOpen(false);
                            window.requestAnimationFrame(() => {
                              if (opener?.isConnected) {
                                opener.focus();
                              } else {
                                document.getElementById("start-proposal-button")?.focus();
                              }
                            });
                          }}
                        >
                          Close proposal editor
                        </button>
                      </div>
                      <DeferredLoadBoundary
                        area="workspace"
                        fallback={<WorkspaceToolFallback label="Loading proposal editor..." />}
                      >
                        <CreateAgreementForm
                          key={activeLandlordAccess?.proposalId || "new-landlord-proposal"}
                          initialAccess={activeLandlordAccess}
                          focusOnMount
                        />
                      </DeferredLoadBoundary>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {workspaceRole && (
        <div
          id="workspace-panel-agreements"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-tab-agreements"
          tabIndex={0}
          hidden={tab !== "agreements"}
        >
          {tab === "agreements" && renderAgreementWorkspace()}
        </div>
      )}

      {workspaceRole && (
        <div
          id="workspace-panel-record"
          className="workspace-panel"
          role="tabpanel"
          aria-labelledby="workspace-tab-record"
          tabIndex={0}
          hidden={tab !== "record"}
        >
          {tab === "record" && renderRecordWorkspace()}
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
