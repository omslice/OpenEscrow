# OpenEscrow

**A tenant-default security-deposit escrow prototype.**

[X](https://x.com/0penEscrow) · [Gitcoin](https://explorer.gitcoin.co/#/projects/0x05a570572fd3b79ac1f9a9f214db9bfd174c42786e14c314152fb8300a7c37f1) · [LinkedIn](https://www.linkedin.com/company/openescrow)

OpenEscrow explores a simple product hypothesis: a rental security deposit should remain protected by default, while a landlord who seeks a deduction must submit a timely claim that the tenant can accept or dispute.

**Public testnet demo:** [openescrow-demo.omrigross.chatgpt.site](https://openescrow-demo.omrigross.chatgpt.site)

The project is an open-source public-interest prototype. It is not a law firm, bank, licensed escrow provider, production custody service, or substitute for jurisdiction-specific legal advice.

## Current status

The Base Sepolia testnet MVP implements the complete technical lifecycle:

- A landlord proposes an agreement.
- An arbiter may be nominated up front and must explicitly accept; or the parties can create the
  agreement without one and mutually appoint one later if a dispute occurs.
- The tenant accepts and funds with either allowlisted plain testUSDC or test-only ytUSDC shares.
- The landlord may submit one timely claim with evidence commitments.
- The tenant may accept all, accept part, or dispute the claim.
- Tenant silence becomes a dispute; it never pays the landlord automatically.
- Only the disputed amount remains locked.
- The current arbiter may award no more than the disputed amount.
- If the arbiter misses the deadline, the disputed balance defaults to the tenant.
- The tenant dashboard shows onchain custody, a deliberately accelerated 20%-per-day demo value,
  deduction/dispute alerts, deadlines, and resolution status. The demo value is not real yield.
- Agreement parties can anchor canonical record snapshots and privacy-safe activity hashes in the
  separate Base Sepolia activity registry, download private proofs, and verify them locally.
- Tenant and landlord withdraw credited balances using pull payments.

The current source includes:

- [`contracts/OpenEscrow.sol`](contracts/OpenEscrow.sol) — shared escrow contract
- [`test/`](test/) — unit, authorization, boundary, fuzz, reentrancy, multi-agreement, and stateful invariant tests
- [`frontend/`](frontend/) — React testnet demonstration
- [`docs/mvp-spec.md`](docs/mvp-spec.md) — normative MVP behavior
- [`docs/open-questions.md`](docs/open-questions.md) — legal and product questions blocking real-money use
- [`docs/security-review.md`](docs/security-review.md) — internal review record and limitations
- [`docs/usability-test-plan.md`](docs/usability-test-plan.md) — moderated research script and success gate
- [`docs/pilot-readiness-brief.md`](docs/pilot-readiness-brief.md) — legal, partner, privacy, and audit handoff

### Verification snapshot

- 151 Foundry tests
- 512 runs per fuzz test
- 256 stateful invariant runs at depth 128
- Frontend lint, TypeScript compilation, and production build
- Full landlord → arbiter → tenant → dispute → ruling → withdrawal demonstration

These checks materially improve confidence but do not replace an independent smart-contract audit.

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
| Yield | Test-only accelerated ytUSDC accounting; no production strategy |
| Fees | No escrow fee; separate fixed 5 testUSDC pilot operations reserve |

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

OpenEscrow is licensed under the [MIT License](LICENSE).
