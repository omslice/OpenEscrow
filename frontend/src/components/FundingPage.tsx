import { Layout } from "./Layout";
import {
  FUNDING_DISCLOSURE,
  hasConfirmedFundingDisclosure,
  publishedFundingEntries,
  summarizePublishedFunding,
} from "../lib/fundingTransparency";

const fundingPriorities = [
  {
    title: "Independent security review",
    description:
      "Exact-commit smart-contract and application review, remediation, and public non-confidential evidence.",
  },
  {
    title: "One-jurisdiction legal and privacy review",
    description:
      "Qualified analysis of rental-deposit, custody, evidence, notice, privacy, and pilot boundaries.",
  },
  {
    title: "Compensated community research",
    description:
      "Moderated usability and accessibility work with tenants, small housing providers, and neutral professionals.",
  },
  {
    title: "Supervised pilot preparation",
    description:
      "Partner-owned safeguards, support, training, stop conditions, and aggregate evaluation for one bounded pilot.",
  },
  {
    title: "Open-source stewardship",
    description:
      "Reproducible releases, self-hosting guidance, contributor pathways, maintenance, and public learning.",
  },
];

function formatCurrency(amount: number | undefined, currency: string | undefined) {
  if (amount === undefined || !currency) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(amount) + ` ${currency}`;
}

export function FundingPage() {
  const entries = publishedFundingEntries();
  const summary = summarizePublishedFunding();
  const confirmedDisclosure = hasConfirmedFundingDisclosure(FUNDING_DISCLOSURE)
    ? FUNDING_DISCLOSURE
    : null;

  return (
    <Layout
      showNotifications={false}
      accountEntry={
        <a className="btn btn-ghost" href="/">
          Back to OpenEscrow
        </a>
      }
    >
      <article className="funding-page" aria-labelledby="funding-page-title">
        <header className="funding-page-heading">
          <p className="eyebrow">Public-good accountability</p>
          <h2 id="funding-page-title">Project funding</h2>
          <p>
            OpenEscrow is free, MIT-licensed public infrastructure for a fairer, more transparent
            rental security-deposit process. Grants, donations, sponsorships, and aligned support
            can fund the external review and community work required before responsible real-world
            use.
          </p>
        </header>

        {!confirmedDisclosure ? (
          <aside className="funding-status funding-status-pending" role="status">
            <strong>Funding disclosures are being verified.</strong>
            <p>
              The opening funding balance, recipient structure, and reporting contact have not yet
              been confirmed for publication. This page therefore does not state a zero balance or
              treat applications, advertised credits, or requested grants as funding received.
            </p>
            <small>Disclosure framework last reviewed {FUNDING_DISCLOSURE.lastReviewed}.</small>
          </aside>
        ) : (
          <aside className="funding-status" role="status">
            <strong>Public ledger confirmed through {confirmedDisclosure.confirmedThrough}.</strong>
            <p>{confirmedDisclosure.recipientDescription}</p>
            <a href={`mailto:${confirmedDisclosure.fundingContact}`}>
              Funding and transparency questions
            </a>
          </aside>
        )}

        <section aria-labelledby="funding-unlocks-title">
          <div className="funding-section-heading">
            <p className="eyebrow">Responsible progress</p>
            <h3 id="funding-unlocks-title">What funding unlocks</h3>
          </div>
          <ol className="funding-priority-list">
            {fundingPriorities.map((priority, index) => (
              <li key={priority.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{priority.title}</strong>
                  <p>{priority.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="funding-boundary-note">
            Optional yield is not part of the default first-pilot budget. It remains a separate
            prototype path unless qualified review, providers, the supervising partner, and every
            participating party approve it for the precise use case.
          </p>
        </section>

        <section aria-labelledby="funding-ledger-title">
          <div className="funding-section-heading">
            <p className="eyebrow">Verified support only</p>
            <h3 id="funding-ledger-title">Public funding ledger</h3>
          </div>
          {!confirmedDisclosure ? (
            <p className="funding-empty-state">
              No total is published until the opening state and confirmation date are verified by
              the project owner. Applications and nominations are never ledger receipts.
            </p>
          ) : entries.length === 0 ? (
            <p className="funding-empty-state">
              No external funding was recorded as of {confirmedDisclosure.confirmedThrough}.
            </p>
          ) : (
            <>
              <dl className="funding-summary" aria-label="Published funding totals in U.S. dollars">
                <div>
                  <dt>Committed</dt>
                  <dd>${summary.committedUsd.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>${summary.receivedUsd.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Spent</dt>
                  <dd>${summary.spentUsd.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>In-kind used</dt>
                  <dd>${summary.inKindUsedUsd.toLocaleString("en-US")}</dd>
                </div>
              </dl>
              <div className="funding-table-scroll" tabIndex={0} aria-label="Scrollable public funding ledger">
                <table className="funding-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Source</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Committed</th>
                      <th scope="col">Received</th>
                      <th scope="col">Use</th>
                      <th scope="col">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.date}</td>
                        <td>{entry.source}</td>
                        <td>{entry.type.replaceAll("_", " ")}</td>
                        <td>{entry.status.replaceAll("_", " ")}</td>
                        <td>{formatCurrency(entry.amountCommitted, entry.currency)}</td>
                        <td>{formatCurrency(entry.amountReceived, entry.currency)}</td>
                        <td>{entry.purpose || entry.restriction || "—"}</td>
                        <td>
                          {entry.evidenceUrl ? (
                            <a href={entry.evidenceUrl} target="_blank" rel="noreferrer">
                              Public evidence
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="funding-principles" aria-labelledby="funding-principles-title">
          <div>
            <p className="eyebrow">Independence by design</p>
            <h3 id="funding-principles-title">What support does not buy</h3>
            <p>
              A contribution does not buy control over OpenEscrow&apos;s code, roadmap, security
              disclosure process, participant data, evidence, or the outcome of a landlord–tenant
              disagreement. Funders receive no privileged access to private records.
            </p>
          </div>
          <div>
            <p className="eyebrow">Open participation</p>
            <h3>Other ways to help</h3>
            <p>
              Review the source, report a reproducible issue, test the Base Sepolia prototype, or
              explore a carefully bounded research or pilot conversation.
            </p>
            <div className="funding-links">
              <a href="https://github.com/omslice/OpenEscrow" target="_blank" rel="noreferrer">
                Review the repository
              </a>
              <a href="/demo">Watch the overview</a>
              <a href="https://linktr.ee/omslice" target="_blank" rel="noreferrer">
                Discuss collaboration
              </a>
            </div>
          </div>
        </section>

        <section aria-labelledby="funding-reporting-title">
          <div className="funding-section-heading">
            <p className="eyebrow">Reporting promise</p>
            <h3 id="funding-reporting-title">Follow the money and the work</h3>
          </div>
          <p>
            Once an opening disclosure is confirmed, this page will be updated at least quarterly
            while OpenEscrow receives or spends external funding, and within 30 days of a material
            award, returned grant, security-review milestone, or restriction change. Cash,
            commitments, expenses, and in-kind support will remain separate.
          </p>
          <p className="funding-tax-note">
            Do not assume a contribution is charitable or tax deductible. Verify the recipient,
            network, address resolution, and transaction-specific terms before sending anything.
          </p>
        </section>
      </article>
    </Layout>
  );
}
