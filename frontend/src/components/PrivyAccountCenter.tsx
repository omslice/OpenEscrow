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
  loadNotificationPreferences,
  loadServiceReadiness,
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

const DEFAULT_PREFERENCES: NotificationPreferences = {
  agreementActivity: false,
  deadlineReminders: false,
};

export function PrivyAccountCenter({
  workspaceRole,
  onChangeWorkspaceRole,
}: {
  workspaceRole?: string;
  onChangeWorkspaceRole?: () => void;
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
  const preferenceWrite = useRef(0);
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
        window.localStorage.setItem(preferenceKey, JSON.stringify(saved));
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

  useEffect(() => {
    let cancelled = false;
    void loadServiceReadiness()
      .then((readiness) => {
        if (!cancelled) setServiceReadiness(readiness);
      })
      .catch(() => {
        if (!cancelled) setServiceReadiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      // The UI still reflects the choice for this session if storage is unavailable.
    }
    if (!identityToken) return;
    const write = ++preferenceWrite.current;
    try {
      const saved = await saveNotificationPreferences(identityToken, next);
      if (write !== preferenceWrite.current) return;
      setPreferences(saved);
      window.localStorage.setItem(preferenceKey, JSON.stringify(saved));
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
          <section className="account-center account-center-embedded" aria-label="Account details">
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
                      onClick={() => void navigator.clipboard.writeText(address)}
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
                    <p className="hint">
                      {walletSetup === "creating"
                        ? "Creating your OpenEscrow wallet..."
                        : walletSetup === "slow"
                          ? "Wallet setup is taking longer than expected. You can retry or connect your own wallet."
                          : "No wallet is linked to this account yet."}
                    </p>
                    {walletError && <p className="tx-error">{walletError}</p>}
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
                              onClick={() => void navigator.clipboard.writeText(wallet.address)}
                            >
                              Copy address
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
        </div>
      </details>

      <details className="card account-workspace-disclosure settings-disclosure">
        <summary>
          <span>
            <span className="eyebrow">Preferences</span>
            <strong>Settings</strong>
            <small>Workspace and notification options</small>
          </span>
          <span className="disclosure-cue" aria-hidden="true" />
        </summary>
        <div className="account-workspace-content settings-content">
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

          <section className="settings-group notification-preferences" aria-labelledby="notification-settings-title">
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
          >
            {preferenceStatus}
          </p>
        )}
          </section>
        </div>
      </details>
    </>
  );
}
