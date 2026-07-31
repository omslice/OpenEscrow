import { lazy, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
import { Layout } from "./components/Layout";
import { PublicIntro } from "./components/PublicIntro";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { preferredScrollBehavior } from "./lib/accessibility";
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

function PublicLanding() {
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
    const signInButton = document.querySelector<HTMLButtonElement>(
      ".header-actions .account-entry button:not(:disabled)",
    );
    signInButton?.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: "center",
    });
    window.requestAnimationFrame(() => {
      signInButton?.focus({ preventScroll: true });
    });
  }

  return (
    <Layout>
      <PublicIntro onStart={focusSignIn} />
      <section
        className="card public-access-prompt"
        aria-labelledby="public-access-title"
      >
        <div>
          <span className="eyebrow">Testnet access</span>
          <h2 id="public-access-title">Sign in to try OpenEscrow</h2>
          <p>
            Continue with Google or a wallet using the sign-in options above.
            Your workspace role is chosen after sign-in; only a specific
            invitation link can preselect it.
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

function AccountApp() {
  const { ready, authenticated } = usePrivy();
  const [entryContext] = useState(captureEntryContext);

  if (!ready) {
    return (
      <div className="app-loading" role="status">
        Checking secure OpenEscrow access...
      </div>
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
