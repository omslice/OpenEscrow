import type { InviteRole } from "./inviteContext";

export type NegotiationRole = "landlord" | InviteRole;
export type NegotiationStatus = "draft" | "ready" | "finalized";

export interface AgreementTerms {
  jurisdiction: string;
  tokenChoice: "plain" | "yield";
  deposit: string;
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
  landlordEmail: string;
  tenantEmail: string;
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

function accessKey(proposalId: string) {
  return `openescrow.negotiationAccess.${proposalId}`;
}

export function storeNegotiationAccess(access: NegotiationAccess, persistent = false) {
  const storage = persistent ? window.localStorage : window.sessionStorage;
  storage.setItem(accessKey(access.proposalId), JSON.stringify(access));
  if (persistent && access.role === "landlord") {
    window.localStorage.setItem(LATEST_LANDLORD_ACCESS, JSON.stringify(access));
  }
}

export function readNegotiationAccess(proposalId: string): NegotiationAccess | null {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(accessKey(proposalId));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as NegotiationAccess;
      if (parsed.proposalId === proposalId && parsed.token && parsed.role) return parsed;
    } catch {
      // Ignore unavailable or malformed browser storage.
    }
  }
  return null;
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
  window.localStorage.setItem(
    LATEST_LANDLORD_BUNDLE,
    JSON.stringify({ proposalId: created.record.id, access: created.access }),
  );
}

export function readLandlordBundle(): {
  proposalId: string;
  access: CreatedNegotiation["access"];
} | null {
  try {
    const raw = window.localStorage.getItem(LATEST_LANDLORD_BUNDLE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      proposalId: string;
      access: CreatedNegotiation["access"];
    };
    return parsed.proposalId && parsed.access?.landlord && parsed.access?.tenant ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLandlordBundle() {
  try {
    const bundle = readLandlordBundle();
    if (bundle) window.localStorage.removeItem(accessKey(bundle.proposalId));
    window.localStorage.removeItem(LATEST_LANDLORD_ACCESS);
    window.localStorage.removeItem(LATEST_LANDLORD_BUNDLE);
  } catch {
    // The in-memory proposal can still be cleared.
  }
}

export function captureNegotiationAccessFromUrl(): NegotiationAccess | null {
  const url = new URL(window.location.href);
  const proposalId = url.searchParams.get("proposal");
  const token = url.searchParams.get("token");
  const role = url.searchParams.get("invite");
  if (!proposalId || !token || (role !== "tenant" && role !== "arbiter")) return null;

  const access: NegotiationAccess = { proposalId, token, role };
  storeNegotiationAccess(access);
  url.searchParams.delete("token");
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
  landlordEmail: string;
  tenantEmail: string;
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

export async function negotiationAction(
  access: NegotiationAccess,
  action:
    | { type: "approve"; wallet: string }
    | { type: "propose_change"; summary: string }
    | { type: "revise"; summary: string; terms: AgreementTerms }
    | { type: "invitation_prepared"; invitedRole: InviteRole; method: "gmail" | "copy" }
    | { type: "finalize"; agreementId: string; transactionHash: string }
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
