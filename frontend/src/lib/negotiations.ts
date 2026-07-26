import type { InviteRole } from "./inviteContext";
import type { ComplianceFacts, ComplianceSnapshot } from "./jurisdictions";
import type {
  DepositAssetId,
  DepositAssetSnapshot,
} from "../../shared/deposit-assets.js";

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

export interface CaliforniaClaimConfirmations {
  itemizedStatement: true;
  supportingDocuments: true;
  moveInPhotos?: true;
  preRepairPhotos?: true;
  postRepairPhotos?: true;
}

export interface NotificationPreferences {
  agreementActivity: boolean;
  deadlineReminders: boolean;
  consentedAt?: string | null;
  updatedAt?: string | null;
}

export interface ServiceReadiness {
  email: {
    configured: boolean;
    provider: "resend" | "webhook" | null;
    schedulerConfigured: boolean;
    schedulerLastRunAt: string | null;
  };
  evidence: {
    configured: boolean;
    mode: "private-r2" | "encrypted-ipfs" | "unconfigured";
    encryptedAtRest: boolean;
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
  };
  complianceSources: {
    configured: boolean;
    total: number;
    tracked: number;
    changed: number;
    unreachable: number;
    lastRunAt: string | null;
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
  terms: AgreementTerms;
  tenantApproved: boolean;
  arbiterApproved: boolean;
  tenantWallet: string | null;
  arbiterWallet: string | null;
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

const LATEST_LANDLORD_ACCESS = "openescrow.latestLandlordProposal";
const LATEST_LANDLORD_BUNDLE = "openescrow.latestLandlordProposalBundle";
const ACCESS_INDEX = "openescrow.negotiationAccessIndex";
const LANDLORD_BUNDLE_PREFIX = "openescrow.landlordProposalBundle.";

interface NegotiationAccessReference {
  proposalId: string;
  role: NegotiationRole;
}

function accessKey(proposalId: string, role: NegotiationRole) {
  return `openescrow.negotiationAccess.${proposalId}.${role}`;
}

function legacyAccessKey(proposalId: string) {
  return `openescrow.negotiationAccess.${proposalId}`;
}

function landlordBundleKey(proposalId: string) {
  return `${LANDLORD_BUNDLE_PREFIX}${proposalId}`;
}

function readAccessIndex(): NegotiationAccessReference[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACCESS_INDEX) || "[]") as NegotiationAccessReference[];
    return parsed.filter(
      (item) =>
        item?.proposalId &&
        (item.role === "landlord" || item.role === "tenant" || item.role === "arbiter"),
    );
  } catch {
    return [];
  }
}

function rememberAccessReference(access: NegotiationAccess) {
  const references = readAccessIndex();
  if (
    !references.some(
      (item) => item.proposalId === access.proposalId && item.role === access.role,
    )
  ) {
    references.push({ proposalId: access.proposalId, role: access.role });
    window.localStorage.setItem(ACCESS_INDEX, JSON.stringify(references));
  }
}

export function storeNegotiationAccess(access: NegotiationAccess, persistent = false) {
  const storage = persistent ? window.localStorage : window.sessionStorage;
  storage.setItem(accessKey(access.proposalId, access.role), JSON.stringify(access));
  if (persistent && access.role === "landlord") {
    window.localStorage.setItem(LATEST_LANDLORD_ACCESS, JSON.stringify(access));
  }
  if (persistent) rememberAccessReference(access);
}

export function readNegotiationAccess(
  proposalId: string,
  role?: NegotiationRole,
): NegotiationAccess | null {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys = role
        ? [accessKey(proposalId, role), legacyAccessKey(proposalId)]
        : [
            accessKey(proposalId, "landlord"),
            accessKey(proposalId, "tenant"),
            accessKey(proposalId, "arbiter"),
            legacyAccessKey(proposalId),
          ];
      for (const key of keys) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as NegotiationAccess;
        if (
          parsed.proposalId === proposalId &&
          parsed.token &&
          parsed.role &&
          (!role || parsed.role === role)
        ) {
          return parsed;
        }
      }
    } catch {
      // Ignore unavailable or malformed browser storage.
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

export function readLatestLandlordAccess(): NegotiationAccess | null {
  try {
    const raw = window.localStorage.getItem(LATEST_LANDLORD_ACCESS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NegotiationAccess;
    return parsed.role === "landlord" && parsed.proposalId && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberLandlordBundle(created: CreatedNegotiation) {
  const serialized = JSON.stringify({ proposalId: created.record.id, access: created.access });
  window.localStorage.setItem(LATEST_LANDLORD_BUNDLE, serialized);
  window.localStorage.setItem(landlordBundleKey(created.record.id), serialized);
}

export function readLandlordBundle(proposalId?: string): {
  proposalId: string;
  access: CreatedNegotiation["access"];
} | null {
  try {
    const raw = window.localStorage.getItem(
      proposalId ? landlordBundleKey(proposalId) : LATEST_LANDLORD_BUNDLE,
    );
    const fallback =
      proposalId && !raw ? window.localStorage.getItem(LATEST_LANDLORD_BUNDLE) : null;
    const candidate = raw || fallback;
    if (!candidate) return null;
    const parsed = JSON.parse(candidate) as {
      proposalId: string;
      access: CreatedNegotiation["access"];
    };
    if (proposalId && parsed.proposalId !== proposalId) return null;
    return parsed.proposalId && parsed.access?.landlord && parsed.access?.tenant ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLandlordBundle(proposalId?: string) {
  try {
    const bundle = readLandlordBundle(proposalId);
    const targetId = proposalId || bundle?.proposalId;
    if (targetId) {
      window.localStorage.removeItem(accessKey(targetId, "landlord"));
      window.localStorage.removeItem(legacyAccessKey(targetId));
      window.localStorage.removeItem(landlordBundleKey(targetId));
      const references = readAccessIndex().filter(
        (item) => !(item.proposalId === targetId && item.role === "landlord"),
      );
      window.localStorage.setItem(ACCESS_INDEX, JSON.stringify(references));
    }
    const latest = readLatestLandlordAccess();
    if (!targetId || latest?.proposalId === targetId) {
      window.localStorage.removeItem(LATEST_LANDLORD_ACCESS);
      window.localStorage.removeItem(LATEST_LANDLORD_BUNDLE);
    }
  } catch {
    // The in-memory proposal can still be cleared.
  }
}

export function captureNegotiationAccessFromUrl(): NegotiationAccess | null {
  const url = new URL(window.location.href);
  const proposalId = url.searchParams.get("proposal");
  const token = url.searchParams.get("token");
  const role = url.searchParams.get("access") || url.searchParams.get("invite");
  if (
    !proposalId ||
    !token ||
    (role !== "landlord" && role !== "tenant" && role !== "arbiter")
  ) {
    return null;
  }

  const access: NegotiationAccess = { proposalId, token, role };
  storeNegotiationAccess(access, true);
  url.searchParams.delete("token");
  url.searchParams.delete("access");
  window.history.replaceState(null, "", url.toString());
  return access;
}

export function buildNegotiationInviteUrl(
  role: InviteRole,
  proposalId: string,
  token: string,
) {
  const url = new URL(window.location.origin);
  url.searchParams.set("invite", role);
  url.searchParams.set("proposal", proposalId);
  url.searchParams.set("token", token);
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

export async function loadNegotiation(access: NegotiationAccess) {
  return request<NegotiationRecord>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}?token=${encodeURIComponent(access.token)}`,
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
  result.accesses.forEach((access) => storeNegotiationAccess(access, true));
  return result.accesses;
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
    | {
        type: "invitation_prepared";
        invitedRole: InviteRole;
        invitedTenantId?: string;
        method: "gmail" | "copy";
      }
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
        californiaConfirmations: CaliforniaClaimConfirmations;
        transactionHash: string;
      }
    | {
        type: "claim_amended";
        amount: string;
        items: DeductionLineItem[];
        note: string;
        evidenceUri: string;
        evidenceHash: string;
        californiaConfirmations: CaliforniaClaimConfirmations;
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

export function negotiationReportUrl(access: NegotiationAccess) {
  return `/api/negotiations/${encodeURIComponent(access.proposalId)}/report?token=${encodeURIComponent(access.token)}`;
}

export function negotiationReportDownloadUrl(access: NegotiationAccess) {
  return `${negotiationReportUrl(access)}&download=1`;
}

export function loadNegotiationSnapshot(access: NegotiationAccess) {
  return request<AgreementSnapshot>(
    `/api/negotiations/${encodeURIComponent(access.proposalId)}/snapshot?token=${encodeURIComponent(access.token)}`,
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
    reviewUrl: string;
    agreementId: string;
    amount: string;
    items: DeductionLineItem[];
    note: string;
    evidenceUri: string;
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
    agreementId: string;
    decision: "approve" | "partial" | "dispute";
    acceptedAmount: string;
    note: string;
    transactionHash: string;
    reviewUrl: string;
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
