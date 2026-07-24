import type { ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";

export function Layout({ children }: { children: ReactNode }) {
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
        <ConnectWallet />
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
