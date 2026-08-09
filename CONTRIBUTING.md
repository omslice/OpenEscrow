# Contributing to OpenEscrow

OpenEscrow welcomes careful contributions from developers, security researchers, housing-domain
reviewers, testers, writers, designers, and accessibility specialists. The project handles a
high-stakes housing workflow, so clarity and safety matter more than feature volume.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Governance and
maintainer responsibilities are described in [GOVERNANCE.md](GOVERNANCE.md) and
[MAINTAINERS.md](MAINTAINERS.md).

## Before opening an issue

- Search existing issues and the [roadmap](ROADMAP.md).
- Never put a suspected vulnerability in a public issue. Follow [SECURITY.md](SECURITY.md).
- Never include private keys, recovery phrases, invitation or access tokens, real leases,
  addresses, evidence, identity documents, contact information, or other personal data.
- For a material contract, compliance, privacy, custody, yield, fee, or workflow change, open a
  design issue before writing code. Explain the user problem, safety boundary, alternatives, and
  required review.
- Small documentation, test, accessibility, and clearly isolated bug fixes may go directly to a
  pull request.

## Development setup

Contract requirements: Foundry with the repository's configured Solidity toolchain.

```bash
git submodule update --init --recursive
forge fmt --check
forge build
forge test
```

Frontend requirements: Node.js 22 and npm.

```bash
cd frontend
npm ci
npm run check
```

The commands are the same on macOS and Linux. On Windows PowerShell, use `npm.cmd` instead of
`npm` when the local execution policy blocks `npm.ps1`; for example, `npm.cmd run check`.

The public application uses Base Sepolia and worthless test assets. Do not point development code
at mainnet or use real rental deposits, real participant data, or production yield routes.

## Make the change reviewable

1. Fork the repository and create a focused branch.
2. Keep commits small and descriptive.
3. Add or update the narrowest tests that prove the intended behavior and the relevant failure
   boundaries.
4. Update specifications, threat models, runbooks, architecture decisions, or user documentation
   when behavior or risk changes.
5. Run the applicable checks and record their exact results in the pull request.
6. Open a pull request using the repository template and respond to review without force-pushing
   away relevant discussion.

AI-assisted contributions are welcome only when the contributor has reviewed, understood, tested,
and accepts responsibility for every submitted change. State material AI assistance in the pull
request; never send private project or participant data to an AI service.

## Required verification

| Change | Minimum local verification |
|---|---|
| Solidity, deployment, registry, reserve, adapter, or contract configuration | `forge fmt --check`, `forge build`, and the complete `forge test` suite |
| Frontend or shared application logic | `npm run check` from `frontend/` plus any focused rendered/recovery check for the surface changed |
| Release, dependency, deployment, self-hosting, or Cloudflare configuration | Relevant focused checker plus `npm run release:check`; never deploy as part of a contribution |
| Documentation or community-health policy | `npm run check:community` from `frontend/` |
| Legal/compliance profile research | Source-specific checks, official-source citations, version/date updates, and human review; code is not legal approval |

The complete pilot/release envelope is intentionally more demanding than ordinary contribution
checks. A maintainer decides when a change is eligible for that candidate process.

## Project invariants

Contributions must preserve these boundaries unless a public design decision explicitly changes
them:

- no owner, pause key, upgrade proxy, or privileged resolver in the shared escrow core;
- no unilateral change to accepted terms or finalized records;
- no public plaintext evidence or personal data onchain or on public IPFS;
- no optimistic success before a required transaction or durable record is verified;
- no production custody, fiat, yield, provider, mainnet, or real-data claim without the documented
  external review and owner gates;
- no paywall around a participant's essential record, sale of participant data, undisclosed
  financial steering, or funder control over dispute outcomes; and
- no claim that tests, source monitoring, automation, a roadmap checkbox, or AI review constitutes
  an audit or legal approval.

## Pull-request expectations

A pull request should explain:

- the user problem and why the change belongs in OpenEscrow;
- what changed and what deliberately did not change;
- security, privacy, accessibility, legal/compliance, migration, and rollback effects;
- exact checks run and any skipped or unavailable check;
- screenshots or short recordings for visible changes, using synthetic data only; and
- follow-up work, known limitations, and conflicts of interest.

Maintainers may ask for an architecture decision record, threat-model update, independent review,
or a smaller change before merge. Passing tests is necessary but not sufficient for a high-risk
change.

## Licensing

By submitting a contribution, you agree that it may be distributed under the repository's
[MIT License](LICENSE). Do not contribute material you do not have the right to license.
