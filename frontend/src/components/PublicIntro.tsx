export function PublicIntro({ onStart }: { onStart: () => void }) {
  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="intro-copy">
        <p className="eyebrow">Open-source public-interest prototype</p>
        <h2 id="public-intro-title">Rental deposits, protected by default.</h2>
        <p className="intro-lede">
          Financial inclusion is optional: tenants can use email-based onboarding and choose a
          yield-bearing deposit option, while anyone can still connect their own wallet.
        </p>
        <div className="intro-actions">
          <button className="btn btn-primary" onClick={onStart}>
            Try the testnet demo
          </button>
          <a className="btn btn-ghost" href="#how-it-works">
            See how it works
          </a>
        </div>
      </div>

      <div className="principle-card">
        <span className="eyebrow">The default</span>
        <strong>The tenant keeps the deposit.</strong>
        <p>A landlord receives only the amount the tenant accepts or the arbiter awards.</p>
      </div>

      <ol className="how-it-works" id="how-it-works">
        <li>
          <span>01</span>
          <strong>Agree &amp; fund</strong>
          <p>Both parties agree to the deposit terms, and the deposit is funded.</p>
        </li>
        <li>
          <span>02</span>
          <strong>Claim &amp; review</strong>
          <p>
            At move-out, the landlord can submit deductions with supporting documents. The
            tenant is notified to approve or dispute them.
          </p>
        </li>
        <li>
          <span>03</span>
          <strong>Release or resolve</strong>
          <p>
            Unclaimed funds are returned to the tenant. Disputes follow the applicable local
            resolution process.
          </p>
        </li>
      </ol>

      <p className="intro-boundary">
        This is a Base Sepolia demonstration using worthless test tokens. It is not a bank,
        licensed escrow service, legal process, or production product.
      </p>
    </section>
  );
}
