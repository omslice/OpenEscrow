import { lazy, Suspense, useState } from "react";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
import { LegalConsentNotice } from "./components/LegalConsentNotice";
import { PublicLanding } from "./components/PublicLanding";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import {
  hasActivatedAccountProvider,
  rememberAccountProviderActivation,
} from "./lib/accountProviderActivation";
import {
  captureEntryContext,
  type AccountLoginMethod,
} from "./lib/entryContext";
import "./App.css";

const AuthenticatedRoot = lazy(() => import("./AuthenticatedRoot"));
const FallbackRoot = lazy(() => import("./FallbackRoot"));
const LegalPage = lazy(() =>
  import("./components/LegalPage").then((module) => ({
    default: module.LegalPage,
  })),
);
const DemoPage = lazy(() =>
  import("./components/DemoPage").then((module) => ({
    default: module.DemoPage,
  })),
);
const FundingPage = lazy(() =>
  import("./components/FundingPage").then((module) => ({
    default: module.FundingPage,
  })),
);

function PublicAccountEntry({
  onChoose,
}: {
  onChoose: (method: AccountLoginMethod) => void;
}) {
  return (
    <div className="account-entry">
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => onChoose("google")}
      >
        Continue with Google
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => onChoose("wallet")}
      >
        Continue with a wallet
      </button>
      <LegalConsentNotice />
    </div>
  );
}

function ConnectingAccountEntry() {
  return (
    <div className="account-entry account-connection-controls" aria-busy="true">
      <button className="btn btn-primary" type="button" disabled>
        Connecting secure sign-in...
      </button>
      <span
        className="account-connection-note"
        role="status"
        aria-live="polite"
        tabIndex={-1}
      >
        Google and wallet sign-in are connecting.
      </span>
    </div>
  );
}

function InteractiveRoot() {
  const [entryContext] = useState(captureEntryContext);
  const [providerPreviouslyActivated] = useState(hasActivatedAccountProvider);
  const [initialLoginMethod, setInitialLoginMethod] =
    useState<AccountLoginMethod | null>(null);

  if (
    ACCOUNT_AUTH_ENABLED &&
    !entryContext.roleLocked &&
    !providerPreviouslyActivated &&
    !initialLoginMethod
  ) {
    return (
      <PublicLanding
        accountEntry={
          <PublicAccountEntry
            onChoose={(method) => {
              rememberAccountProviderActivation();
              setInitialLoginMethod(method);
            }}
          />
        }
      />
    );
  }

  return (
    <DeferredLoadBoundary
      area="app"
      fallback={
        ACCOUNT_AUTH_ENABLED && !entryContext.roleLocked ? (
          <PublicLanding
            accountReady={false}
            accountEntry={<ConnectingAccountEntry />}
          />
        ) : (
          <div className="app-loading" role="status">
            Loading secure OpenEscrow access...
          </div>
        )
      }
    >
      {ACCOUNT_AUTH_ENABLED ? (
        <AuthenticatedRoot
          entryContext={entryContext}
          initialLoginMethod={initialLoginMethod}
        />
      ) : (
        <FallbackRoot />
      )}
    </DeferredLoadBoundary>
  );
}

export function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/demo") {
    return (
      <Suspense
        fallback={
          <div className="app-loading" role="status">
            Loading the OpenEscrow overview...
          </div>
        }
      >
        <DemoPage />
      </Suspense>
    );
  }

  if (path === "/funding") {
    return (
      <Suspense
        fallback={
          <div className="app-loading" role="status">
            Loading OpenEscrow funding transparency...
          </div>
        }
      >
        <FundingPage />
      </Suspense>
    );
  }

  if (path === "/privacy") {
    return (
      <Suspense
        fallback={
          <div className="app-loading" role="status">
            Loading the Privacy Policy...
          </div>
        }
      >
        <LegalPage document="privacy" />
      </Suspense>
    );
  }

  if (path === "/terms") {
    return (
      <Suspense
        fallback={
          <div className="app-loading" role="status">
            Loading the Terms of Use...
          </div>
        }
      >
        <LegalPage document="terms" />
      </Suspense>
    );
  }

  return <InteractiveRoot />;
}
