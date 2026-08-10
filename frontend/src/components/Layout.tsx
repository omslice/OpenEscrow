import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";
import { copyTextToClipboard } from "../lib/browserActions";
import { readRecoveryJson, writeRecoveryJson } from "../lib/browserRecovery";

const DONATION_ADDRESS = "0x0C33BC6449d134782a95167658303F9d87dd7D79";
const DONATION_NAME = "openescrow.eth";

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
      await copyTextToClipboard(DONATION_NAME);
      setDonationCopyStatus({
        message: "Donation address copied.",
        error: false,
      });
    } catch {
      setDonationCopyStatus({
        message: `We could not copy the address. Select ${DONATION_NAME} and copy it manually.`,
        error: true,
      });
    }
  }

  return (
    <div className="app-shell">
      <header
        className={`app-header${
          !showNotifications || accountEntry !== undefined ? " app-header-account-entry" : ""
        }`}
      >
        <div className="app-brand">
          <h1 className="app-title">
            <picture>
              <source media="(prefers-color-scheme: light)" srcSet="/openescrow-wordmark.svg" />
              <img
                src="/openescrow-logo-tapered-dark.png"
                alt="OpenEscrow"
                className="app-wordmark-logo"
              />
            </picture>
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
        <strong>Public Base Sepolia testnet prototype.</strong> Test tokens only; use invented
        information and test files. OpenEscrow is not legal advice or a licensed escrow provider.
      </div>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <nav className="legal-links" aria-label="Legal and project information">
          <a href="/funding">Project Funding</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Use</a>
          <a href="mailto:support@openescrow.io">Support</a>
          <a href="https://github.com/omslice/OpenEscrow" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="donation-message">
          <span>
            <strong>Support the open-source project.</strong> Donations help fund continued
            OpenEscrow development.
          </span>
          <span className="donation-address-control">
            <span
              className="donation-address"
              title={`Resolves to ${DONATION_ADDRESS}`}
            >
              {DONATION_NAME}
            </span>
            <button
              className="donation-copy-button"
              type="button"
              aria-label={`Copy donation address ${DONATION_NAME}`}
              title={`Copy ${DONATION_NAME}`}
              onClick={() => void copyDonationAddress()}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </span>
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
