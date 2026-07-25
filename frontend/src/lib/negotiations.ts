import type { InviteRole } from "./inviteContext";

export type NegotiationRole = "landlord" | InviteRole;
export type NegotiationStatus = "draft" | "ready" | "finalized";

export interface AgreementTerms {
  jurisdiction: string;
  tokenChoice: "plain" | "yield";
  deposit: string;
  operationsReserve: string;
  claimWindowStart: string;
  claimDays: string;
  responseDays: string;
  arbiterDays: string;
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
  arbiterName: string | null;
  arbiterEmail: string | null;
  terms: AgreementTerms;
  tenantApproved: boolean;
  arbiterApproved: boolean;
  tenantWallet: string | null;
  arbiterWallet: string | null;
  onchainAgreementId: string | null;
  onchainTxHash: string | null;
  events: NegotiationEvent[];
}

export interface NegotiationAccess {
  proposalId: string;
  role: NegotiationRole;
  token: string;
}

export interface CreatedNegotiation {
  record: NegotiationRecord;
  access: {
    landlord: string;
    tenant: string;
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
  arbiterName: string;
  arbiterEmail: string | null;
  terms: AgreementTerms;
}) {
  return request<CreatedNegotiation>("/api/negotiations", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function negotiationAction(
  access: NegotiationAccess,
  action:
    | { type: "approve"; wallet: string; name?: string }
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
    | { type: "invitation_prepared"; invitedRole: InviteRole; method: "gmail" | "copy" }
    | { type: "finalize"; agreementId: string; transactionHash: string }
    | { type: "operations_reserve_paid"; transactionHash: string }
    | {
        type: "claim_submitted";
        amount: string;
        category: string;
        note: string;
        evidenceUri: string;
        evidenceHash: string;
        transactionHash: string;
      }
    | {
        type: "claim_amended";
        amount: string;
        note: string;
        evidenceUri: string;
        evidenceHash: string;
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
    | {
        type: "arbiter_ruling";
        awardToLandlord: string;
        note: string;
        transactionHash: string;
      },
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

export async function uploadEvidenceToIpfs(
  access: NegotiationAccess,
  file: File,
): Promise<{ cid: string; uri: string; gatewayUrl: string }> {
  const form = new FormData();
  form.set("proposalId", access.proposalId);
  form.set("token", access.token);
  form.set("file", file);
  const response = await fetch("/api/evidence", { method: "POST", body: form });
  const data = (await response.json()) as {
    cid?: string;
    uri?: string;
    gatewayUrl?: string;
    error?: string;
  };
  if (!response.ok || !data.cid || !data.uri || !data.gatewayUrl) {
    throw new Error(data.error || "The file could not be uploaded to IPFS.");
  }
  return { cid: data.cid, uri: data.uri, gatewayUrl: data.gatewayUrl };
}

export async function sendClaimNotification(
  access: NegotiationAccess,
  input: {
    reviewUrl: string;
    agreementId: string;
    amount: string;
    note: string;
    evidenceUri: string;
  },
) {
  return request<{ messageId: string }>("/api/notifications/claim", {
    method: "POST",
    body: JSON.stringify({ proposalId: access.proposalId, token: access.token, ...input }),
  });
}
