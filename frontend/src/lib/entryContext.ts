import { replaceRecoveryUrl } from "./browserRecovery";
import {
  preserveNegotiationAccessForReload,
  recoverNegotiationAccessForEntry,
  recoverUniqueNegotiationAccessForProposal,
} from "./negotiationAccessRecovery";
import type { NegotiationAccess, NegotiationRole } from "./negotiations";
import {
  clearInvitationCredential,
  readInvitationCredential,
} from "./invitationCredential";

export type AccountLoginMethod = "google" | "wallet";

export type EntryContext = {
  initialAccess: NegotiationAccess | null;
  roleLocked: boolean;
};

let currentPageEntryAccess: NegotiationAccess | null = null;

export function captureEntryContext(): EntryContext {
  const url = new URL(window.location.href);
  const proposalId = url.searchParams.get("proposal");
  const invitationCredential = readInvitationCredential(url);
  const token = invitationCredential.token;
  const accessRole = url.searchParams.get("access");
  const inviteRole = url.searchParams.get("invite");
  const role = accessRole || inviteRole;
  const validRole =
    role === "landlord" || role === "tenant" || role === "arbiter";
  const validNegotiationInvitation = Boolean(proposalId && token && validRole);
  const currentPageRecovery =
    proposalId &&
    currentPageEntryAccess?.proposalId === proposalId &&
    (!validRole || currentPageEntryAccess.role === role)
      ? currentPageEntryAccess
      : null;
  const recoveredAccess =
    !invitationCredential.present && proposalId
      ? validRole
        ? recoverNegotiationAccessForEntry(proposalId, role) ||
          currentPageRecovery
        : recoverUniqueNegotiationAccessForProposal(proposalId) ||
          currentPageRecovery
      : null;
  const validNegotiationRecovery = Boolean(recoveredAccess);
  const agreementId = url.searchParams.get("id");
  let validAgreementInvitation = false;
  if (
    agreementId &&
    (inviteRole === "tenant" || inviteRole === "arbiter")
  ) {
    try {
      validAgreementInvitation = BigInt(agreementId) >= 0n;
    } catch {
      validAgreementInvitation = false;
    }
  }

  let needsCleanup = false;
  if (invitationCredential.present) {
    clearInvitationCredential(url);
    url.searchParams.delete("access");
    needsCleanup = true;
  } else if (accessRole) {
    url.searchParams.delete("access");
    needsCleanup = true;
  }
  if (
    inviteRole &&
    !validNegotiationInvitation &&
    !validNegotiationRecovery &&
    !validAgreementInvitation
  ) {
    url.searchParams.delete("invite");
    needsCleanup = true;
  }
  if (needsCleanup && !replaceRecoveryUrl(url)) {
    try {
      window.location.replace(url.toString());
    } catch {
      // Keep captured access in current-page memory if URL cleanup is blocked.
    }
  }

  if (proposalId && token && validRole) {
    const initialAccess: NegotiationAccess = {
      proposalId,
      token,
      role: role as NegotiationRole,
      source: "invite",
    };
    currentPageEntryAccess = initialAccess;
    preserveNegotiationAccessForReload(initialAccess);
    return {
      initialAccess,
      roleLocked: true,
    };
  }
  if (recoveredAccess) {
    currentPageEntryAccess = recoveredAccess;
    return {
      initialAccess: recoveredAccess,
      roleLocked: true,
    };
  }
  return {
    initialAccess: null,
    roleLocked: validAgreementInvitation,
  };
}
