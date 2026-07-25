import { useEffect, useState } from "react";

export type InviteRole = "tenant" | "arbiter";
export type WorkspaceRole = "landlord" | InviteRole;

const WORKSPACE_ROLE_STORAGE_KEY = "openescrow.workspaceRole";
const CHANGE_EVENT = "openescrow:invite-context-changed";

export const roleLabel: Record<WorkspaceRole, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
  arbiter: "Arbiter",
};

function isInviteRole(value: string | null): value is InviteRole {
  return value === "tenant" || value === "arbiter";
}

export function readInviteRole(): InviteRole | null {
  const fromUrl = new URLSearchParams(window.location.search).get("invite");
  return isInviteRole(fromUrl) ? fromUrl : null;
}

export function clearInviteRole() {
  try {
    window.sessionStorage.removeItem(WORKSPACE_ROLE_STORAGE_KEY);
  } catch {
    // Clearing the URL still exits invitation mode for this page.
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.delete("proposal");
  url.searchParams.delete("token");
  window.history.replaceState(null, "", url.toString());
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isSelectableWorkspaceRole(value: string | null): value is "landlord" | "tenant" {
  return value === "landlord" || value === "tenant";
}

export function readWorkspaceRole(): WorkspaceRole | null {
  const inviteRole = readInviteRole();
  if (inviteRole) return inviteRole;

  try {
    const stored = window.sessionStorage.getItem(WORKSPACE_ROLE_STORAGE_KEY);
    return isSelectableWorkspaceRole(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function selectWorkspaceRole(role: "landlord" | "tenant") {
  if (readInviteRole()) return;
  try {
    window.sessionStorage.setItem(WORKSPACE_ROLE_STORAGE_KEY, role);
  } catch {
    // The current React state still reflects the selection for this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
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
  const url = new URL(window.location.origin);
  url.searchParams.set("invite", role);
  if (agreementId !== undefined) url.searchParams.set("id", agreementId.toString());
  if (jurisdiction) url.searchParams.set("jurisdiction", jurisdiction);
  return url.toString();
}
