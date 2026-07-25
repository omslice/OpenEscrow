import type { ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";

export type AppNotification = {
  id: string;
  createdAt: string;
  actor: string;
  summary: string;
};

export function Layout({
  children,
  notifications = [],
}: {
  children: ReactNode;
  notifications?: AppNotification[];
}) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Rental deposit protection · Base Sepolia</p>
          <h1>OpenEscrow</h1>
          <p className="tagline">
            The deposit stays protected unless a landlord submits a claim the tenant accepts or an
            agreed arbiter resolves.
          </p>
        </div>
        <div className="header-actions">
          <details className="notification-center">
            <summary aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}>
              <span aria-hidden="true">🔔</span>
              {notifications.length > 0 && <b>{notifications.length}</b>}
            </summary>
            <div className="notification-menu">
              <h2>Agreement activity</h2>
              {notifications.length === 0 ? (
                <p>Find your proposals and agreements to load recent activity.</p>
              ) : (
                <ol>
                  {notifications.map((notification) => (
                    <li key={notification.id}>
                      <strong>{notification.actor}</strong>
                      <span>{notification.summary}</span>
                      <time dateTime={notification.createdAt}>
                        {new Date(notification.createdAt).toLocaleString()}
                      </time>
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
          Evidence uploaded through this app is stored via a content hash + pointer only, per{" "}
          <code>docs/mvp-spec.md</code>. Any URI you publish (including IPFS) is public and permanent -
          never upload real personal information, lease documents, invoices, or photographs here.
        </p>
      </footer>
    </div>
  );
}
