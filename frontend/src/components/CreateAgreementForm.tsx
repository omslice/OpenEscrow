import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { decodeEventLog, isAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  DEPLOYMENT_BLOCK,
  MAX_CLAIM_WINDOW_OFFSET_SECONDS,
  MAX_PERIOD_SECONDS,
  MIN_PERIOD_SECONDS,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  USDC_ADDRESS,
  YIELD_USDC_ADDRESS,
  chain,
} from "../contracts/config";
import { formatUSDC, parseUSDC } from "../lib/format";
import {
  CALIFORNIA_POLICY,
  DEFAULT_COMPLIANCE_FACTS,
  GENERIC_TEST_POLICY,
  addressResolutionMatchesProfile,
  buildComplianceSnapshot,
  isJurisdictionCode,
  jurisdictionProfile,
  jurisdictionProfileForPostalCode,
  normalizeComplianceFacts,
  normalizeAddressResolution,
  rememberJurisdiction,
  type AddressResolution,
  type ComplianceFacts,
  type JurisdictionCode,
  type USJurisdictionProfile,
} from "../lib/jurisdictions";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  clearRecoveryJsonIf,
  isTransactionHash,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";
import {
  confirmBrowserAction,
  copyTextToClipboard,
} from "../lib/browserActions";
import { preferredScrollBehavior } from "../lib/accessibility";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  finalizationRecoveryKey,
  findAgreementFinalizationTransaction,
  type FinalizationRecoveryClient,
} from "../lib/finalizationTransaction";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import type { InviteRole } from "../lib/inviteContext";
import {
  checkComplianceSourceStatus,
  complianceSourceStatusSummary,
  type ComplianceSourceStatus,
} from "../lib/complianceSourceStatus";
import {
  buildNegotiationInviteUrl,
  addNegotiationTenant,
  removeNegotiationTenant,
  resetNegotiationArbiterInvite,
  resetNegotiationTenantInvite,
  sendNegotiationInvitation,
  validateNegotiationInvitation,
  updateNegotiationTenant,
  clearLandlordBundle,
  createNegotiation,
  loadNegotiation,
  negotiationAction,
  readLandlordBundle,
  rememberLandlordBundle,
  storeNegotiationAccess,
  type AgreementTerms,
  type CreatedNegotiation,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import { agreementReference } from "../lib/displayIds";
import { AddressAutocomplete, type AddressSuggestion } from "./AddressAutocomplete";
import { DepositAssetSelector } from "./DepositAssetSelector";
import {
  DEPOSIT_ASSET_IDS,
  createDepositAssetSnapshot,
  depositAssetAvailability,
  depositAssetIdFromTerms,
  getDepositAsset,
  type DepositAssetId,
} from "../../shared/deposit-assets.js";
import {
  ACCELERATED_REVIEW_TIMING_PROFILE,
  acceleratedReviewClaimWindowStart,
  agreementTimingSeconds,
  isAcceleratedReviewTiming,
} from "../../shared/testnet-review-timing.js";
import "./CreateAgreementFormTabs.css";

const DAY = 24 * 60 * 60;
const MAX_PERIOD_DAYS = MAX_PERIOD_SECONDS / DAY;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type PendingFinalization = {
  agreementId: string;
  transactionHash: `0x${string}`;
};

function isPendingFinalization(value: unknown): value is PendingFinalization {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.agreementId === "string" &&
    /^\d+$/.test(candidate.agreementId) &&
    isTransactionHash(candidate.transactionHash)
  );
}

function samePendingFinalization(
  value: unknown,
  expected: PendingFinalization,
) {
  return (
    isPendingFinalization(value) &&
    value.agreementId === expected.agreementId &&
    value.transactionHash.toLowerCase() ===
      expected.transactionHash.toLowerCase()
  );
}

type ProposalField =
  | "tenantName"
  | "tenantEmail"
  | "arbiterEmail"
  | "propertyAddress"
  | "monthlyRent"
  | "depositAsset"
  | "deposit"
  | "depositShares"
  | "claimWindowStart"
  | "claimDays"
  | "responseDays"
  | "arbiterDays"
  | "revisionSummary";

type ProposalValidationIssue = {
  field?: ProposalField;
  message: string;
};

type ProposalStep = "participants" | "terms" | "review";

const PROPOSAL_STEPS: Array<{
  id: ProposalStep;
  label: string;
  shortLabel: string;
}> = [
  { id: "participants", label: "Parties & property", shortLabel: "Parties" },
  { id: "terms", label: "Deposit terms", shortLabel: "Terms" },
  { id: "review", label: "Review & approvals", shortLabel: "Review" },
];

function proposalStepForField(field?: ProposalField): ProposalStep {
  if (!field || field === "revisionSummary") return "review";
  if (
    field === "tenantName" ||
    field === "tenantEmail" ||
    field === "arbiterEmail" ||
    field === "propertyAddress"
  ) {
    return "participants";
  }
  return "terms";
}

function validatePeriodDays(days: string, label: string): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be a positive number of days.`;
  const seconds = n * DAY;
  if (seconds < MIN_PERIOD_SECONDS) return `${label} is below the contract's minimum (5 minutes).`;
  if (seconds > MAX_PERIOD_SECONDS) return `${label} exceeds the contract's maximum (${MAX_PERIOD_DAYS} days).`;
  return null;
}

function hasFirstAndLastName(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function localDateTimeInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function serializedDateTimeValue(value: string): string {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
}

function defaultClaimWindowStart(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return localDateTimeInputValue(date);
}

function equalSplitBps(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(10000 / count);
  const remainder = 10000 - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function sharePercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

function percentToBps(value: string): number {
  return Math.round(Number(value) * 100);
}

function rebalanceShares(
  currentShares: number[],
  changedIndex: number,
  requestedBps: number,
): number[] {
  const count = currentShares.length;
  if (count <= 1) return count === 1 ? [10000] : [];

  const next = Array.from({ length: count }, (_, index) =>
    Number.isInteger(currentShares[index]) && currentShares[index] > 0
      ? currentShares[index]
      : 1,
  );
  const changedBps = Math.min(
    10000 - (count - 1),
    Math.max(1, Number.isFinite(requestedBps) ? Math.round(requestedBps) : 1),
  );
  next[changedIndex] = changedBps;

  const otherIndexes = next.map((_, index) => index).filter((index) => index !== changedIndex);
  const remaining = 10000 - changedBps;
  const distributable = remaining - otherIndexes.length;
  const weightTotal = otherIndexes.reduce((total, index) => total + next[index], 0);
  const allocations = otherIndexes.map((index) => {
    const exact = weightTotal > 0
      ? (distributable * next[index]) / weightTotal
      : distributable / otherIndexes.length;
    return { index, value: 1 + Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let leftover = remaining - allocations.reduce((total, item) => total + item.value, 0);
  for (const item of allocations.slice().sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {
    if (leftover <= 0) break;
    allocations.find((allocation) => allocation.index === item.index)!.value += 1;
    leftover -= 1;
  }
  allocations.forEach((item) => {
    next[item.index] = item.value;
  });
  return next;
}

function tenantFundingBreakdown(
  deposit: string,
  reserve: string,
  bps: number,
  tenantCount: number,
  tenantIndex: number,
) {
  try {
    const depositUnits = parseUSDC(deposit || "0");
    const reserveUnits = parseUSDC(reserve || "0");
    const depositShare = (depositUnits * BigInt(bps)) / 10000n;
    const count = BigInt(Math.max(tenantCount, 1));
    const baseReserve = reserveUnits / count;
    const remainder = reserveUnits % count;
    const reserveShare = baseReserve + (BigInt(tenantIndex) < remainder ? 1n : 0n);
    return {
      deposit: formatUSDC(depositShare),
      reserve: formatUSDC(reserveShare),
      total: formatUSDC(depositShare + reserveShare),
    };
  } catch {
    return { deposit: "0", reserve: "0", total: "0" };
  }
}

function tokenLabel(tokenChoice: "plain" | "yield") {
  return tokenChoice === "yield" ? "taUSDC" : "testUSDC";
}

function totalFundingAmount(deposit: string, reserve: string) {
  try {
    return formatUSDC(parseUSDC(deposit || "0") + parseUSDC(reserve || "0"));
  } catch {
    return "0";
  }
}

function readableComplianceDate(value: string | null | undefined): string {
  if (!value) return "Not checked yet";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(value.length === 10
      ? {}
      : { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  }).format(date);
}

function TenantFundingDue({
  deposit,
  reserve,
  bps,
  tenantCount,
  tenantIndex,
  tokenChoice,
}: {
  deposit: string;
  reserve: string;
  bps: number;
  tenantCount: number;
  tenantIndex: number;
  tokenChoice: "plain" | "yield";
}) {
  const amounts = tenantFundingBreakdown(
    deposit,
    reserve,
    bps,
    tenantCount,
    tenantIndex,
  );
  return (
    <small>
      Deposit {amounts.deposit} + reserve {amounts.reserve} ={" "}
      <strong>{amounts.total} {tokenLabel(tokenChoice)} total</strong>
    </small>
  );
}

function inviteContent(
  role: InviteRole,
  proposalId: string,
  token: string,
) {
  const inviteUrl = buildNegotiationInviteUrl(role, proposalId, token);
  const body = [
    `You have been invited to review an OpenEscrow security-deposit proposal as the ${role}.`,
    "",
    `Review the landlord's terms, propose changes, or approve the current revision here: ${inviteUrl}`,
    "",
    "Your invitation is locked to the role named above. OpenEscrow can create an EVM wallet when you sign in with Google, or you can connect your own wallet.",
    "",
    "Every proposal, requested change, approval, invitation action, and finalization is added to a timestamped running record.",
    "",
    "This is a Base Sepolia testnet demonstration. Do not send real funds.",
  ].join("\n");
  return {
    body,
    url: inviteUrl,
  };
}

function AgreementForm({
  landlordName,
  landlordEmail,
  initialAccess,
  focusOnMount,
  onTrackAgreement,
}: {
  landlordName: string;
  landlordEmail: string;
  initialAccess?: NegotiationAccess | null;
  focusOnMount?: boolean;
  onTrackAgreement: (id: bigint) => void;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const builderRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    builderRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantEmail, setNewTenantEmail] = useState("");
  const [pendingTenants, setPendingTenants] = useState<
    Array<{ name: string; email: string; depositShareBps: number }>
  >([]);
  const [showAdditionalTenant, setShowAdditionalTenant] = useState(false);
  const [showArbiter, setShowArbiter] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingTenantName, setEditingTenantName] = useState("");
  const [editingTenantEmail, setEditingTenantEmail] = useState("");
  const [arbiterName, setArbiterName] = useState("");
  const [arbiterEmail, setArbiterEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [selectedJurisdiction, setSelectedJurisdiction] =
    useState<USJurisdictionProfile | null>(null);
  const [addressResolution, setAddressResolution] = useState<AddressResolution | null>(null);
  const [complianceFacts, setComplianceFacts] = useState<ComplianceFacts>({
    ...DEFAULT_COMPLIANCE_FACTS,
  });
  const complianceSourceScope = useMemo(
    () =>
      createAsyncOperationScope(
        selectedJurisdiction
          ? `${selectedJurisdiction.code}:${selectedJurisdiction.version}`
          : "no-jurisdiction",
      ),
    [selectedJurisdiction],
  );
  const [complianceSourceResult, setComplianceSourceResult] =
    useState<ComplianceSourceStatus | null>(null);
  const [complianceSourceError, setComplianceSourceError] = useState<string | null>(
    null,
  );
  const [isCheckingComplianceSource, setIsCheckingComplianceSource] =
    useState(false);
  const [primaryTenantShareBps, setPrimaryTenantShareBps] = useState(10000);
  const [tenantShareDraft, setTenantShareDraft] = useState<Record<string, number>>({});
  const [deposit, setDeposit] = useState("100");
  const [monthlyRent, setMonthlyRent] = useState("");
  const operationsReserve = GENERIC_TEST_POLICY.operationsReserve;
  const [depositAssetId, setDepositAssetId] = useState<DepositAssetId>(
    DEPOSIT_ASSET_IDS.USDC,
  );
  const [yieldConsent, setYieldConsent] = useState(false);
  const selectedDepositAsset =
    getDepositAsset(depositAssetId) ?? getDepositAsset(DEPOSIT_ASSET_IDS.USDC)!;
  const tokenChoice =
    selectedDepositAsset.contractTokenChoice === "yield" ? "yield" : "plain";
  const [claimWindowStart, setClaimWindowStart] = useState(defaultClaimWindowStart);
  const [claimDays, setClaimDays] = useState<string>(GENERIC_TEST_POLICY.claimDays);
  const [responseDays, setResponseDays] = useState<string>(GENERIC_TEST_POLICY.responseDays);
  const [arbiterDays, setArbiterDays] = useState<string>(GENERIC_TEST_POLICY.arbiterDays);
  const [testnetTimingProfile, setTestnetTimingProfile] =
    useState<AgreementTerms["testnetTimingProfile"]>();
  const [draft, setDraft] = useState<NegotiationRecord | null>(null);
  const [accessBundle, setAccessBundle] = useState<CreatedNegotiation["access"] | null>(null);
  const [revisionSummary, setRevisionSummary] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [pendingFinalization, setPendingFinalization] =
    useState<PendingFinalization | null>(null);
  const [finalizationRecordError, setFinalizationRecordError] = useState<string | null>(null);
  const [isSavingFinalizationRecord, setIsSavingFinalizationRecord] =
    useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<ProposalField | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<Set<string>>(() => new Set());
  const persistedSentInviteKeys = draft
    ? [
        ...draft.tenants
          .filter((tenant) => Boolean(tenant.invitationSentAt))
          .map((tenant) => tenant.id),
        ...(draft.arbiterInvitationSentAt ? ["arbiter"] : []),
      ]
    : [];
  const persistedSentInviteKey = persistedSentInviteKeys.join("|");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPreflightingFinalization, setIsPreflightingFinalization] =
    useState(false);
  const [isEditingRevision, setIsEditingRevision] = useState(false);
  const [proposalStep, setProposalStep] = useState<ProposalStep>("participants");
  const submittedJurisdiction = useRef<JurisdictionCode>(GENERIC_TEST_POLICY.jurisdiction);
  const handledReceipt = useRef<`0x${string}` | null>(null);
  const finalizationRetryButton = useRef<HTMLButtonElement>(null);
  const pendingFinalizationStored = useRef(true);

  useEffect(() => {
    setSentInvites(
      new Set(
        persistedSentInviteKey ? persistedSentInviteKey.split("|") : [],
      ),
    );
  }, [draft?.id, draft?.revision, persistedSentInviteKey]);

  function confirmProposalChange(message: string) {
    setFormError(null);
    try {
      return confirmBrowserAction(message);
    } catch (cause) {
      setFormMessage(null);
      setFormError(
        cause instanceof Error
          ? cause.message
          : "This browser could not show the confirmation prompt. Try again.",
      );
      return false;
    }
  }

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const {
    data: receipt,
    isLoading: isMining,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });
  const claimWindowHasPassed =
    Boolean(claimWindowStart) && new Date(claimWindowStart).getTime() <= Date.now();
  const acceleratedReviewTiming = isAcceleratedReviewTiming({
    testnetTimingProfile,
  });
  const approvedTermsLocked =
    Boolean(
      draft &&
        (draft.tenants.some((tenant) => tenant.approved) ||
          (draft.arbiterEmail && draft.arbiterApproved)),
    ) && !isEditingRevision;
  const compliancePreview =
    selectedJurisdiction && addressResolution
      ? buildComplianceSnapshot(
          selectedJurisdiction,
          addressResolution,
          complianceFacts,
        )
      : null;
  const complianceSourceSelectionKey = compliancePreview
    ? compliancePreview.overlays
        .map((overlay) => `${overlay.id}:${overlay.version}`)
        .join("|")
    : "no-compliance-preview";

  useEffect(() => {
    complianceSourceScope.open();
    setComplianceSourceResult(null);
    setComplianceSourceError(null);
    setIsCheckingComplianceSource(false);
    return () => complianceSourceScope.close();
  }, [complianceSourceScope, complianceSourceSelectionKey]);

  async function refreshComplianceSource() {
    if (!selectedJurisdiction || !compliancePreview) return;
    const operationId = complianceSourceScope.start();
    setComplianceSourceResult(null);
    setComplianceSourceError(null);
    setIsCheckingComplianceSource(true);
    try {
      const result = await checkComplianceSourceStatus(
        selectedJurisdiction.code,
        selectedJurisdiction.version,
        [
          {
            citation: selectedJurisdiction.statuteCitation,
            url: selectedJurisdiction.statuteUrl,
          },
          ...compliancePreview.overlays.flatMap((overlay) => overlay.sources),
        ],
        compliancePreview.overlays.map((overlay) => ({
          id: overlay.id,
          version: overlay.version,
        })),
      );
      if (!complianceSourceScope.isCurrent(operationId)) return;
      setComplianceSourceResult(result);
    } catch (cause) {
      if (!complianceSourceScope.isCurrent(operationId)) return;
      setComplianceSourceError(
        cause instanceof Error
          ? cause.message
          : "OpenEscrow could not check the official source right now. Try again later.",
      );
    } finally {
      if (complianceSourceScope.isCurrent(operationId)) {
        setIsCheckingComplianceSource(false);
      }
    }
  }

  const landlordAccess = useMemo<NegotiationAccess | null>(
    () =>
      draft && accessBundle
        ? { proposalId: draft.id, role: "landlord", token: accessBundle.landlord }
        : null,
    [draft, accessBundle],
  );
  const pendingFinalizationKey =
    landlordAccess && address
      ? finalizationRecoveryKey({
          proposalId: landlordAccess.proposalId,
          role: "landlord",
          address,
        })
      : null;
  const finalizationScopeKey = JSON.stringify([
    landlordAccess?.proposalId || null,
    landlordAccess?.role || null,
    address?.toLowerCase() || null,
  ]);
  const finalizationScope = useMemo(
    () => createAsyncOperationScope(finalizationScopeKey),
    [finalizationScopeKey],
  );

  useEffect(() => {
    finalizationScope.open();
    setIsSavingFinalizationRecord(false);
    setIsPreflightingFinalization(false);
    return () => finalizationScope.close();
  }, [finalizationScope]);

  const saveFinalizationRecord = useCallback(
    async (agreementId: string, transactionHash: `0x${string}`) => {
      if (!landlordAccess) return;
      const operationId = finalizationScope.start();
      setFinalizationRecordError(null);
      setIsSavingFinalizationRecord(true);
      const expected: PendingFinalization = {
        agreementId,
        transactionHash,
      };
      try {
        const updated = await negotiationAction(landlordAccess, {
          type: "finalize",
          agreementId,
          transactionHash,
        });
        if (!finalizationScope.isCurrent(operationId)) return;
        setDraft(updated);
        if (pendingFinalizationKey) {
          clearRecoveryJsonIf(
            pendingFinalizationKey,
            (value) => samePendingFinalization(value, expected),
          );
        }
        setPendingFinalization((current) =>
          samePendingFinalization(current, expected) ? null : current,
        );
      } catch (cause) {
        if (!finalizationScope.isCurrent(operationId)) return;
        const reloadWarning = pendingFinalizationStored.current
          ? " This safe retry is stored only for this proposal, landlord role, and wallet."
          : " This browser could not keep a reload-recovery copy, so keep this page open and retry now.";
        const failureDetail =
          cause instanceof Error
            ? `: ${cause.message.replace(/[.\s]+$/, "")}.`
            : ".";
        setFinalizationRecordError(
          `${agreementReference(agreementId)} was created on the test network, but its finalization still needs to be added to the Record${failureDetail}${reloadWarning}`,
        );
      } finally {
        if (finalizationScope.isCurrent(operationId)) {
          setIsSavingFinalizationRecord(false);
        }
      }
    },
    [finalizationScope, landlordAccess, pendingFinalizationKey],
  );

  useEffect(() => {
    if (!landlordAccess || !pendingFinalizationKey) return;
    const stored = readRecoveryJson(
      pendingFinalizationKey,
      isPendingFinalization,
    );
    if (stored) {
      pendingFinalizationStored.current = true;
      setPendingFinalization(stored);
      void saveFinalizationRecord(stored.agreementId, stored.transactionHash);
    }
  }, [
    landlordAccess,
    pendingFinalizationKey,
    saveFinalizationRecord,
  ]);

  useEffect(() => {
    if (
      pendingFinalization &&
      finalizationRecordError &&
      !isSavingFinalizationRecord
    ) {
      finalizationRetryButton.current?.focus({ preventScroll: true });
    }
  }, [
    finalizationRecordError,
    isSavingFinalizationRecord,
    pendingFinalization,
  ]);

  const queueFinalizationRecord = useCallback(
    (
      agreementId: bigint,
      transactionHash: `0x${string}`,
      jurisdiction: JurisdictionCode,
    ) => {
      const pending: PendingFinalization = {
        agreementId: agreementId.toString(),
        transactionHash,
      };
      setCreatedId(agreementId);
      rememberJurisdiction(agreementId, jurisdiction);
      onTrackAgreement(agreementId);
      setPendingFinalization(pending);
      pendingFinalizationStored.current = Boolean(
        pendingFinalizationKey &&
          writeRecoveryJson(pendingFinalizationKey, pending),
      );
      void saveFinalizationRecord(pending.agreementId, transactionHash);
    },
    [onTrackAgreement, pendingFinalizationKey, saveFinalizationRecord],
  );

  function applyTerms(record: NegotiationRecord) {
    const isLegacyCalifornia =
      record.terms.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
      record.terms.policyVersion === CALIFORNIA_POLICY.version;
    const savedProfile = jurisdictionProfile(record.terms.jurisdiction);
    setSelectedJurisdiction(
      savedProfile?.version === record.terms.policyVersion ? savedProfile : null,
    );
    setTenantName(record.tenantName || "");
    setTenantEmail(record.tenantEmail);
    setArbiterName(record.arbiterName || "");
    setArbiterEmail(record.arbiterEmail || "");
    setShowArbiter(Boolean(record.arbiterEmail));
    setPropertyAddress(record.terms.propertyAddress || "");
    setAddressResolution(normalizeAddressResolution(record.terms.addressResolution));
    setComplianceFacts(normalizeComplianceFacts(record.terms.complianceFacts));
    setTenantShareDraft(
      Object.fromEntries(
        record.tenants.map((tenant) => [tenant.id, tenant.depositShareBps]),
      ),
    );
    setDeposit(record.terms.deposit);
    setMonthlyRent(record.terms.monthlyRent || "");
    setDepositAssetId(depositAssetIdFromTerms(record.terms));
    setYieldConsent(record.terms.yieldConsent === true);
    setClaimWindowStart(
      localDateTimeInputValue(new Date(record.terms.claimWindowStart)),
    );
    setClaimDays(
      isLegacyCalifornia ? GENERIC_TEST_POLICY.claimDays : record.terms.claimDays,
    );
    setResponseDays(
      isLegacyCalifornia ? GENERIC_TEST_POLICY.responseDays : record.terms.responseDays,
    );
    setArbiterDays(
      isLegacyCalifornia ? GENERIC_TEST_POLICY.arbiterDays : record.terms.arbiterDays,
    );
    setTestnetTimingProfile(record.terms.testnetTimingProfile);
    setProposalStep(
      record.status === "ready" || record.status === "finalized"
        ? "review"
        : "participants",
    );
  }

  useEffect(() => {
    const saved = initialAccess?.proposalId
      ? readLandlordBundle(initialAccess.proposalId)
      : null;
    const access: NegotiationAccess | null =
      initialAccess?.role === "landlord"
        ? initialAccess
        : null;
    if (!access) return;
    if (draft?.id === access.proposalId) {
      setAccessBundle((current) => {
        if (current?.landlord === access.token) return current;
        return current
          ? { ...current, landlord: access.token }
          : {
              landlord: access.token,
              tenant: "",
              tenants: [],
              arbiter: null,
            };
      });
      setFormError((current) =>
        current === "This proposal link is invalid or no longer available." ? null : current,
      );
      return;
    }
    loadNegotiation(access)
      .then((record) => {
        setDraft(record);
        setAccessBundle({
          ...(saved?.access || {
            tenant: "",
            tenants: [],
            arbiter: null,
          }),
          landlord: access.token,
        });
        setFormError(null);
        applyTerms(record);
      })
      .catch(() => {
        clearLandlordBundle(access.proposalId);
      });
  }, [draft?.id, initialAccess]);

  useEffect(() => {
    if (!receipt || handledReceipt.current === receipt.transactionHash) return;
    handledReceipt.current = receipt.transactionHash;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: OpenEscrowABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "AgreementProposed") {
          const id = (decoded.args as unknown as { id: bigint }).id;
          if (landlordAccess) {
            queueFinalizationRecord(
              id,
              receipt.transactionHash,
              submittedJurisdiction.current,
            );
          }
          break;
        }
      } catch {
        // Ignore logs emitted by other contracts in the transaction.
      }
    }
  }, [
    receipt,
    landlordAccess,
    queueFinalizationRecord,
  ]);

  function currentTerms(): AgreementTerms {
    const policy = selectedJurisdiction;
    return {
      jurisdiction: policy?.code ?? GENERIC_TEST_POLICY.jurisdiction,
      policyVersion: policy?.version ?? GENERIC_TEST_POLICY.version,
      tokenChoice,
      depositAssetId,
      depositAssetSnapshot: createDepositAssetSnapshot(depositAssetId) ?? undefined,
      yieldConsent: selectedDepositAsset.consentRequired ? yieldConsent : false,
      propertyAddress: propertyAddress.trim(),
      addressResolution,
      complianceFacts,
      complianceSnapshot:
        policy && addressResolution
          ? buildComplianceSnapshot(policy, addressResolution, complianceFacts)
          : null,
      deposit,
      operationsReserve: GENERIC_TEST_POLICY.operationsReserve,
      monthlyRent,
      smallLandlordException: false,
      tenantIsServiceMember: false,
      electronicDeliveryConsent: true,
      claimWindowStart: serializedDateTimeValue(claimWindowStart),
      claimDays: policy?.defaultClaimDays ?? claimDays,
      responseDays,
      arbiterDays,
      testnetTimingProfile,
    };
  }

  function validateDraft(): ProposalValidationIssue | null {
    if (ACCOUNT_AUTH_ENABLED && !landlordEmail) {
      return { message: "The landlord must link a verified email before creating a proposal." };
    }
    if (!hasFirstAndLastName(tenantName)) {
      return {
        field: "tenantName",
        message: "Enter the tenant’s legal first and last name.",
      };
    }
    if (!EMAIL_PATTERN.test(tenantEmail)) {
      return { field: "tenantEmail", message: "Enter a valid tenant email." };
    }
    if (propertyAddress.trim().length < 5) {
      return {
        field: "propertyAddress",
        message: "Enter the rental property address for this agreement.",
      };
    }
    if (
      selectedJurisdiction &&
      (!addressResolution ||
        !addressResolutionMatchesProfile(addressResolution, selectedJurisdiction) ||
        addressResolution.label !== propertyAddress.trim())
    ) {
      return {
        field: "propertyAddress",
        message: "Select the complete property address from the verified suggestions again.",
      };
    }
    if (selectedJurisdiction) {
      try {
        if (parseUSDC(monthlyRent || "0") <= 0n) {
          return {
            field: "monthlyRent",
            message:
              "Enter the monthly rent so OpenEscrow can evaluate the statewide deposit baseline.",
          };
        }
      } catch {
        return {
          field: "monthlyRent",
          message: "Enter a valid monthly rent.",
        };
      }
    }
    const assetAvailability = depositAssetAvailability(depositAssetId, {
      countryCode: addressResolution?.countryCode || "US",
    });
    if (!assetAvailability.available || !selectedDepositAsset.contractTokenChoice) {
      return {
        field: "depositAsset",
        message:
          assetAvailability.reason ||
          "The selected deposit asset is not supported by the current escrow contract.",
      };
    }
    if (selectedDepositAsset.consentRequired && !yieldConsent) {
      return {
        field: "depositAsset",
        message: `Affirmatively consent to the ${selectedDepositAsset.displayName} risks before saving this revision.`,
      };
    }
    const hasArbiter = arbiterEmail.trim() !== "";
    if (hasArbiter && !EMAIL_PATTERN.test(arbiterEmail)) {
      return {
        field: "arbiterEmail",
        message: "Enter a valid arbiter email, or leave it blank.",
      };
    }
    if (hasArbiter && tenantEmail.toLowerCase() === arbiterEmail.toLowerCase()) {
      return {
        field: "arbiterEmail",
        message: "Tenant and arbiter must use different emails.",
      };
    }
    if (
      tenantEmail.toLowerCase() === landlordEmail.toLowerCase() ||
      (hasArbiter && arbiterEmail.toLowerCase() === landlordEmail.toLowerCase())
    ) {
      return {
        field:
          tenantEmail.toLowerCase() === landlordEmail.toLowerCase()
            ? "tenantEmail"
            : "arbiterEmail",
        message: "Landlord, tenant, and arbiter must use different emails.",
      };
    }
    if (!claimWindowStart) {
      return {
        field: "claimWindowStart",
        message: "Expected possession-return date is required.",
      };
    }
    if (!draft) {
      const shares = [primaryTenantShareBps, ...pendingTenants.map((tenant) => tenant.depositShareBps)];
      if (
        shares.some((share) => !Number.isInteger(share) || share <= 0) ||
        shares.reduce((total, share) => total + share, 0) !== 10000
      ) {
        return {
          field: "depositShares",
          message: "Tenant deposit shares must be positive and total exactly 100%.",
        };
      }
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(new Date(claimWindowStart).getTime() / 1000);
    if (!Number.isFinite(startSec) || startSec <= nowSec) {
      return {
        field: "claimWindowStart",
        message:
          "The saved possession-return date has passed. Choose a future date before publishing this revision.",
      };
    }
    if (startSec - nowSec > MAX_CLAIM_WINDOW_OFFSET_SECONDS) {
      return {
        field: "claimWindowStart",
        message: "Expected possession-return date is too far in the future.",
      };
    }
    try {
      if (parseUSDC(deposit) <= 0n) {
        return { field: "deposit", message: "Deposit must be greater than zero." };
      }
    } catch {
      return { field: "deposit", message: "Invalid deposit amount." };
    }
    for (const [days, label, field] of [
      [claimDays, "Claim period", "claimDays"],
      [responseDays, "Response period", "responseDays"],
      [arbiterDays, "Arbiter ruling period", "arbiterDays"],
    ] as const) {
      const validation = validatePeriodDays(days, label);
      if (validation) return { field, message: validation };
    }
    return null;
  }

  function clearFieldIssue(field: ProposalField) {
    if (invalidField !== field) return;
    setInvalidField(null);
    setFormError(null);
  }

  function applyAcceleratedReviewTiming() {
    setTestnetTimingProfile(ACCELERATED_REVIEW_TIMING_PROFILE);
    setClaimWindowStart(
      localDateTimeInputValue(acceleratedReviewClaimWindowStart()),
    );
    clearFieldIssue("claimWindowStart");
    setFormError(null);
    setFormMessage(
      "Accelerated reviewer timing applied. The claim window starts in about one hour, followed by 30-minute claim, response, and arbiter periods.",
    );
  }

  function restoreStandardTiming() {
    setTestnetTimingProfile(undefined);
    setClaimWindowStart(defaultClaimWindowStart());
    clearFieldIssue("claimWindowStart");
    setFormError(null);
    setFormMessage(
      "Standard test timing restored. Review the possession-return date before publishing.",
    );
  }

  function reportIssue(issue: ProposalValidationIssue) {
    setFormMessage(null);
    setFormError(issue.message);
    setInvalidField(issue.field || null);
    setProposalStep(proposalStepForField(issue.field));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = issue.field
          ? document.querySelector<HTMLElement>(`[data-proposal-field="${issue.field}"]`)
          : document.getElementById("proposal-form-feedback");
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({
          behavior: preferredScrollBehavior(),
          block: "center",
        });
      });
    });
  }

  async function saveDraft() {
    setFormError(null);
    setFormMessage(null);
    setInvalidField(null);
    if (draft && revisionSummary.trim().length < 8) {
      return reportIssue({
        field: "revisionSummary",
        message: "Add a revision note of at least 8 characters describing what changed.",
      });
    }
    const validation = validateDraft();
    if (validation) return reportIssue(validation);

    setIsSavingDraft(true);
    try {
      if (!draft) {
        const created = await createNegotiation({
          landlordName,
          landlordEmail,
          tenantName,
          tenantEmail,
          tenants: [
            { name: tenantName, email: tenantEmail, depositShareBps: primaryTenantShareBps },
            ...pendingTenants,
          ],
          arbiterName,
          arbiterEmail: arbiterEmail.trim() || null,
          terms: currentTerms(),
        });
        setDraft(created.record);
        setAccessBundle(created.access);
        const access: NegotiationAccess = {
          proposalId: created.record.id,
          role: "landlord",
          token: created.access.landlord,
        };
        storeNegotiationAccess(access, true);
        rememberLandlordBundle(created);
        setPendingTenants([]);
        setShowAdditionalTenant(false);
        setTenantShareDraft(
          Object.fromEntries(
            created.record.tenants.map((tenant) => [tenant.id, tenant.depositShareBps]),
          ),
        );
        setFormMessage("Proposal saved. Invitations are now unlocked for this exact revision.");
        setProposalStep("review");
      } else {
        if (!landlordAccess) throw new Error("The landlord proposal access is unavailable.");
        const updated = await negotiationAction(landlordAccess, {
          type: "revise",
          summary: revisionSummary.trim(),
          terms: currentTerms(),
          participants: { landlordName, tenantName, arbiterName },
        });
        setDraft(updated);
        const refreshed = await rotateParticipantInvites(
          updated,
          accessBundle || {
            landlord: landlordAccess.token,
            tenant: "",
            tenants: [],
            arbiter: null,
          },
        );
        setDraft(refreshed.record);
        setAccessBundle(refreshed.access);
        setRevisionSummary("");
        setIsEditingRevision(false);
        setFormMessage(
          `Revision ${updated.revision} published. Prior approvals and links were reset; fresh review links are ready to send to every tenant${updated.arbiterEmail ? " and the arbiter" : ""}.`,
        );
        setProposalStep("review");
      }
    } catch (saveError) {
      reportIssue({
        message:
          saveError instanceof Error ? saveError.message : "The proposal could not be saved.",
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  function startAnotherProposal() {
    setDraft(null);
    setAccessBundle(null);
    setPendingTenants([]);
    setShowAdditionalTenant(false);
    setShowArbiter(false);
    setPropertyAddress("");
    setSelectedJurisdiction(null);
    setAddressResolution(null);
    setComplianceFacts({ ...DEFAULT_COMPLIANCE_FACTS });
    setMonthlyRent("");
    setPrimaryTenantShareBps(10000);
    setTenantShareDraft({});
    setClaimWindowStart(defaultClaimWindowStart());
    setTestnetTimingProfile(undefined);
    setClaimDays(GENERIC_TEST_POLICY.claimDays);
    setRevisionSummary("");
    setIsEditingRevision(false);
    setInvalidField(null);
    setFormError(null);
    setFormMessage("Ready to create a separate proposal.");
    goToProposalStep("participants");
  }

  function addOrReplaceTenant() {
    setDraft(null);
    setAccessBundle(null);
    setTenantName("");
    setTenantEmail("");
    setArbiterName("");
    setArbiterEmail("");
    setPendingTenants([]);
    setShowAdditionalTenant(false);
    setShowArbiter(false);
    setPropertyAddress("");
    setSelectedJurisdiction(null);
    setAddressResolution(null);
    setComplianceFacts({ ...DEFAULT_COMPLIANCE_FACTS });
    setMonthlyRent("");
    setPrimaryTenantShareBps(10000);
    setTenantShareDraft({});
    setClaimWindowStart(defaultClaimWindowStart());
    setTestnetTimingProfile(undefined);
    setClaimDays(GENERIC_TEST_POLICY.claimDays);
    setRevisionSummary("");
    setIsEditingRevision(false);
    setInvalidField(null);
    setFormError(null);
    setFormMessage(
      "Started a separate proposal for a new tenant. The existing approved record remains unchanged.",
    );
    goToProposalStep("participants");
  }

  async function addTenantReviewer() {
    setFormError(null);
    setFormMessage(null);
    const name = newTenantName.trim();
    const email = newTenantEmail.trim().toLowerCase();
    if (!hasFirstAndLastName(name)) {
      return setFormError("Enter the additional tenant’s legal first and last name.");
    }
    if (!EMAIL_PATTERN.test(email)) {
      return setFormError("Enter a valid email such as tenant@example.com.");
    }
    const reservedEmails = [
      landlordEmail,
      tenantEmail,
      arbiterEmail,
      ...pendingTenants.map((tenant) => tenant.email),
      ...(draft?.tenants.map((tenant) => tenant.email) || []),
    ].map((value) => value.trim().toLowerCase());
    if (reservedEmails.includes(email)) {
      return setFormError("Each tenant must use a different email address.");
    }
    if (!draft) {
      const nextCount = pendingTenants.length + 2;
      const split = equalSplitBps(nextCount);
      setPrimaryTenantShareBps(split[0]);
      setPendingTenants((current) => [
        ...current.map((tenant, index) => ({
          ...tenant,
          depositShareBps: split[index + 1],
        })),
        { name, email, depositShareBps: split[nextCount - 1] },
      ]);
      setNewTenantName("");
      setNewTenantEmail("");
      setShowAdditionalTenant(false);
      setFormMessage(`${name} will be included when this proposal is saved.`);
      return;
    }
    if (!landlordAccess || !accessBundle) return;
    setIsSavingDraft(true);
    try {
      const result = await addNegotiationTenant(landlordAccess, {
        name,
        email,
      });
      const nextBundle = {
        ...accessBundle,
        tenants: [
          ...(accessBundle.tenants || []),
          result.invite,
        ],
      };
      setDraft(result.record);
      const refreshed = await rotateParticipantInvites(result.record, nextBundle);
      setDraft(refreshed.record);
      setTenantShareDraft(
        Object.fromEntries(
          refreshed.record.tenants.map((tenant) => [tenant.id, tenant.depositShareBps]),
        ),
      );
      setAccessBundle(refreshed.access);
      rememberLandlordBundle(refreshed);
      setNewTenantName("");
      setNewTenantEmail("");
      setShowAdditionalTenant(false);
      setIsEditingRevision(false);
      setFormMessage(
        `Added ${email}. Revision ${result.record.revision} now requires fresh approval from every tenant${result.record.arbiterEmail ? " and the arbiter" : ""}. Fresh links are ready to send.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant could not be added.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  function beginTenantEdit(tenantId: string) {
    const tenant = draft?.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    setEditingTenantId(tenant.id);
    setEditingTenantName(tenant.name || "");
    setEditingTenantEmail(tenant.email);
    setFormError(null);
    setFormMessage(null);
  }

  async function saveTenantEdit() {
    if (!landlordAccess || !draft || !accessBundle || !editingTenantId) return;
    const name = editingTenantName.trim();
    const email = editingTenantEmail.trim().toLowerCase();
    if (!hasFirstAndLastName(name)) {
      return setFormError("Enter the tenant’s legal first and last name.");
    }
    if (!EMAIL_PATTERN.test(email)) {
      return setFormError("Enter a valid email for the tenant.");
    }
    setIsSavingDraft(true);
    setFormError(null);
    setFormMessage(null);
    try {
      const result = await updateNegotiationTenant(
        landlordAccess,
        editingTenantId,
        { name, email },
      );
      const previousInvite = accessBundle.tenants.find(
        (item) => item.id === editingTenantId,
      );
      const replacementInvite =
        result.invite ||
        (previousInvite
          ? { ...previousInvite, name, email }
          : null);
      const nextTenants = accessBundle.tenants
        .map((item) =>
          item.id === editingTenantId && replacementInvite
            ? replacementInvite
            : item,
        )
        .map((item) => ({
          ...item,
          isFundingTenant:
            result.record.tenants.find((tenant) => tenant.id === item.id)
              ?.isFundingTenant || false,
        }));
      const fundingInvite = nextTenants.find((item) => item.isFundingTenant);
      const nextBundle = {
        ...accessBundle,
        tenant: fundingInvite?.token || accessBundle.tenant,
        tenants: nextTenants,
      };
      setDraft(result.record);
      const refreshed = await rotateParticipantInvites(result.record, nextBundle);
      setDraft(refreshed.record);
      setTenantName(refreshed.record.tenantName || "");
      setTenantEmail(refreshed.record.tenantEmail);
      setAccessBundle(refreshed.access);
      setTenantShareDraft(
        Object.fromEntries(
          refreshed.record.tenants.map((tenant) => [tenant.id, tenant.depositShareBps]),
        ),
      );
      rememberLandlordBundle(refreshed);
      setEditingTenantId(null);
      setIsEditingRevision(false);
      setFormMessage(
        `Updated ${email} on the active proposal. Revision ${result.record.revision} now requires fresh approval from every tenant${result.record.arbiterEmail ? " and the arbiter" : ""}. Fresh links are ready to send.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant could not be updated.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function removeTenant(tenantId: string) {
    if (!landlordAccess || !draft || !accessBundle) return;
    const tenant = draft.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    if (
      !confirmProposalChange(
        `Remove ${tenant.name || tenant.email} from this proposal? This invalidates their access and resets every current approval.`,
      )
    ) {
      return;
    }
    setIsSavingDraft(true);
    setFormError(null);
    setFormMessage(null);
    try {
      const result = await removeNegotiationTenant(landlordAccess, tenantId);
      const remainingInvites = accessBundle.tenants
        .filter((item) => item.id !== tenantId)
        .map((item) => ({
          ...item,
          isFundingTenant:
            result.record.tenants.find((recordTenant) => recordTenant.id === item.id)
              ?.isFundingTenant || false,
        }));
      const fundingInvite = remainingInvites.find((item) => item.isFundingTenant);
      const nextBundle = {
        ...accessBundle,
        tenant: fundingInvite?.token || "",
        tenants: remainingInvites,
      };
      setDraft(result.record);
      const refreshed = await rotateParticipantInvites(result.record, nextBundle);
      setDraft(refreshed.record);
      setTenantName(refreshed.record.tenantName || "");
      setTenantEmail(refreshed.record.tenantEmail);
      setAccessBundle(refreshed.access);
      setTenantShareDraft(
        Object.fromEntries(
          refreshed.record.tenants.map((recordTenant) => [
            recordTenant.id,
            recordTenant.depositShareBps,
          ]),
        ),
      );
      rememberLandlordBundle(refreshed);
      setEditingTenantId(null);
      setIsEditingRevision(false);
      setFormMessage(
        `Removed ${tenant.email} from the active proposal. Revision ${result.record.revision} now requires fresh approval from every remaining tenant${result.record.arbiterEmail ? " and the arbiter" : ""}. Fresh links are ready to send.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant could not be removed.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  function editFinalizedAsReplacement() {
    const finalizedAgreementId = draft?.onchainAgreementId;
    setDraft(null);
    setAccessBundle(null);
    setRevisionSummary("");
    setIsEditingRevision(false);
    setInvalidField(null);
    setFormError(null);
    setFormMessage(
      `The fields are open for editing. Saving will create a replacement proposal and require fresh tenant${
        arbiterEmail ? " and arbiter" : ""
      } approval. The existing onchain agreement${
        finalizedAgreementId ? ` #${finalizedAgreementId}` : ""
      } remains unchanged; cancel it from its Manage proposal section before it is funded.`,
    );
    goToProposalStep("participants");
  }

  function rebalancePendingTenantShares(changedIndex: number, requestedBps: number) {
    const nextShares = rebalanceShares(
      [primaryTenantShareBps, ...pendingTenants.map((tenant) => tenant.depositShareBps)],
      changedIndex,
      requestedBps,
    );
    setPrimaryTenantShareBps(nextShares[0]);
    setPendingTenants((current) =>
      current.map((tenant, index) => ({
        ...tenant,
        depositShareBps: nextShares[index + 1],
      })),
    );
  }

  function rebalanceSavedTenantShares(tenantId: string, requestedBps: number) {
    if (!draft) return;
    const changedIndex = draft.tenants.findIndex((tenant) => tenant.id === tenantId);
    if (changedIndex < 0) return;
    const nextShares = rebalanceShares(
      draft.tenants.map(
        (tenant) => tenantShareDraft[tenant.id] ?? tenant.depositShareBps,
      ),
      changedIndex,
      requestedBps,
    );
    setTenantShareDraft(
      Object.fromEntries(
        draft.tenants.map((tenant, index) => [tenant.id, nextShares[index]]),
      ),
    );
  }

  async function saveTenantShares() {
    if (!landlordAccess || !draft) return;
    const shares = draft.tenants.map((tenant) => ({
      tenantId: tenant.id,
      depositShareBps: tenantShareDraft[tenant.id] ?? tenant.depositShareBps,
    }));
    if (
      shares.some(
        (item) =>
          !Number.isInteger(item.depositShareBps) ||
          item.depositShareBps <= 0 ||
          item.depositShareBps > 10000,
      ) ||
      shares.reduce((total, item) => total + item.depositShareBps, 0) !== 10000
    ) {
      return setFormError("Tenant deposit shares must be positive and total exactly 100%.");
    }
    setIsSavingDraft(true);
    setFormError(null);
    setFormMessage(null);
    try {
      const updated = await negotiationAction(landlordAccess, {
        type: "update_tenant_shares",
        shares,
      });
      setDraft(updated);
      const refreshed = await rotateParticipantInvites(
        updated,
        accessBundle || {
          landlord: landlordAccess.token,
          tenant: "",
          tenants: [],
          arbiter: null,
        },
      );
      setDraft(refreshed.record);
      setAccessBundle(refreshed.access);
      setTenantShareDraft(
        Object.fromEntries(
          refreshed.record.tenants.map((tenant) => [tenant.id, tenant.depositShareBps]),
        ),
      );
      setIsEditingRevision(false);
      setFormMessage(
        `Updated the tenant deposit split. Revision ${updated.revision} now requires fresh approval from every tenant${updated.arbiterEmail ? " and the arbiter" : ""}. Fresh links are ready to send.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant split could not be saved.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function cancelProposal() {
    if (!landlordAccess || !draft || draft.status === "finalized") return;
    if (
      !confirmProposalChange(
        "Cancel and remove this proposal from every party's active workspace? Its timestamped audit record will be preserved.",
      )
    ) {
      return;
    }
    setIsSavingDraft(true);
    setFormError(null);
    try {
      await negotiationAction(landlordAccess, { type: "cancel_proposal" });
      clearLandlordBundle(draft.id);
      setDraft(null);
      setAccessBundle(null);
      setPendingTenants([]);
      setShowAdditionalTenant(false);
      setShowArbiter(false);
      setPropertyAddress("");
      setSelectedJurisdiction(null);
      setAddressResolution(null);
      setComplianceFacts({ ...DEFAULT_COMPLIANCE_FACTS });
      setMonthlyRent("");
      setPrimaryTenantShareBps(10000);
      setTenantShareDraft({});
      setClaimWindowStart(defaultClaimWindowStart());
      setTestnetTimingProfile(undefined);
      setClaimDays(GENERIC_TEST_POLICY.claimDays);
      setFormMessage(
        "Proposal cancelled and removed from active workspaces. Its audit record was preserved.",
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The proposal could not be cancelled.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  function arbiterInvite() {
    if (!draft || !accessBundle) return null;
    return accessBundle.arbiter && draft.arbiterEmail
      ? inviteContent("arbiter", draft.id, accessBundle.arbiter)
      : null;
  }

  function tenantInvite(tenantId: string) {
    if (!draft || !accessBundle) return null;
    const tenant = draft.tenants.find((item) => item.id === tenantId);
    const token =
      accessBundle.tenants?.find((item) => item.id === tenantId)?.token ||
      (tenant?.isFundingTenant ? accessBundle.tenant : null);
    return tenant && token
      ? inviteContent("tenant", draft.id, token)
      : null;
  }

  async function rotateParticipantInvites(
    record: NegotiationRecord,
    bundle: CreatedNegotiation["access"],
  ) {
    if (!landlordAccess) {
      throw new Error("The landlord proposal access is unavailable.");
    }
    let latestRecord = record;
    let nextBundle = bundle;
    for (const tenant of record.tenants) {
      const result = await resetNegotiationTenantInvite(landlordAccess, tenant.id);
      const existingInvites = nextBundle.tenants || [];
      const nextTenants = existingInvites.some((item) => item.id === tenant.id)
        ? existingInvites.map((item) =>
            item.id === tenant.id ? result.invite : item,
          )
        : [...existingInvites, result.invite];
      nextBundle = {
        ...nextBundle,
        tenant: result.invite.isFundingTenant
          ? result.invite.token
          : nextBundle.tenant,
        tenants: nextTenants,
      };
      latestRecord = result.record;
      setDraft(latestRecord);
      setAccessBundle(nextBundle);
      rememberLandlordBundle({ record: latestRecord, access: nextBundle });
    }
    if (record.arbiterEmail) {
      const result = await resetNegotiationArbiterInvite(landlordAccess);
      nextBundle = { ...nextBundle, arbiter: result.invite.token };
      latestRecord = result.record;
      setDraft(latestRecord);
      setAccessBundle(nextBundle);
      rememberLandlordBundle({ record: latestRecord, access: nextBundle });
    } else if (nextBundle.arbiter) {
      nextBundle = { ...nextBundle, arbiter: null };
      setAccessBundle(nextBundle);
      rememberLandlordBundle({ record: latestRecord, access: nextBundle });
    }
    setCopiedInvite(null);
    setSentInvites(new Set());
    return { record: latestRecord, access: nextBundle };
  }

  async function ensureTenantInvite(tenantId: string) {
    const existing = tenantInvite(tenantId);
    if (existing && landlordAccess) {
      try {
        await validateNegotiationInvitation(landlordAccess, {
          invitedRole: "tenant",
          invitedTenantId: tenantId,
          invitationUrl: existing.url,
        });
        return existing;
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          cause.message !==
            "This invitation link was replaced. Send the current link instead."
        ) {
          throw cause;
        }
      }
    }
    if (!landlordAccess || !draft || !accessBundle) return null;
    const tenant = draft.tenants.find((item) => item.id === tenantId);
    if (!tenant) return null;
    const result = await resetNegotiationTenantInvite(landlordAccess, tenantId);
    const existingInvites = accessBundle.tenants || [];
    const nextTenants = existingInvites.some((item) => item.id === tenantId)
      ? existingInvites.map((item) =>
          item.id === tenantId ? result.invite : item,
        )
      : [...existingInvites, result.invite];
    const nextBundle = {
      ...accessBundle,
      tenant: result.invite.isFundingTenant
        ? result.invite.token
        : accessBundle.tenant,
      tenants: nextTenants,
    };
    setDraft(result.record);
    setAccessBundle(nextBundle);
    rememberLandlordBundle({ record: result.record, access: nextBundle });
    return inviteContent("tenant", result.record.id, result.invite.token);
  }

  async function ensureArbiterInvite() {
    const existing = arbiterInvite();
    if (existing && landlordAccess) {
      try {
        await validateNegotiationInvitation(landlordAccess, {
          invitedRole: "arbiter",
          invitationUrl: existing.url,
        });
        return existing;
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          cause.message !==
            "This invitation link was replaced. Send the current link instead."
        ) {
          throw cause;
        }
      }
    }
    if (!landlordAccess || !draft?.arbiterEmail || !accessBundle) return null;
    const result = await resetNegotiationArbiterInvite(landlordAccess);
    const nextBundle = { ...accessBundle, arbiter: result.invite.token };
    setDraft(result.record);
    setAccessBundle(nextBundle);
    rememberLandlordBundle({ record: result.record, access: nextBundle });
    return inviteContent("arbiter", result.record.id, result.invite.token);
  }

  async function recordInvitation(
    role: InviteRole,
    invitedTenantId?: string,
  ) {
    if (!landlordAccess) return;
    try {
      await negotiationAction(landlordAccess, {
        type: "invitation_prepared",
        invitedRole: role,
        invitedTenantId,
        method: "copy",
      });
    } catch {
      setFormError(
        "The invitation opened or copied, but OpenEscrow could not add that preparation step to the private record. The invitation link and approved proposal are unchanged.",
      );
    }
  }

  async function copyTenantInvite(tenantId: string) {
    const invitation = await ensureTenantInvite(tenantId);
    if (!invitation) return;
    setFormError(null);
    try {
      await copyTextToClipboard(invitation.body);
      setCopiedInvite(tenantId);
      void recordInvitation("tenant", tenantId);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant invitation could not be copied.",
      );
    }
  }

  async function sendTenantInvite(tenantId: string) {
    const tenant = draft?.tenants.find((item) => item.id === tenantId);
    if (!tenant || !landlordAccess) return;
    setFormError(null);
    setFormMessage(null);
    setSendingInvite(tenantId);
    try {
      const invitation = await ensureTenantInvite(tenantId);
      if (!invitation) throw new Error("The current tenant invitation could not be prepared.");
      const result = await sendNegotiationInvitation(landlordAccess, {
        invitedRole: "tenant",
        invitedTenantId: tenantId,
        invitationUrl: invitation.url,
      });
      if (!result.sent) {
        setFormMessage(
          `OpenEscrow is already sending the current invitation to ${result.recipientEmail}.`,
        );
        return;
      }
      setSentInvites((current) => new Set(current).add(tenantId));
      setFormMessage(
        result.duplicate
          ? `The current invitation for ${result.recipientEmail} was already sent recently.`
          : `Sent the current invitation to ${result.recipientEmail}.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The tenant invitation could not be sent.",
      );
    } finally {
      setSendingInvite(null);
    }
  }

  async function copyArbiterInvite() {
    const invitation = await ensureArbiterInvite();
    if (!invitation) return;
    setFormError(null);
    try {
      await copyTextToClipboard(invitation.body);
      setCopiedInvite("arbiter");
      void recordInvitation("arbiter");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The arbiter invitation could not be copied.",
      );
    }
  }

  async function sendArbiterInvite() {
    if (!draft?.arbiterEmail || !landlordAccess) return;
    setFormError(null);
    setFormMessage(null);
    setSendingInvite("arbiter");
    try {
      const invitation = await ensureArbiterInvite();
      if (!invitation) throw new Error("The current arbiter invitation could not be prepared.");
      const result = await sendNegotiationInvitation(landlordAccess, {
        invitedRole: "arbiter",
        invitationUrl: invitation.url,
      });
      if (!result.sent) {
        setFormMessage(
          `OpenEscrow is already sending the current invitation to ${result.recipientEmail}.`,
        );
        return;
      }
      setSentInvites((current) => new Set(current).add("arbiter"));
      setFormMessage(
        result.duplicate
          ? `The current invitation for ${result.recipientEmail} was already sent recently.`
          : `Sent the current invitation to ${result.recipientEmail}.`,
      );
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "The arbiter invitation could not be sent.",
      );
    } finally {
      setSendingInvite(null);
    }
  }

  async function finalizeOnchain() {
    setFormError(null);
    setCreatedId(null);
    if (pendingFinalization) {
      return setFormError(
        "This agreement was already created on the test network. Finish its safe Record update instead of creating another agreement.",
      );
    }
    if (!draft || draft.status !== "ready") {
      return setFormError("Every tenant and the optional arbiter must approve the current revision first.");
    }
    if (!address) return setFormError("Connect the landlord wallet before finalizing.");
    if (!publicClient) {
      return setFormError(
        "OpenEscrow cannot safely check for an earlier finalization right now. Reconnect to Base Sepolia and try again before creating an agreement.",
      );
    }
    const approvedCaliforniaPolicy =
      draft.terms.policyVersion === CALIFORNIA_POLICY.version &&
      draft.terms.jurisdiction === CALIFORNIA_POLICY.jurisdiction &&
      draft.terms.operationsReserve === CALIFORNIA_POLICY.operationsReserve &&
      draft.terms.claimDays === CALIFORNIA_POLICY.claimDays &&
      draft.terms.responseDays === CALIFORNIA_POLICY.responseDays &&
      draft.terms.arbiterDays === CALIFORNIA_POLICY.arbiterDays;
    const approvedGenericTestPolicy =
      draft.terms.policyVersion === GENERIC_TEST_POLICY.version &&
      draft.terms.jurisdiction === GENERIC_TEST_POLICY.jurisdiction &&
      draft.terms.operationsReserve === GENERIC_TEST_POLICY.operationsReserve;
    const approvedResearchProfile = jurisdictionProfile(draft.terms.jurisdiction);
    const approvedAddressPolicy =
      approvedResearchProfile !== null &&
      draft.terms.policyVersion === approvedResearchProfile.version &&
      draft.terms.claimDays === approvedResearchProfile.defaultClaimDays &&
      addressResolutionMatchesProfile(
        draft.terms.addressResolution,
        approvedResearchProfile,
      ) &&
      draft.terms.responseDays === "7" &&
      (!draft.arbiterEmail || draft.terms.arbiterDays === "7") &&
      draft.terms.operationsReserve === GENERIC_TEST_POLICY.operationsReserve;
    if (
      !approvedCaliforniaPolicy &&
      !approvedGenericTestPolicy &&
      !approvedAddressPolicy
    ) {
      return setFormError(
        "This approved revision does not match a current jurisdiction policy. Unlock edits, publish a new revision, and collect fresh approvals before finalizing.",
      );
    }
    const tenantWallets = draft.tenants.map((tenant) => tenant.wallet || "");
    const arbiterWallet = draft.arbiterWallet || "";
    const hasArbiter = Boolean(draft.arbiterEmail);
    if (tenantWallets.some((wallet) => !isAddress(wallet))) {
      return setFormError("Every tenant must approve with a valid wallet.");
    }
    if (new Set(tenantWallets.map((wallet) => wallet.toLowerCase())).size !== tenantWallets.length) {
      return setFormError("Each tenant must approve with a different wallet.");
    }
    if (hasArbiter && !isAddress(arbiterWallet)) {
      return setFormError("The arbiter must approve with a valid wallet.");
    }
    if (tenantWallets.some((wallet) => wallet.toLowerCase() === address.toLowerCase())) {
      return setFormError("The landlord and tenant wallets must be different.");
    }
    if (hasArbiter && arbiterWallet.toLowerCase() === address.toLowerCase()) {
      return setFormError("The landlord and arbiter wallets must be different.");
    }
    if (
      hasArbiter &&
      tenantWallets.some((wallet) => wallet.toLowerCase() === arbiterWallet.toLowerCase())
    ) {
      return setFormError("Every tenant and the arbiter must use different wallets.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(new Date(draft.terms.claimWindowStart).getTime() / 1000);
    const timingSeconds = agreementTimingSeconds(draft.terms);
    if (startSec < nowSec) return setFormError("The expected possession-return date must still be in the future.");
    if (startSec - nowSec > MAX_CLAIM_WINDOW_OFFSET_SECONDS) {
      return setFormError("The expected possession-return date is too far in the future.");
    }
    if (!landlordAccess || isPreflightingFinalization) return;
    const operationId = finalizationScope.start();
    const priorPreflightAt = [...draft.events]
      .reverse()
      .find(
        (event) =>
          event.action === "finalization_preflight_passed" &&
          event.revision === draft.revision,
      )?.createdAt;
    setIsPreflightingFinalization(true);
    let preflightRecord: NegotiationRecord;
    try {
      preflightRecord = await negotiationAction(landlordAccess, {
        type: "preflight_finalize",
      });
      if (!finalizationScope.isCurrent(operationId)) return;
      setDraft(preflightRecord);
    } catch (cause) {
      if (!finalizationScope.isCurrent(operationId)) return;
      setFormError(
        cause instanceof Error
          ? cause.message
          : "OpenEscrow could not validate this proposal for finalization.",
      );
      setIsPreflightingFinalization(false);
      return;
    }

    let existingFinalization;
    try {
      const recoverySearchStartedAt =
        priorPreflightAt ||
        [...preflightRecord.events]
          .reverse()
          .find(
            (event) =>
              event.action === "finalization_preflight_passed" &&
              event.revision === draft.revision,
          )?.createdAt;
      if (!recoverySearchStartedAt) {
        throw new Error("The finalization check time is unavailable.");
      }
      const fundingTenant =
        draft.tenants.find((tenant) => tenant.isFundingTenant) ||
        draft.tenants[0];
      if (!fundingTenant?.wallet || !isAddress(fundingTenant.wallet)) {
        throw new Error("The funding tenant wallet is unavailable.");
      }
      existingFinalization = await findAgreementFinalizationTransaction(
        publicClient as unknown as FinalizationRecoveryClient,
        {
          deploymentBlock: DEPLOYMENT_BLOCK,
          contractAddress: OPEN_ESCROW_ADDRESS,
          abi: OpenEscrowABI,
          readyAt: recoverySearchStartedAt,
          landlord: address,
          fundingTenant: fundingTenant.wallet,
          arbiter: hasArbiter
            ? (arbiterWallet as `0x${string}`)
            : ZERO_ADDRESS,
          agreedAmount: parseUSDC(draft.terms.deposit),
          claimWindowStart: BigInt(startSec),
          claimPeriod: BigInt(timingSeconds.claimPeriodSeconds),
          responsePeriod: BigInt(timingSeconds.responsePeriodSeconds),
          arbiterRulingPeriod: BigInt(timingSeconds.arbiterRulingPeriodSeconds),
        },
      );
      if (!finalizationScope.isCurrent(operationId)) return;
    } catch {
      if (!finalizationScope.isCurrent(operationId)) return;
      setIsPreflightingFinalization(false);
      setFormError(
        "OpenEscrow could not safely check whether this proposal was already finalized. Try again before creating another agreement.",
      );
      return;
    }
    setIsPreflightingFinalization(false);

    if (existingFinalization) {
      queueFinalizationRecord(
        existingFinalization.agreementId,
        existingFinalization.transactionHash,
        isJurisdictionCode(draft.terms.jurisdiction)
          ? draft.terms.jurisdiction
          : GENERIC_TEST_POLICY.jurisdiction,
      );
      return;
    }

    submittedJurisdiction.current = isJurisdictionCode(draft.terms.jurisdiction)
      ? draft.terms.jurisdiction
      : GENERIC_TEST_POLICY.jurisdiction;
    writeContract({
      address: OPEN_ESCROW_ADDRESS,
      abi: OpenEscrowABI,
      functionName: "createMultiTenantAgreementWithToken",
      account: address,
      chain,
      args: [
        tenantWallets,
        draft.tenants.map((tenant) => tenant.depositShareBps),
        hasArbiter ? arbiterWallet : ZERO_ADDRESS,
        draft.terms.tokenChoice === "yield" ? YIELD_USDC_ADDRESS : USDC_ADDRESS,
        parseUSDC(draft.terms.deposit),
        BigInt(startSec),
        BigInt(timingSeconds.claimPeriodSeconds),
        BigInt(timingSeconds.responsePeriodSeconds),
        BigInt(timingSeconds.arbiterRulingPeriodSeconds),
      ],
    });
  }

  function goToProposalStep(step: ProposalStep) {
    setProposalStep(step);
    window.requestAnimationFrame(() => {
      document.getElementById(`proposal-panel-${step}`)?.focus({ preventScroll: true });
    });
  }

  function handleProposalTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentStep: ProposalStep,
  ) {
    const currentIndex = PROPOSAL_STEPS.findIndex((step) => step.id === currentStep);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % PROPOSAL_STEPS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + PROPOSAL_STEPS.length) % PROPOSAL_STEPS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = PROPOSAL_STEPS.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    const nextStep = PROPOSAL_STEPS[nextIndex].id;
    setProposalStep(nextStep);
    window.requestAnimationFrame(() => {
      document.getElementById(`proposal-tab-${nextStep}`)?.focus();
    });
  }

  return (
    <section
      ref={builderRef}
      className="card proposal-builder"
      id="proposal-builder"
      tabIndex={-1}
      aria-labelledby="proposal-builder-title"
    >
      <div className="proposal-builder-heading">
        <div>
          <span className="eyebrow">Landlord-initiated workflow</span>
          <h2 id="proposal-builder-title">
            {draft ? `Agreement proposal ${draft.id}` : "Set up a new agreement proposal"}
          </h2>
        </div>
        {draft && <span className={`negotiation-status status-${draft.status}`}>Revision {draft.revision}</span>}
      </div>
      <p className="hint">
        Set the complete proposal first. Tenant invitations stay locked until it is saved, so
        invitees always receive terms they can review, change, and approve.
      </p>
      <div
        className="proposal-workflow-tabs"
        role="tablist"
        aria-label="Agreement proposal sections"
      >
        {PROPOSAL_STEPS.map((step, index) => (
          <button
            className={proposalStep === step.id ? "active" : ""}
            type="button"
            role="tab"
            id={`proposal-tab-${step.id}`}
            aria-controls={`proposal-panel-${step.id}`}
            aria-selected={proposalStep === step.id}
            tabIndex={proposalStep === step.id ? 0 : -1}
            key={step.id}
            onClick={() => goToProposalStep(step.id)}
            onKeyDown={(event) => handleProposalTabKeyDown(event, step.id)}
          >
            <span aria-hidden="true">{index + 1}</span>
            <strong>{step.label}</strong>
            <small>{step.shortLabel}</small>
          </button>
        ))}
      </div>

      <section
        className="proposal-step-panel"
        role="tabpanel"
        id="proposal-panel-participants"
        aria-labelledby="proposal-tab-participants"
        tabIndex={0}
        hidden={proposalStep !== "participants"}
      >
      <div className="proposal-step-heading">
        <span className="eyebrow">Step 1 of 3</span>
        <h3>Parties &amp; property</h3>
        <p>Identify the landlord, every tenant, and the rental this one proposal covers.</p>
      </div>
      <div className="participant-summary" id="proposal-participants">
        <span>Landlord</span>
        <strong>{landlordName || "Name from linked account"}</strong>
        <small>{landlordEmail || "Link Google in your account settings first"}</small>
        <small>The active wallet becomes the onchain landlord after approvals.</small>
      </div>

      <div className="primary-tenant-field">
        <div className="field-label-heading">
          <label htmlFor="primary-tenant-name">Tenant first and last name</label>
          <div className="participant-add-actions">
            {draft?.status !== "finalized" && (
              <button
                className="btn btn-ghost small add-tenant-toggle"
                type="button"
                disabled={
                  showAdditionalTenant ||
                  (draft ? draft.tenants.length >= 5 : pendingTenants.length >= 4)
                }
                title="Add another tenant to this same proposal."
                onClick={() => setShowAdditionalTenant(true)}
              >
                + Add tenant
              </button>
            )}
            {draft?.status !== "finalized" && (
              <button
                className="btn btn-ghost small add-tenant-toggle"
                type="button"
                disabled
                title="Arbiter participation is saved for a later release."
              >
                + Add arbiter
              </button>
            )}
          </div>
        </div>
        <input
          id="primary-tenant-name"
          value={tenantName}
          onChange={(event) => {
            setTenantName(event.target.value);
            clearFieldIssue("tenantName");
          }}
          placeholder="First and last name"
          autoComplete="name"
          disabled={Boolean(draft)}
          data-proposal-field="tenantName"
          aria-invalid={invalidField === "tenantName"}
        />
      </div>
      <label>
        Tenant email address
        <input
          value={tenantEmail}
          onChange={(event) => {
            setTenantEmail(event.target.value);
            clearFieldIssue("tenantEmail");
          }}
          placeholder="tenant@example.com"
          type="email"
          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
          autoComplete="email"
          disabled={Boolean(draft)}
          data-proposal-field="tenantEmail"
          aria-invalid={invalidField === "tenantEmail"}
        />
      </label>
      <p className="field-help">
        Use a complete address in the format tenant@example.com. The server validates it again
        before saving or changing an invitation.
      </p>
      {!draft && pendingTenants.length > 0 && (
        <div className="pending-tenant-list" aria-label="Additional tenants in this proposal">
          {pendingTenants.map((tenant) => (
            <div key={tenant.email}>
              <span>
                <strong>{tenant.name}</strong> · {tenant.email}
              </span>
              <button
                className="btn btn-ghost small"
                type="button"
                onClick={() => {
                  const remaining = pendingTenants.filter(
                    (item) => item.email !== tenant.email,
                  );
                  const split = equalSplitBps(remaining.length + 1);
                  setPrimaryTenantShareBps(split[0]);
                  setPendingTenants(
                    remaining.map((item, index) => ({
                      ...item,
                      depositShareBps: split[index + 1],
                    })),
                  );
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {ARBITER_UI_ENABLED && showArbiter && (
        <section className="optional-arbiter" aria-labelledby="optional-arbiter-title">
          <div className="record-header">
            <div>
              <h3 id="optional-arbiter-title">Optional arbiter</h3>
              <p className="hint">
                The arbiter receives a role-locked invitation and must approve this proposal.
              </p>
            </div>
            {!draft && (
              <button
                className="btn btn-ghost small"
                type="button"
                onClick={() => {
                  setShowArbiter(false);
                  setArbiterName("");
                  setArbiterEmail("");
                }}
              >
                Remove arbiter
              </button>
            )}
          </div>
          <div className="participant-input-grid">
            <label>
              Arbiter first and last name
              <input
                value={arbiterName}
                onChange={(event) => setArbiterName(event.target.value)}
                placeholder="First and last name"
                autoComplete="name"
                disabled={Boolean(draft)}
              />
            </label>
            <label>
              Arbiter email
              <input
                value={arbiterEmail}
                onChange={(event) => {
                  setArbiterEmail(event.target.value);
                  clearFieldIssue("arbiterEmail");
                }}
                placeholder="arbiter@example.com"
                type="email"
                pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                autoComplete="email"
                disabled={Boolean(draft)}
                data-proposal-field="arbiterEmail"
                aria-invalid={invalidField === "arbiterEmail"}
              />
            </label>
          </div>
        </section>
      )}
      {draft && (
        <p className="field-help">
          Each approved tenant wallet funds only its recorded percentage. The agreement remains
          partially funded until every tenant contribution has been received.
        </p>
      )}
      {showAdditionalTenant && (!draft || draft.status !== "finalized") && (
        <section className="additional-tenant" aria-labelledby="add-tenant-title">
          <h3 id="add-tenant-title">Additional tenant</h3>
          <p className="hint">
            {draft
              ? "Adding a tenant updates this active proposal, records the change, and resets every existing approval."
              : "This tenant will be included in the same proposal and will receive a separate role-locked invitation after it is saved."}
          </p>
          <div className="participant-input-grid">
            <label>
              Tenant first and last name
              <input
                value={newTenantName}
                onChange={(event) => setNewTenantName(event.target.value)}
                placeholder="First and last name"
                autoComplete="name"
              />
            </label>
            <label>
              Tenant email address
              <input
                value={newTenantEmail}
                onChange={(event) => setNewTenantEmail(event.target.value)}
                placeholder="additional.tenant@example.com"
                type="email"
                pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                autoComplete="email"
              />
            </label>
          </div>
          <div className="button-row">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={isSavingDraft || Boolean(draft && draft.tenants.length >= 5)}
              title={
                draft?.tenants.length === 5
                  ? "This MVP supports up to five tenant reviewers."
                  : draft
                    ? "Adding this tenant updates the active proposal and requires every party to approve again."
                    : "Adds this tenant to the one proposal being prepared."
              }
              onClick={() => void addTenantReviewer()}
            >
              Add tenant to this proposal ⓘ
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={isSavingDraft}
              onClick={() => {
                setShowAdditionalTenant(false);
                setNewTenantName("");
                setNewTenantEmail("");
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {draft && (
        <section className="proposal-party-management" aria-labelledby="manage-tenants-title">
          <div className="record-header">
            <div>
              <h3 id="manage-tenants-title">Manage tenants</h3>
              <p className="hint">
                Names and emails stay editable until finalization. Each saved change resets
                approvals and is added to the running record.
              </p>
            </div>
          </div>
          <div className="tenant-invite-list">
            {draft.tenants.map((tenant) => (
              <div className="tenant-invite-row" key={tenant.id}>
                {editingTenantId === tenant.id ? (
                  <div className="tenant-edit-fields">
                    <label>
                      Tenant first and last name
                      <input
                        value={editingTenantName}
                        onChange={(event) => setEditingTenantName(event.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Tenant email
                      <input
                        value={editingTenantEmail}
                        onChange={(event) => setEditingTenantEmail(event.target.value)}
                        type="email"
                        pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                        autoComplete="email"
                      />
                    </label>
                    <small>
                      Saving updates this proposal, records the change, and resets all approvals.
                      Changing the email also invalidates the prior invite.
                    </small>
                  </div>
                ) : (
                  <div>
                    <strong>{tenant.name || "Tenant"}</strong>
                    <span>{tenant.email}</span>
                    <small>{sharePercent(tenant.depositShareBps)}% deposit ownership</small>
                  </div>
                )}
                <div className="invite-actions tenant-management-actions">
                  {editingTenantId === tenant.id ? (
                    <>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={isSavingDraft}
                        onClick={() => void saveTenantEdit()}
                      >
                        Save tenant
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={isSavingDraft}
                        onClick={() => setEditingTenantId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    draft.status !== "finalized" && (
                      <>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={isSavingDraft}
                          title="Editing records a new revision and requires every party to approve again."
                          onClick={() => beginTenantEdit(tenant.id)}
                        >
                          Edit tenant ⓘ
                        </button>
                        <button
                          className="btn btn-ghost danger"
                          type="button"
                          disabled={isSavingDraft || draft.tenants.length === 1}
                          title={
                            draft.tenants.length === 1
                              ? "Add a replacement tenant before removing the only tenant."
                              : "Removing a tenant invalidates their access, records the action, and resets every approval."
                          }
                          onClick={() => void removeTenant(tenant.id)}
                        >
                          Remove
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AddressAutocomplete
        value={propertyAddress}
        onChange={(next) => {
          setPropertyAddress(next);
          setSelectedJurisdiction(null);
          setAddressResolution(null);
          setClaimDays(GENERIC_TEST_POLICY.claimDays);
          clearFieldIssue("propertyAddress");
        }}
        onVerifiedSuggestion={(suggestion: AddressSuggestion) => {
          const resolution = normalizeAddressResolution({
            ...suggestion,
            provider: "photon-openstreetmap",
            providerFeatureId: suggestion.id,
          });
          const profile =
            resolution?.countryCode === "US" && resolution.attestation
              ? jurisdictionProfileForPostalCode(resolution.stateCode)
              : null;
          setAddressResolution(profile ? resolution : null);
          setSelectedJurisdiction(profile);
          setClaimDays(profile?.defaultClaimDays ?? GENERIC_TEST_POLICY.claimDays);
          setResponseDays(GENERIC_TEST_POLICY.responseDays);
          setArbiterDays(GENERIC_TEST_POLICY.arbiterDays);
        }}
        disabled={approvedTermsLocked}
        invalid={invalidField === "propertyAddress"}
      />
      <p className="field-help">
        This identifies which rental and security deposit the proposal covers. It remains in the
        private agreement record and is not written directly to the public blockchain.
      </p>
      {selectedJurisdiction && (
        <fieldset className="token-choice">
          <legend>Property and program facts</legend>
          <label>
            <span>
              <strong>Housing program</strong>
              <small>Select the funding or assistance program, not the tenant's income.</small>
            </span>
            <select
              value={complianceFacts.housingProgram}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  housingProgram: event.target
                    .value as ComplianceFacts["housingProgram"],
                }))
              }
            >
              <option value="unknown">Unknown / confirm</option>
              <option value="conventional">Conventional private rental</option>
              <option value="housing-choice-voucher">Housing Choice Voucher</option>
              <option value="emergency-housing-voucher">Emergency Housing Voucher</option>
              <option value="public-housing">Public housing</option>
              <option value="project-based-section-8">Project-based Section 8</option>
              <option value="section-202">HUD Section 202</option>
              <option value="section-811">HUD Section 811</option>
              <option value="usda-rural">USDA Rural Development</option>
              <option value="lihtc">Low-Income Housing Tax Credit</option>
              <option value="home">HOME-assisted housing</option>
              <option value="housing-trust-fund">Housing Trust Fund</option>
              <option value="other-assisted">Other assisted housing</option>
            </select>
          </label>
          {selectedJurisdiction.deadlines.some(
            (deadline) =>
              deadline.condition?.fact === "writtenRentalAgreement",
          ) && (
            <label>
              <span>
                <strong>Written rental agreement</strong>
                <small>
                  Maine uses different return paths for a written rental agreement
                  and a tenancy at will.
                </small>
              </span>
              <select
                value={String(complianceFacts.writtenRentalAgreement)}
                disabled={approvedTermsLocked}
                onChange={(event) =>
                  setComplianceFacts((current) => ({
                    ...current,
                    writtenRentalAgreement:
                      event.target.value === "true"
                        ? true
                        : event.target.value === "false"
                          ? false
                          : "unknown",
                  }))
                }
              >
                <option value="unknown">Unknown / confirm</option>
                <option value="true">Yes</option>
                <option value="false">No / tenancy at will</option>
              </select>
            </label>
          )}
          {selectedJurisdiction.deadlines.some(
            (deadline) =>
              deadline.condition?.fact === "leaseExtendsDepositDeadline",
          ) && (
            <label>
              <span>
                <strong>Lease extends the deposit-return period</strong>
                <small>
                  Record this only when the written lease expressly uses the
                  longer period allowed by the state profile.
                </small>
              </span>
              <select
                value={String(complianceFacts.leaseExtendsDepositDeadline)}
                disabled={approvedTermsLocked}
                onChange={(event) =>
                  setComplianceFacts((current) => ({
                    ...current,
                    leaseExtendsDepositDeadline:
                      event.target.value === "true"
                        ? true
                        : event.target.value === "false"
                          ? false
                          : "unknown",
                  }))
                }
              >
                <option value="unknown">Unknown / confirm</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          )}
          {selectedJurisdiction.deadlines.some(
            (deadline) =>
              deadline.condition?.fact === "seasonalNonPrimaryOccupancy",
          ) && (
            <label>
              <span>
                <strong>Qualifying seasonal non-primary occupancy</strong>
                <small>
                  Vermont’s longer seasonal path is narrow; confirm both seasonal
                  use and non-primary-residence status.
                </small>
              </span>
              <select
                value={String(complianceFacts.seasonalNonPrimaryOccupancy)}
                disabled={approvedTermsLocked}
                onChange={(event) =>
                  setComplianceFacts((current) => ({
                    ...current,
                    seasonalNonPrimaryOccupancy:
                      event.target.value === "true"
                        ? true
                        : event.target.value === "false"
                          ? false
                          : "unknown",
                  }))
                }
              >
                <option value="unknown">Unknown / confirm</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          )}
          <label>
            <span>
              <strong>Property type</strong>
              <small>Coverage exceptions frequently depend on this classification.</small>
            </span>
            <select
              value={complianceFacts.propertyType}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  propertyType: event.target
                    .value as ComplianceFacts["propertyType"],
                }))
              }
            >
              <option value="unknown">Unknown / confirm</option>
              <option value="standard-residential">Standard residential rental</option>
              <option value="owner-occupied">Owner-occupied property</option>
              <option value="mobile-home">Mobile or manufactured home</option>
              <option value="seasonal">Seasonal occupancy</option>
              <option value="transient">Transient occupancy</option>
              <option value="institutional">Institutional housing</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Tenancy type</strong>
              <small>This can select different statutory deadline paths.</small>
            </span>
            <select
              value={complianceFacts.tenancyType}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  tenancyType: event.target
                    .value as ComplianceFacts["tenancyType"],
                }))
              }
            >
              <option value="unknown">Unknown / confirm</option>
              <option value="fixed-term">Fixed-term written lease</option>
              <option value="month-to-month">Month-to-month</option>
              <option value="at-will">Tenancy at will</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Number of rental units controlled by this owner</strong>
              <small>Leave blank only when it cannot yet be confirmed.</small>
            </span>
            <input
              type="number"
              min="1"
              max="100000"
              step="1"
              value={complianceFacts.unitCount ?? ""}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  unitCount: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
            />
          </label>
          <label>
            <span>
              <strong>Owner lives at the property</strong>
              <small>Owner-occupancy changes coverage in several jurisdictions.</small>
            </span>
            <select
              value={String(complianceFacts.ownerOccupied)}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  ownerOccupied:
                    event.target.value === "true"
                      ? true
                      : event.target.value === "false"
                        ? false
                        : "unknown",
                }))
              }
            >
              <option value="unknown">Unknown / confirm</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Unit is furnished</strong>
              <small>Some states allow a different furnished-unit deposit cap.</small>
            </span>
            <select
              value={String(complianceFacts.furnished)}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  furnished:
                    event.target.value === "true"
                      ? true
                      : event.target.value === "false"
                        ? false
                        : "unknown",
                }))
              }
            >
              <option value="unknown">Unknown / confirm</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Assistance-animal accommodation affects deposit treatment</strong>
              <small>No diagnosis or medical documentation is stored here.</small>
            </span>
            <select
              value={String(complianceFacts.assistanceAnimalAccommodation)}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  assistanceAnimalAccommodation:
                    event.target.value === "true"
                      ? true
                      : event.target.value === "false"
                        ? false
                        : "unknown",
                }))
              }
            >
              <option value="unknown">Unknown / not answered</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Qualifying SCRA lease termination asserted</strong>
              <small>Orders and military details stay outside the general agreement record.</small>
            </span>
            <select
              value={String(complianceFacts.scraQualifiedTermination)}
              disabled={approvedTermsLocked}
              onChange={(event) =>
                setComplianceFacts((current) => ({
                  ...current,
                  scraQualifiedTermination:
                    event.target.value === "true"
                      ? true
                      : event.target.value === "false"
                        ? false
                        : "unknown",
                }))
              }
            >
              <option value="unknown">Unknown / not asserted</option>
              <option value="true">Yes, asserted</option>
              <option value="false">No</option>
            </select>
          </label>
          <p className="field-help">
            OpenEscrow never infers these facts from an address. VAWA survivor details and
            emergency-transfer information must not be entered or uploaded here.
          </p>
        </fieldset>
      )}
      <div className="proposal-step-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => goToProposalStep("terms")}
        >
          Continue to deposit terms
        </button>
      </div>
      </section>

      <section
        className="proposal-step-panel"
        role="tabpanel"
        id="proposal-panel-terms"
        aria-labelledby="proposal-tab-terms"
        tabIndex={0}
        hidden={proposalStep !== "terms"}
      >
      <div className="proposal-step-heading">
        <span className="eyebrow">Step 2 of 3</span>
        <h3>Deposit terms</h3>
        <p>Set ownership, token, total funding, and the test lifecycle timing.</p>
      </div>
      <section
        className="deposit-split"
        aria-labelledby="deposit-split-title"
        data-proposal-field="depositShares"
        tabIndex={-1}
      >
        <div className="record-header">
          <div>
            <h3 id="deposit-split-title">Tenant deposit ownership split</h3>
            <p className="hint">
              Shares start equally divided. Editing one percentage automatically rebalances the
              others so the total stays at exactly 100%. Every tenant approves the split.
            </p>
          </div>
          <strong>
            {draft
              ? sharePercent(
                  draft.tenants.reduce(
                    (total, tenant) =>
                      total +
                      (tenantShareDraft[tenant.id] ?? tenant.depositShareBps),
                    0,
                  ),
                )
              : sharePercent(
                  primaryTenantShareBps +
                    pendingTenants.reduce(
                      (total, tenant) => total + tenant.depositShareBps,
                      0,
                    ),
                )}
            % total
          </strong>
        </div>
        <div className="deposit-split-list">
          {!draft ? (
            <>
              <label>
                <span>
                  <strong>{tenantName || tenantEmail || "Primary tenant"}</strong>
                  <TenantFundingDue
                    deposit={deposit}
                    reserve={operationsReserve}
                    bps={primaryTenantShareBps}
                    tenantCount={pendingTenants.length + 1}
                    tenantIndex={0}
                    tokenChoice={tokenChoice}
                  />
                </span>
                <span className="percentage-input">
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={sharePercent(primaryTenantShareBps)}
                    onChange={(event) =>
                      rebalancePendingTenantShares(
                        0,
                        percentToBps(event.target.value),
                      )
                    }
                  />
                  %
                </span>
              </label>
              {pendingTenants.map((tenant, index) => (
                <label key={tenant.email}>
                  <span>
                    <strong>{tenant.name}</strong>
                    <TenantFundingDue
                      deposit={deposit}
                      reserve={operationsReserve}
                      bps={tenant.depositShareBps}
                      tenantCount={pendingTenants.length + 1}
                      tenantIndex={index + 1}
                      tokenChoice={tokenChoice}
                    />
                  </span>
                  <span className="percentage-input">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={sharePercent(tenant.depositShareBps)}
                      onChange={(event) =>
                        rebalancePendingTenantShares(
                          index + 1,
                          percentToBps(event.target.value),
                        )
                      }
                    />
                    %
                  </span>
                </label>
              ))}
            </>
          ) : (
            draft.tenants.map((tenant, index) => (
              <label key={tenant.id}>
                <span>
                  <strong>{tenant.name || tenant.email}</strong>
                  <TenantFundingDue
                    deposit={deposit}
                    reserve={operationsReserve}
                    bps={tenantShareDraft[tenant.id] ?? tenant.depositShareBps}
                    tenantCount={draft.tenants.length}
                    tenantIndex={index}
                    tokenChoice={tokenChoice}
                  />
                </span>
                <span className="percentage-input">
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    disabled={draft.status === "finalized"}
                    value={sharePercent(
                      tenantShareDraft[tenant.id] ?? tenant.depositShareBps,
                    )}
                    onChange={(event) =>
                      rebalanceSavedTenantShares(
                        tenant.id,
                        percentToBps(event.target.value),
                      )
                    }
                  />
                  %
                </span>
              </label>
            ))
          )}
        </div>
        {draft && draft.status !== "finalized" && (
          <button
            className="btn btn-secondary"
            type="button"
            disabled={isSavingDraft}
            title="Saving a changed split creates a new revision and requires every party to approve again."
            onClick={() => void saveTenantShares()}
          >
            Save deposit split
          </button>
        )}
      </section>

      <section
        className={`jurisdiction-notice ${
          selectedJurisdiction ? "california-policy" : "generic-test-policy"
        }`}
        aria-labelledby="jurisdiction-policy-title"
      >
        <div className="california-policy-heading">
          <div>
            <strong id="jurisdiction-policy-title">
              {selectedJurisdiction?.label ?? "Non-specific test jurisdiction"}
            </strong>
            <small>
              {selectedJurisdiction?.version ?? GENERIC_TEST_POLICY.version}
            </small>
          </div>
          <span className="policy-test">
            {selectedJurisdiction ? "Rules applied" : "Test only"}
          </span>
        </div>
        {selectedJurisdiction ? (
          <>
            <p>
              The verified address selected and locked this statewide profile automatically.
              OpenEscrow applies its baseline timing and records the full requirement set with the
              agreement. Facts and local overlays can still change which branch controls.
            </p>
            {addressResolution && (
              <p className="field-help">
                Resolved to {addressResolution.city || "an unincorporated locality"}
                {addressResolution.county ? `, ${addressResolution.county}` : ""},{" "}
                {addressResolution.stateCode}
                {addressResolution.postalCode ? ` ${addressResolution.postalCode}` : ""}.
              </p>
            )}
            <ul>
              {selectedJurisdiction.deadlines.map((deadline) => (
                <li key={deadline.id}>
                  {deadline.label}: {deadline.days} {deadline.dayType} days after{" "}
                  {deadline.triggerDescription}
                  {!deadline.statutory ? " (OpenEscrow safeguard, not a statutory deadline)" : ""}
                </li>
              ))}
              <li>Deposit baseline: {selectedJurisdiction.depositCapSummary}</li>
            </ul>
            <details>
              <summary>Applied statewide requirement checklist</summary>
              <ul>
                {selectedJurisdiction.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </details>
            {compliancePreview && (
              <details>
                <summary>
                  Federal and program overlays ({compliancePreview.overlays.length})
                </summary>
                {compliancePreview.overlays.map((overlay) => (
                  <section key={overlay.id}>
                    <strong>{overlay.label}</strong>{" "}
                    <small>
                      {overlay.applicability === "applies"
                        ? "Applied"
                        : "Needs a property or program fact"}
                    </small>
                    <ul>
                      {overlay.requirements.map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                    {overlay.privacyNote && (
                      <p className="field-help">{overlay.privacyNote}</p>
                    )}
                  </section>
                ))}
                {compliancePreview.localCoverage === "unreviewed-locality" && (
                  <p className="field-help">
                    The resolved city and county do not yet have a reviewed local overlay.
                    Their rules remain a required manual check.
                  </p>
                )}
                {compliancePreview.missingFacts.length > 0 && (
                  <p className="field-help">
                    {compliancePreview.missingFacts.length} conditional rule{" "}
                    {compliancePreview.missingFacts.length === 1 ? "fact is" : "facts are"}{" "}
                    still unresolved. Agreement facts can be completed here; facts that occur
                    later require confirmation by both parties on the compliance timeline.
                  </p>
                )}
              </details>
            )}
            <section
              className="compliance-source-panel"
              aria-labelledby="compliance-source-title"
              aria-busy={isCheckingComplianceSource}
            >
              <div>
                <strong id="compliance-source-title">Official requirements sources</strong>
                <p className="field-help">
                  These sources support the requirements currently applied to this address.
                </p>
                <ul className="compliance-source-list">
                  {[
                    {
                      citation: selectedJurisdiction.statuteCitation,
                      url: selectedJurisdiction.statuteUrl,
                    },
                    ...compliancePreview.overlays.flatMap((overlay) => overlay.sources),
                  ].map((source, index) => {
                    const checkedSource = complianceSourceResult?.sources[index];
                    return (
                      <li key={`${source.url}:${index}`}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.citation}
                        </a>
                        <span>
                          {checkedSource?.lastCheckedAt
                            ? `Checked ${readableComplianceDate(checkedSource.lastCheckedAt)}`
                            : "Not checked in this session"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="field-help">
                  Profile research date:{" "}
                  <time dateTime={selectedJurisdiction.researchedOn}>
                    {readableComplianceDate(selectedJurisdiction.researchedOn)}
                  </time>
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={isCheckingComplianceSource}
                onClick={() => void refreshComplianceSource()}
              >
                {isCheckingComplianceSource
                  ? "Checking official sources..."
                  : "Check official sources for updates"}
              </button>
              {complianceSourceResult && (
                <p
                  className={
                    complianceSourceResult.sources.some(
                      (source) => source.requiresReview,
                    )
                      ? "tx-error"
                      : "tx-success"
                  }
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {complianceSourceStatusSummary(complianceSourceResult.sources)}{" "}
                  Finalized agreements keep their recorded compliance snapshot.
                </p>
              )}
              {complianceSourceError && (
                <p className="tx-error" role="alert">
                  {complianceSourceError}
                </p>
              )}
            </section>
            <p className="field-help">
              City, county, housing-program, property-type, and fact-specific overlays remain
              flagged for resolution. A source check detects possible changes but never rewrites
              legal requirements automatically. This software output is not legal advice or a
              guarantee.
            </p>
          </>
        ) : (
          <>
            <p>
              Select a U.S. address suggestion to apply its statewide compliance profile. Manual,
              unresolved, or non-U.S. addresses keep the generic lifecycle profile.
            </p>
            <p className="field-help">
              Timing remains editable and is not a legal deadline. Do not use this profile with
              real funds or a real tenancy.
            </p>
          </>
        )}
      </section>

      <div data-proposal-field="depositAsset" tabIndex={-1}>
        <DepositAssetSelector
          selectedAssetId={depositAssetId}
          yieldConsent={yieldConsent}
          disabled={approvedTermsLocked}
          countryCode={addressResolution?.countryCode || "US"}
          onSelect={setDepositAssetId}
          onYieldConsentChange={setYieldConsent}
        />
      </div>
      <label>
        Monthly rent
        <input
          value={monthlyRent}
          onChange={(event) => {
            setMonthlyRent(event.target.value);
            clearFieldIssue("monthlyRent");
          }}
          type="number"
          min="0"
          step="0.01"
          disabled={approvedTermsLocked}
          data-proposal-field="monthlyRent"
          aria-invalid={invalidField === "monthlyRent"}
        />
        <small>
          Used to evaluate deposit caps. It remains in the private agreement record.
        </small>
      </label>
      <label>
        Deposit amount ({tokenChoice === "yield" ? "taUSDC shares" : "testUSDC"})
        <input
          value={deposit}
          onChange={(event) => {
            setDeposit(event.target.value);
            clearFieldIssue("deposit");
          }}
          type="number"
          min="0"
          step="0.000001"
          disabled={approvedTermsLocked}
          data-proposal-field="deposit"
          aria-invalid={invalidField === "deposit"}
        />
      </label>
      <section className="cost-breakdown" aria-label="Agreement funding breakdown">
        <div>
          <span>Refundable security deposit</span>
          <strong>{deposit || "0"} {tokenChoice === "yield" ? "taUSDC" : "testUSDC"}</strong>
        </div>
        <div>
          <span>Testnet network &amp; storage reserve</span>
          <strong>
            {operationsReserve} {tokenLabel(tokenChoice)} total · split evenly between tenants
          </strong>
        </div>
        <div className="cost-total">
          <span>Tenants provide in total</span>
          <strong>
            {totalFundingAmount(deposit, operationsReserve)} {tokenLabel(tokenChoice)}
          </strong>
        </div>
        <p>
          Each tenant pays the approved deposit percentage shown above plus an equal share of the
          separate {operationsReserve} {tokenLabel(tokenChoice)} testnet reserve. The reserve uses
          the selected token but is not refundable deposit principal. This test profile does not
          determine the legal treatment of any real tenant-paid charge.
        </p>
      </section>
      <section
        className={`reviewer-timing-card${acceleratedReviewTiming ? " is-active" : ""}`}
        aria-labelledby="reviewer-timing-title"
      >
        <div>
          <span className="eyebrow">Base Sepolia reviewer tool</span>
          <h3 id="reviewer-timing-title">Accelerated lifecycle timing</h3>
          <p>
            Use this only for an invented reviewer agreement. The possession-return time is set
            about one hour ahead, followed by 30-minute claim, response, and arbiter periods.
          </p>
          <strong>
            {acceleratedReviewTiming
              ? "Accelerated timing is active for this revision."
              : "Standard agreement timing is active."}
          </strong>
        </div>
        <button
          className={acceleratedReviewTiming ? "btn btn-ghost" : "btn btn-primary"}
          type="button"
          disabled={approvedTermsLocked}
          onClick={
            acceleratedReviewTiming
              ? restoreStandardTiming
              : applyAcceleratedReviewTiming
          }
        >
          {acceleratedReviewTiming
            ? "Restore standard timing"
            : "Use accelerated reviewer timing"}
        </button>
      </section>
      <label>
        Expected date tenant vacates / possession is returned
        <input
          value={claimWindowStart}
          onChange={(event) => {
            setClaimWindowStart(event.target.value);
            clearFieldIssue("claimWindowStart");
          }}
          type="datetime-local"
          disabled={approvedTermsLocked}
          data-proposal-field="claimWindowStart"
          aria-invalid={invalidField === "claimWindowStart" || claimWindowHasPassed}
        />
      </label>
      <p className="field-help">
        {acceleratedReviewTiming
          ? "This accelerated Base Sepolia date is for reviewer testing only and does not represent a legal deadline."
          : "This is the test lifecycle start date. It is not calculated from or validated against any jurisdiction's law."}
      </p>
      {claimWindowHasPassed && (
        <p className="field-validation-error" role="alert">
          This saved date has passed. Select a future possession-return date before publishing a
          revision or finalizing onchain.
        </p>
      )}
      <label>
        {selectedJurisdiction ? "Statewide onchain safeguard window" : "Test deduction window"}
        <input
          value={claimDays}
          onChange={(event) => {
            setClaimDays(event.target.value);
            clearFieldIssue("claimDays");
          }}
          type="number"
          min="1"
          disabled={approvedTermsLocked || Boolean(selectedJurisdiction)}
          data-proposal-field="claimDays"
          aria-invalid={invalidField === "claimDays"}
        />
      </label>
      <p className="field-help">
        {acceleratedReviewTiming
          ? `${selectedJurisdiction?.defaultClaimDays || claimDays} days remains in the policy record, while this reviewer-only onchain agreement uses a 30-minute claim period.`
          : selectedJurisdiction
            ? `${selectedJurisdiction.defaultClaimDays} days is locked as the onchain safeguard. The agreement record also preserves the profile's conditional and multi-stage deadlines.`
            : "Editable test timing. This value does not represent a legal deadline."}
      </p>
      <label>
        OpenEscrow tenant response period
        <input
          value={responseDays}
          onChange={(event) => {
            setResponseDays(event.target.value);
            clearFieldIssue("responseDays");
          }}
          type="number"
          min="1"
          disabled={approvedTermsLocked}
          data-proposal-field="responseDays"
          aria-invalid={invalidField === "responseDays"}
        />
      </label>
      <p className="field-help">
        {acceleratedReviewTiming
          ? "Reviewer-only onchain response period: 30 minutes. The recorded standard value remains visible above."
          : "Editable test timing for the tenant's approve-or-dispute step."}
      </p>
      {ARBITER_UI_ENABLED && (showArbiter || Boolean(draft?.arbiterEmail)) && (
        <>
          <label>
            OpenEscrow arbiter ruling period
            <input
              value={arbiterDays}
              onChange={(event) => {
                setArbiterDays(event.target.value);
                clearFieldIssue("arbiterDays");
              }}
              type="number"
              min="1"
              disabled={approvedTermsLocked}
              data-proposal-field="arbiterDays"
              aria-invalid={invalidField === "arbiterDays"}
            />
          </label>
          <p className="field-help">
            {acceleratedReviewTiming
              ? "Reviewer-only onchain arbiter period: 30 minutes. The recorded standard value remains visible above."
              : "Editable test timing for the optional arbiter's ruling step."}
          </p>
        </>
      )}

      <div className="proposal-step-actions">
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => goToProposalStep("participants")}
        >
          Back to parties &amp; property
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => goToProposalStep("review")}
        >
          Continue to review
        </button>
      </div>
      </section>

      <section
        className="proposal-step-panel"
        role="tabpanel"
        id="proposal-panel-review"
        aria-labelledby="proposal-tab-review"
        tabIndex={0}
        hidden={proposalStep !== "review"}
      >
      <div className="proposal-step-heading">
        <span className="eyebrow">Step 3 of 3</span>
        <h3>Review &amp; approvals</h3>
        <p>Save or publish this revision, invite tenants, track approvals, and finalize once ready.</p>
      </div>
      {draft?.status === "ready" && (
        <section className="onchain-ready primary-finalization" id="proposal-finalize">
          <span className="eyebrow">All required approvals recorded</span>
          <h3>Finalize this approved proposal onchain</h3>
          <p>
            This is the only finalization action. It creates the Base Sepolia agreement using the
            exact participant, property, deposit-split, timing, and token terms everyone approved.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={
              !isConnected ||
              isPreflightingFinalization ||
              Boolean(pendingFinalization) ||
              isSavingFinalizationRecord ||
              isPending ||
              isMining
            }
            onClick={() => void finalizeOnchain()}
          >
            {isPreflightingFinalization
              ? "Checking the approved proposal..."
              : pendingFinalization || isSavingFinalizationRecord
                ? "Finalization confirmed—updating Record..."
              : isPending
              ? "Confirm in wallet..."
              : isMining
                ? "Finalizing onchain..."
                : "Finalize approved proposal onchain"}
          </button>
          {!isConnected && (
            <p className="field-help">Connect the landlord wallet to enable finalization.</p>
          )}
        </section>
      )}

      {draft && draft.status !== "finalized" ? (
        <section className="revision-publisher" aria-labelledby="revision-publisher-title">
          {approvedTermsLocked ? (
            <div className="revision-lock">
              <div>
                <h3 id="revision-publisher-title">Approved terms are locked</h3>
                <p className="hint">
                  At least one invited party approved revision {draft.revision}. Unlocking edits
                  does not change the record until you publish a new revision.
                </p>
              </div>
              <div className="button-row">
                <button
                  className="btn btn-secondary"
                  type="button"
                  title="Any published edit creates a new revision, cancels current approvals, and requires every tenant and the optional arbiter to approve again."
                  onClick={() => {
                    setIsEditingRevision(true);
                    goToProposalStep("terms");
                  }}
                >
                  Edit terms ⓘ
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  title="Starts a separate replacement proposal and preserves the existing approved record."
                  onClick={addOrReplaceTenant}
                >
                  Start replacement proposal
                </button>
              </div>
            </div>
          ) : (
            <>
          <h3 id="revision-publisher-title">Publish a new revision</h3>
          <p className="hint">
            Update the terms above, then describe the change. Publishing creates a new timestamped
            revision and requires fresh approval from every invited reviewer.
          </p>
          {(draft.tenantApproved || draft.arbiterApproved) && (
            <div className="revision-impact">
              <strong>The current revision is already approved.</strong>
              <span>
                Publishing changes will cancel its ready-to-finalize status and reset the recorded
                tenant{draft.arbiterEmail ? " and arbiter approvals" : " approval"}.
              </span>
            </div>
          )}
          <label>
            Revision note (required)
            <textarea
              value={revisionSummary}
              onChange={(event) => {
                setRevisionSummary(event.target.value);
                clearFieldIssue("revisionSummary");
              }}
              placeholder="For example: Extended the response period from 7 to 10 days."
              rows={3}
              minLength={8}
              data-proposal-field="revisionSummary"
              aria-invalid={invalidField === "revisionSummary"}
            />
          </label>
          <p className="field-help">At least 8 characters. This note becomes part of the running record.</p>
          <div className="button-row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={isSavingDraft}
              onClick={() => void saveDraft()}
            >
              {isSavingDraft ? "Publishing revision..." : "Publish revised proposal"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={startAnotherProposal}>
              Start another proposal
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              title="Starts a separate replacement proposal and preserves the existing record."
              onClick={addOrReplaceTenant}
            >
              Start replacement proposal
            </button>
          </div>
            </>
          )}
        </section>
      ) : !draft ? (
        <div className="button-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={isSavingDraft}
            onClick={() => void saveDraft()}
          >
            {isSavingDraft ? "Saving proposal..." : "Save proposal for review"}
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button
            className="btn btn-secondary"
            type="button"
            title="Onchain terms cannot be overwritten. This reopens the existing values in a replacement proposal that requires fresh approval."
            onClick={editFinalizedAsReplacement}
          >
            Edit terms ⓘ
          </button>
          <button className="btn btn-ghost" type="button" onClick={startAnotherProposal}>
            Start another proposal
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            title="Starts a separate replacement proposal and preserves the existing record."
            onClick={addOrReplaceTenant}
          >
            Start replacement proposal
          </button>
        </div>
      )}
      <div
        className="proposal-form-feedback"
        id="proposal-form-feedback"
        aria-live="assertive"
        tabIndex={-1}
      >
        {formMessage && <p className="tx-success">{formMessage}</p>}
        {formError && <p className="tx-error">{formError}</p>}
      </div>
      {draft && draft.status !== "finalized" && (
        <div className="proposal-danger-zone">
          <div>
            <strong>Cancel this proposal</strong>
            <span>
              Remove it from every party’s active workspace while preserving its timestamped
              audit record.
            </span>
          </div>
          <button
            className="btn btn-ghost danger"
            type="button"
            disabled={isSavingDraft}
            onClick={() => void cancelProposal()}
          >
            Cancel and remove proposal
          </button>
        </div>
      )}

      {!draft && (
        <div className="invite-gate">
          <strong>Invitations unlock after the proposal is saved.</strong>
          <span>Every tenant will receive this exact revision for review.</span>
        </div>
      )}

      {draft && (
        <section className="proposal-review-controls" id="proposal-review">
          <div className="record-header">
            <div>
              <h3>Invite parties to review revision {draft.revision}</h3>
              <p className="hint">
                Saving never sends an invitation. Email is sent only when you choose
                <strong> Send invite</strong>.
              </p>
              <p className="hint">Each link is role-locked and opens this saved proposal—not the landlord’s creation tools.</p>
            </div>
          </div>
          <div className="tenant-invite-list">
            {draft.tenants.map((tenant, index) => (
              <div
                className={`tenant-invite-row ${
                  tenant.approved ? "approved" : "awaiting"
                }`}
                key={tenant.id}
              >
                <div>
                  <strong>{tenant.name || "Tenant"}</strong>
                  <span>{tenant.email}</span>
                  <small>{sharePercent(tenant.depositShareBps)}% deposit ownership</small>
                  <TenantFundingDue
                    deposit={draft.terms.deposit}
                    reserve={draft.terms.operationsReserve}
                    bps={tenant.depositShareBps}
                    tenantCount={draft.tenants.length}
                    tenantIndex={index}
                    tokenChoice={draft.terms.tokenChoice}
                  />
                  <strong className="party-review-status">
                    {tenant.approved
                      ? `Approved revision ${draft.revision}`
                      : "Awaiting approval"}
                  </strong>
                </div>
                <div className="invite-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={isSavingDraft || sendingInvite !== null}
                    onClick={() => void sendTenantInvite(tenant.id)}
                  >
                    {sendingInvite === tenant.id
                      ? "Sending..."
                      : sentInvites.has(tenant.id)
                        ? "✓ Sent"
                        : "Send invite"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={isSavingDraft || sendingInvite !== null}
                    title="Copy the current invitation so you can send it in your preferred email or messaging app."
                    onClick={() => void copyTenantInvite(tenant.id)}
                  >
                    {copiedInvite === tenant.id
                      ? "✓ Copied"
                      : "Send manually"}
                  </button>
                </div>
              </div>
            ))}
            {ARBITER_UI_ENABLED && draft.arbiterEmail && (
              <div
                className={`tenant-invite-row ${
                  draft.arbiterApproved ? "approved" : "awaiting"
                }`}
              >
                <div>
                  <strong>{draft.arbiterName || "Arbiter"}</strong>
                  <span>{draft.arbiterEmail}</span>
                  <strong className="party-review-status">
                    {draft.arbiterApproved
                      ? `Approved revision ${draft.revision}`
                      : "Awaiting approval"}
                  </strong>
                </div>
                <div className="invite-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={isSavingDraft || sendingInvite !== null}
                  onClick={() => void sendArbiterInvite()}
                >
                  {sendingInvite === "arbiter"
                    ? "Sending..."
                    : sentInvites.has("arbiter")
                      ? "✓ Sent"
                      : "Send invite"}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={isSavingDraft || sendingInvite !== null}
                  title="Copy the current invitation so you can send it in your preferred email or messaging app."
                  onClick={() => void copyArbiterInvite()}
                >
                  {copiedInvite === "arbiter"
                    ? "✓ Copied"
                    : "Send manually"}
                </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {draft && draft.status === "draft" && (
        <p className="role-pending">Onchain finalization stays locked until every tenant approves the current revision.</p>
      )}
      {draft?.status === "finalized" && (
        <p className="tx-success" role="status">
          This proposal is finalized as{" "}
          {draft.onchainAgreementId
            ? agreementReference(draft.onchainAgreementId)
            : "an onchain agreement"}
          . Open the Deposits tab to manage it.
        </p>
      )}
      {(error || receiptError) && (
        <p className="tx-error" role="alert">
          {(error || receiptError)?.message.split("\n")[0]}
        </p>
      )}
      {pendingFinalization && (
        <div
          className="receipt-recovery"
          aria-busy={isSavingFinalizationRecord}
        >
          {finalizationRecordError && (
            <p className="tx-error" role="alert">
              {finalizationRecordError}
            </p>
          )}
          {isSavingFinalizationRecord && (
            <p className="hint" role="status" aria-live="polite">
              Adding the confirmed finalization to the private Record...
            </p>
          )}
          {finalizationRecordError && (
            <button
              ref={finalizationRetryButton}
              className="btn btn-ghost small"
              type="button"
              disabled={isSavingFinalizationRecord}
              onClick={() =>
                void saveFinalizationRecord(
                  pendingFinalization.agreementId,
                  pendingFinalization.transactionHash,
                )
              }
            >
              {isSavingFinalizationRecord
                ? "Adding finalization to Record..."
                : "Finish adding finalization to Record"}
            </button>
          )}
        </div>
      )}
      {createdId !== null && (
        <p className="tx-success" role="status">
          Created {agreementReference(createdId)} on the test network.
        </p>
      )}
      <div className="proposal-step-actions">
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => goToProposalStep("terms")}
        >
          Back to deposit terms
        </button>
      </div>
      </section>
    </section>
  );
}

function PrivyCreateAgreementForm({
  initialAccess,
  focusOnMount,
  onTrackAgreement,
}: {
  initialAccess?: NegotiationAccess | null;
  focusOnMount?: boolean;
  onTrackAgreement: (id: bigint) => void;
}) {
  const { user } = usePrivy();
  const landlordName = user?.google?.name ?? "";
  const landlordEmail = user?.google?.email ?? user?.email?.address ?? "";
  return (
    <AgreementForm
      landlordName={landlordName}
      landlordEmail={landlordEmail}
      initialAccess={initialAccess}
      focusOnMount={focusOnMount}
      onTrackAgreement={onTrackAgreement}
    />
  );
}

export function CreateAgreementForm({
  initialAccess,
  focusOnMount,
  onTrackAgreement,
}: {
  initialAccess?: NegotiationAccess | null;
  focusOnMount?: boolean;
  onTrackAgreement: (id: bigint) => void;
}) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyCreateAgreementForm
      initialAccess={initialAccess}
      focusOnMount={focusOnMount}
      onTrackAgreement={onTrackAgreement}
    />
  ) : (
    <AgreementForm
      landlordName=""
      landlordEmail=""
      initialAccess={initialAccess}
      focusOnMount={focusOnMount}
      onTrackAgreement={onTrackAgreement}
    />
  );
}
