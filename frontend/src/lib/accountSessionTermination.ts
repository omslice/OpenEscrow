export type AccountSessionTerminationResult =
  | {
      outcome: "complete";
      revokedSessions: number;
      localCleanupFailed: boolean;
    }
  | {
      outcome: "identity_changed";
      revokedSessions: number;
      localCleanupFailed: boolean;
      localCleanupSkipped: boolean;
    }
  | {
      outcome: "logout_failed" | "reload_failed";
      revokedSessions: number;
      localCleanupFailed: boolean;
      error: unknown;
    };

export interface AccountSessionTerminationEnvironment {
  revoke(): Promise<{ revokedSessions: number }>;
  clearLocalAccess(): void;
  logout(): Promise<void>;
  reload(): void;
  isCurrentIdentity?(): boolean;
  onRevoked?(revokedSessions: number): void;
}

function canContinueForCurrentIdentity(
  environment: AccountSessionTerminationEnvironment,
) {
  try {
    return environment.isCurrentIdentity?.() ?? true;
  } catch {
    return false;
  }
}

export async function terminateAccountSessions(
  environment: AccountSessionTerminationEnvironment,
): Promise<AccountSessionTerminationResult> {
  const { revokedSessions } = await environment.revoke();
  if (!canContinueForCurrentIdentity(environment)) {
    return {
      outcome: "identity_changed",
      revokedSessions,
      localCleanupFailed: false,
      localCleanupSkipped: true,
    };
  }
  let localCleanupFailed = false;
  try {
    environment.clearLocalAccess();
  } catch {
    localCleanupFailed = true;
  }
  if (!canContinueForCurrentIdentity(environment)) {
    return {
      outcome: "identity_changed",
      revokedSessions,
      localCleanupFailed,
      localCleanupSkipped: false,
    };
  }
  try {
    environment.onRevoked?.(revokedSessions);
  } catch {
    // A rendering callback must not interrupt server-side containment.
  }
  if (!canContinueForCurrentIdentity(environment)) {
    return {
      outcome: "identity_changed",
      revokedSessions,
      localCleanupFailed,
      localCleanupSkipped: false,
    };
  }
  try {
    await environment.logout();
  } catch (error) {
    return {
      outcome: "logout_failed",
      revokedSessions,
      localCleanupFailed,
      error,
    };
  }
  try {
    environment.reload();
  } catch (error) {
    return {
      outcome: "reload_failed",
      revokedSessions,
      localCleanupFailed,
      error,
    };
  }
  return {
    outcome: "complete",
    revokedSessions,
    localCleanupFailed,
  };
}
