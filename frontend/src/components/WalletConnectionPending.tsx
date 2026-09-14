import { useEffect, useState } from "react";
import { reloadBrowserPage } from "../lib/browserActions";

const WALLET_CONNECTION_TIMEOUT_MS = 12_000;

export function WalletConnectionPending({ compact = false }: { compact?: boolean }) {
  const [delayed, setDelayed] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDelayed(true), WALLET_CONNECTION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  function retry() {
    setReloadError(null);
    try {
      reloadBrowserPage();
    } catch (error) {
      setReloadError(
        error instanceof Error
          ? error.message
          : "Use your browser's refresh control to retry the wallet connection.",
      );
    }
  }

  return (
    <div className={compact ? "account-entry account-connection-controls" : "wallet-setup-state wallet-connection-pending"}>
      <span className="hint" role="status">
        {delayed
          ? compact
            ? "Wallet connection is taking longer than expected."
            : "Wallet connection is taking longer than expected. You can keep waiting or reload the page to retry."
          : compact
            ? "Connecting wallet..."
            : "Loading wallets..."}
      </span>
      {delayed && (
        <button className="btn btn-secondary" type="button" onClick={retry}>
          Reload to retry wallet connection
        </button>
      )}
      {reloadError && <span className="tx-error" role="alert">{reloadError}</span>}
    </div>
  );
}
