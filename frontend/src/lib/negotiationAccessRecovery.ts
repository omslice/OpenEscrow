import {
  clearRecoveryJsonIf,
  clearRecoveryValue,
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "./browserRecovery.ts";
import type {
  NegotiationAccess,
  NegotiationRole,
} from "./negotiations.ts";

const LATEST_LANDLORD_ACCESS = "openescrow.latestLandlordProposal";

export function negotiationAccessStorageKey(
  proposalId: string,
  role: NegotiationRole,
) {
  return `openescrow.negotiationAccess.${proposalId}.${role}`;
}

export function isNegotiationAccess(
  value: unknown,
): value is NegotiationAccess {
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

export function preserveNegotiationAccessForReload(
  access: NegotiationAccess,
) {
  const key = negotiationAccessStorageKey(access.proposalId, access.role);
  const sessionStorage = getBrowserRecoveryStorage("session");
  const stored = sessionStorage
    ? writeRecoveryJson(key, access, sessionStorage)
    : false;
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
  return stored;
}

export function recoverNegotiationAccessForEntry(
  proposalId: string,
  role: NegotiationRole,
): NegotiationAccess | null {
  const key = negotiationAccessStorageKey(proposalId, role);
  for (const kind of ["session", "local"] as const) {
    const storage = getBrowserRecoveryStorage(kind);
    if (!storage) continue;
    const access = readRecoveryJson(key, isNegotiationAccess, storage);
    if (
      access?.proposalId === proposalId &&
      access.role === role &&
      access.source === "invite"
    ) {
      if (kind === "local") {
        preserveNegotiationAccessForReload(access);
        clearRecoveryValue(key, storage);
      }
      return access;
    }
  }
  return null;
}
