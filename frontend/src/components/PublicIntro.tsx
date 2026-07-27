import { useEffect, useRef } from "react";

export function PublicIntro({ onStart }: { onStart: () => void }) {
  const yieldDialogRef = useRef<HTMLDialogElement>(null);
  const yieldHash = "yield-stablecoins";

  function ensureYieldHashOpened(shouldOpen: boolean) {
    const baseHref = `${window.location.pathname}${window.location.search}`;
    if (shouldOpen) {
      if (window.location.hash !== `#${yieldHash}`) {
        window.history.replaceState({}, "", `${baseHref}#${yieldHash}`);
      }
      if (!yieldDialogRef.current?.open) {
        yieldDialogRef.current?.showModal();
      }
      return;
    }
    if (window.location.hash === `#${yieldHash}`) {
      window.history.replaceState({}, "", baseHref);
    }
    if (yieldDialogRef.current?.open) {
      yieldDialogRef.current.close();
    }
  }

  function openYieldExplainer() {
    ensureYieldHashOpened(true);
  }

  function closeYieldExplainer() {
    ensureYieldHashOpened(false);
  }

  useEffect(() => {
    const applyHashState = () => {
      ensureYieldHashOpened(window.location.hash === `#${yieldHash}`);
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
          automated, tracked, and secured by Ethereum.
        </p>
        <div className="intro-actions">
          <button className="btn btn-primary" onClick={onStart}>
            Try the testnet demo
          </button>
        </div>
      </div>

      <div className="how-it-works-block" id="how-it-works">
        <header className="how-it-works-title">
          <div>
            <span className="eyebrow">From agreement to outcome</span>
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
                <summary className="yield-option">Earn yield?</summary>
                <div className="yield-tooltip-panel">
                  <strong>Optional, with everyone&apos;s approval</strong>
                  <p>
                    All parties can agree to hold the funds in a yield-bearing stablecoin so
                    tenants earn yield on their security deposit.
                  </p>
                  <a
                    href={`#${yieldHash}`}
                    className="yield-tooltip-link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      openYieldExplainer();
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
      </div>

      <dialog
        className="yield-dialog"
        ref={yieldDialogRef}
        aria-labelledby="yield-explainer-title"
        onClose={closeYieldExplainer}
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
              <span className="test-example-badge">Educational · testnet</span>
            </header>

            <div className="yield-concept-grid">
              <article className="yield-reference-example">
                <span className="eyebrow">Stablecoins, briefly</span>
                <h4>A digital token designed to track a reference currency</h4>
                <p>
                  A dollar stablecoin is intended to stay close to one U.S. dollar. With a
                  reserve-backed token, an issuer holds cash or other eligible reserve assets and
                  issues tokens that can move between blockchain wallets. “Stable” describes the
                  price goal—not a guarantee that the token, issuer, wallet, or network cannot fail.
                </p>
              </article>
              <article className="yield-reference-example">
                <span className="eyebrow">Treasury-backed yield, briefly</span>
                <h4>Reserve earnings are passed through to eligible holders</h4>
                <p>
                  Some products invest their backing in short-duration U.S. Treasury-related assets
                  and bank deposits. Net earnings may appear as more tokens or as a rising
                  per-token redemption price. The yield changes with underlying rates and costs,
                  and adds issuer, custody, liquidity, smart-contract, and eligibility risk.
                </p>
              </article>
            </div>

            <div className="yield-options-heading">
              <span className="eyebrow">Options discussed for OpenEscrow</span>
              <p>
                USDC remains the default. The other paths are comparisons or future integrations,
                not live investment choices in this testnet demo.
              </p>
            </div>

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
                  risk. The demo&apos;s ytUSDC only simulates this idea; it is not a live Aave
                  position.
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

      <p className="intro-boundary">
        This is a Base Sepolia demonstration using worthless test tokens. It is not a bank,
        licensed escrow service, legal process, or production product.
      </p>
    </section>
  );
}
