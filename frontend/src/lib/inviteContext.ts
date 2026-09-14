import { useEffect, useState } from "react";
import { replaceRecoveryUrl } from "./browserRecovery.ts";
import { clearInvitationCredential } from "./invitationCredential.ts";
import { publicAppOrigin } from "./publicAppOrigin.ts";

export type InviteRole = "tenant" | "arbiter";
export type WorkspaceRole = "landlord" | InviteRole;

const WORKSPACE_ROLE_STORAGE_KEY = "openescrow.workspaceRole";
const WORKSPACE_ROLE_IDENTITY_STORAGE_KEY = "openescrow.workspaceRoleIdentity";
const CHANGE_EVENT = "openescrow:invite-context-changed";
let memoryWorkspaceRole: WorkspaceRole | null = null;
let memoryWorkspaceRoleIdentity: string | null = null;
let ignoredInviteHref: string | null = null;

export const roleLabel: Record<WorkspaceRole, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
  arbiter: "Arbiter",
};

function isInviteRole(value: string | null): value is InviteRole {
  return value === "tenant" || value === "arbiter";
}

function inviteHrefWithoutHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

export function readInviteRole(): InviteRole | null {
  if (ignoredInviteHref) {
    if (inviteHrefWithoutHash() === ignoredInviteHref) return null;
    ignoredInviteHref = null;
  }
  const fromUrl = new URLSearchParams(window.location.search).get("invite");
  return isInviteRole(fromUrl) ? fromUrl : null;
}

export function clearInviteRole() {
  memoryWorkspaceRole = null;
  ignoredInviteHref = inviteHrefWithoutHash();
  try {
    window.sessionStorage.removeItem(WORKSPACE_ROLE_STORAGE_KEY);
  } catch {
    // Clearing the URL still exits invitation mode for this page.
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.delete("proposal");
  clearInvitationCredential(url);
  if (replaceRecoveryUrl(url)) {
    ignoredInviteHref = null;
  } else {
    try {
      window.location.replace(url.toString());
    } catch {
      // Keep invitation mode suppressed for this page if navigation is blocked.
    }
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isSelectableWorkspaceRole(value: string | null): value is WorkspaceRole {
  return value === "landlord" || value === "tenant" || value === "arbiter";
}

export function readWorkspaceRole(): WorkspaceRole | null {
  const inviteRole = readInviteRole();
  if (inviteRole) return inviteRole;

  try {
    const stored = window.sessionStorage.getItem(WORKSPACE_ROLE_STORAGE_KEY);
    if (isSelectableWorkspaceRole(stored)) {
      memoryWorkspaceRole = stored;
      return stored;
    }
  } catch {
    // Use current-page memory when browser storage is unavailable.
  }
  return memoryWorkspaceRole;
}

export function selectWorkspaceRole(role: WorkspaceRole) {
  if (readInviteRole()) return;
  memoryWorkspaceRole = role;
  try {
    window.sessionStorage.setItem(WORKSPACE_ROLE_STORAGE_KEY, role);
  } catch {
    // Current-page memory still reflects the selection.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function reconcileWorkspaceRoleIdentity(identity: string | null) {
  if (!identity) return;
  const inviteRole = readInviteRole();
  let roleChanged = false;

  try {
    const storedIdentity = window.sessionStorage.getItem(
      WORKSPACE_ROLE_IDENTITY_STORAGE_KEY,
    );
    const storedRole = window.sessionStorage.getItem(WORKSPACE_ROLE_STORAGE_KEY);
    if (inviteRole) {
      roleChanged = storedRole !== inviteRole;
      window.sessionStorage.setItem(WORKSPACE_ROLE_STORAGE_KEY, inviteRole);
      window.sessionStorage.setItem(WORKSPACE_ROLE_IDENTITY_STORAGE_KEY, identity);
      memoryWorkspaceRole = inviteRole;
      memoryWorkspaceRoleIdentity = identity;
    } else if (storedIdentity !== identity) {
      roleChanged = isSelectableWorkspaceRole(storedRole);
      window.sessionStorage.removeItem(WORKSPACE_ROLE_STORAGE_KEY);
      window.sessionStorage.setItem(WORKSPACE_ROLE_IDENTITY_STORAGE_KEY, identity);
      memoryWorkspaceRole = null;
      memoryWorkspaceRoleIdentity = identity;
    } else {
      memoryWorkspaceRoleIdentity = identity;
    }
  } catch {
    if (inviteRole) {
      roleChanged = memoryWorkspaceRole !== inviteRole;
      memoryWorkspaceRole = inviteRole;
      memoryWorkspaceRoleIdentity = identity;
    } else if (memoryWorkspaceRoleIdentity !== identity) {
      roleChanged = memoryWorkspaceRole !== null;
      memoryWorkspaceRole = null;
      memoryWorkspaceRoleIdentity = identity;
    }
  }

  if (roleChanged) {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function useInviteRole() {
  const [role, setRole] = useState<InviteRole | null>(() => readInviteRole());

  useEffect(() => {
    const refresh = () => setRole(readInviteRole());
    window.addEventListener("popstate", refresh);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("popstate", refresh);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  return role;
}

export function useWorkspaceRole() {
  const [role, setRole] = useState<WorkspaceRole | null>(() => readWorkspaceRole());

  useEffect(() => {
    const refresh = () => setRole(readWorkspaceRole());
    window.addEventListener("popstate", refresh);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("popstate", refresh);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  return role;
}

export function buildInviteUrl(
  role: InviteRole,
  agreementId?: bigint,
  jurisdiction?: string,
) {
  const url = new URL(publicAppOrigin());
  url.searchParams.set("invite", role);
  if (agreementId !== undefined) url.searchParams.set("id", agreementId.toString());
  if (jurisdiction) url.searchParams.set("jurisdiction", jurisdiction);
  return url.toString();
}
