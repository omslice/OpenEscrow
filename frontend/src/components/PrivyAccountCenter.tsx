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
import { terminateAccountSessions } from "../lib/accountSessionTermination";
import { deliverAccountDataInventory } from "../lib/accountDataInventoryDownload";
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
  confirmBrowserAction,
  copyTextToClipboard,
  reloadBrowserPage,
} from "../lib/browserActions";
import { createAccountOperationGuard } from "../lib/accountOperationGuard";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  agreementActivity: true,
  deadlineReminders: true,
};

type PreferenceNotice = {
  message: string;
  error: boolean;
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
  const [preferenceNotice, setPreferenceNotice] = useState<PreferenceNotice | null>(null);
  const [serviceReadiness, setServiceReadiness] = useState<ServiceReadiness | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const [isDownloadingInventory, setIsDownloadingInventory] = useState(false);
  const [isCopyingInventory, setIsCopyingInventory] = useState(false);
  const [inventoryRecovery, setInventoryRecovery] = useState<string | null>(null);
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
  const activeIdentityToken = useRef(identityToken);
  activeIdentityToken.current = identityToken;
  const accountIdentity = user?.id ?? null;
  const activeAccountIdentity = useRef(accountIdentity);
  const accountScopeActive = useRef(true);
  activeAccountIdentity.current = accountIdentity;

  const email = user?.google?.email ?? user?.email?.address;
  const displayName = user?.google?.name?.trim() || email || "Your";
  const hasWallet = wallets.length > 0;
  const preferenceKey = useMemo(
    () => (user ? `openescrow:notifications:${user.id}` : null),
    [user],
  );
  useEffect(() => {
    setInventoryRecovery(null);
    setSecurityStatus(null);
    setSecurityError(false);
    setIsDownloadingInventory(false);
    setIsCopyingInventory(false);
  }, [identityToken]);

  useEffect(() => {
    accountScopeActive.current = true;
    setIsEndingSessions(false);
    setIsTestingEmail(false);
    setWalletSetup("idle");
    setWalletError(null);
    setWalletCopyStatus(null);
    attemptedForUser.current = null;
    return () => {
      accountScopeActive.current = false;
    };
  }, [accountIdentity]);

  useEffect(() => {
    if (!preferenceKey) {
      setPreferences(DEFAULT_PREFERENCES);
      setPreferenceNotice(null);
      return;
    }
    setPreferenceNotice(null);
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
        setPreferenceNotice(
          saved.updatedAt
            ? { message: "Preferences synced to your account.", error: false }
            : null,
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setPreferenceNotice({
            message:
              error instanceof Error
                ? error.message
                : "Account preferences could not be loaded.",
            error: true,
          });
        }
      });
    return () => {
      cancelled = true;
      preferenceWrite.current += 1;
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
    const requestedAccountIdentity = user?.id ?? null;
    if (!requestedAccountIdentity || hasWallet || walletSetup === "creating") return;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );

    setWalletSetup("creating");
    setWalletError(null);
    let slowTimer: number | undefined;
    try {
      slowTimer = window.setTimeout(() => {
        if (requestIsCurrent()) setWalletSetup("slow");
      }, 12_000);
      await createWallet();
      if (!requestIsCurrent()) return;
      setWalletSetup("idle");
    } catch (cause) {
      if (!requestIsCurrent()) return;
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
    const requestedAccountIdentity = accountIdentity;
    const requestedIdentityToken = identityToken;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );
    const next = { ...preferences, [name]: checked };
    setPreferences(next);
    setPreferenceNotice({
      message: requestedIdentityToken ? "Saving preferences..." : "Saved on this device.",
      error: false,
    });
    writeRecoveryJson(preferenceKey, next);
    if (!requestedIdentityToken || !requestedAccountIdentity) return;
    const write = ++preferenceWrite.current;
    try {
      const saved = await saveNotificationPreferences(requestedIdentityToken, next);
      if (
        write !== preferenceWrite.current ||
        !requestIsCurrent()
      ) {
        return;
      }
      setPreferences(saved);
      writeRecoveryJson(preferenceKey, saved);
      setPreferenceNotice({
        message:
          saved.agreementActivity || saved.deadlineReminders
            ? "Preferences synced to your account with a consent timestamp."
            : "Email notifications are turned off for this account.",
        error: false,
      });
    } catch (error) {
      if (
        write !== preferenceWrite.current ||
        !requestIsCurrent()
      ) {
        return;
      }
      setPreferences(preferences);
      writeRecoveryJson(preferenceKey, preferences);
      setPreferenceNotice({
        message:
          error instanceof Error
            ? error.message
            : "Preferences are saved locally but could not be synced.",
        error: true,
      });
    }
  }

  async function endOpenEscrowSessions() {
    if (!identityToken || !accountIdentity || isEndingSessions) return;
    const requestedIdentityToken = identityToken;
    const requestedAccountIdentity = accountIdentity;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );
    let confirmed = false;
    try {
      confirmed = confirmBrowserAction(
        "End every OpenEscrow record session issued to this verified account and sign out on this device? Invitation links and wallet-provider sessions are separate and will not be revoked.",
      );
    } catch (error) {
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "This browser could not show the confirmation prompt. Try again.",
      );
      return;
    }
    if (!confirmed) {
      return;
    }

    setIsEndingSessions(true);
    setSecurityError(false);
    setSecurityStatus("Ending OpenEscrow record sessions...");
    try {
      const result = await terminateAccountSessions({
        revoke: () => revokeAccountSessions(requestedIdentityToken),
        clearLocalAccess: clearAccountNegotiationAccesses,
        logout,
        reload: reloadBrowserPage,
        isCurrentIdentity: requestIsCurrent,
        onRevoked: (revokedSessions) => {
          if (!requestIsCurrent()) return;
          setSecurityStatus(
            revokedSessions
              ? `${revokedSessions} OpenEscrow record session(s) ended. Signing out...`
              : "No active OpenEscrow record sessions were found. Signing out...",
          );
        },
      });
      if (result.outcome === "identity_changed") return;
      if (!requestIsCurrent()) return;
      if (result.outcome === "complete") return;
      setSecurityError(true);
      const revokedMessage = result.revokedSessions
        ? `${result.revokedSessions} OpenEscrow record session(s) ended`
        : "No active OpenEscrow record sessions were found";
      const cleanupMessage = result.localCleanupFailed
        ? " This browser could not clear its cached account links, but the server sessions are invalid."
        : "";
      if (result.outcome === "logout_failed") {
        setSecurityStatus(
          `${revokedMessage}, but wallet-provider sign-out did not finish.${cleanupMessage} Use the separate Sign out control and then reload the page.`,
        );
      } else {
        const reloadMessage =
          result.error instanceof Error
            ? result.error.message
            : "Use the browser refresh control before continuing.";
        setSecurityStatus(
          `${revokedMessage}, and this device signed out.${cleanupMessage} ${reloadMessage}`,
        );
      }
    } catch (error) {
      if (!requestIsCurrent()) return;
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "OpenEscrow record sessions could not be ended.",
      );
    } finally {
      if (requestIsCurrent()) {
        setIsEndingSessions(false);
      }
    }
  }

  async function downloadAccountDataInventory() {
    if (!identityToken || !accountIdentity || isDownloadingInventory) return;
    const requestedIdentityToken = identityToken;
    const requestedAccountIdentity = accountIdentity;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );
    setIsDownloadingInventory(true);
    setInventoryRecovery(null);
    setSecurityError(false);
    setSecurityStatus("Preparing your account data inventory...");
    try {
      const inventory = await loadAccountDataInventory(requestedIdentityToken);
      if (
        !requestIsCurrent() ||
        activeIdentityToken.current !== requestedIdentityToken
      ) {
        return;
      }
      const delivery = deliverAccountDataInventory(inventory);
      if (delivery.outcome === "copy_available") {
        setInventoryRecovery(delivery.content);
        setSecurityError(true);
        setSecurityStatus(
          `${
            delivery.error instanceof Error
              ? delivery.error.message
              : "This browser could not start the download."
          } The prepared inventory is available below to copy instead.`,
        );
        return;
      }
      setSecurityStatus(
        `Downloaded an inventory of ${inventory.records.length} account record reference(s). Complete shared records remain available in the Record tab.`,
      );
    } catch (error) {
      if (
        !requestIsCurrent() ||
        activeIdentityToken.current !== requestedIdentityToken
      ) {
        return;
      }
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "Your account data inventory could not be prepared.",
      );
    } finally {
      if (
        requestIsCurrent() &&
        activeIdentityToken.current === requestedIdentityToken
      ) {
        setIsDownloadingInventory(false);
      }
    }
  }

  async function copyPreparedAccountDataInventory() {
    if (
      !identityToken ||
      !accountIdentity ||
      !inventoryRecovery ||
      isCopyingInventory ||
      isDownloadingInventory ||
      isEndingSessions
    ) {
      return;
    }
    const requestedIdentityToken = identityToken;
    const requestedAccountIdentity = accountIdentity;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );
    setIsCopyingInventory(true);
    setSecurityError(false);
    setSecurityStatus("Copying the prepared account data inventory...");
    try {
      await copyTextToClipboard(inventoryRecovery);
      if (
        !requestIsCurrent() ||
        activeIdentityToken.current !== requestedIdentityToken
      ) {
        return;
      }
      setSecurityStatus(
        "Account data inventory copied. Paste it into a private file you control; complete shared records remain in the Record tab.",
      );
    } catch (error) {
      if (
        !requestIsCurrent() ||
        activeIdentityToken.current !== requestedIdentityToken
      ) {
        return;
      }
      setSecurityError(true);
      setSecurityStatus(
        error instanceof Error
          ? error.message
          : "The prepared account data inventory could not be copied.",
      );
    } finally {
      if (
        requestIsCurrent() &&
        activeIdentityToken.current === requestedIdentityToken
      ) {
        setIsCopyingInventory(false);
      }
    }
  }

  async function copyWalletAddress(walletAddress: string, label: string) {
    const requestedAccountIdentity = accountIdentity;
    const requestIsCurrent = createAccountOperationGuard(
      () => activeAccountIdentity.current,
      requestedAccountIdentity,
      () => accountScopeActive.current,
    );
    setWalletCopyStatus(null);
    try {
      await copyTextToClipboard(walletAddress);
      if (!requestIsCurrent()) return;
      setWalletCopyStatus({ message: `${label} copied.`, error: false });
    } catch (error) {
      if (!requestIsCurrent()) return;
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
            <span className="account-title-row">
              <strong>{displayName === "Your" ? "Your account" : displayName}</strong>
              {workspaceRole && (
                <span
                  className={`account-role-badge ${workspaceRole.toLowerCase()}`}
                  aria-label={`${workspaceRole} workspace`}
                >
                  {workspaceRole}
                </span>
              )}
            </span>
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
              <div className="account-info-card account-email-card">
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

              <div className="account-info-card account-wallet-card">
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
            <div className="notification-preferences-heading">
              <span className="settings-icon" aria-hidden="true">✉</span>
              <div>
                <h3 id="notification-settings-title">Email notifications</h3>
                <p>Choose which useful account updates OpenEscrow sends to your verified email.</p>
              </div>
            </div>
            <div className="notification-choice-list">
              <label className="notification-choice">
                <input
                  type="checkbox"
                  checked={preferences.agreementActivity}
                  disabled={!email || preferences.deliveryPaused}
                  aria-describedby={`notification-preference-boundary${
                    preferenceNotice ? " notification-preference-status" : ""
                  }`}
                  onChange={(event) =>
                    void updatePreference("agreementActivity", event.target.checked)
                  }
                />
                <span>
                  <strong>Agreement updates</strong>
                  <small>Invitations, funding, claims, responses, and rulings</small>
                </span>
              </label>
              <label className="notification-choice">
                <input
                  type="checkbox"
                  checked={preferences.deadlineReminders}
                  disabled={!email || preferences.deliveryPaused}
                  aria-describedby={`notification-preference-boundary${
                    preferenceNotice ? " notification-preference-status" : ""
                  }`}
                  onChange={(event) =>
                    void updatePreference("deadlineReminders", event.target.checked)
                  }
                />
                <span>
                  <strong>Deadline reminders</strong>
                  <small>Upcoming claim, response, and arbiter deadlines</small>
                </span>
              </label>
            </div>
            <p id="notification-preference-boundary" className="notification-boundary">
              Both are on by default for a new verified account. You can turn either one off at any
              time. Messages follow your account, include an unsubscribe link, and omit private
              agreement details.
            </p>
            {preferences.deliveryPaused && (
              <p className="notification-paused-notice" role="status">
                {preferences.deliveryPauseReason === "complained"
                  ? "Email is paused because this address marked an OpenEscrow message as spam. Contact OpenEscrow if that was a mistake."
                  : "Email is paused because delivery to this address was not safe. Confirm the address, then contact OpenEscrow to restore delivery."}
              </p>
            )}
            {serviceReadiness?.email.configured ? (
              <>
                <div
                  className={`notification-delivery-status${
                    serviceReadiness.email.deliveryStatusConfigured &&
                    serviceReadiness.email.participantDeliveryReady
                      ? " ready"
                      : ""
                  }`}
                >
                  <div>
                    <strong>
                      {serviceReadiness.email.deliveryStatusConfigured &&
                      serviceReadiness.email.participantDeliveryReady
                        ? "Email notifications are ready"
                        : serviceReadiness.email.participantDeliveryReady
                          ? "Email sending is ready"
                          : "Account-only test mode"}
                    </strong>
                    <span>
                      {serviceReadiness.email.participantDeliveryReady
                        ? "OpenEscrow can send updates to verified participants."
                        : "A verified sending domain is still needed before participant emails can be delivered."}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost small"
                    type="button"
                    disabled={!identityToken || !accountIdentity || !email || isTestingEmail}
                    aria-describedby={`notification-preference-boundary${
                      preferenceNotice ? " notification-preference-status" : ""
                    }`}
                    onClick={async () => {
                if (!identityToken || !accountIdentity) return;
                const requestedIdentityToken = identityToken;
                const requestedAccountIdentity = accountIdentity;
                const requestIsCurrent = createAccountOperationGuard(
                  () => activeAccountIdentity.current,
                  requestedAccountIdentity,
                  () => accountScopeActive.current,
                );
                setIsTestingEmail(true);
                setPreferenceNotice({
                  message: "Sending a private configuration test...",
                  error: false,
                });
                try {
                  const result = await sendNotificationTest(requestedIdentityToken);
                  if (!requestIsCurrent()) return;
                  setPreferenceNotice({
                    message: result.duplicate
                      ? "A test was already delivered recently. Check this account's inbox."
                      : "Test email sent. Check this account's inbox.",
                    error: false,
                  });
                } catch (error) {
                  if (!requestIsCurrent()) return;
                  setPreferenceNotice({
                    message:
                      error instanceof Error
                        ? error.message
                        : "The test email could not be sent.",
                    error: true,
                  });
                } finally {
                  if (requestIsCurrent()) {
                    setIsTestingEmail(false);
                  }
                }
                    }}
                  >
                    {isTestingEmail ? "Sending..." : "Send test email"}
                  </button>
                </div>
                <details className="notification-technical-details">
                  <summary>Delivery details</summary>
                  <dl>
                    <div>
                      <dt>Provider</dt>
                      <dd>
                        {serviceReadiness.email.provider === "resend"
                          ? "Resend"
                          : "Configured email webhook"}
                      </dd>
                    </div>
                    <div>
                      <dt>Participant delivery</dt>
                      <dd>
                        {serviceReadiness.email.participantDeliveryReady
                          ? "Ready"
                          : "Verified sending domain needed"}
                      </dd>
                    </div>
                    <div>
                      <dt>Delivery confirmation</dt>
                      <dd>
                        {serviceReadiness.email.deliveryStatusConfigured
                          ? "Ready"
                          : "Setup incomplete"}
                      </dd>
                    </div>
                    <div>
                      <dt>Reminder scheduler</dt>
                      <dd>
                        {serviceReadiness.email.schedulerHealthy
                          ? `Healthy · every ${serviceReadiness.email.schedulerExpectedIntervalMinutes} minutes`
                          : "Needs attention"}
                        {serviceReadiness.email.schedulerLastRunAt
                          ? ` · checked ${new Date(serviceReadiness.email.schedulerLastRunAt).toLocaleString()}`
                          : " · waiting for its first hosted run"}
                      </dd>
                    </div>
                  </dl>
                </details>
              </>
            ) : (
              <div className="notification-delivery-status">
                <div>
                  <strong>Manual email options are available</strong>
                  <span>Copyable notices remain available while automatic delivery is being set up.</span>
                </div>
              </div>
            )}
            {preferenceNotice && (
              <p
                id="notification-preference-status"
                className={preferenceNotice.error ? "tx-error" : "field-help"}
                role={preferenceNotice.error ? "alert" : "status"}
                aria-live={preferenceNotice.error ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {preferenceNotice.message}
              </p>
            )}
          </section>

          <section
            className="settings-group account-security-settings"
            aria-labelledby="account-security-title"
          >
            <div className="account-security-heading">
              <span className="settings-icon" aria-hidden="true">✓</span>
              <div>
                <h3 id="account-security-title">Account security</h3>
                <p>Review your account inventory or end record access on devices you no longer trust.</p>
              </div>
            </div>
            <div className="account-security-options">
              <div className="account-security-option">
                <strong>Your data inventory</strong>
                <p id="account-data-inventory-description">
                  Download a privacy-safe list of record references and settings. It excludes
                  evidence, addresses, other participants' details, and access tokens.
                </p>
                <div className="settings-actions">
                  <button
                    className="btn btn-ghost small"
                    type="button"
                    aria-describedby={`account-data-inventory-description${
                      securityStatus ? " account-security-status" : ""
                    }`}
                    disabled={
                      !identityToken ||
                      isDownloadingInventory ||
                      isCopyingInventory ||
                      isEndingSessions
                    }
                    onClick={() => void downloadAccountDataInventory()}
                  >
                    {isDownloadingInventory ? "Preparing inventory..." : "Download data inventory"}
                  </button>
                  {inventoryRecovery && (
                    <button
                      className="btn btn-ghost small"
                      type="button"
                      aria-describedby="account-data-inventory-description account-security-status"
                      disabled={
                        !identityToken ||
                        isCopyingInventory ||
                        isDownloadingInventory ||
                        isEndingSessions
                      }
                      onClick={() => void copyPreparedAccountDataInventory()}
                    >
                      {isCopyingInventory ? "Copying inventory..." : "Copy prepared inventory"}
                    </button>
                  )}
                </div>
              </div>
              <div className="account-security-option">
                <strong>Record-session safety</strong>
                <p id="account-session-containment-description">
                  End expiring OpenEscrow record sessions on every device. Agreements, archives,
                  invitation links, and wallet-provider sessions are not changed.
                </p>
                <div className="settings-actions">
                  <button
                    className="btn btn-ghost small"
                    type="button"
                    aria-describedby={`account-session-containment-description${
                      securityStatus ? " account-security-status" : ""
                    }`}
                    disabled={
                      !identityToken ||
                      isEndingSessions ||
                      isDownloadingInventory ||
                      isCopyingInventory
                    }
                    onClick={() => void endOpenEscrowSessions()}
                  >
                    {isEndingSessions ? "Ending sessions..." : "End record sessions & sign out"}
                  </button>
                </div>
              </div>
            </div>
            {securityStatus && (
              <p
                id="account-security-status"
                className={securityError ? "tx-error" : "field-help"}
                role={securityError ? "alert" : "status"}
                aria-live={securityError ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {securityStatus}
              </p>
            )}
          </section>

        </div>
      </details>
    </>
  );
}
