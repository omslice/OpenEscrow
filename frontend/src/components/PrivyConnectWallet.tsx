import { lazy, Suspense, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useInviteRole } from "../lib/inviteContext";
import { reloadBrowserPage } from "../lib/browserActions";

const ACCOUNT_CONNECTION_TIMEOUT_MS = 5_000;

const PrivyConnectedWallet = lazy(() =>
  import("./PrivyConnectedWallet").then((module) => ({
    default: module.PrivyConnectedWallet,
  })),
);

function AccountConnectionControls() {
  const [delayed, setDelayed] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDelayed(true),
      ACCOUNT_CONNECTION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  function reload() {
    setReloadError(null);
    try {
      reloadBrowserPage();
    } catch (error) {
      setReloadError(
        error instanceof Error
          ? error.message
          : "OpenEscrow could not reload. Use your browser's refresh control and try again.",
      );
    }
  }

  return (
    <div
      className="account-entry account-connection-controls"
      aria-busy={!delayed}
    >
      {delayed ? (
        <button className="btn btn-primary" type="button" onClick={reload}>
          Retry secure sign-in
        </button>
      ) : (
        <button className="btn btn-primary" type="button" disabled>
          Connecting secure sign-in...
        </button>
      )}
      <span
        className={delayed ? "account-connection-error" : "account-connection-note"}
        role={delayed ? "alert" : "status"}
        aria-live={delayed ? "assertive" : "polite"}
        tabIndex={-1}
      >
        {delayed
          ? "Sign-in is taking longer than expected. Check your connection and try again."
          : "Google and wallet sign-in are connecting."}
      </span>
      {reloadError && (
        <span className="account-connection-error" role="alert">
          {reloadError}
        </span>
      )}
    </div>
  );
}

export function PrivyConnectWallet() {
  const { ready, authenticated, login } = usePrivy();
  const inviteRole = useInviteRole();

  if (!ready) {
    return <AccountConnectionControls />;
  }

  if (!authenticated) {
    return (
      <div className="account-entry">
        <button className="btn btn-primary" onClick={() => login({ loginMethods: ["google"] })}>
          {inviteRole ? `Continue as ${inviteRole} with Google` : "Continue with Google"}
        </button>
        <button className="btn btn-ghost" onClick={() => login({ loginMethods: ["wallet"] })}>
          {inviteRole ? `Use a ${inviteRole} wallet` : "Continue with a wallet"}
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<button className="btn btn-primary" disabled>Loading wallet...</button>}>
      <PrivyConnectedWallet />
    </Suspense>
  );
}
