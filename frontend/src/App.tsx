import { lazy, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
import { Layout } from "./components/Layout";
import { PublicIntro } from "./components/PublicIntro";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { preferredScrollBehavior } from "./lib/accessibility";
import { reloadBrowserPage } from "./lib/browserActions";
import { replaceRecoveryUrl } from "./lib/browserRecovery";
import {
  preserveNegotiationAccessForReload,
  recoverNegotiationAccessForEntry,
  recoverUniqueNegotiationAccessForProposal,
} from "./lib/negotiationAccessRecovery";
import type { NegotiationAccess, NegotiationRole } from "./lib/negotiations";
import "./App.css";

const WorkspaceApp = lazy(() => import("./WorkspaceApp"));
const WalletProviders = lazy(() => import("./WalletProviders"));
const ACCOUNT_CONNECTION_TIMEOUT_MS = 5_000;

type EntryContext = {
  initialAccess: NegotiationAccess | null;
  roleLocked: boolean;
};

let currentPageEntryAccess: NegotiationAccess | null = null;

function captureEntryContext(): EntryContext {
  const url = new URL(window.location.href);
  const proposalId = url.searchParams.get("proposal");
  const token = url.searchParams.get("token");
  const accessRole = url.searchParams.get("access");
  const inviteRole = url.searchParams.get("invite");
  const role = accessRole || inviteRole;
  const validRole =
    role === "landlord" || role === "tenant" || role === "arbiter";
  const validNegotiationInvitation = Boolean(proposalId && token && validRole);
  const currentPageRecovery =
    proposalId &&
    currentPageEntryAccess?.proposalId === proposalId &&
    (!validRole || currentPageEntryAccess.role === role)
      ? currentPageEntryAccess
      : null;
  const recoveredAccess =
    !token && proposalId
      ? validRole
        ? recoverNegotiationAccessForEntry(proposalId, role) ||
          currentPageRecovery
        : recoverUniqueNegotiationAccessForProposal(proposalId) ||
          currentPageRecovery
      : null;
  const validNegotiationRecovery = Boolean(recoveredAccess);
  const agreementId = url.searchParams.get("id");
  let validAgreementInvitation = false;
  if (
    agreementId &&
    (inviteRole === "tenant" || inviteRole === "arbiter")
  ) {
    try {
      validAgreementInvitation = BigInt(agreementId) >= 0n;
    } catch {
      validAgreementInvitation = false;
    }
  }

  let needsCleanup = false;
  if (token) {
    url.searchParams.delete("token");
    url.searchParams.delete("access");
    needsCleanup = true;
  } else if (accessRole) {
    url.searchParams.delete("access");
    needsCleanup = true;
  }
  if (
    inviteRole &&
    !validNegotiationInvitation &&
    !validNegotiationRecovery &&
    !validAgreementInvitation
  ) {
    url.searchParams.delete("invite");
    needsCleanup = true;
  }
  if (needsCleanup && !replaceRecoveryUrl(url)) {
    try {
      window.location.replace(url.toString());
    } catch {
      // Keep the captured access in current-page memory if URL cleanup is blocked.
    }
  }

  if (proposalId && token && validRole) {
    const initialAccess: NegotiationAccess = {
      proposalId,
      token,
      role: role as NegotiationRole,
      source: "invite",
    };
    currentPageEntryAccess = initialAccess;
    preserveNegotiationAccessForReload(initialAccess);
    return {
      initialAccess,
      roleLocked: true,
    };
  }
  if (recoveredAccess) {
    currentPageEntryAccess = recoveredAccess;
    return {
      initialAccess: recoveredAccess,
      roleLocked: true,
    };
  }
  return {
    initialAccess: null,
    roleLocked: validAgreementInvitation,
  };
}

function PublicLanding({ accountReady = true }: { accountReady?: boolean }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    const jurisdictionParam = params.get("jurisdiction");
    if (!idParam || !jurisdictionParam) return;
    const linkedId = idParam;
    const linkedJurisdiction = jurisdictionParam;
    let active = true;

    async function rememberLinkedJurisdiction() {
      try {
        const id = BigInt(linkedId);
        const { isJurisdictionCode, rememberJurisdiction } = await import(
          "./lib/jurisdictions"
        );
        if (active && isJurisdictionCode(linkedJurisdiction)) {
          rememberJurisdiction(id, linkedJurisdiction);
        }
      } catch {
        // A malformed or unsupported hint must not interrupt public sign-in.
      }
    }

    void rememberLinkedJurisdiction();
    return () => {
      active = false;
    };
  }, []);

  function focusSignIn() {
    const signInTarget = document.querySelector<HTMLElement>(
      ".header-actions .account-entry button:not(:disabled)",
    ) || document.querySelector<HTMLElement>(
      ".header-actions .account-entry [role='status'], .header-actions .account-entry [role='alert']",
    );
    signInTarget?.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: "center",
    });
    window.requestAnimationFrame(() => {
      signInTarget?.focus({ preventScroll: true });
    });
  }

  return (
    <Layout showNotifications={false}>
      <PublicIntro onStart={focusSignIn} />
      <section
        className="card public-access-prompt"
        aria-labelledby="public-access-title"
      >
        <div>
          <span className="eyebrow">Testnet access</span>
          <h2 id="public-access-title">Sign in to try OpenEscrow</h2>
          <p>
            {accountReady
              ? "Continue with Google or a wallet using the sign-in options above. Your workspace role is chosen after sign-in; only a specific invitation link can preselect it."
              : "Google and wallet sign-in are still connecting. You can review how OpenEscrow works while you wait, then use the retry control above if sign-in remains unavailable."}
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={focusSignIn}>
          Show sign-in options
        </button>
      </section>
    </Layout>
  );
}

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

function AccountApp() {
  const { ready, authenticated } = usePrivy();
  const [entryContext] = useState(captureEntryContext);

  if (!ready) {
    return entryContext.roleLocked ? (
      <AccountConnectionPage />
    ) : (
      <PublicLanding accountReady={false} />
    );
  }
  if (!authenticated && !entryContext.roleLocked) {
    return <PublicLanding />;
  }
  return <WorkspaceBoundary initialAccess={entryContext.initialAccess} />;
}

function App() {
  return ACCOUNT_AUTH_ENABLED ? <AccountApp /> : <WorkspaceBoundary />;
}

export default App;
