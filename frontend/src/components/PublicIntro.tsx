export function PublicIntro({ onStart }: { onStart: () => void }) {
  return (
    <section className="public-intro" aria-labelledby="public-intro-title">
      <div className="intro-copy">
        <p className="eyebrow">Open-source public-interest prototype</p>
        <h2 id="public-intro-title">Rental deposits, protected by default.</h2>
        <p className="intro-lede">
          OpenEscrow tests a tenant-first rule: the deposit stays protected unless a landlord
          submits a timely claim that the tenant accepts or a mutually chosen arbiter resolves.
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
          <strong>Agree</strong>
          <p>Landlord, tenant, and a neutral arbiter explicitly accept their roles.</p>
        </li>
        <li>
          <span>02</span>
          <strong>Protect</strong>
          <p>Test USDC remains in escrow while the agreement is active.</p>
        </li>
        <li>
          <span>03</span>
          <strong>Resolve</strong>
          <p>No claim means a refund. Disputed deductions require an arbiter ruling.</p>
        </li>
      </ol>

      <p className="intro-boundary">
        This is a Base Sepolia demonstration using worthless test tokens. It is not a bank,
        licensed escrow service, legal process, or production product.
      </p>
    </section>
  );
}
