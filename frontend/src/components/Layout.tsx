import type { ReactNode } from "react";
import { ConnectWallet } from "./ConnectWallet";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>OpenEscrow</h1>
        <p className="tagline">Base Sepolia demo - testnet funds only, not a production deployment.</p>
        <ConnectWallet />
      </header>
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
