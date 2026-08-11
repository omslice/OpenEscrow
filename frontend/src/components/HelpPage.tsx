import { Layout } from "./Layout";

const OPEN_ESCROW_ADDRESS = "0x9f8c9555f28c10347c58fc71f430f4cbc3724b10";
const ACTIVITY_REGISTRY_ADDRESS = "0x88b53d6c35020e82b97462e8a1cbcdc8d6d50f53";
const SELF_HOST_RELEASE =
  "https://github.com/omslice/OpenEscrow/releases/tag/selfhost-v0.1.0-testnet";

const roleGuides = [
  {
    id: "landlord-guide",
    label: "Landlord",
    steps: [
      "Use invented test information. Create a proposal with the deposit amount, tenant shares, and deadlines.",
      "Wait for every tenant to accept the final terms before asking them to fund.",
      "After the lease term expires, either release the deposit or submit a documented deduction claim.",
      "If a tenant disputes a deduction, work with the tenant to resolve it if possible. OpenEscrow preserves the shared record of the claim and response.",
    ],
  },
  {
    id: "tenant-guide",
    label: "Tenant",
    steps: [
      "Open your role-specific invitation and verify the property, deposit amount, your share, deadlines, and selected test token.",
      "Accept the terms.",
      "Fund your portion of the deposit with valueless Base Sepolia test tokens.",
      "After the lease period expires, review any deduction claims your landlord submits and indicate whether you approve or dispute them.",
      "After the claim period expires, receive your refund.",
    ],
  },
];

export function HelpPage() {
  return (
    <Layout
      showNotifications={false}
      accountEntry={
        <a className="btn btn-ghost" href="/">
          Back to OpenEscrow
        </a>
      }
    >
      <article className="help-page" aria-labelledby="help-page-title">
        <header className="help-page-heading">
          <p className="eyebrow">Public testnet documentation</p>
          <h2 id="help-page-title">OpenEscrow help and quick-start guides</h2>
          <p>
            This text guide accompanies the <a href="/demo">one-minute overview</a>. It explains
            what the public prototype does, how each role participates, and which limitations to
            understand before trying it.
          </p>
          <nav className="help-section-nav" aria-label="Help page sections">
            <a href="#quick-start">Role guides</a>
            <a href="#lifecycles">Lifecycle tables</a>
            <a href="#deployment">Testnet deployment</a>
            <a href="#self-host">Self-host</a>
            <a href="#faq">FAQ</a>
          </nav>
        </header>

        <aside className="testnet-deployment-card" id="deployment" aria-labelledby="deployment-title">
          <div>
            <span className="network-badge">Base Sepolia · chain 84532</span>
            <h3 id="deployment-title">Active public testnet deployment</h3>
            <p>
              These are two different deployed contracts. The activity registry records selected
              public activity proofs and is not the escrow contract.
            </p>
          </div>
          <dl className="deployment-links">
            <div>
              <dt>OpenEscrow escrow contract</dt>
              <dd>
                <a
                  href={`https://sepolia.basescan.org/address/${OPEN_ESCROW_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {OPEN_ESCROW_ADDRESS}
                </a>
              </dd>
            </div>
            <div>
              <dt>Agreement activity registry</dt>
              <dd>
                <a
                  href={`https://sepolia.basescan.org/address/${ACTIVITY_REGISTRY_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {ACTIVITY_REGISTRY_ADDRESS}
                </a>
              </dd>
            </div>
            <div>
              <dt>Verified deployment manifest</dt>
              <dd>
                <a
                  href="https://github.com/omslice/OpenEscrow/blob/main/deployments/base-sepolia-latest.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  View addresses, transactions, blocks, source commit, and verification results
                </a>
              </dd>
            </div>
          </dl>
        </aside>

        <section id="quick-start" aria-labelledby="quick-start-title">
          <div className="help-section-heading">
            <p className="eyebrow">Choose your role</p>
            <h3 id="quick-start-title">Quick-start guides</h3>
          </div>
          <div className="role-guide-grid">
            {roleGuides.map((guide) => (
              <article key={guide.id} aria-labelledby={guide.id}>
                <h4 id={guide.id}>{guide.label}</h4>
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
          <p className="field-help">
            In-app arbitration is planned for a future release. The current reviewer flow focuses
            on a shared, timestamped record for landlords and tenants.
          </p>
        </section>

        <section id="lifecycles" aria-labelledby="lifecycles-title">
          <div className="help-section-heading">
            <p className="eyebrow">Shared state, explicit actions</p>
            <h3 id="lifecycles-title">Agreement, claim, and dispute lifecycles</h3>
          </div>
          <p>
            All time windows are half-open: an action is timely before its displayed deadline and
            expired at the exact deadline. Nothing runs automatically; an eligible person must
            submit the next transaction.
          </p>

          <h4>Agreement lifecycle</h4>
          <div className="help-table-scroll" tabIndex={0} aria-label="Scrollable agreement lifecycle">
            <table className="help-table">
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">What it means</th>
                  <th scope="col">Typical next action</th>
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Proposed</th><td>Private terms are being reviewed and accepted.</td><td>Accept, revise, or cancel before funding.</td></tr>
                <tr><th scope="row">Ready to fund</th><td>Required acceptances are complete; tenants have not all funded.</td><td>Each tenant funds their assigned share with test tokens.</td></tr>
                <tr><th scope="row">Active</th><td>The agreed deposit is funded in the escrow contract.</td><td>Release it or submit a timely deduction claim.</td></tr>
                <tr><th scope="row">Claim open</th><td>A landlord deduction claim awaits the tenant response.</td><td>Tenant accepts, counters, rejects, or the response deadline passes.</td></tr>
                <tr><th scope="row">Disputed</th><td>The undisputed amount is allocated; only the disputed amount remains locked.</td><td>Accepted arbiter rules, or someone invokes the timeout after its deadline.</td></tr>
                <tr><th scope="row">Closed / cancelled</th><td>Allocations are final for this agreement.</td><td>Each party withdraws its credited amount.</td></tr>
              </tbody>
            </table>
          </div>

          <h4>Claim outcomes</h4>
          <div className="help-table-scroll" tabIndex={0} aria-label="Scrollable claim lifecycle">
            <table className="help-table">
              <thead><tr><th scope="col">Event</th><th scope="col">Contract outcome</th></tr></thead>
              <tbody>
                <tr><th scope="row">No claim before the claim deadline</th><td>The full deposit is allocated to the tenant side after someone triggers the no-claim transition.</td></tr>
                <tr><th scope="row">Tenant accepts the claim</th><td>The accepted deduction goes to the landlord and the remainder to the tenant side.</td></tr>
                <tr><th scope="row">Tenant counters or rejects</th><td>The agreed portion, if any, is allocated; the remainder becomes disputed.</td></tr>
                <tr><th scope="row">Tenant does not respond</th><td>The claim is not automatically awarded to the landlord. The claimed amount becomes disputed.</td></tr>
                <tr><th scope="row">Landlord amends a claim</th><td>One amendment may keep or reduce the claim. The original response deadline does not move.</td></tr>
              </tbody>
            </table>
          </div>

          <h4>Dispute outcomes</h4>
          <div className="help-table-scroll" tabIndex={0} aria-label="Scrollable dispute lifecycle">
            <table className="help-table">
              <thead><tr><th scope="col">Event</th><th scope="col">Contract outcome</th></tr></thead>
              <tbody>
                <tr><th scope="row">Arbiter rules in time</th><td>The disputed test tokens are allocated according to that decision. The prototype has no appeal.</td></tr>
                <tr><th scope="row">Arbiter is replaced</th><td>Both parties must consent and the replacement must accept. The existing ruling deadline remains fixed.</td></tr>
                <tr><th scope="row">Arbiter deadline passes</th><td>Anyone may invoke the timeout, which allocates the entire disputed amount to the tenant side.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="self-host" aria-labelledby="self-host-title">
          <div className="help-section-heading">
            <p className="eyebrow">Free and open source</p>
            <h3 id="self-host-title">Run the testnet application on your own Cloudflare account</h3>
          </div>
          <p>
            The supported first distribution packages the complete Base Sepolia application for
            operators who can manage Cloudflare Workers, D1, private R2, Privy, DNS, secrets,
            backups, legal notices, and test users. It includes checksums, an SBOM, a release
            manifest, and GitHub provenance. It does not make a deployment production-ready.
          </p>
          <div className="help-actions">
            <a className="btn btn-primary" href={SELF_HOST_RELEASE} target="_blank" rel="noreferrer">
              Download the self-hosted testnet release
            </a>
            <a
              href="https://github.com/omslice/OpenEscrow/blob/main/self-host/cloudflare/README.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the operator guide
            </a>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title">
          <div className="help-section-heading">
            <p className="eyebrow">Important boundaries</p>
            <h3 id="faq-title">Frequently asked questions</h3>
          </div>
          <div className="faq-list">
            <details>
              <summary>Is OpenEscrow private?</summary>
              <p>
                Not completely. Wallet addresses, test-token amounts, deadlines, state changes,
                hashes, and opaque references can be public on Base Sepolia. The hosted service
                stores proposals, account associations, notification settings, record data, and
                encrypted evidence offchain. Use invented information and test files only.
              </p>
            </details>
            <details>
              <summary>Who has custody of the deposit?</summary>
              <p>
                In this prototype, the OpenEscrow smart contract holds only valueless Base Sepolia
                test tokens. OpenEscrow is not a licensed escrow provider, bank, custodian, or
                money transmitter, and the application is not approved for real deposits.
              </p>
            </details>
            <details>
              <summary>Does OpenEscrow provide arbitration?</summary>
              <p>
                No. Parties may name and mutually accept an arbiter, but OpenEscrow does not select,
                verify, train, supervise, or guarantee that person. There is no appeal or
                decentralized arbitration layer. Local law and a separate agreement may impose
                rights or requirements the prototype does not determine.
              </p>
            </details>
            <details>
              <summary>What does it cost?</summary>
              <p>
                The software is MIT-licensed and the public prototype charges no real-money escrow
                fee. Its current hosted pilot flow separately discloses a fixed five-testUSDC
                network-and-storage reserve divided among tenants. Test ETH and testUSDC have no
                monetary value. A self-hosted operator bears its own infrastructure, email, legal,
                support, and transaction costs.
              </p>
            </details>
            <details>
              <summary>Are test tokens money?</summary>
              <p>
                No. Base Sepolia assets used here are demonstration tokens with no promised value,
                redemption right, or relationship to real USDC. Never buy them or send real assets
                to a testnet address.
              </p>
            </details>
            <details>
              <summary>What happens at a deadline?</summary>
              <p>
                The contract does not wake up or move funds by itself. At the exact deadline the
                prior window is closed, and someone must submit the applicable transition. A missed
                landlord claim deadline enables a full tenant-side allocation; tenant silence on a
                claim creates a dispute; an arbiter timeout sends the disputed amount to the tenant
                side.
              </p>
            </details>
            <details>
              <summary>Is OpenEscrow ready for production or a real rental deposit?</summary>
              <p>
                No. It is a public Base Sepolia research and testing prototype. It has not had an
                independent smart-contract audit or jurisdiction-specific legal approval, does not
                perform KYC, and does not establish that a workflow satisfies rental-deposit,
                custody, privacy, notice, evidence, tax, or arbitration law. Do not use it with real
                funds or real tenancy data.
              </p>
            </details>
          </div>
        </section>
      </article>
    </Layout>
  );
}
