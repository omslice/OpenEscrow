export function PublicIntro({ onStart }: { onStart: () => void }) {
  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="intro-copy">
        <p className="eyebrow">Open-source public-interest prototype</p>
        <h2 id="public-intro-title">A better way to handle rental deposits.</h2>
        <p className="intro-summary">
          A clear, documented process from agreement to refund, with fair dispute resolution and
          optional yield. Automated, tracked, and secured by Ethereum.
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
              <details className="yield-option">
                <summary>Earn yield?</summary>
                <span className="yield-option-copy" role="tooltip">
                  All parties can optionally agree to hold the deposit in a yield-bearing
                  stablecoin so tenants earn yield in proportion to their approved deposit
                  shares. This testnet demo uses a simulated token with no real value.
                </span>
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

      <p className="intro-boundary">
        This is a Base Sepolia demonstration using worthless test tokens. It is not a bank,
        licensed escrow service, legal process, or production product.
      </p>
    </section>
  );
}
