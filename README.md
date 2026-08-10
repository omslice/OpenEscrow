# OpenEscrow

**A better way to handle rental deposits.**

[X](https://x.com/0penEscrow) · [Farcaster](https://farcaster.xyz/openescrow) · [LinkedIn](https://www.linkedin.com/company/openescrow)

A clear, documented process from agreement to refund, with fair dispute resolution and optional
yield. Automated, tracked, and secured by Ethereum.

**Public testnet app:** [openescrow.io](https://openescrow.io)

**Product walkthrough:** [openescrow.io/demo](https://openescrow.io/demo)

The project is an open-source public-interest prototype. It is not a law firm, bank, licensed escrow provider, production custody service, or substitute for jurisdiction-specific legal advice.

## Current status

The Base Sepolia testnet MVP implements the complete technical lifecycle:

- A landlord proposes an agreement.
- Every tenant approves the same saved revision and owns an explicit deposit percentage; shares
  default evenly and any change resets the approval cycle.
- An arbiter may be nominated up front and must explicitly accept; or the parties can create the
  agreement without one and mutually appoint one later if a dispute occurs.
- Each tenant funds only their approved portion with allowlisted plain testUSDC or test-only
  taUSDC shares. The agreement activates only after the full deposit has been received.
- The landlord may submit one timely claim with evidence commitments.
- The tenant may accept all, accept part, or dispute the claim.
- Tenant silence becomes a dispute; it never pays the landlord automatically.
- Only the disputed amount remains locked.
- The current arbiter may award no more than the disputed amount.
- If the arbiter misses the deadline, the disputed balance defaults to the tenant.
- The tenant dashboard shows onchain custody, a deliberately accelerated 1%-per-hour demo value
  capped at 5%, deduction/dispute alerts, deadlines, and resolution status. The demo value is not
  real yield.
- Agreement parties can download a complete timestamped report, preserve an AES-256-GCM encrypted
  canonical record with a separate verification key, anchor its SHA-256 hash in the Base Sepolia
  activity registry, and verify the encrypted record locally against current agreement parties.
- Supporting PDFs and images can be encrypted in a party-authorized private vault or stored as
  encrypted IPFS ciphertext while a content hash supplies the integrity receipt.
- Opted-in accounts receive provider-neutral, idempotent action and deadline notices with
  one-click unsubscribe and a signed-in delivery self-test.
- Embedded-wallet tenants have a guarded Privy card/bank checkout path ready for sandbox
  configuration; the public Base Sepolia demo continues to use free test tokens.
- Tenant and landlord withdraw credited balances using pull payments.

The current source includes:

- [`contracts/OpenEscrow.sol`](contracts/OpenEscrow.sol) — shared escrow contract
- [`test/`](test/) — unit, authorization, boundary, fuzz, reentrancy, multi-agreement, and stateful invariant tests
- [`frontend/`](frontend/) — React testnet demonstration
- [`docs/mvp-spec.md`](docs/mvp-spec.md) — normative MVP behavior
- [`docs/open-questions.md`](docs/open-questions.md) — legal and product questions blocking real-money use
- [`docs/security-review.md`](docs/security-review.md) — internal review record and limitations
- [`docs/dependency-risk-register.md`](docs/dependency-risk-register.md) — fail-closed production dependency audit policy and time-bounded exceptions
- [`docs/privacy-threat-model.md`](docs/privacy-threat-model.md) — hosted data flows, authorization,
  evidence protection, recovery boundaries, and the privacy-deletion design gate
- [`docs/usability-test-plan.md`](docs/usability-test-plan.md) — moderated research script and success gate
- [`docs/pilot-readiness-brief.md`](docs/pilot-readiness-brief.md) — legal, partner, privacy, and audit handoff
- [`docs/pilot-services-setup.md`](docs/pilot-services-setup.md) — email, fiat sandbox, and encrypted evidence setup
- [`docs/owner-actions.md`](docs/owner-actions.md) — running list of owner-only credentials, signatures, decisions, and external reviews
- [`docs/mvp-roadmap.md`](docs/mvp-roadmap.md) — canonical high-level testnet MVP status, remaining work, and material unknowns
- [`docs/release-evidence-index.md`](docs/release-evidence-index.md) — claim-to-evidence map for reviewers, contributors, auditors, partners, and funders
- [`docs/reviewer-publication-runbook.md`](docs/reviewer-publication-runbook.md) — exact-source manifest and owner-gated publication procedure
- [`GOVERNANCE.md`](GOVERNANCE.md) — current decision process, roles, conflicts, funding independence, and succession direction
- [`MAINTAINERS.md`](MAINTAINERS.md) — current maintainers and the path to shared stewardship
- [`SECURITY.md`](SECURITY.md) — private vulnerability reporting and safe research boundaries
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — participation and enforcement expectations

### Verification snapshot

- 234 passing Foundry tests across 22 suites, plus one opt-in live Base Sepolia fork test skipped
  when no RPC URL is supplied
- 512 runs per fuzz test
- Nine stateful accounting properties exercised for 32,768 calls each
- Frontend lint, TypeScript compilation, and production build
- Full landlord → arbiter → tenant → dispute → ruling → withdrawal demonstration

These checks materially improve confidence, but OpenEscrow has not been independently audited and
they do not replace an independent professional smart-contract audit.

## MVP architecture

The testnet MVP deliberately excludes the earlier factory/module design.

| Concern | MVP decision |
|---|---|
| Deployment | One shared contract keyed by agreement ID |
| Asset | One immutable token address |
| Arbitration | One mutually accepted address per agreement |
| Claims | Optimistic only when the tenant explicitly accepts |
| Disputes | Disputed funds remain locked until ruling or timeout |
| Evidence | Public hash, opaque URI, type, timestamp, submitter |
| Administration | No owner, pause key, upgrade proxy, or privileged resolver |
| Yield | Funding-relative taUSDC demo accounting at 1%/hour, capped at 5%; no production strategy |
| Fees | No escrow fee; separate fixed 5 testUSDC pilot operations reserve split evenly among tenants |

See [`docs/technical-overview.md`](docs/technical-overview.md) and [`docs/protocol-flow.md`](docs/protocol-flow.md).

## Safety boundary

This repository is suitable for testnet demonstrations and technical evaluation only.

Before any real-money deployment, OpenEscrow still requires:

1. A jurisdiction-specific legal design.
2. A qualified custody/escrow analysis.
3. A clearly defined mediator or arbiter operating model.
4. Privacy-safe evidence storage and retention.
5. An independent professional smart-contract audit.
6. Operational procedures for compromised wallets, unavailable arbiters, and user support.

Never publish names, addresses, leases, invoices, photographs, or other personal information directly onchain or through an unencrypted public IPFS URI.

## Run the contract checks

Requirements: [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
forge fmt --check
forge build
forge test
```

For deeper local inspection:

```bash
forge test --gas-report
forge coverage
```

## Run the frontend

Requirements: Node.js 20+ and an injected wallet such as MetaMask.

```bash
cd frontend
npm ci
npm run dev
```

The app is configured for Base Sepolia. See [`frontend/README.md`](frontend/README.md) for current deployment information and the guided test flow.

## Project direction

The next milestone is not broader protocol functionality. It is a credible pilot:

1. Independently review and harden the testnet implementation.
2. Publish a stable demo and test it with people who did not build it.
3. Select one jurisdiction and obtain legal review.
4. Run a supervised pilot with a housing or mediation partner.
5. Revisit the production architecture only after those findings.

See [`ROADMAP.md`](ROADMAP.md) for release gates.

## Contributing

Issues and pull requests are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing changes.
Please report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md), not in a
public issue.

OpenEscrow is licensed under the [MIT License](LICENSE).
