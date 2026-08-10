import { useEffect, type ReactNode } from "react";
import { Layout } from "./Layout";
import { PublicIntro } from "./PublicIntro";
import { preferredScrollBehavior } from "../lib/accessibility";

export function PublicLanding({
  accountReady = true,
  accountEntry,
  signInError,
}: {
  accountReady?: boolean;
  accountEntry?: ReactNode;
  signInError?: string | null;
}) {
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
          "../lib/jurisdictions"
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

  function focusAccountEntry() {
    const signInTarget =
      document.querySelector<HTMLElement>(
        ".header-actions .account-entry button:not(:disabled)",
      ) ||
      document.querySelector<HTMLElement>(
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

  function focusSignInSection() {
    const section = document.getElementById("public-access");
    const heading = document.getElementById("public-access-title");
    section?.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: "center",
    });
    window.requestAnimationFrame(() => {
      heading?.focus({ preventScroll: true });
    });
  }

  return (
    <Layout showNotifications={false} accountEntry={accountEntry}>
      <PublicIntro onStart={focusSignInSection} showAboutDetails />
      <section
        id="public-access"
        className="card public-access-prompt"
        aria-labelledby="public-access-title"
      >
        <div>
          <span className="eyebrow">Testnet access</span>
          <h2 id="public-access-title" tabIndex={-1}>
            Sign in to try OpenEscrow
          </h2>
          <p>
            {accountReady
              ? "Continue with Google or a wallet using the sign-in options above. Your workspace role is chosen after sign-in; only a specific invitation link can preselect it."
              : "Google and wallet sign-in are still connecting. You can review how OpenEscrow works while you wait, then use the retry control above if sign-in remains unavailable."}
          </p>
          {signInError && (
            <p className="tx-error" role="alert" aria-live="assertive">
              {signInError}
            </p>
          )}
        </div>
        <button className="btn btn-secondary" type="button" onClick={focusAccountEntry}>
          Show sign-in options
        </button>
      </section>
    </Layout>
  );
}
