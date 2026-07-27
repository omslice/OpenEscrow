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
              <details className="yield-tooltip">
                <summary className="yield-option">Earn yield?</summary>
                <div className="yield-tooltip-panel">
                  <strong>Optional, with everyone&apos;s approval</strong>
                  <p>
                    All parties can agree to hold the funds in a yield-bearing stablecoin so
                    tenants earn yield on their security deposit.
                  </p>
                  <a className="yield-tooltip-link" href="#yield-stablecoins">
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

      <section className="yield-explainer" id="yield-stablecoins" aria-labelledby="yield-explainer-title">
        <header className="yield-explainer-heading">
          <div>
            <span className="eyebrow">Optional yield, in plain English</span>
            <h3 id="yield-explainer-title">How a yield-bearing stablecoin can work</h3>
          </div>
          <span className="test-example-badge">ytUSDC · test example</span>
        </header>

        <p className="yield-explainer-intro">
          A stablecoin such as USDC is designed to track the U.S. dollar. A yield-bearing version
          represents stablecoins supplied to an onchain lending market, where borrowers pay
          interest and part of that interest goes to suppliers. OpenEscrow&apos;s ytUSDC is only a
          testnet illustration; it has no real value and is not currently an Aave integration.
        </p>

        <div className="yield-reference-example">
          <span className="eyebrow">Established reference model</span>
          <h4>Aave&apos;s aUSDC</h4>
          <p>
            When USDC is supplied to an Aave liquidity pool, the supplier&apos;s position accrues
            interest at the current market supply rate. That rate changes as borrowing demand and
            available liquidity change. ytUSDC borrows this receipt-token idea for the demo, but it
            does not use Aave or promise a particular return.
          </p>
        </div>

        <div className="yield-explainer-grid">
          <article>
            <span>1</span>
            <h4>Everyone opts in</h4>
            <p>
              The landlord and every tenant must approve the yield option in the agreement. It is
              never selected for one party by another.
            </p>
          </article>
          <article>
            <span>2</span>
            <h4>The deposit earns</h4>
            <p>
              In a production model, the USDC would be supplied to a vetted lending market. The
              mock ytUSDC balance represents each tenant&apos;s deposit share plus accrued yield.
            </p>
          </article>
          <article>
            <span>3</span>
            <h4>The rate can change</h4>
            <p>
              Lending-market rates move with borrowing demand and available liquidity. A displayed
              annual rate is an estimate, not a promise.
            </p>
          </article>
          <article>
            <span>4</span>
            <h4>Rules still control release</h4>
            <p>
              The agreement determines when principal and earned yield can be released, including
              what happens if there is a documented claim or dispute.
            </p>
          </article>
        </div>

        <div className="yield-risk-note">
          <strong>What can go wrong?</strong>
          <p>
            Yield does not make a deposit risk-free. A production version would need clear
            disclosures and safeguards for smart-contract failures, changing rates, stablecoin
            price or redemption risk, withdrawal liquidity, fees, and applicable law. Returns are
            not guaranteed, and this is not a bank account or investment offer.
          </p>
        </div>

        <p className="yield-source-note">
          Educational model based on{" "}
          <a href="https://aave.com/help/supplying/supply-tokens" target="_blank" rel="noreferrer">
            Aave&apos;s supply-token explanation
          </a>{" "}
          and{" "}
          <a href="https://developers.circle.com/stablecoins/what-is-usdc" target="_blank" rel="noreferrer">
            Circle&apos;s USDC documentation
          </a>
          .
        </p>
      </section>

      <p className="intro-boundary">
        This is a Base Sepolia demonstration using worthless test tokens. It is not a bank,
        licensed escrow service, legal process, or production product.
      </p>
    </section>
  );
}
