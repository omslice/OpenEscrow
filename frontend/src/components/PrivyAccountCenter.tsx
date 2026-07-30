import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreateWallet,
  useIdentityToken,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount } from "wagmi";
import { shortAddr } from "../lib/format";
import {
  clearAccountNegotiationAccesses,
  loadAccountDataInventory,
  loadNotificationPreferences,
  loadServiceReadiness,
  revokeAccountSessions,
  saveNotificationPreferences,
  sendNotificationTest,
  type NotificationPreferences,
  type ServiceReadiness,
} from "../lib/negotiations";
import {
  clearInviteRole,
  roleLabel,
  useInviteRole,
} from "../lib/inviteContext";
import { writeRecoveryJson } from "../lib/browserRecovery";
import {
  copyTextToClipboard,
  downloadTextFile,
} from "../lib/browserActions";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  agreementActivity: false,
  deadlineReminders: false,
};

export function PrivyAccountCenter({
  workspaceRole,
  onChangeWorkspaceRole,
  onReadinessChange,
}: {
  workspaceRole?: string;
  onChangeWorkspaceRole?: () => void;
  onReadinessChange?: (serviceReadiness: ServiceReadiness | null) => void;
}) {
  const { ready, authenticated, user, linkGoogle, linkWallet, logout } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [preferenceStatus, setPreferenceStatus] = useState<string | null>(null);
  const [serviceReadiness, setServiceReadiness] = useState<ServiceReadiness | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const [isDownloadingInventory, setIsDownloadingInventory] = useState(false);
  const [walletCopyStatus, setWalletCopyStatus] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const preferenceWrite = useRef(0);
  const isRefreshingReadinessRef = useRef(false);
  const [walletSetup, setWalletSetup] = useState<"idle" | "creating" | "slow" | "error">("idle");
  const [walletError, setWalletError] = useState<string | null>(null);
  const attemptedForUser = useRef<string | null>(null);
  const inviteRole = useInviteRole();

  const email = user?.google?.email ?? user?.email?.address;
  const displayName = user?.google?.name?.trim() || email || "Your";
  const hasWallet = wallets.length > 0;
  const preferenceKey = useMemo(
    () => (user ? `openescrow:notifications:${user.id}` : null),
    [user],
  );
  useEffect(() => {
    if (!preferenceKey) {
      setPreferences(DEFAULT_PREFERENCES);
      setPreferenceStatus(null);
      return;
    }
    try {
      const stored = window.localStorage.getItem(preferenceKey);
      const parsed = stored ? JSON.parse(stored) : DEFAULT_PREFERENCES;
      setPreferences({
        agreementActivity: parsed.agreementActivity === true,
        deadlineReminders: parsed.deadlineReminders === true,
      });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
    if (!identityToken) return;
    let cancelled = false;
    void loadNotificationPreferences(identityToken)
      .then((saved) => {
        if (cancelled) return;
        setPreferences(saved);
        writeRecoveryJson(preferenceKey, saved);
        setPreferenceStatus(saved.updatedAt ? "Preferences synced to your account." : null);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreferenceStatus(
            error instanceof Error
              ? error.message
              : "Account preferences could not be loaded.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identityToken, preferenceKey]);

  const refreshServiceReadiness = useCallback(async () => {
    if (isRefreshingReadinessRef.current) return;
    isRefreshingReadinessRef.current = true;
    try {
      const readiness = await loadServiceReadiness();
      setServiceReadiness(readiness);
    } catch {
      setServiceReadiness(null);
    } finally {
      isRefreshingReadinessRef.current = false;
    }
  }, []);

  useEffect(() => {
    onReadinessChange?.(serviceReadiness);
  }, [onReadinessChange, serviceReadiness]);

  useEffect(() => {
    void refreshServiceReadiness();
  }, [refreshServiceReadiness]);

  const provisionWallet = useCallback(async () => {
    if (!user || hasWallet || walletSetup === "creating") return;

    setWalletSetup("creating");
    setWalletError(null);
    let slowTimer: number | undefined;
    try {
      slowTimer = window.setTimeout(() => setWalletSetup("slow"), 12_000);
      await createWallet();
      setWalletSetup("idle");
    } catch (cause) {
      setWalletSetup("error");
      setWalletError(cause instanceof Error ? cause.message : "Wallet setup did not complete.");
    } finally {
      if (slowTimer !== undefined) window.clearTimeout(slowTimer);
    }
  }, [createWallet, hasWallet, user, walletSetup]);

  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !walletsReady ||
      !user ||
      !email ||
      hasWallet ||
      attemptedForUser.current === user.id
    ) {
      return;
    }

    attemptedForUser.current = user.id;
    void provisionWallet();
  }, [authenticated, email, hasWallet, provisionWallet, ready, user, walletsReady]);

  useEffect(() => {
    if (hasWallet) {
      setWalletSetup("idle");
      setWalletError(null);
    }
  }, [hasWallet]);

  async function updatePreference(
    name: "agreementActivity" | "deadlineReminders",
    checked: boolean,
  ) {
    if (!preferenceKey) return;
    const next = { ...preferences, [name]: checked };
    setPreferences(next);
    setPreferenceStatus(identityToken ? "Saving preferences..." : "Saved on this device.");
    writeRecoveryJson(preferenceKey, next);
    if (!identityToken) return;
    const write = ++preferenceWrite.current;
    try {
      const saved = await saveNotificationPreferences(identityToken, next);
      if (write !== preferenceWrite.current) return;
      setPreferences(saved);
      writeRecoveryJson(preferenceKey, saved);
      setPreferenceStatus(
        saved.agreementActivity || saved.deadlineReminders
          ? "Preferences synced to your account with a consent timestamp."
          : "Email notifications are turned off for this account.",
      );
    } catch (error) {
      if (write !== preferenceWrite.current) return;
      setPreferenceStatus(
        error instanceof Error
          ? error.message
          : "Preferences are saved locally but could not be synced.",
      );
    }
  }

  async function endOpenEscrowSessions() {
    if (!identityToken || isEndingSessions) return;
    if (
      !window.confirm(
        "End every OpenEscrow record session issued to this verified account and sign out on this device? Invitation links and wallet-provider sessions are separate and will not be revoked.",
      )
    ) {
      return;
    }

    setIsEndingSessions(true);
    setSecurityError(false);
    setSecurityStatus("Ending OpenEscrow record sessions...");
    try {
      const result = await revokeAccountSessions(identityToken);
      clearAccountNegotiationAccesses();
      setSecurityStatus(
        result.revokedSessions
          ? `${result.revokedSessions} OpenEscrow record session(s) ended. Signing out...`
          : "No active OpenEscrow record sessions were found. Signing out...",
      );
      await logout();
      window.location.reload();
    } catch (error) {
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "OpenEscrow record sessions could not be ended.",
      );
      setIsEndingSessions(false);
    }
  }

  async function downloadAccountDataInventory() {
    if (!identityToken || isDownloadingInventory) return;
    setIsDownloadingInventory(true);
    setSecurityError(false);
    setSecurityStatus("Preparing your account data inventory...");
    try {
      const inventory = await loadAccountDataInventory(identityToken);
      downloadTextFile(
        `${JSON.stringify(inventory, null, 2)}\n`,
        "application/json",
        `openescrow-account-data-inventory-${inventory.generatedAt.slice(0, 10)}.json`,
      );
      setSecurityStatus(
        `Downloaded an inventory of ${inventory.records.length} account record reference(s). Complete shared records remain available in the Record tab.`,
      );
    } catch (error) {
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "Your account data inventory could not be prepared.",
      );
    } finally {
      setIsDownloadingInventory(false);
    }
  }

  async function copyWalletAddress(walletAddress: string, label: string) {
    setWalletCopyStatus(null);
    try {
      await copyTextToClipboard(walletAddress);
      setWalletCopyStatus({ message: `${label} copied.`, error: false });
    } catch (error) {
      setWalletCopyStatus({
        message:
          error instanceof Error ? error.message : "The wallet address could not be copied.",
        error: true,
      });
    }
  }

  if (!ready || !authenticated || !user) return null;

  return (
    <>
      <details className="card account-workspace-disclosure account-profile-disclosure">
        <summary>
          <span>
            <span className="eyebrow">Account</span>
            <strong>{displayName === "Your" ? "Your account" : displayName}</strong>
            <small>Identity, email, and connected wallets</small>
          </span>
          <span className="disclosure-cue" aria-hidden="true" />
        </summary>
        <div className="account-workspace-content">
          <section className="account-center account-center-embedded" aria-label="Account and workspace settings">
            {inviteRole && (
              <div className="invite-role-notice">
                <div>
                  <span className="eyebrow">{roleLabel[inviteRole]} invitation · role locked</span>
                  <h3>You are joining this deposit as the {inviteRole}.</h3>
                  <p>
                    Sign in with the Google account that received the invitation. This onboarding
                    role does not make the account a landlord; the connected wallet is matched to a
                    specific on-chain role when the agreement is created.
                  </p>
                  {email && (
                    <p>
                      Currently signed in as <strong>{email}</strong>. If this is the landlord
                      account, sign out and choose the invited account.
                    </p>
                  )}
                </div>
                <div className="invite-role-actions">
                  {address && (
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        void copyWalletAddress(address, `Your ${inviteRole} wallet address`)
                      }
                    >
                      Copy my {inviteRole} wallet
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => logout()}>
                    Use a different Google account
                  </button>
                  <button className="btn btn-ghost" onClick={clearInviteRole}>
                    This invitation is for someone else
                  </button>
                </div>
              </div>
            )}

            <div className="account-grid">
              <div>
                <h3>Email identity</h3>
                {email ? (
                  <>
                    <strong>{email}</strong>
                    <p className="hint">Verified through your linked Google or email account.</p>
                  </>
                ) : (
                  <>
                    <p className="hint">Link Google to add a verified notification address.</p>
                    <button className="btn btn-secondary" onClick={() => linkGoogle()}>
                      Link Google account
                    </button>
                  </>
                )}
              </div>

              <div>
                <h3>Wallets</h3>
                {!walletsReady ? (
                  <p className="hint">Loading wallets...</p>
                ) : !hasWallet ? (
                  <div className="wallet-setup-state">
                    <p className="hint" role="status">
                      {walletSetup === "creating"
                        ? "Creating your OpenEscrow wallet..."
                        : walletSetup === "slow"
                          ? "Wallet setup is taking longer than expected. You can retry or connect your own wallet."
                          : "No wallet is linked to this account yet."}
                    </p>
                    {walletError && <p className="tx-error" role="alert">{walletError}</p>}
                    {walletSetup !== "creating" && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          attemptedForUser.current = null;
                          void provisionWallet();
                        }}
                      >
                        Retry OpenEscrow wallet setup
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="wallet-list">
                    {wallets.map((wallet) => {
                      const isEmbedded = wallet.walletClientType === "privy";
                      const isActive = wallet.address.toLowerCase() === address?.toLowerCase();
                      return (
                        <li key={`${wallet.walletClientType}:${wallet.address}`}>
                          <div>
                            <strong>{isEmbedded ? "OpenEscrow wallet" : "Connected wallet"}</strong>
                            <span title={wallet.address}>{shortAddr(wallet.address)}</span>
                          </div>
                          <div className="wallet-actions">
                            {isActive ? (
                              <span className="active-wallet">Active</span>
                            ) : (
                              <button
                                className="btn btn-ghost"
                                onClick={() => setActiveWallet(wallet)}
                              >
                                Use wallet
                              </button>
                            )}
                            <button
                              className="btn btn-ghost"
                              onClick={() =>
                                void copyWalletAddress(wallet.address, "Wallet address")
                              }
                            >
                              Copy address
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {walletCopyStatus && (
                  <p
                    className={walletCopyStatus.error ? "tx-error" : "field-help"}
                    role={walletCopyStatus.error ? "alert" : "status"}
                    aria-live={walletCopyStatus.error ? "assertive" : "polite"}
                  >
                    {walletCopyStatus.message}
                  </p>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => linkWallet({ walletChainType: "ethereum-only" })}
                >
                  Connect another EVM wallet
                </button>
                <p className="hint wallet-support-note">
                  Rabby is available through installed-wallet detection. If it is not installed in
                  this browser, choose WalletConnect and search for Rabby.
                </p>
              </div>
            </div>
          </section>
          <section className="settings-group" aria-labelledby="workspace-settings-title">
            <div>
              <h3 id="workspace-settings-title">Workspace</h3>
              <p>
                This changes the tools shown in this session. Agreement roles remain fixed by each
                participant record and wallet assignment.
              </p>
            </div>
            <div className="settings-actions">
              {workspaceRole ? (
                <span className="account-status">{workspaceRole} workspace</span>
              ) : inviteRole ? (
                <span className="account-status">{roleLabel[inviteRole]} invitation</span>
              ) : (
                <span className="settings-status">No workspace selected</span>
              )}
              {onChangeWorkspaceRole && (
                <button
                  className="btn btn-ghost small"
                  type="button"
                  onClick={onChangeWorkspaceRole}
                >
                  Change workspace role
                </button>
              )}
            </div>
          </section>

          <section
            className="settings-group notification-preferences"
            aria-labelledby="notification-settings-title"
          >
            <h3 id="notification-settings-title">Email notifications</h3>
        <label>
          <input
            type="checkbox"
            checked={preferences.agreementActivity}
            disabled={!email}
            onChange={(event) =>
              void updatePreference("agreementActivity", event.target.checked)
            }
          />
          Agreement invitations, funding, claims, responses, and rulings
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.deadlineReminders}
            disabled={!email}
            onChange={(event) =>
              void updatePreference("deadlineReminders", event.target.checked)
            }
          />
          Upcoming claim, response, and arbiter deadlines
        </label>
        <p className="notification-boundary">
          Preferences follow your verified account. Every optional message includes an unsubscribe
          link and intentionally omits private agreement details.
        </p>
        {serviceReadiness?.email.configured ? (
          <div className="notification-delivery-status ready">
            <div>
              <strong>Automatic delivery ready</strong>
              <span>
                {serviceReadiness.email.provider === "resend"
                  ? "Resend"
                  : "Configured email webhook"}
                {serviceReadiness.email.schedulerHealthy
                  ? ` · scheduler healthy (${serviceReadiness.email.schedulerExpectedIntervalMinutes} min cadence)`
                  : " · scheduler stale"}
                {serviceReadiness.email.schedulerLastRunAt
                  ? ` · scheduler checked ${new Date(serviceReadiness.email.schedulerLastRunAt).toLocaleString()}`
                  : " · scheduler awaits its first hosted run"}
              </span>
            </div>
            <button
              className="btn btn-ghost small"
              type="button"
              disabled={!identityToken || !email || isTestingEmail}
              onClick={async () => {
                if (!identityToken) return;
                setIsTestingEmail(true);
                setPreferenceStatus("Sending a private configuration test...");
                try {
                  const result = await sendNotificationTest(identityToken);
                  setPreferenceStatus(
                    result.duplicate
                      ? "A test was already delivered recently. Check this account's inbox."
                      : "Test email sent. Check this account's inbox.",
                  );
                } catch (error) {
                  setPreferenceStatus(
                    error instanceof Error
                      ? error.message
                      : "The test email could not be sent.",
                  );
                } finally {
                  setIsTestingEmail(false);
                }
              }}
            >
              {isTestingEmail ? "Sending..." : "Send test email"}
            </button>
          </div>
        ) : (
          <div className="notification-delivery-status">
            <div>
              <strong>Manual fallback active</strong>
              <span>
                Gmail drafts and copy-email notices remain available until the deployment owner
                configures a free email provider.
              </span>
            </div>
          </div>
        )}
            {preferenceStatus && (
              <p
                className={
                  preferenceStatus.includes("could not") ? "tx-error" : "field-help"
                }
                role={preferenceStatus.includes("could not") ? "alert" : "status"}
              >
                {preferenceStatus}
              </p>
            )}
          </section>

          <section
            className="settings-group account-security-settings"
            aria-labelledby="account-security-title"
          >
            <div>
              <h3 id="account-security-title">Account security</h3>
              <p>
                If a device or browser profile is no longer trusted, end every expiring OpenEscrow
                record session issued to this verified account. Agreements, archive preferences,
                invitation links, and wallet-provider sessions are not changed.
              </p>
              <p>
                You can also download a privacy-safe inventory of record references and account
                settings. It excludes evidence, addresses, other participants' details, and all
                access tokens; use the Record tab for each complete shared record.
              </p>
              {securityStatus && (
                <p
                  className={securityError ? "tx-error" : "field-help"}
                  role={securityError ? "alert" : "status"}
                  aria-live={securityError ? "assertive" : "polite"}
                >
                  {securityStatus}
                </p>
              )}
            </div>
            <div className="settings-actions">
              <button
                className="btn btn-ghost small"
                type="button"
                disabled={!identityToken || isDownloadingInventory || isEndingSessions}
                onClick={() => void downloadAccountDataInventory()}
              >
                {isDownloadingInventory ? "Preparing inventory..." : "Download data inventory"}
              </button>
              <button
                className="btn btn-ghost small"
                type="button"
                disabled={!identityToken || isEndingSessions || isDownloadingInventory}
                onClick={() => void endOpenEscrowSessions()}
              >
                {isEndingSessions ? "Ending sessions..." : "End record sessions & sign out"}
              </button>
            </div>
          </section>

        </div>
      </details>
    </>
  );
}
