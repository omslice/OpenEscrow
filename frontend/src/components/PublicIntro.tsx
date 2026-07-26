export function PublicIntro({ onStart }: { onStart: () => void }) {
  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="intro-copy">
        <p className="eyebrow">Open-source public-interest prototype</p>
        <h2 id="public-intro-title">One clear process for rental security deposits.</h2>
        <div className="intro-actions">
          <button className="btn btn-primary" onClick={onStart}>
            Try the testnet demo
          </button>
          <a className="btn btn-ghost" href="#how-it-works">
            See how it works
          </a>
        </div>
      </div>

      <div className="how-it-works-block" id="how-it-works">
        <h3>How it works</h3>
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
