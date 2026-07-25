import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount } from "wagmi";
import { shortAddr } from "../lib/format";
import {
  clearInviteRole,
  inviteRoleLabel,
  useInviteRole,
} from "../lib/inviteContext";

type NotificationPreferences = {
  agreementActivity: boolean;
  deadlineReminders: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  agreementActivity: false,
  deadlineReminders: false,
};

export function PrivyAccountCenter() {
  const { ready, authenticated, user, linkGoogle, linkWallet, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [walletSetup, setWalletSetup] = useState<"idle" | "creating" | "slow" | "error">("idle");
  const [walletError, setWalletError] = useState<string | null>(null);
  const attemptedForUser = useRef<string | null>(null);
  const inviteRole = useInviteRole();

  const email = user?.google?.email ?? user?.email?.address;
  const hasWallet = wallets.length > 0;
  const preferenceKey = useMemo(
    () => (user ? `openescrow:notifications:${user.id}` : null),
    [user],
  );

  useEffect(() => {
    if (!preferenceKey) {
      setPreferences(DEFAULT_PREFERENCES);
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
  }, [preferenceKey]);

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

  function updatePreference(name: keyof NotificationPreferences, checked: boolean) {
    if (!preferenceKey) return;
    const next = { ...preferences, [name]: checked };
    setPreferences(next);
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      // The UI still reflects the choice for this session if storage is unavailable.
    }
  }

  if (!ready || !authenticated || !user) return null;

  return (
    <section className="card account-center" aria-labelledby="account-center-title">
      <div className="account-center-heading">
        <div>
          <span className="eyebrow">Account and wallet</span>
          <h2 id="account-center-title">Your OpenEscrow account</h2>
        </div>
        <span className="account-status">Signed in</span>
      </div>

      {inviteRole && (
        <div className="invite-role-notice">
          <div>
            <span className="eyebrow">{inviteRoleLabel[inviteRole]} invitation</span>
            <h3>You are joining this deposit as the {inviteRole}.</h3>
            <p>
              Sign in with the Google account that received the invitation. This onboarding role
              does not make the account a landlord; the connected wallet is matched to a specific
              on-chain role when the agreement is created.
            </p>
            {email && (
              <p>
                Currently signed in as <strong>{email}</strong>. If this is the landlord account,
                sign out and choose the invited account.
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
              Exit invitation mode
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
                        <button className="btn btn-ghost" onClick={() => setActiveWallet(wallet)}>
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
            Rabby is available through installed-wallet detection. If it is not installed in this
            browser, choose WalletConnect and search for Rabby.
          </p>
        </div>
      </div>

      <div className="notification-preferences">
        <h3>Email notification preferences</h3>
        <label>
          <input
            type="checkbox"
            checked={preferences.agreementActivity}
            disabled={!email}
            onChange={(event) => updatePreference("agreementActivity", event.target.checked)}
          />
          Agreement invitations, funding, claims, responses, and rulings
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.deadlineReminders}
            disabled={!email}
            onChange={(event) => updatePreference("deadlineReminders", event.target.checked)}
          />
          Upcoming claim, response, and arbiter deadlines
        </label>
        <p className="notification-boundary">
          Preferences are saved on this device for now. Email delivery is not active until the
          server-side chain monitor and email service are connected.
        </p>
      </div>
    </section>
  );
}
