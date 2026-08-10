import { lazy, useEffect, useRef, useState } from "react";
import { useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
import { PublicLanding } from "./components/PublicLanding";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { rememberAccountProviderActivation } from "./lib/accountProviderActivation";
import { reloadBrowserPage } from "./lib/browserActions";
import {
  captureEntryContext,
  type AccountLoginMethod,
  type EntryContext,
} from "./lib/entryContext";
import type { NegotiationAccess } from "./lib/negotiations";

const WorkspaceApp = lazy(() => import("./WorkspaceApp"));
const WalletProviders = lazy(() => import("./WalletProviders"));
const ACCOUNT_CONNECTION_TIMEOUT_MS = 5_000;

function WorkspaceBoundary({
  initialAccess,
}: {
  initialAccess?: NegotiationAccess | null;
}) {
  const workspace = <WorkspaceApp initialAccess={initialAccess} />;
  return (
    <DeferredLoadBoundary
      area="app"
      fallback={
        <div className="app-loading" role="status">
          Loading your OpenEscrow workspace...
        </div>
      }
    >
      {ACCOUNT_AUTH_ENABLED ? (
        <WalletProviders>{workspace}</WalletProviders>
      ) : (
        workspace
      )}
    </DeferredLoadBoundary>
  );
}

function AccountConnectionPage() {
  const [delayed, setDelayed] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const retryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDelayed(true),
      ACCOUNT_CONNECTION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (delayed) retryButton.current?.focus();
  }, [delayed]);

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
    <main
      className={`load-failure load-failure-app account-connection-page${
        delayed ? " delayed" : ""
      }`}
      role={delayed ? "alert" : "status"}
      aria-busy={!delayed}
      aria-label="OpenEscrow secure sign-in status"
    >
      <div>
        <span className="load-failure-eyebrow">
          {delayed ? "Temporary sign-in problem" : "Secure testnet access"}
        </span>
        <h1>
          {delayed
            ? "Secure sign-in is unavailable"
            : "Connecting secure sign-in"}
        </h1>
        <p>
          {delayed
            ? "Check your connection and try again. Your invitation remains available in this tab, and no transaction has been started."
            : "OpenEscrow is checking the account provider before opening this invitation."}
        </p>
      </div>
      <div className="load-failure-recovery">
        {delayed ? (
          <button
            ref={retryButton}
            className="load-failure-action"
            type="button"
            onClick={reload}
          >
            Retry secure sign-in
          </button>
        ) : (
          <button className="load-failure-action" type="button" disabled>
            Connecting...
          </button>
        )}
        {reloadError && (
          <p className="tx-error" aria-live="assertive">
            {reloadError}
          </p>
        )}
      </div>
    </main>
  );
}

function AccountApp({
  entryContext,
  initialLoginMethod,
}: {
  entryContext: EntryContext;
  initialLoginMethod?: AccountLoginMethod | null;
}) {
  const { ready, authenticated, login } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const loginAttempted = useRef(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && authenticated) rememberAccountProviderActivation();
  }, [authenticated, ready]);

  useEffect(() => {
    if (
      !ready ||
      authenticated ||
      entryContext.roleLocked ||
      !initialLoginMethod ||
      loginAttempted.current
    ) {
      return;
    }
    loginAttempted.current = true;
    setSignInError(null);
    const reportSignInError = () => {
      setSignInError(
        "Sign-in did not open. Choose Google or a wallet above to try again.",
      );
    };
    try {
      const loginResult =
        initialLoginMethod === "google"
          ? initOAuth({ provider: "google" })
          : login({ loginMethods: ["wallet"] });
      void Promise.resolve(loginResult).catch(reportSignInError);
    } catch {
      reportSignInError();
    }
  }, [authenticated, entryContext.roleLocked, initialLoginMethod, initOAuth, login, ready]);

  if (!ready) {
    return entryContext.roleLocked ? (
      <AccountConnectionPage />
    ) : (
      <PublicLanding accountReady={false} />
    );
  }
  if (!authenticated && !entryContext.roleLocked) {
    return <PublicLanding signInError={signInError} />;
  }
  return <WorkspaceBoundary initialAccess={entryContext.initialAccess} />;
}

function App({
  entryContext: suppliedEntryContext,
  initialLoginMethod,
}: {
  entryContext?: EntryContext;
  initialLoginMethod?: AccountLoginMethod | null;
}) {
  const [entryContext] = useState(
    () => suppliedEntryContext || captureEntryContext(),
  );
  return ACCOUNT_AUTH_ENABLED ? (
    <AccountApp
      entryContext={entryContext}
      initialLoginMethod={initialLoginMethod}
    />
  ) : (
    <WorkspaceBoundary initialAccess={entryContext.initialAccess} />
  );
}

export default App;
