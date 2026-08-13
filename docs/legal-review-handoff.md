# OpenEscrow legal-review handoff

This document identifies the exact product behavior that should be reviewed by qualified counsel
before any real-money, production, or public pilot use. It is not legal advice and does not authorize
OpenEscrow to hold real deposits.

## Review boundary

Review the release candidate and its deployed configuration together. The public application remains
a Base Sepolia demonstration using valueless `testUSDC` and `taUSDC`; invented information and test
files are required. The software is not a bank, licensed escrow provider, custodian, money
transmitter, law firm, or substitute for a jurisdiction-specific process.

The candidate behavior requiring an opinion is:

1. A landlord and one or more tenants approve one private proposal revision.
2. Each tenant funds only their disclosed percentage of the test deposit and separate refundable
   operations reserve.
3. After the agreed claim-window start, the landlord may submit one documented deduction claim and
   amend it downward once.
4. Each tenant may record approval, partial approval, or dispute. A missed deadline is recorded as
   **No response**, not as consent and not as a dispute.
5. In the default no-arbiter mode, tenant responses are evidentiary only: after every response or the
   response deadline, the contract allocates the documented claim to the landlord and the remainder
   to tenants. The application does not determine whether the deduction is legally valid and does
   not eliminate external remedies.
6. An optional arbiter-backed contract path remains available for later evaluation but is not the
   default public pilot workflow.
7. For the bounded taUSDC test harness, terminal settlement converts fixed test shares to
   deterministic testUSDC value. A landlord receives no more than the principal-equivalent
   documented claim; tenants receive the remaining principal and all positive demo yield.
8. A tenant's unspent operations reserve is returned in its original test token at terminal
   withdrawal.
9. Public-chain data can include wallet addresses, test-token amounts, deadlines, state changes,
   hashes, and opaque references. Private proposal, identity, notification, and evidence data are
   hosted offchain; evidence is encrypted at rest, but blockchain metadata cannot be made private.

## Questions counsel must answer

For each selected pilot jurisdiction and tenancy segment, provide a written answer with primary
authority, effective date, and any unresolved interpretation:

1. Who may receive or control a rental security deposit, and what licensing, trust-account,
   segregation, bonding, disclosure, or interest requirements apply?
2. What event starts the claim, itemization, response, refund, and payment deadlines? How should
   weekends, holidays, time zones, early termination, abandonment, and statutory extensions work?
3. Which deductions are permitted, and what notices, receipts, estimates, photographs, inspections,
   signatures, and delivery methods are required?
4. May software release a documented landlord deduction after a tenant disputes or does not respond?
   What court, agency, escrow, mediation, or appeal process must remain available, and what product
   language avoids misrepresenting legal entitlement?
5. Is the optional arbiter path enforceable, what consent and neutrality requirements apply, and
   what outcome is permitted when the arbiter resigns or misses a deadline?
6. Can any yield accrue on a deposit; who legally owns it; how must it be disclosed, accounted for,
   taxed, and returned; and may parties waive or change the statutory rule?
7. Does the separate refundable operations reserve create a fee, prepaid-services, custody,
   consumer-finance, abandoned-property, or disclosure obligation?
8. Which money-transmission, escrow, custody, sanctions, KYC/AML, consumer-finance, and payments laws
   apply to the intended provider and funds flow?
9. What privacy notice, consent, retention, deletion, legal-hold, access, breach-notification,
   accessibility, language, and minors' requirements apply to each data category?
10. What Terms and Privacy Policy changes are required, and which statements must appear at proposal,
    funding, claim, evidence, settlement, withdrawal, and optional-yield decision points?

## Materials for the reviewer

- [`mvp-spec.md`](./mvp-spec.md) — normative state machine and accounting rules.
- [`protocol-flow.md`](./protocol-flow.md) — participant flow and outcome timing.
- [`privacy-threat-model.md`](./privacy-threat-model.md) — data, access, and recovery boundaries.
- [`contract-threat-model.md`](./contract-threat-model.md) — value and authorization threats.
- [`jurisdiction-research-methodology.md`](./jurisdiction-research-methodology.md) — source and
  review method for compliance profiles.
- [`../frontend/src/components/LegalPage.tsx`](../frontend/src/components/LegalPage.tsx) — published
  Terms and Privacy presentation.
- [`../contracts/OpenEscrow.sol`](../contracts/OpenEscrow.sol) and
  [`../contracts/OperationsReserve.sol`](../contracts/OperationsReserve.sol) — exact executable
  behavior.
- [`uat/execution-ledger.md`](./uat/execution-ledger.md) — acceptance evidence and known limits.

Counsel should identify the exact reviewed Git commit. A later contract, configuration, jurisdiction
profile, provider flow, or user-facing policy change requires a scoped delta review.

## Required deliverable and release gate

The requested deliverable is a written issue matrix mapping every conclusion to the material above,
with severity, affected jurisdiction/segment, authority, effective date, required product change,
and whether the issue blocks a supervised pilot or only a real-money release.

Until that deliverable is accepted, OpenEscrow remains a public testnet demonstration. No compliance
profile, landlord confirmation, disclaimer, automated test, or blockchain receipt substitutes for
qualified legal review.
