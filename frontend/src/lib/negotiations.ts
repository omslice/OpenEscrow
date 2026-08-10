import type { InviteRole } from "./inviteContext";
import type { ComplianceFacts, ComplianceSnapshot } from "./jurisdictions";
import {
  clearRecoveryJsonIf,
  clearRecoveryValue,
  getBrowserRecoveryStorage,
  readRecoveryValue,
  replaceRecoveryUrl,
  writeRecoveryValue,
  type BrowserRecoveryStorage,
  type BrowserRecoveryStorageKind,
} from "./browserRecovery.ts";
import { recoverUniqueNegotiationAccessForProposal } from "./negotiationAccessRecovery.ts";
import { publicAppOrigin } from "./publicAppOrigin.ts";
import {
  clearInvitationCredential,
  readInvitationCredential,
  setInvitationCredential,
} from "./invitationCredential.ts";
import type {
  DepositAssetId,
  DepositAssetSnapshot,
} from "../../shared/deposit-assets.js";
import type {
  FundingCheckoutLifecycle,
  FundingIntent,
} from "../../shared/funding-routes.js";

export type NegotiationRole = "landlord" | InviteRole;
export type NegotiationStatus =
  | "draft"
  | "ready"
  | "finalized"
  | "cancelled"
  | "superseded";

export interface AgreementTerms {
  jurisdiction: string;
  policyVersion?: string;
  propertyAddress: string;
  addressResolution?: {
    provider: "photon-openstreetmap";
    providerFeatureId: string;
    label: string;
    countryCode: "US";
    stateCode: string;
    city: string | null;
    county: string | null;
    postalCode: string | null;
    latitude: number;
    longitude: number;
    attestation: string | null;
  } | null;
  complianceFacts?: ComplianceFacts;
  complianceSnapshot?: ComplianceSnapshot | null;
  tokenChoice: "plain" | "yield";
  depositAssetId?: DepositAssetId;
  depositAssetSnapshot?: DepositAssetSnapshot;
  yieldConsent?: boolean;
  deposit: string;
  operationsReserve: string;
  monthlyRent?: string;
  smallLandlordException?: boolean;
  tenantIsServiceMember?: boolean;
  electronicDeliveryConsent?: boolean;
  claimWindowStart: string;
  claimDays: string;
  responseDays: string;
  arbiterDays: string;
}

export interface DeductionLineItem {
  category: string;
  description: string;
  amount: string;
}

export interface ClaimPacketConfirmations {
  itemizedStatement?: true;
  supportingDocuments?: true;
  moveInPhotos?: true;
  preRepairPhotos?: true;
  postRepairPhotos?: true;
  attestations?: Record<string, true>;
}

export interface NotificationPreferences {
  agreementActivity: boolean;
  deadlineReminders: boolean;
  consentedAt?: string | null;
  updatedAt?: string | null;
  deliveryPaused?: boolean;
  deliveryPauseReason?: "bounced" | "complained" | "suppressed" | null;
  deliveryPausedAt?: string | null;
}

export interface ServiceReadiness {
  email: {
    configured: boolean;
    provider: "resend" | "webhook" | null;
    participantDeliveryReady: boolean;
    senderMode:
      | "unconfigured"
      | "invalid"
      | "account-test-only"
      | "participant-capable";
    deliveryStatusConfigured?: boolean;
    schedulerConfigured: boolean;
    schedulerLastRunAt: string | null;
    schedulerHealthy: boolean;
    schedulerExpectedIntervalMinutes: number;
    schedulerAgeMinutes: number | null;
  };
  evidence: {
    configured: boolean;
    mode: "private-r2" | "encrypted-ipfs" | "unconfigured";
    encryptedAtRest: boolean;
    activeEncryptionKeyId?: string | null;
    retainedDecryptionKeyCount?: number;
    referencedEncryptionKeyCount?: number;
    missingDecryptionKeyCount?: number;
    unverifiedEncryptionKeyCount?: number;
    mismatchedDecryptionKeyCount?: number;
    keyringReady?: boolean;
    encryptionError?: string | null;
    decentralizedReady: boolean;
  };
  recordIntegrity: {
    lifecycleStateGuards: boolean;
    transactionReceiptVerification: boolean;
    chain: "Base Sepolia";
    activityRegistry: {
      configured: boolean;
      verificationEnabled: boolean;
      ready: boolean;
      registryAddress: string;
      expectedEscrowAddress: string;
      boundEscrowAddress: string | null;
      checkedAt: string | null;
      error: string | null;
    };
    activityIndexer: {
      configured: boolean;
      healthy: boolean;
      caughtUp: boolean;
      lastStartedAt: string | null;
      lastSucceededAt: string | null;
      nextBlock: number | null;
      latestFinalizedBlock: number | null;
      pendingEventCount: number;
      unmatchedEventCount: number;
      error: string | null;
      confirmationBlocks: number;
    };
  };
  addressValidation: {
    configured: boolean;
    provider: "Photon / OpenStreetMap";
    tamperResistantProfiles: boolean;
  };
  complianceSources: {
    configured: boolean;
    proposalGateEnforced: boolean;
    total: number;
    tracked: number;
    changed: number;
    unreachable: number;
    manualReviewCurrent: number;
    pending: number;
    stale: number;
    blocked: number;
    lastRunAt: string | null;
    monitorHealthy: boolean;
    monitorExpectedIntervalMinutes: number;
    monitorLastRunAgeMinutes: number | null;
    maxVerificationAgeDays: number;
    ready: boolean;
  };
}

export interface AccountDataInventory {
  schema: "openescrow.account-data-inventory.v1";
  generatedAt: string;
  scope: string;
  verifiedEmailCount: number;
  records: Array<{
    proposalId: string;
    role: NegotiationRole;
    status: NegotiationStatus;
    updatedAt: string;
    archived: boolean;
  }>;
  accountSettings: {
    activeRecordSessions: number;
    archivedRecordPreferences: number;
    notificationPreferences: NotificationPreferences | null;
  };
  boundaries: {
    includesPrivateEvidence: false;
    includesInvitationOrSessionTokens: false;
    includesOtherParticipantDetails: false;
    deletesOrChangesData: false;
    publicBlockchainRecordsCanBeErased: false;
  };
}

export interface AgreementSnapshot {
  algorithm: "SHA-256";
  hash: `0x${string}`;
  canonical: string;
  snapshot: Record<string, unknown>;
}

export interface NegotiationEvent {
  id: number;
  createdAt: string;
  actorRole: NegotiationRole | "system";
  action: string;
  summary: string;
  revision: number;
  metadata?: Record<string, unknown> | null;
}

export interface NegotiationTenant {
  id: string;
  name: string | null;
  email: string;
  approved: boolean;
  wallet: string | null;
  isFundingTenant: boolean;
  acceptedAt: string | null;
  invitationSentAt?: string | null;
  depositShareBps: number;
}

export interface NegotiationRecord {
  id: string;
  status: NegotiationStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  landlordName: string | null;
  landlordEmail: string;
  tenantName: string | null;
  tenantEmail: string;
  tenants: NegotiationTenant[];
  arbiterName: string | null;
  arbiterEmail: string | null;
  arbiterInvitationSentAt?: string | null;
  terms: AgreementTerms;
  tenantApproved: boolean;
  arbiterApproved: boolean;
  tenantWallet: string | null;
  arbiterWallet: string | null;
  arbiterReplacement?: {
    email: string;
    wallet: string;
    status: "proposed" | "confirmed";
    proposedByRole: "landlord" | "tenant";
    proposedAt: string;
    confirmedAt: string | null;
  } | null;
  onchainAgreementId: string | null;
  onchainTxHash: string | null;
  viewerTenantId?: string;
  viewerEmail?: string;
  events: NegotiationEvent[];
}

export interface NegotiationAccess {
  proposalId: string;
  role: NegotiationRole;
  token: string;
  archived?: boolean;
  source?: "account" | "invite";
}

export interface CreatedNegotiation {
  record: NegotiationRecord;
  access: {
    landlord: string;
    tenant: string;
    tenants: Array<{
      id: string;
      name: string | null;
      email: string;
      token: string;
      isFundingTenant: boolean;
      depositShareBps: number;
    }>;
    arbiter: string | null;
  };
}

export type ProposalInvitationResult =
  | {
      sent: true;
      duplicate: boolean;
      provider: "resend" | "webhook";
      messageId: string;
      recipientEmail: string;
    }
  | {
      sent: false;
      pending: true;
      duplicate: true;
      provider: "resend" | "webhook";
      recipientEmail: string;
    };

export interface ProposalInvitationValidation {
  current: true;
  recipientEmail: string;
}

type SerializableFundingIntent = Omit<FundingIntent, "amountMicros"> & {
  amountMicros: string;
};

export interface DurableFundingCheckoutResult {
  checkout: FundingCheckoutLifecycle;
  created: boolean;
  requestedIntentMatched: boolean;
  durable: true;
  sandboxOnly: true;
}

export interface DurableFundingCheckoutRecovery {
  checkout: FundingCheckoutLifecycle | null;
  requestedIntentMatched: boolean;
  durable: true;
  sandboxOnly: true;
}

export interface DurableFundingCheckoutEventResult {
  checkout: FundingCheckoutLifecycle;
  duplicate: boolean;
  durable: true;
  sandboxOnly: true;
}

const LATEST_LANDLORD_ACCESS = "openescrow.latestLandlordProposal";
const LATEST_LANDLORD_BUNDLE = "openescrow.latestLandlordProposalBundle";
const ACCESS_INDEX = "openescrow.negotiationAccessIndex";
const LANDLORD_BUNDLE_PREFIX = "openescrow.landlordProposalBundle.";
const memoryAccesses = new Map<string, NegotiationAccess>();
const memoryLandlordBundles = new Map<string, string>();
let memoryLatestLandlordAccess: NegotiationAccess | null = null;

interface NegotiationAccessReference {
  proposalId: string;
  role: NegotiationRole;
}

function accessKey(proposalId: string, role: NegotiationRole) {
  return `openescrow.negotiationAccess.${proposalId}.${role}`;
}

function serializeFundingIntent(intent: FundingIntent): SerializableFundingIntent {
  return {
    ...intent,
    amountMicros: intent.amountMicros.toString(),
  };
}

function legacyAccessKey(proposalId: string) {
  return `openescrow.negotiationAccess.${proposalId}`;
}

function landlordBundleKey(proposalId: string) {
  return `${LANDLORD_BUNDLE_PREFIX}${proposalId}`;
}

function availableStorages(
  kinds: BrowserRecoveryStorageKind[] = ["session", "local"],
): BrowserRecoveryStorage[] {
  return kinds
    .map((kind) => getBrowserRecoveryStorage(kind))
    .filter((storage): storage is BrowserRecoveryStorage => Boolean(storage));
}

function writeAvailable(
  key: string,
  value: string,
  kinds: BrowserRecoveryStorageKind[],
) {
  let stored = false;
  for (const storage of availableStorages(kinds)) {
    stored = writeRecoveryValue(key, value, storage) || stored;
  }
  return stored;
}

function isNegotiationAccess(value: unknown): value is NegotiationAccess {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NegotiationAccess>;
  return (
    typeof candidate.proposalId === "string" &&
    candidate.proposalId.length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    (candidate.role === "landlord" ||
      candidate.role === "tenant" ||
      candidate.role === "arbiter")
  );
}

function readAccessIndex(): NegotiationAccessReference[] {
  const references: NegotiationAccessReference[] = [];
  for (const storage of availableStorages(["local", "session"])) {
    const raw = readRecoveryValue(ACCESS_INDEX, storage);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as NegotiationAccessReference[];
      for (const item of parsed) {
        if (
          item?.proposalId &&
          (item.role === "landlord" ||
            item.role === "tenant" ||
            item.role === "arbiter") &&
          !references.some(
            (saved) =>
              saved.proposalId === item.proposalId && saved.role === item.role,
          )
        ) {
          references.push(item);
        }
      }
    } catch {
      clearRecoveryValue(ACCESS_INDEX, storage);
    }
  }
  for (const access of memoryAccesses.values()) {
    if (
      !references.some(
        (saved) =>
          saved.proposalId === access.proposalId && saved.role === access.role,
      )
    ) {
      references.push({ proposalId: access.proposalId, role: access.role });
    }
  }
  return references;
}

function rememberAccessReference(access: NegotiationAccess) {
  const references = readAccessIndex();
  if (
    !references.some(
      (item) => item.proposalId === access.proposalId && item.role === access.role,
    )
  ) {
    references.push({ proposalId: access.proposalId, role: access.role });
  }
  writeAvailable(
    ACCESS_INDEX,
    JSON.stringify(references),
    ["local", "session"],
  );
}

export function storeNegotiationAccess(access: NegotiationAccess, persistent = false) {
  const key = accessKey(access.proposalId, access.role);
  const saved = { ...access };
  memoryAccesses.set(key, saved);
  const durable = persistent && access.source !== "invite";
  const stored = writeAvailable(
    key,
    JSON.stringify(saved),
    durable ? ["local", "session"] : ["session"],
  );
  if (durable && access.role === "landlord") {
    memoryLatestLandlordAccess = saved;
    writeAvailable(
      LATEST_LANDLORD_ACCESS,
      JSON.stringify(saved),
      ["local", "session"],
    );
  }
  if (durable) rememberAccessReference(access);
  if (access.source === "invite") {
    if (
      access.role === "landlord" &&
      memoryLatestLandlordAccess?.source === "invite" &&
      memoryLatestLandlordAccess?.proposalId === access.proposalId &&
      memoryLatestLandlordAccess.token === access.token
    ) {
      memoryLatestLandlordAccess = null;
    }
    const localStorage = getBrowserRecoveryStorage("local");
    if (localStorage) {
      clearRecoveryValue(key, localStorage);
      if (access.role === "landlord") {
        clearRecoveryJsonIf(
          LATEST_LANDLORD_ACCESS,
          (value) =>
            isNegotiationAccess(value) &&
            value.source === "invite" &&
            value.proposalId === access.proposalId &&
            value.token === access.token,
          localStorage,
        );
      }
    }
  }
  return stored ? (durable ? "persistent" : "session") : "memory";
}

export function readNegotiationAccess(
  proposalId: string,
  role?: NegotiationRole,
): NegotiationAccess | null {
  const keys = role
    ? [accessKey(proposalId, role), legacyAccessKey(proposalId)]
    : [
        accessKey(proposalId, "landlord"),
        accessKey(proposalId, "tenant"),
        accessKey(proposalId, "arbiter"),
        legacyAccessKey(proposalId),
      ];
  for (const key of keys) {
    const saved = memoryAccesses.get(key);
    if (saved && (!role || saved.role === role)) return saved;
  }
  for (const storage of availableStorages()) {
    for (const key of keys) {
      const raw = readRecoveryValue(key, storage);
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          isNegotiationAccess(parsed) &&
          parsed.proposalId === proposalId &&
          (!role || parsed.role === role)
        ) {
          memoryAccesses.set(accessKey(parsed.proposalId, parsed.role), parsed);
          return parsed;
        }
        clearRecoveryValue(key, storage);
      } catch {
        clearRecoveryValue(key, storage);
      }
    }
  }
  return null;
}

export function listNegotiationAccesses(role?: NegotiationRole): NegotiationAccess[] {
  const accesses = readAccessIndex()
    .filter((item) => !role || item.role === role)
    .map((item) => readNegotiationAccess(item.proposalId, item.role))
    .filter((item): item is NegotiationAccess => Boolean(item));

  const latestLandlord = readLatestLandlordAccess();
  if (
    latestLandlord &&
    (!role || role === "landlord") &&
    !accesses.some(
      (item) =>
        item.proposalId === latestLandlord.proposalId && item.role === latestLandlord.role,
    )
  ) {
    accesses.push(latestLandlord);
  }
  return accesses;
}

export function clearAccountNegotiationAccesses() {
  for (const [key, access] of memoryAccesses) {
    if (access.source === "account") memoryAccesses.delete(key);
  }
  if (memoryLatestLandlordAccess?.source === "account") {
    memoryLatestLandlordAccess = null;
  }

  const references = readAccessIndex();
  for (const reference of references) {
    const keys = [
      accessKey(reference.proposalId, reference.role),
      legacyAccessKey(reference.proposalId),
    ];
    for (const storage of availableStorages()) {
      for (const key of keys) {
        const raw = readRecoveryValue(key, storage);
        if (!raw) continue;
        try {
          const access: unknown = JSON.parse(raw);
          if (isNegotiationAccess(access) && access.source === "account") {
            clearRecoveryValue(key, storage);
          }
        } catch {
          clearRecoveryValue(key, storage);
        }
      }
    }
  }
  const remaining = references.filter((reference) =>
    Boolean(readNegotiationAccess(reference.proposalId, reference.role)),
  );
  writeAvailable(
    ACCESS_INDEX,
    JSON.stringify(remaining),
    ["local", "session"],
  );

  for (const storage of availableStorages()) {
    const raw = readRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
    if (!raw) continue;
    try {
      const latest: unknown = JSON.parse(raw);
      if (isNegotiationAccess(latest) && latest.source === "account") {
        clearRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
      }
    } catch {
      clearRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
    }
  }
}

export function readLatestLandlordAccess(): NegotiationAccess | null {
  if (
    memoryLatestLandlordAccess?.role === "landlord" &&
    memoryLatestLandlordAccess.proposalId &&
    memoryLatestLandlordAccess.token
  ) {
    return memoryLatestLandlordAccess;
  }
  for (const storage of availableStorages(["local", "session"])) {
    const raw = readRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isNegotiationAccess(parsed) && parsed.role === "landlord") {
        memoryLatestLandlordAccess = parsed;
        memoryAccesses.set(accessKey(parsed.proposalId, parsed.role), parsed);
        return parsed;
      }
      clearRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
    } catch {
      clearRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
    }
  }
  return null;
}

export function rememberLandlordBundle(created: CreatedNegotiation) {
  const serialized = JSON.stringify({ proposalId: created.record.id, access: created.access });
  const specificKey = landlordBundleKey(created.record.id);
  memoryLandlordBundles.set(LATEST_LANDLORD_BUNDLE, serialized);
  memoryLandlordBundles.set(specificKey, serialized);
  const latestStored = writeAvailable(
    LATEST_LANDLORD_BUNDLE,
    serialized,
    ["local", "session"],
  );
  const specificStored = writeAvailable(
    specificKey,
    serialized,
    ["local", "session"],
  );
  return latestStored && specificStored ? "persistent" : "memory";
}

function parseLandlordBundle(
  candidate: string | null,
  proposalId?: string,
): {
  proposalId: string;
  access: CreatedNegotiation["access"];
} | null {
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as {
      proposalId: string;
      access: CreatedNegotiation["access"];
    };
    if (proposalId && parsed.proposalId !== proposalId) return null;
    return parsed.proposalId && parsed.access?.landlord && parsed.access?.tenant
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function readLandlordBundle(proposalId?: string): {
  proposalId: string;
  access: CreatedNegotiation["access"];
} | null {
  const keys = proposalId
    ? [landlordBundleKey(proposalId), LATEST_LANDLORD_BUNDLE]
    : [LATEST_LANDLORD_BUNDLE];
  for (const key of keys) {
    const memory = parseLandlordBundle(
      memoryLandlordBundles.get(key) || null,
      proposalId,
    );
    if (memory) return memory;
  }
  for (const storage of availableStorages(["local", "session"])) {
    for (const key of keys) {
      const raw = readRecoveryValue(key, storage);
      const parsed = parseLandlordBundle(raw, proposalId);
      if (parsed) {
        memoryLandlordBundles.set(key, raw || "");
        return parsed;
      }
      if (raw) clearRecoveryValue(key, storage);
    }
  }
  return null;
}

export function clearLandlordBundle(proposalId?: string) {
  const bundle = readLandlordBundle(proposalId);
  const targetId = proposalId || bundle?.proposalId;
  if (targetId) {
    const landlordKey = accessKey(targetId, "landlord");
    memoryAccesses.delete(landlordKey);
    memoryAccesses.delete(legacyAccessKey(targetId));
    memoryLandlordBundles.delete(landlordBundleKey(targetId));
    for (const storage of availableStorages()) {
      clearRecoveryValue(landlordKey, storage);
      clearRecoveryValue(legacyAccessKey(targetId), storage);
      clearRecoveryValue(landlordBundleKey(targetId), storage);
    }
    const references = readAccessIndex().filter(
      (item) => !(item.proposalId === targetId && item.role === "landlord"),
    );
    writeAvailable(
      ACCESS_INDEX,
      JSON.stringify(references),
      ["local", "session"],
    );
  }
  const latest = readLatestLandlordAccess();
  const latestBundle = readLandlordBundle();
  if (
    !targetId ||
    latest?.proposalId === targetId ||
    latestBundle?.proposalId === targetId
  ) {
    memoryLatestLandlordAccess = null;
    memoryLandlordBundles.delete(LATEST_LANDLORD_BUNDLE);
    for (const storage of availableStorages()) {
      clearRecoveryValue(LATEST_LANDLORD_ACCESS, storage);
      clearRecoveryValue(LATEST_LANDLORD_BUNDLE, storage);
    }
  }
}

export function captureNegotiationAccessFromUrl(): NegotiationAccess | null {
  const url = new URL(window.location.href);
  const proposalId = url.searchParams.get("proposal");
  const invitationCredential = readInvitationCredential(url);
  const token = invitationCredential.token;
  const role = url.searchParams.get("access") || url.searchParams.get("invite");
  const validRole =
    role === "landlord" || role === "tenant" || role === "arbiter";
  const validInvitation = Boolean(proposalId && token && validRole);
  if (proposalId && !invitationCredential.present) {
    const recovered =
      recoverUniqueNegotiationAccessForProposal(proposalId);
    if (recovered) return recovered;
    const currentPageMatches = (
      ["landlord", "tenant", "arbiter"] as const
    )
      .map((candidateRole) =>
        readNegotiationAccess(proposalId, candidateRole),
      )
      .filter(
        (access): access is NegotiationAccess =>
          Boolean(access?.source === "invite"),
      );
    return currentPageMatches.length === 1
      ? currentPageMatches[0]
      : null;
  }
  if (invitationCredential.present) {
    clearInvitationCredential(url);
    url.searchParams.delete("access");
    if (!validInvitation) url.searchParams.delete("invite");
    if (!replaceRecoveryUrl(url)) {
      try {
        window.location.replace(url.toString());
      } catch {
        // Continue in memory if the browser refuses both same-page URL updates.
      }
    }
  }
  if (
    !proposalId ||
    !token ||
    !validRole
  ) {
    return null;
  }

  const access: NegotiationAccess = { proposalId, token, role, source: "invite" };
  storeNegotiationAccess(access);
  return access;
}

export function buildNegotiationInviteUrl(
  role: InviteRole,
  proposalId: string,
  token: string,
) {
  const url = new URL(publicAppOrigin());
  url.searchParams.set("invite", role);
  url.searchParams.set("proposal", proposalId);
  setInvitationCredential(url, token);
  return url.toString();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The agreement record could not be updated.");
  return data;
}

export async function createNegotiation(input: {
  landlordName: string;
  landlordEmail: string;
  tenantName: string;
  tenantEmail: string;
  tenants?: Array<{ name: string; email: string; depositShareBps: number }>;
  arbiterName: string;
  arbiterEmail: string | null;
  terms: AgreementTerms;
}) {
  return request<CreatedNegotiation>("/api/negotiations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendNegotiationInvitation(
  access: NegotiationAccess,
  invitation: {
    invitedRole: InviteRole;
    invitedTenantId?: string;
    invitationUrl: string;
  },
) {
  return request<ProposalInvitationResult>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/invitations`,
    {
      method: "POST",
      body: JSON.stringify({
        token: access.token,
        ...invitation,
      }),
    },
  );
}

export function validateNegotiationInvitation(
  access: NegotiationAccess,
  invitation: {
    invitedRole: InviteRole;
    invitedTenantId?: string;
    invitationUrl: string;
  },
) {
  return request<ProposalInvitationValidation>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/invitations`,
    {
      method: "POST",
      body: JSON.stringify({
        token: access.token,
        ...invitation,
        validateOnly: true,
      }),
    },
  );
}

export function addNegotiationTenant(
  access: NegotiationAccess,
  tenant: { name: string; email: string },
) {
  return request<{
    record: NegotiationRecord;
    invite: {
      id: string;
      name: string | null;
      email: string;
      token: string;
      isFundingTenant: false;
      depositShareBps: number;
    };
  }>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/tenants`,
    {
      method: "POST",
      body: JSON.stringify({ token: access.token, ...tenant }),
    },
  );
}

export function updateNegotiationTenant(
  access: NegotiationAccess,
  tenantId: string,
  tenant: { name: string; email: string },
) {
  return request<{
    record: NegotiationRecord;
    invite: CreatedNegotiation["access"]["tenants"][number] | null;
  }>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ token: access.token, ...tenant }),
    },
  );
}

export function removeNegotiationTenant(
  access: NegotiationAccess,
  tenantId: string,
) {
  return request<{
    record: NegotiationRecord;
    removedTenantId: string;
    promotedTenantId: string | null;
  }>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ token: access.token }),
    },
  );
}

export function resetNegotiationTenantInvite(
  access: NegotiationAccess,
  tenantId: string,
) {
  return request<{
    record: NegotiationRecord;
    invite: CreatedNegotiation["access"]["tenants"][number];
  }>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/tenants/${encodeURIComponent(tenantId)}`,
    {
      method: "POST",
      body: JSON.stringify({ token: access.token }),
    },
  );
}

export function resetNegotiationArbiterInvite(access: NegotiationAccess) {
  return request<{
    record: NegotiationRecord;
    invite: {
      email: string;
      token: string;
    };
  }>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/arbiter`,
    {
      method: "POST",
      body: JSON.stringify({ token: access.token }),
    },
  );
}

export async function loadNegotiation(access: NegotiationAccess) {
  return request<NegotiationRecord>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}`,
    {
      headers: { authorization: `Bearer ${access.token}` },
    },
  );
}

export async function discoverNegotiationsForAccount(
  role: NegotiationRole,
  identityToken: string,
) {
  const result = await request<{ accesses: NegotiationAccess[] }>(
    "/api/negotiations/discover",
    {
      method: "POST",
      headers: { "privy-id-token": identityToken },
      body: JSON.stringify({ role }),
    },
  );
  const accesses = result.accesses.map((access) => ({
    ...access,
    source: "account" as const,
  }));
  accesses.forEach((access) => storeNegotiationAccess(access, true));
  return accesses;
}

export function revokeAccountSessions(identityToken: string) {
  return request<{
    revoked: true;
    revokedSessions: number;
  }>("/api/profile/account-sessions/revoke", {
    method: "POST",
    headers: { "privy-id-token": identityToken },
  });
}

export function loadAccountDataInventory(identityToken: string) {
  return request<AccountDataInventory>("/api/profile/data-inventory", {
    headers: { "privy-id-token": identityToken },
  });
}

export function updateRecordArchivePreference(
  identityToken: string,
  access: Pick<NegotiationAccess, "proposalId" | "role">,
  archived: boolean,
) {
  return request<{
    proposalId: string;
    role: NegotiationRole;
    archived: boolean;
    archivedAt: string | null;
  }>("/api/profile/record-archives", {
    method: "PUT",
    headers: { "privy-id-token": identityToken },
    body: JSON.stringify({
      proposalId: access.proposalId,
      role: access.role,
      archived,
    }),
  });
}

export function loadNotificationPreferences(identityToken: string) {
  return request<NotificationPreferences>("/api/profile/notification-preferences", {
    headers: { "privy-id-token": identityToken },
  });
}

export function saveNotificationPreferences(
  identityToken: string,
  preferences: Pick<
    NotificationPreferences,
    "agreementActivity" | "deadlineReminders"
  >,
) {
  return request<NotificationPreferences>("/api/profile/notification-preferences", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "privy-id-token": identityToken,
    },
    body: JSON.stringify(preferences),
  });
}

export function loadServiceReadiness() {
  return request<ServiceReadiness>("/api/system/readiness");
}

export function sendNotificationTest(identityToken: string) {
  return request<{
    sent: boolean;
    duplicate: boolean;
    provider: "resend" | "webhook";
    messageId: string;
  }>("/api/profile/test-email", {
    method: "POST",
    headers: { "privy-id-token": identityToken },
  });
}

export function sendLandlordInvite(identityToken: string, landlordEmail: string) {
  return request<{
    sent: boolean;
    duplicate: boolean;
    provider: "resend" | "webhook";
    messageId: string;
  }>("/api/profile/landlord-invite", {
    method: "POST",
    headers: { "privy-id-token": identityToken },
    body: JSON.stringify({ landlordEmail }),
  });
}

export function createDurableFundingCheckout(
  access: NegotiationAccess,
  intent: FundingIntent,
  attemptId: string,
) {
  return request<DurableFundingCheckoutResult>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/funding-checkouts`,
    {
      method: "POST",
      body: JSON.stringify({
        token: access.token,
        attemptId,
        intent: serializeFundingIntent(intent),
      }),
    },
  );
}

export function recoverDurableFundingCheckout(
  access: NegotiationAccess,
  intent: FundingIntent,
) {
  return request<DurableFundingCheckoutRecovery>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/funding-checkouts/recover`,
    {
      method: "POST",
      body: JSON.stringify({
        token: access.token,
        intent: serializeFundingIntent(intent),
      }),
    },
  );
}

export function appendDurableFundingCheckoutEvent(
  access: NegotiationAccess,
  attemptId: string,
  event: {
    eventId: string;
    status: unknown;
    providerStatus?: unknown;
  },
) {
  return request<DurableFundingCheckoutEventResult>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/funding-checkouts/${encodeURIComponent(attemptId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        token: access.token,
        ...event,
      }),
    },
  );
}

export type NegotiationAction =
    | { type: "approve"; wallet: string; name?: string; assetConsent?: boolean }
    | { type: "propose_change"; summary: string }
    | {
        type: "revise";
        summary: string;
        terms: AgreementTerms;
        participants?: {
          landlordName?: string;
          tenantName?: string;
          arbiterName?: string;
        };
      }
    | {
        type: "update_tenant_shares";
        shares: Array<{ tenantId: string; depositShareBps: number }>;
      }
    | { type: "cancel_proposal" }
    | { type: "onchain_proposal_cancelled"; transactionHash: string }
    | {
        type: "invitation_prepared";
        invitedRole: InviteRole;
        invitedTenantId?: string;
        method: "gmail" | "copy";
      }
    | { type: "preflight_finalize" }
    | { type: "finalize"; agreementId: string; transactionHash: string }
    | { type: "operations_reserve_paid"; amount?: string; transactionHash: string }
    | { type: "tenant_share_funded"; amount?: string; transactionHash: string }
    | { type: "agreement_funded"; transactionHash: string }
    | {
        type: "propose_compliance_event";
        eventName: string;
        occurredAt: string;
        note?: string;
      }
    | {
        type: "confirm_compliance_event";
        proposalEventId: number;
      }
    | {
        type: "propose_compliance_fact";
        factName: string;
        value: boolean;
        note?: string;
      }
    | {
        type: "confirm_compliance_fact";
        proposalEventId: number;
      }
    | {
        type: "reject_compliance_fact";
        proposalEventId: number;
        note?: string;
      }
    | {
        type: "record_snapshot_anchored";
        snapshotHash: string;
        transactionHash: string;
      }
    | {
        type: "activity_hash_published";
        activityType: 1 | 2 | 3 | 4;
        contentHash: string;
        transactionHash: string;
      }
    | {
        type: "claim_submitted";
        amount: string;
        category: string;
        items: DeductionLineItem[];
        note: string;
        evidenceUri: string;
        evidenceHash: string;
        claimConfirmations: ClaimPacketConfirmations;
        transactionHash: string;
      }
    | {
        type: "claim_amended";
        amount: string;
        items: DeductionLineItem[];
        note: string;
        evidenceUri: string;
        evidenceHash: string;
        claimConfirmations: ClaimPacketConfirmations;
        transactionHash: string;
      }
    | { type: "claim_notification_prepared"; method: "gmail" | "copy" }
    | {
        type: "claim_response";
        decision: "approve" | "partial" | "dispute";
        acceptedAmount: string;
        note: string;
        transactionHash: string;
      }
    | { type: "claim_response_notification_prepared"; method: "gmail" | "copy" }
    | {
        type: "arbiter_ruling";
        awardToLandlord: string;
        note: string;
        transactionHash: string;
      }
    | {
        type: "withdrawal_completed";
        amount: string;
        transactionHash: string;
      }
    | {
        type: "timeout_executed";
        timeout:
          | "no_claim_refund"
          | "no_response_dispute"
          | "arbiter_timeout_refund";
        transactionHash: string;
      };

export async function negotiationAction(
  access: NegotiationAccess,
  action: NegotiationAction,
) {
  return request<NegotiationRecord>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ token: access.token, ...action }),
    },
  );
}

export type ArbiterReplacementAction =
  | {
      type: "arbiter_replacement_proposed";
      newArbiterEmail: string;
      newArbiterWallet: string;
      transactionHash: string;
    }
  | {
      type:
        | "arbiter_replacement_confirmed"
        | "arbiter_replacement_cancelled"
        | "arbiter_replacement_accepted";
      transactionHash: string;
    }
  | { type: "arbiter_replacement_invite_reset" };

export interface ArbiterReplacementActionResult {
  record: NegotiationRecord;
  invite: {
    email: string;
    wallet: string;
    token: string;
    availableAfterConfirmation: true;
  } | null;
}

export async function arbiterReplacementAction(
  access: NegotiationAccess,
  action: ArbiterReplacementAction,
): Promise<ArbiterReplacementActionResult> {
  const result = await request<
    NegotiationRecord | {
      record: NegotiationRecord;
      invite: NonNullable<ArbiterReplacementActionResult["invite"]>;
    }
  >(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ token: access.token, ...action }),
    },
  );
  return "record" in result
    ? result
    : { record: result, invite: null };
}

export async function loadNegotiationReport(access: NegotiationAccess) {
  const response = await fetch(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/report?download=1`,
    {
      headers: { authorization: `Bearer ${access.token}` },
    },
  );
  if (!response.ok) {
    let message = "The complete record report could not be downloaded.";
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as { error?: string };
        if (data.error) message = data.error;
      } else {
        const text = (await response.text()).trim();
        if (text && text.length <= 240) message = text;
      }
    } catch {
      // Keep the consistent consumer-facing fallback above.
    }
    throw new Error(message);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const suppliedFilename = disposition
    .match(/filename="([^"]+)"/i)?.[1]
    ?.replace(/[^a-zA-Z0-9._-]/g, "-");
  const fallbackId = access.proposalId.replace(/[^a-zA-Z0-9-]/g, "-");
  return {
    content: await response.text(),
    contentType: response.headers.get("content-type") || "text/html; charset=utf-8",
    filename:
      suppliedFilename || `openescrow-${fallbackId}-complete-record.html`,
  };
}

export function loadNegotiationSnapshot(access: NegotiationAccess) {
  return request<AgreementSnapshot>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/snapshot`,
    {
      headers: { authorization: `Bearer ${access.token}` },
    },
  );
}

export async function uploadEvidenceDocument(
  access: NegotiationAccess,
  file: File,
): Promise<{
  reference: string;
  uri: string;
  gatewayUrl: string;
  sha256: string;
  storageKind:
    | "private"
    | "encrypted"
    | "encrypted-private"
    | "encrypted-decentralized";
}> {
  const form = new FormData();
  form.set("proposalId", access.proposalId);
  form.set("token", access.token);
  form.set("file", file);
  const response = await fetch("/api/evidence", { method: "POST", body: form });
  const data = (await response.json()) as {
    cid?: string;
    uri?: string;
    gatewayUrl?: string;
    sha256?: string;
    storageKind?:
      | "private"
      | "encrypted"
      | "encrypted-private"
      | "encrypted-decentralized";
    error?: string;
  };
  if (
    !response.ok ||
    !data.cid ||
    !data.uri ||
    !data.gatewayUrl ||
    !data.sha256 ||
    !data.storageKind
  ) {
    throw new Error(data.error || "The evidence file could not be stored.");
  }
  return {
    reference: data.cid,
    uri: data.uri,
    gatewayUrl: data.gatewayUrl,
    sha256: data.sha256,
    storageKind: data.storageKind,
  };
}

export async function sendClaimNotification(
  access: NegotiationAccess,
  input: {
    reviewLinks: Array<{
      tenantId: string;
      email: string;
      reviewUrl: string;
    }>;
  },
) {
  return request<{ messageId: string }>("/api/notifications/claim", {
    method: "POST",
    body: JSON.stringify({ proposalId: access.proposalId, token: access.token, ...input }),
  });
}

export async function sendClaimResponseNotification(
  access: NegotiationAccess,
  input: {
    transactionHash: string;
  },
) {
  return request<{ messageId: string; duplicate?: boolean }>(
    "/api/notifications/claim-response",
    {
      method: "POST",
      body: JSON.stringify({
        proposalId: access.proposalId,
        token: access.token,
        ...input,
      }),
    },
  );
}
