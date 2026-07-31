import {
  getBrowserRecoveryStorage,
  readRecoveryJson,
  writeRecoveryJson,
} from "./browserRecovery.ts";
import type {
  NegotiationAccess,
  NegotiationRole,
} from "./negotiations.ts";

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
  const sessionStorage = getBrowserRecoveryStorage("session");
  if (!sessionStorage) return false;
  return writeRecoveryJson(
    negotiationAccessStorageKey(access.proposalId, access.role),
    access,
    sessionStorage,
  );
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
      return access;
    }
  }
  return null;
}
