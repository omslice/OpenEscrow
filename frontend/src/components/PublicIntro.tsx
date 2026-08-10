import { useEffect, useRef, useState } from "react";
import {
  closeModalDialog,
  showModalDialog,
} from "../lib/browserActions";
import { replaceRecoveryUrl } from "../lib/browserRecovery";

export function PublicIntro({
  onStart,
  showAboutDetails = false,
}: {
  onStart: () => void;
  showAboutDetails?: boolean;
}) {
  const yieldDialogRef = useRef<HTMLDialogElement>(null);
  const yieldDialogCloseRef = useRef<HTMLButtonElement>(null);
  const yieldSummaryRef = useRef<HTMLElement>(null);
  const shouldRestoreYieldFocusRef = useRef(false);
  const [yieldDialogError, setYieldDialogError] = useState<string | null>(null);
  const yieldHash = "yield-stablecoins";

  function ensureYieldHashOpened(shouldOpen: boolean) {
    const baseHref = `${window.location.pathname}${window.location.search}`;
    if (shouldOpen) {
      if (!showModalDialog(yieldDialogRef.current)) {
        if (window.location.hash === `#${yieldHash}`) {
          replaceRecoveryUrl(baseHref, {});
        }
        return false;
      }
      yieldDialogCloseRef.current?.focus({ preventScroll: true });
      if (window.location.hash !== `#${yieldHash}`) {
        replaceRecoveryUrl(`${baseHref}#${yieldHash}`, {});
      }
      setYieldDialogError(null);
      return true;
    }
    if (window.location.hash === `#${yieldHash}`) {
      replaceRecoveryUrl(baseHref, {});
    }
    if (!closeModalDialog(yieldDialogRef.current)) {
      setYieldDialogError(
        "This browser could not close the explanation. Press Escape or reload the page.",
      );
      return false;
    }
    setYieldDialogError(null);
    return true;
  }

  function openYieldExplainer() {
    shouldRestoreYieldFocusRef.current = true;
    const opened = ensureYieldHashOpened(true);
    if (!opened) {
      shouldRestoreYieldFocusRef.current = false;
      setYieldDialogError(
        "This browser could not open the explanation. Update the browser and try again.",
      );
    }
    return opened;
  }

  function closeYieldExplainer() {
    ensureYieldHashOpened(false);
  }

  function handleYieldExplainerClosed() {
    ensureYieldHashOpened(false);
    if (!shouldRestoreYieldFocusRef.current) return;
    shouldRestoreYieldFocusRef.current = false;
    window.requestAnimationFrame(() => {
      yieldSummaryRef.current?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    const applyHashState = () => {
      const shouldOpen = window.location.hash === `#${yieldHash}`;
      if (!ensureYieldHashOpened(shouldOpen) && shouldOpen) {
        setYieldDialogError(
          "This browser could not open the explanation. Update the browser and try again.",
        );
      }
    };
    applyHashState();
    window.addEventListener("hashchange", applyHashState);
    return () => window.removeEventListener("hashchange", applyHashState);
  }, [yieldHash]);

  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="intro-copy">
        <p className="eyebrow">Open-source public-interest prototype</p>
        <h2 id="public-intro-title">A better way to handle rental deposits.</h2>
        <p className="intro-summary">
          A clear, documented process from agreement to refund, with fair dispute resolution and
          optional yield. Tracked, secured, and powered by Ethereum.
        </p>
        <div className="intro-actions">
          <button
            className={`btn btn-primary intro-demo-cta${showAboutDetails ? " about-demo-cta" : ""}`}
            onClick={onStart}
          >
            Try the testnet demo
          </button>
          <a
            className="btn btn-secondary intro-demo-cta"
            href="https://github.com/omslice/OpenEscrow"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </div>

      <section className="project-demo-video" aria-labelledby="project-demo-video-title">
        <header>
          <p className="eyebrow">One-minute overview</p>
          <h3 id="project-demo-video-title">Get to know OpenEscrow</h3>
          <p id="project-demo-video-description">
            A quick introduction to what OpenEscrow is, why it was created, and how it helps
            landlords and tenants manage rental security deposits more clearly.
          </p>
        </header>
        <video
          controls
          playsInline
          preload="none"
          poster="/og.png"
          aria-describedby="project-demo-video-description"
        >
          <source src="/openescrow-demo.mp4" type="video/mp4" />
          Your browser cannot play this video. You can{" "}
          <a href="/openescrow-demo.mp4">open the OpenEscrow overview directly</a>.
        </video>
        <a className="project-demo-page-link" href="/demo">
          Open the standalone demo
        </a>
      </section>

      <div className="how-it-works-block" id="how-it-works">
        <header className="how-it-works-title">
          <div>
            <h3>How it works</h3>
          </div>
          <p>Three clear steps, one shared record.</p>
        </header>
        <ol className="how-it-works">
          <li>
            <span className="step-number">01</span>
            <div className="how-it-works-heading">
              <strong>Agree &amp; fund</strong>
              <details className="yield-tooltip">
                <summary className="yield-option" ref={yieldSummaryRef}>
                  Earn yield?
                </summary>
                <div className="yield-tooltip-panel">
                  <strong>Optional, with everyone&apos;s approval</strong>
                  <p>
                    All parties can agree to hold the funds in a yield-bearing asset so
                    tenants earn yield on their security deposit.
                  </p>
                  <a
                    href={`#${yieldHash}`}
                    className="yield-tooltip-link"
                    onClick={(event) => {
                      event.preventDefault();
                      if (openYieldExplainer()) {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }
                    }}
                  >
                    Learn more
                  </a>
                </div>
              </details>
            </div>
            <p>All parties agree to the deposit terms, and the deposit is funded.</p>
          </li>
          <li>
            <span className="step-number">02</span>
            <strong>Claim &amp; review</strong>
            <p>
              At move-out, the landlord can submit deductions with supporting documents. The
              tenant is notified to approve or dispute them.
            </p>
          </li>
          <li>
            <span className="step-number">03</span>
            <strong>Release or resolve</strong>
            <p>
              Unclaimed funds are returned to the tenant. Disputes follow the applicable local
              resolution process.
            </p>
          </li>
        </ol>
        {yieldDialogError && (
          <p className="tx-error" role="alert" aria-live="assertive">
            {yieldDialogError}
          </p>
        )}
      </div>

      <dialog
        className="yield-dialog"
        ref={yieldDialogRef}
        aria-labelledby="yield-explainer-title"
        onClose={handleYieldExplainerClosed}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeYieldExplainer();
          }
        }}
      >
        <div className="yield-dialog-shell">
          <button
            className="yield-dialog-close"
            type="button"
            ref={yieldDialogCloseRef}
            aria-label="Close yield explanation"
            onClick={closeYieldExplainer}
          >
            {"\u00d7"}
          </button>
          <section className="yield-explainer" id="yield-stablecoins">
            <header className="yield-explainer-heading">
              <div>
                <span className="eyebrow">Stablecoins and optional yield</span>
                <h3 id="yield-explainer-title">How the deposit asset choices work</h3>
              </div>
            </header>

            <div className="yield-explainer-grid yield-asset-grid">
              <article className="yield-asset-card">
                <span className="yield-asset-badge no-yield">Standard · No yield</span>
                <h4>USDC</h4>
                <p>
                  Circle-issued USDC is designed to be redeemable 1:1 for U.S. dollars and backed
                  by highly liquid cash and cash-equivalent reserves. Holders do not receive the
                  earnings on those reserves. OpenEscrow uses USDC as the default principal and
                  settlement asset.
                </p>
              </article>
              <article className="yield-asset-card">
                <span className="yield-asset-badge variable-yield">Variable lending yield</span>
                <h4>USDC on Aave (aUSDC)</h4>
                <p>
                  USDC is supplied to an Aave lending pool and the position receives aUSDC. Its
                  balance grows from borrower-paid interest at a variable market rate. On release,
                  aUSDC is withdrawn back to USDC, subject to smart-contract and available-liquidity
                  risk. The demo&apos;s taUSDC only simulates this idea; it is not a live Aave
                  position.
                </p>
              </article>
              <article className="yield-asset-card">
                <span className="yield-asset-badge treasury-yield">
                  Treasury yield · Restricted
                </span>
                <h4>Ondo USDY</h4>
                <p>
                  USDY is an accumulating tokenized note backed by qualifying Treasury-related
                  assets and bank deposits. Its token count can stay fixed while its official
                  redemption price rises. It is not a standard $1 payment stablecoin, and U.S. and
                  Canadian persons are prohibited from acquiring or redeeming it, so it remains
                  unavailable for OpenEscrow&apos;s U.S. rental flow.
                </p>
              </article>
              <article className="yield-asset-card">
                <span className="yield-asset-badge no-yield">State-issued · No holder yield</span>
                <h4>Wyoming FRNT</h4>
                <p>
                  FRNT is Wyoming&apos;s state-issued, reserve-backed stable token. It is an
                  alternative principal asset—not a yield option. Under the program terms, reserve
                  earnings do not accrue to token holders. A future OpenEscrow route would also
                  need approved funding, liquidity, and settlement support.
                </p>
              </article>
            </div>

            <div className="yield-risk-note">
              <strong>OpenEscrow&apos;s rule</strong>
              <p>
                Non-yield USDC stays selected unless every party affirmatively approves an
                available yield option. Principal and earned yield remain separately documented,
                rates are never guaranteed, and the agreement still controls release, claims, and
                disputes. This demo uses worthless test tokens and does not place funds into any
                live yield product.
              </p>
            </div>

            <p className="yield-source-note">
              Plain-English summary based on official documentation from{" "}
              <a
                href="https://developers.circle.com/stablecoins/what-is-usdc"
                target="_blank"
                rel="noreferrer"
              >
                Circle
              </a>
              ,{" "}
              <a
                href="https://aave.com/help/supplying/supply-tokens"
                target="_blank"
                rel="noreferrer"
              >
                Aave
              </a>
              , the{" "}
              <a
                href="https://stabletoken.wyo.gov/pages/FRNT"
                target="_blank"
                rel="noreferrer"
              >
                Wyoming Stable Token Commission
              </a>
              , and{" "}
              <a
                href="https://docs.ondo.finance/general-access-products/usdy/basics"
                target="_blank"
                rel="noreferrer"
              >
                Ondo USDY
              </a>
              . Eligibility and product terms can change and must be checked again before any live
              integration.
            </p>
          </section>
        </div>
      </dialog>

      {showAboutDetails && (
        <section className="about-details" aria-labelledby="about-project-title">
          <article className="about-card about-project-card">
            <p className="eyebrow">About the project</p>
            <h3 id="about-project-title">Public-interest infrastructure for rental deposits</h3>
            <p>
              OpenEscrow is free, open-source software exploring a clearer shared process for
              landlords and tenants—from agreeing on terms and protecting funds through claims,
              refunds, and resolution. Ethereum supplies tamper-resistant receipts; private
              housing details stay in the participant-controlled record.
            </p>
            <p>
              The goal is practical trust and accountability. The current application is a Base
              Sepolia testnet prototype built for learning, testing, and responsible public
              collaboration.
            </p>
            <div className="about-links" aria-label="OpenEscrow project links">
              <a
                href="https://github.com/omslice/OpenEscrow"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/company/openescrow"
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn
              </a>
              <a
                href="https://farcaster.xyz/openescrow"
                target="_blank"
                rel="noreferrer"
              >
                Farcaster
              </a>
              <button
                className="about-download-coming-soon"
                type="button"
                disabled
                aria-label="Download self-hosted OpenEscrow (coming soon)"
              >
                <span>Download self-hosted app</span>
                <small>Coming soon</small>
              </button>
            </div>
          </article>

          <article className="about-card">
            <p className="eyebrow">About the builder</p>
            <h3>Built by Omri Gross</h3>
            <p>
              Omri works at the intersection of housing policy, public-interest technology, and
              blockchain. His work has included policy, guidance, workflows, tracking,
              contractor management, and implementation across multiple complex national program
              environments. OpenEscrow demonstrates how verifiable shared systems can
              reduce confusion and conflict around an everyday housing process.
            </p>
            <p>
              Omri&apos;s essay{" "}
              <a
                className="about-inline-link"
                href="https://medium.com/emerging-govtech/on-blockchains-importance-for-housing-4fd4e4c06530"
                target="_blank"
                rel="noreferrer"
              >
                <cite>On Blockchain&apos;s Importance for Housing</cite>
              </a>{" "}
              explains the broader
              case for applying smart contracts and decentralized records to housing with an
              emphasis on transparency, security, and responsible implementation.
            </p>
            <div className="about-links" aria-label="Omri Gross links">
              <a
                href="https://linktr.ee/omslice"
                target="_blank"
                rel="noreferrer"
              >
                Explore Omri&apos;s work &amp; connect
              </a>
            </div>
          </article>

        </section>
      )}

    </section>
  );
}
