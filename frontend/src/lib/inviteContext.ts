import { useEffect, useState } from "react";

export type InviteRole = "tenant" | "arbiter";

const STORAGE_KEY = "openescrow.pendingInviteRole";
const CHANGE_EVENT = "openescrow:invite-context-changed";

export const inviteRoleLabel: Record<InviteRole, string> = {
  tenant: "Tenant",
  arbiter: "Arbiter",
};

function isInviteRole(value: string | null): value is InviteRole {
  return value === "tenant" || value === "arbiter";
}

export function readInviteRole(): InviteRole | null {
  const fromUrl = new URLSearchParams(window.location.search).get("invite");
  if (isInviteRole(fromUrl)) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      // The URL remains the source of truth when session storage is unavailable.
    }
    return fromUrl;
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isInviteRole(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearInviteRole() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing the URL still exits invitation mode for this page.
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", url.toString());
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
