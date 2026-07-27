import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "./ConnectWallet";

export type AppNotification = {
  id: string;
  createdAt: string;
  actor: string;
  summary: string;
  href?: string;
  onOpen?: () => void;
  agreementId?: string;
};

export function Layout({
  children,
  notifications = [],
}: {
  children: ReactNode;
  notifications?: AppNotification[];
}) {
  const { address } = useAccount();
  const readStateKey = `openescrow:read-notifications:${address?.toLowerCase() || "guest"}`;
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(readStateKey) || "[]");
      setReadIds(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
    } catch {
      setReadIds([]);
    }
  }, [readStateKey]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !readIds.includes(notification.id)).length,
    [notifications, readIds],
  );

  function markAllRead() {
    const next = Array.from(
      new Set([...notifications.map((notification) => notification.id), ...readIds]),
    ).slice(0, 250);
    setReadIds(next);
    window.localStorage.setItem(readStateKey, JSON.stringify(next));
  }

  function openNotification(notification: AppNotification) {
    const next = Array.from(new Set([notification.id, ...readIds])).slice(0, 250);
    setReadIds(next);
    window.localStorage.setItem(readStateKey, JSON.stringify(next));
    notification.onOpen?.();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Rental deposit protection · Base Sepolia</p>
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
                <p>Find your proposals and agreements to load recent activity.</p>
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
          <ConnectWallet />
        </div>
      </header>
      <div className="demo-notice" role="status">
        <strong>Testnet demonstration.</strong> Test tokens only. Do not upload personal information
        or use this app for a real tenancy.
      </div>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>
          Evidence stored in the private demo vault is retrievable only through an authorized
          agreement link; its content hash can be independently verified. Any IPFS URI entered
          manually is public and permanent. This remains a testnet demo—do not upload real personal
          information, lease documents, invoices, or photographs.
        </p>
      </footer>
    </div>
  );
}
