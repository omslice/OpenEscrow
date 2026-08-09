# OpenEscrow release and grant evidence index

Last reviewed: 2026-08-09.

This index helps reviewers, contributors, auditors, partners, and funders locate authoritative
evidence. It is not itself an audit, legal approval, deployment authorization, or claim that the
newest source is publicly deployed.

## Canonical public references

- Product: <https://openescrow.io>
- Walkthrough: <https://openescrow.io/demo>
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

- The complete credential-free pilot-candidate envelope last recorded in the repository passed on
  commit `3e42b37`.
- The New Hampshire monitor (`a07d953`), proposal/deposit UX (`d25b7a9`), account/settings UX
  (`6bcc101`), bounded test-token cohort (`84dcb31`), Base Sepolia signer correction (`460eaac`)
  and public contact update (`d97e09a`) are newer source milestones with narrower reported checks.
- The generated `frontend-site-dist.tar` must be intentionally reconciled and the complete release
  envelope rerun before a later commit is called a clean audit or deployment candidate.
- The public F18 escrow cohort and its activity registry predate parts of the newest source. Use the
  manifests below for exact addresses; never describe `main` as the deployed contract.

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
| Self-hosting | `self-host/cloudflare/`, release package scripts and SBOM checks | Reproducible Cloudflare-oriented packaging at the recorded baseline | Maintenance by a third party or production suitability |
| Governance and contribution | [Governance](../GOVERNANCE.md), [maintainers](../MAINTAINERS.md), [contributing](../CONTRIBUTING.md), [security policy](../SECURITY.md), [Code of Conduct](../CODE_OF_CONDUCT.md) | Current founder-maintained process, intake and safety rules | Outside maintainers, community governance or nonprofit status |
| Funding transparency | `frontend/src/components/FundingPage.tsx`, `frontend/src/lib/fundingTransparency.ts`, their tests and the rendered landing check | A local fail-closed public route that separates applications, commitments, receipts, spending and in-kind support and requires complete owner-confirmed opening facts | A live canonical route, a zero funding balance, a legal recipient, tax deductibility or permission to solicit or receive funds |
| Reviewer-safe publication | [Publication runbook](reviewer-publication-runbook.md), `frontend/scripts/create-reviewer-evidence-manifest.mjs` | Exact public-source file hashes, Git-state blockers and publication procedure | A clean public commit, independent review, deployment identity or owner approval |

## Verification snapshot

Repository release documentation records:

- 234 passing Foundry tests across 22 suites;
- one opt-in live Base Sepolia Aave fork test skipped without an RPC URL;
- nine stateful accounting properties exercised for 32,768 calls each; and
- a complete clean pilot-candidate envelope on `3e42b37`.

On 2026-08-09, the publication working tree based on `d97e09a` completed `npm run check`
successfully: 122
server tests and, after the local funding-transparency and reviewer-publication tranche, 313
client/script logic tests. The latest combined gate passed cleanly across the rendered
account/funding/evidence/accessibility/deposit/record/pilot checks, roadmap and community-health
checks, TypeScript/Vite production build, bundle budget, and provider-free landing check. An earlier
combined run had one private-record browser timeout waiting for an existing field; its immediate
isolated rerun passed. Foundry was not
available in that Windows funding workspace and was not rerun there.

Treat this as dated development evidence, not a clean tagged release. The exact candidate must rerun
the complete contract and application envelope from a clean tree.

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
