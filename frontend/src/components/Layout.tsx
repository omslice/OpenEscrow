import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";
import { copyTextToClipboard } from "../lib/browserActions";
import { readRecoveryJson, writeRecoveryJson } from "../lib/browserRecovery";

export type AppNotification = {
  id: string;
  createdAt: string;
  actor: string;
  summary: string;
  href?: string;
  onOpen?: () => void;
  agreementId?: string;
};

function isNotificationReadState(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 250 &&
    value.every((id) => typeof id === "string" && id.length <= 200)
  );
}

export function Layout({
  children,
  notifications = [],
  notificationStorageScope = "guest",
  showNotifications = true,
  accountEntry,
}: {
  children: ReactNode;
  notifications?: AppNotification[];
  notificationStorageScope?: string | null;
  showNotifications?: boolean;
  accountEntry?: ReactNode;
}) {
  const readStateKey = `openescrow:read-notifications:${
    notificationStorageScope?.toLowerCase() || "guest"
  }`;
  const [readIds, setReadIds] = useState<string[]>([]);
  const [donationCopyStatus, setDonationCopyStatus] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!showNotifications) {
      setReadIds([]);
      return;
    }
    setReadIds(
      readRecoveryJson(readStateKey, isNotificationReadState) || [],
    );
  }, [readStateKey, showNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !readIds.includes(notification.id)).length,
    [notifications, readIds],
  );

  function markAllRead() {
    const next = Array.from(
      new Set([...notifications.map((notification) => notification.id), ...readIds]),
    ).slice(0, 250);
    setReadIds(next);
    writeRecoveryJson(readStateKey, next);
  }

  function openNotification(notification: AppNotification) {
    const next = Array.from(new Set([notification.id, ...readIds])).slice(0, 250);
    setReadIds(next);
    writeRecoveryJson(readStateKey, next);
    notification.onOpen?.();
  }

  async function copyDonationAddress() {
    try {
      await copyTextToClipboard("omslice.eth");
      setDonationCopyStatus({
        message: "Donation address copied.",
        error: false,
      });
    } catch {
      setDonationCopyStatus({
        message: "We could not copy the address. Select omslice.eth and copy it manually.",
        error: true,
      });
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">
            <img
              src="/openescrow-wordmark.svg"
              alt="OpenEscrow"
              className="app-wordmark-logo"
            />
          </h1>
          <p className="tagline">
            OpenEscrow is a free, open-source platform for fair and transparent management of rental
            security deposits.
          </p>
        </div>
        <div className="header-actions">
          {showNotifications && (
            <details className="notification-center">
              <summary aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}>
                <span aria-hidden="true">🔔</span>
                {unreadCount > 0 && <b>{unreadCount}</b>}
              </summary>
              <div className="notification-menu">
                <div className="notification-menu-heading">
                  <h2>Agreement activity</h2>
                  {unreadCount > 0 && (
                    <button type="button" onClick={markAllRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p>Find your proposals and deposits to load recent activity.</p>
                ) : (
                  <ol>
                    {notifications.map((notification) => (
                      <li
                        className={readIds.includes(notification.id) ? "" : "unread"}
                        key={notification.id}
                      >
                        <button
                          className="notification-item"
                          type="button"
                          onClick={(event) => {
                            openNotification(notification);
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                        >
                          <strong>{notification.actor}</strong>
                          <span>{notification.summary}</span>
                          <time dateTime={notification.createdAt}>
                            {new Date(notification.createdAt).toLocaleString()}
                          </time>
                          <small>Open relevant workspace →</small>
                        </button>
                        {notification.href && (
                          <a href={notification.href} target="_blank" rel="noreferrer">
                            View onchain receipt
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </details>
          )}
          {accountEntry === undefined ? <ConnectWallet /> : accountEntry}
        </div>
      </header>
      <div className="demo-notice" role="status">
        <strong>Testnet demonstration.</strong> Test tokens only. Do not upload personal information
        or use this app for a real tenancy.
      </div>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p className="footer-safety-note">
          OpenEscrow is a testnet demo. Use only invented information and test files—never upload
          real leases, identity documents, invoices, or photographs. Private demo files require an
          authorized agreement link. A file added with a public IPFS link is public and permanent,
          while its digital fingerprint can help confirm whether it changed.
        </p>
        <div className="donation-message">
          <span>
            <strong>Support the open-source project.</strong> Optional donations help fund continued
            OpenEscrow development.
          </span>
          <span className="donation-address-control">
            <span className="donation-address">omslice.eth</span>
            <button
              className="donation-copy-button"
              type="button"
              aria-label="Copy donation address omslice.eth"
              onClick={() => void copyDonationAddress()}
            >
              Copy address
            </button>
          </span>
          <small>Donations are separate from rental deposits and never affect access.</small>
          {donationCopyStatus && (
            <span
              className={`donation-copy-status${donationCopyStatus.error ? " error" : ""}`}
              role={donationCopyStatus.error ? "alert" : "status"}
              aria-live={donationCopyStatus.error ? "assertive" : "polite"}
            >
              {donationCopyStatus.message}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
