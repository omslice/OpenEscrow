# OpenEscrow one-jurisdiction pilot readiness brief

This document is a handoff package for counsel, a housing-sector pilot partner, and an independent
security auditor. It is not legal advice and does not authorize real-money use.

## Decision required from the project owner

Choose exactly one initial jurisdiction and user segment:

- jurisdiction: state/province/country and any relevant city;
- tenancy type: fixed-term, month-to-month, subsidized, student, or another narrow segment;
- landlord segment: small landlord, professional manager, nonprofit housing provider, or another
  defined group;
- intended role of OpenEscrow: evidentiary workflow plus custody, regulated escrow service, or
  another legally reviewed model.

Do not build jurisdiction-specific contract behavior before these choices are written down.
The demo's jurisdiction selector is only an off-chain research label; choosing an option there does
not satisfy this decision or imply that counsel has approved the workflow for that location.

## Counsel work package

Counsel should provide a written answer, with citations and effective dates, for:

1. Who may legally hold the deposit and under what licensing, trust-account, bonding, or
   segregation requirements?
2. What event starts the return/itemization deadline?
3. Which deadlines are mandatory, and what happens when a landlord misses one?
4. Which deduction categories are permitted?
5. What itemization, receipt, estimate, inspection, and move-in-baseline evidence is required?
6. Can parties use mediation or binding arbitration, and what consent language is enforceable?
7. Can the product apply a tenant-favoring default when the arbiter is unavailable?
8. What notices, disclosures, records, accessibility, language, and privacy obligations apply?
9. How should abandoned accounts, lost wallets, death, incapacity, court orders, and sanctions be
   handled?
10. Is stablecoin custody permissible, or must the pilot use fiat or a licensed custodian?

The deliverable should map every answer to the relevant item in
[`open-questions.md`](./open-questions.md) and label assumptions that require regulator or court
interpretation.

## Pilot partner work package

The partner should nominate:

- one operational owner;
- a small participant cohort and recruitment criteria;
- qualified or supervised arbiters/mediators;
- a support and escalation channel;
- a process for verifying off-chain events such as move-out;
- a data-retention owner;
- explicit stop conditions.

## Privacy and evidence design gate

Before any personal information is collected:

- complete a data-flow diagram and threat model;
- select encrypted, access-controlled storage;
- define per-role access and revocation;
- define deletion and legal-hold behavior;
- prohibit public IPFS for personal evidence;
- separate wallet addresses from participant contact details where practical;
- complete a privacy notice and incident-response procedure.

## Independent audit request

Commission a professional review of the exact intended deployment commit. The scope must include:

- state-machine and authorization review;
- accounting and solvency invariants;
- ERC-20 assumptions and reentrancy;
- deadline and timestamp boundaries;
- arbiter resignation and replacement;
- denial-of-service and griefing;
- deployment configuration and immutable token pinning;
- frontend transaction construction;
- a remediation review after fixes.

The existing AI-assisted reviews, 221-test contract suite, and 90-test hosted-workflow suite are
useful inputs, not substitutes for this engagement.

## Go/no-go checklist

Real-money use remains **no-go** until every item is evidenced:

- [ ] jurisdiction and segment selected;
- [ ] written counsel opinion accepted;
- [ ] custody model legally permitted;
- [ ] pilot partner and operating owner committed;
- [ ] private evidence system reviewed;
- [ ] independent audit findings remediated;
- [ ] participant disclosures and support process approved;
- [ ] monitoring and incident response exercised;
- [ ] usability gate passed;
- [ ] rollback/stop plan approved.

Until then, OpenEscrow must remain clearly labeled as a public testnet demonstration.
