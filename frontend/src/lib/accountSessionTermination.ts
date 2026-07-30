export type AccountSessionTerminationResult =
  | {
      outcome: "complete";
      revokedSessions: number;
      localCleanupFailed: boolean;
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
  onRevoked?(revokedSessions: number): void;
}

export async function terminateAccountSessions(
  environment: AccountSessionTerminationEnvironment,
): Promise<AccountSessionTerminationResult> {
  const { revokedSessions } = await environment.revoke();
  let localCleanupFailed = false;
  try {
    environment.clearLocalAccess();
  } catch {
    localCleanupFailed = true;
  }
  try {
    environment.onRevoked?.(revokedSessions);
  } catch {
    // A rendering callback must not interrupt server-side containment.
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
