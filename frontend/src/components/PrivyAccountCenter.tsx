import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useAccount } from "wagmi";
import { shortAddr } from "../lib/format";

type NotificationPreferences = {
  agreementActivity: boolean;
  deadlineReminders: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  agreementActivity: false,
  deadlineReminders: false,
};

export function PrivyAccountCenter() {
  const { ready, authenticated, user, linkGoogle, linkWallet } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  const email = user?.google?.email ?? user?.email?.address;
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
