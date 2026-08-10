# OpenEscrow release and grant evidence index

Last reviewed: 2026-08-10.

This index helps reviewers, contributors, auditors, partners, and funders locate authoritative
evidence. It is not itself an audit, legal approval, deployment authorization, or claim that the
newest source is publicly deployed.

## Canonical public references

- Product: <https://openescrow.io>
- Walkthrough: <https://openescrow.io/demo>
- Reviewer guide: [grant-reviewer-guide.md](grant-reviewer-guide.md)
- Repository: <https://github.com/omslice/OpenEscrow>
- Network: Base Sepolia, chain ID 84532
- License: [MIT](../LICENSE)

Operational rollback origins are not public product links. The canonical-domain and retained-host
boundaries are documented in [the Cloudflare application plan](cloudflare-landing-and-mvp-plan.md).

## Evidence hierarchy

When records differ, use this order:

1. Exact source commit, build provenance, deployment transaction and immutable contract address.
2. Current deployment manifests and a readiness response that matches the exact approved commit.
3. Dated release artifacts, complete test output and security/rehearsal evidence bound to that commit.
4. Current source, specifications, threat models and tests.
5. Public website, demo, application copy and task handoffs.

A new source commit does not modify an older immutable contract. A passing narrow test does not
replace the complete release envelope. A public page does not prove that its hosted services,
contract cohort and repository HEAD all match.

## Current source and deployment boundary

- The complete credential-free pilot-candidate envelope first passed on exact source commit
  [`7cb1e20`](https://github.com/omslice/OpenEscrow/commit/7cb1e20588ebb9cdc2bffbf7ea6a914b94453634)
  and passed again after the signed-out layout correction on exact commit
  [`fca5f13`](https://github.com/omslice/OpenEscrow/commit/fca5f13cdba668f1dc2bcbd432a241f9384939d8).
  It covers the bounded testUSDC/taUSDC cohort, participant notification delivery, landlord and
  multi-tenant lifecycle checks, rendered accessibility/UX checks, deployment and incident
  rehearsals, and exact-source Cloudflare and Sites builds.
- The canonical hosted app and retained Sites mirror report clean release commit `4281a1f`. It
  preserves the fresh bounded
  test-token cohort compiled from exact contract source `200848d`: escrow `0x9F8C...4b10`, reserve
  `0xDB66...A626`, and activity registry `0x88b5...0f53`.
- The modified `frontend-site-dist.tar` is a separately owned obsolete generated archive and was
  excluded from both exact-source hosting builds and the candidate source envelope. It still needs
  an explicit owner decision before any future Sites packaging; it is not current release evidence.
- The F18 escrow cohort and its repaired activity registry are preserved as historical rollback
  state in `deployments/base-sepolia-rollback-f18.json`; their agreement state and balances were not
  migrated. Use the manifests below for exact addresses and never infer contract deployment from a
  moving repository HEAD.

Update this section whenever a clean, exact later candidate passes or a deployment is approved.

## Evidence map

| Claim area | Authoritative evidence | What it proves | What it does not prove |
|---|---|---|---|
| Contract behavior and limitations | [MVP specification](mvp-spec.md), [technical overview](technical-overview.md), [protocol flow](protocol-flow.md) | Intended current testnet behavior and architecture | Legal validity, production safety, or deployment identity |
| Contract verification | [Security review](security-review.md), [contract threat model](contract-threat-model.md), `frontend/scripts/check-contract-release.mjs`, `test/` | Dated internal review and automated properties for exact source | Independent audit or vulnerability-free code |
| Audit scope | [Independent audit handoff](independent-audit-handoff.md) | Components, assumptions, threat areas and reviewer questions | Vendor engagement, completed audit, or remediation acceptance |
| Base Sepolia deployments | `deployments/base-sepolia-latest.json`, [Base Sepolia deployment](base-sepolia-deployment.md), [activity-registry deployment](agreement-activity-registry-deployment.md) | Exact recorded addresses, transactions and binding evidence | That newer source is deployed or mainnet-ready |
| Hosted application | `frontend/package.json` checks, [MVP roadmap](mvp-roadmap.md), [deployment runbook](cloudflare-deployment-runbook.md) | Application gates, current source status and operating procedure | Current hosted readiness unless rerun against the live exact commit |
| Privacy and evidence | [Privacy threat model](privacy-threat-model.md), [hosted-data continuity](hosted-data-continuity.md), [incident runbook](testnet-incident-response-runbook.md) | Designed authorization, encryption, recovery and containment boundaries | Legal compliance, zero breach risk, or approved real-data use |
| Compliance engineering | [U.S. jurisdiction profiles](us-jurisdiction-profiles.md), source registry/tests, `.github/workflows/compliance-source-monitor.yml` | Versioned official-source research and fail-closed change handling | Legal advice, complete local law, or counsel approval |
| User and pilot readiness | [Consumer UX audit](consumer-ux-audit.md), [usability plan](usability-test-plan.md), [pilot runbook](testnet-pilot-runbook.md), [pilot brief](pilot-readiness-brief.md) | Automated UX coverage and planned supervised validation | Real beneficiary outcomes or completed partner pilot |
| Grant review path | [Grant reviewer guide](grant-reviewer-guide.md) | Concise one-minute, five-minute and separate-account test routes with safety boundaries | A completed external review, real-user pilot or production approval |
| Self-hosting | `self-host/cloudflare/`, release package scripts and SBOM checks | Reproducible Cloudflare-oriented packaging at the recorded baseline | Maintenance by a third party or production suitability |
| Governance and contribution | [Governance](../GOVERNANCE.md), [maintainers](../MAINTAINERS.md), [contributing](../CONTRIBUTING.md), [security policy](../SECURITY.md), [Code of Conduct](../CODE_OF_CONDUCT.md) | Current founder-maintained process, intake and safety rules | Outside maintainers, community governance or nonprofit status |
| Funding transparency | `frontend/src/components/FundingPage.tsx`, `frontend/src/lib/fundingTransparency.ts`, their tests and the rendered landing check | A live fail-closed public route that separates applications, commitments, receipts, spending and in-kind support and requires complete owner-confirmed opening facts | A zero funding balance, a legal recipient, tax deductibility or permission to solicit or receive funds |
| Reviewer-safe publication | [Publication runbook](reviewer-publication-runbook.md), `frontend/scripts/create-reviewer-evidence-manifest.mjs` | Exact public-source file hashes, Git-state blockers and publication procedure | A clean public commit, independent review, deployment identity or owner approval |

## Verification snapshot

Repository release documentation records:

- 238 passing Foundry tests across 23 suites;
- one opt-in live Base Sepolia Aave fork test skipped without an RPC URL;
- nine stateful accounting properties exercised for 32,768 calls each; and
- five ABI/runtime/storage-layout checks and two pinned dependency-tree checks; and
- complete credential-free pilot-candidate envelopes on `7cb1e20` and `fca5f13`.

On 2026-08-09, exact candidate `7cb1e20` completed all seven credential-free candidate stages:
the repository release envelope, deployment rehearsal, pilot rehearsal, incident rehearsal,
Cloudflare build/configuration validation, and Sites build. The envelope included 122 server tests,
320 client/script logic tests, the Foundry snapshot above, rendered account/funding/evidence/
accessibility/deposit/record/multi-party checks, TypeScript/Vite production builds, bundle budgets,
and provider-free landing checks. The resulting candidate JSON reports `ok: true` and binds every
stage to the full 40-character commit.

Treat these as exact development and release-candidate evidence, not as proof of an independent
audit, production readiness, legal approval, or approval for real funds.

On 2026-08-09, the unified cohort broadcast produced six successful Base Sepolia transactions.
Two public RPC providers independently returned the same receipts, exact deployed runtime bytes,
and reciprocal bindings for the five new contracts. Canonical app release `b941a67` activated that
cohort. On 2026-08-10, clean release `4281a1f` was then deployed to both public hosts and passed
HTTP, clean-provenance, canonical redirect, registry-binding, receipt-verification, email,
scheduler, and private-R2 keyring checks without replacing hosted storage or secrets. The separate
strict pilot gate still reports three compliance-source alerts and no independent security audit
has been completed.

## Community-health evidence

`npm run check:community` verifies that:

- the canonical public app and walkthrough use `openescrow.io`;
- the public test-count snapshot matches the latest security-review snapshot;
- governance, maintainership, security, conduct and contribution policies exist and are linked;
- required issue and pull-request intake files exist; and
- local policy-document links resolve.

This check prevents documentation drift. It does not prove that outside contributors, maintainers,
users or a governance body exist.

## Refresh commands

From the repository root:

```bash
forge fmt --check
forge build
forge test
cd frontend
npm ci
npm run check:community
npm run check:reviewer-evidence
npm run release:check
```

The full pilot-candidate and deployment commands have additional credential, clean-source,
provenance and owner gates. Follow the runbooks; do not infer deployment authorization from this
index.

## Public-claim rules

- Say “public on Base Sepolia” or “testnet prototype,” not “production” or “mainnet.”
- Pair every test count with the dated source/release evidence and mention the skipped live fork.
- Say “internal review” until an independent reviewer actually completes and publishes the agreed
  deliverable.
- Say “official-source-based compliance engineering,” not “legally compliant” or “legal advice.”
- Say “founder-maintained” until outside maintainers and a real governance process exist.
- Say “preparing a supervised pilot” until a named partner approves a written scope and the pilot
  occurs.
- Do not call funding, donations, a fiscal sponsor, an entity, beneficiaries, or partnerships
  verified until authoritative evidence exists and publication is approved.

## Owner-controlled evidence

The following may be necessary for diligence but must not enter the public repository: identity,
tax and bank records; private keys or recovery material; service credentials; unredacted contracts;
private participant or partner information; vulnerability details under embargo; and legal advice.
Share them only through an approved, least-privileged diligence channel at the time required.
