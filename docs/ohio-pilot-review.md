# Ohio residential pilot: source review and production decisions

Prepared September 14, 2026. Owner-selected scope: **Ohio residential rentals**. Municipality,
fixed-term versus periodic tenancy, housing-program participation, operating entity, and custody
provider are not yet selected. This is an engineering issue matrix for qualified Ohio counsel,
not a legal opinion or approval for real deposits.

## Exact review target

The starting application release is `592c6d04f0fb3c1de1faf9b956be4e8c4067952e`.
The active immutable contract cohort was compiled from
`5073f2a98de0741f577ca443f249541f08e4d67e`; use
[`base-sepolia-latest.json`](../deployments/base-sepolia-latest.json) for all addresses and
transactions. A reviewer must additionally identify the exact commit containing any proposed
changes. This document cannot bind future moving branch contents to an opinion.

## Official sources checked September 14

- [R.C. 5321.16](https://codes.ohio.gov/ohio-revised-code/section-5321.16), effective
  November 4, 1974: deposit interest, deductions, return/itemization, forwarding address, remedies.
- [R.C. 5321.13](https://codes.ohio.gov/ohio-revised-code/section-5321.13), effective
  August 22, 1990: prohibited rental terms, non-waiver, and liability provisions.
- [R.C. 5321.05](https://codes.ohio.gov/ohio-revised-code/section-5321.05), effective
  August 22, 1990: tenant obligations and associated remedies referenced by the deposit statute.
- [R.C. 5321.01](https://codes.ohio.gov/ohio-revised-code/section-5321.01), effective
  October 3, 2023: definitions and excluded residential arrangements.

These are the effective dates displayed by the official pages on the review date. Counsel must
check amendments, controlling decisions, local rules, and any applicable federal housing program.
The list is a starting inventory, not a complete opinion on Ohio landlord-tenant law.

## Decisions and implementation gaps

| ID | Source observation or review question | Current software | Required production decision and acceptance case |
|---|---|---|---|
| OH-01 | R.C. 5321.16(B) links the 30-day return/itemization period to both termination and delivery of possession | Contract uses a pre-agreed claim-window timestamp; offchain event confirmation exists | Counsel specifies evidence, disagreement handling, and the operative event; test different termination/possession dates and early termination |
| OH-02 | Notice and amount due are addressed together in R.C. 5321.16(B) | Claim and response windows can run beyond the configured claim-start period; ordinary withdrawals wait for the claim deadline | Define payment and notice deadlines separately and prove no contract lock or response period causes an unlawful late refund |
| OH-03 | R.C. 5321.16(A) specifies 5% annual interest on the amount above the greater of $50 or one month's periodic rent when possession lasts at least six months, computed and paid annually | Test yield is a separate bounded simulation and is settled at closure | Decide statutory-interest computation, payer, annual payment, rounding, rent changes, and partial-year treatment; test threshold, six-month, and annual-payment boundaries |
| OH-04 | R.C. 5321.16(B) connects deductions to past-due rent and qualifying damage from noncompliance with the lease or R.C. 5321.05 | App records offchain line items; contract allocates an aggregate claim | Approve categories, proof, itemization and dispute process; ensure an unsupported amount cannot be described as legally adjudicated |
| OH-05 | R.C. 5321.16(B)-(C) discusses the written forwarding address and remedies for wrongful withholding | Wallet/email routing is not itself a postal-address or statutory-delivery determination | Decide private address collection, evidence of delivery, failed-delivery recovery and missing-address treatment; do not infer that missing address forfeits the principal |
| OH-06 | R.C. 5321.13 limits waiver and certain contractual liability/fee terms | Default no-arbiter mode allocates the landlord claim after responses or expiry, including dispute/non-response | Obtain an explicit opinion on automatic release, notice, consent, judicial remedies and any required hold; agreement acceptance alone is not the answer |
| OH-07 | R.C. 5321.01 distinguishes covered residential arrangements | Address routing does not establish tenancy/program eligibility | Define an eligibility checklist and escalation for excluded or subsidized arrangements; test unknown facts without assuming conventional tenancy |
| OH-08 | Municipal and federal overlays depend on location and participant facts | Reviewed Ohio city overlays are not yet established | Identify actual pilot municipality/county, check local and housing-program requirements, and record coverage gaps before enabling them |
| OH-09 | Legal civil-time interpretation needs review | Explicit instants are deterministic; a device timezone is not attested property location | Select property timezone evidence and deadline counting; test DST, conflicting device zone, month/year rollover and an unavailable timezone provider |
| OH-10 | Who may hold deposits and whether the chosen token/funds flow is lawful remain open | Immutable shared testnet escrow plus separate refundable reserve | Counsel and provider specify custody, segregation, licensing, sanctions and fee/reserve responsibilities; review the actual flow diagram |
| OH-11 | Loss, unavailable wallets, court orders and exceptional tenancy events need operational treatment | Wallet authorization and fixed onchain transitions are not a legal recovery service | Specify permitted recovery/holds and who can initiate or verify them; independently audit any resulting contract change |
| OH-12 | Personal evidence, notices and payment records create privacy/retention obligations | Private R2, encryption, role isolation, exports and session containment implemented | Approve data map, retention, deletion/legal holds, access requests, breach response, vendor roles and accessible notices |

For each row, counsel should record: conclusion, controlling authority/effective date, factual
assumptions, permitted product behavior, blocked behavior, required changes, reviewer/date, and
whether a later delta review is required. All legal conclusions are currently **pending**.

## Ohio source-monitor correction

Candidate profile `oh-rules-2026-09-14.v6` replaces a court-opinion URL with the actual official
R.C. 5321.16 page. Three independent local HTTP retrievals returned 200 with the same 16,432-byte
body hash `e81d3dfe1e00552f7b8ea81f79237d4d7da646a25e597f5d5b4fecc62e246017`.
The source observation verifies the exact URL, content hash, essential text markers, and a
48-hour maximum age through the existing GitHub external monitor. This verifies a document
observation; it does not certify the rule interpretation or production readiness.

The [September 14 workflow](https://github.com/omslice/OpenEscrow/actions/runs/34892299991)
published Ohio's matching observation at `2026-09-14T20:20:28.845Z` from candidate `4c708bc`.
Its overall review gate failed for New Hampshire's changed source; Ohio itself was unchanged.
This dated result expires after 48 hours. Before activating a later candidate, refresh and verify
`state-oh.json`, then verify the deployed Ohio source status. A missing, changed, stale,
or malformed observation must block new adoption of that profile. Never manufacture an
`unchanged` result or rewrite an accepted historical snapshot to make a check green.

## Synthetic acceptance handoff

Use the [testnet pilot runbook](testnet-pilot-runbook.md) and record exact app/contract versions.
The first hosted session needs a landlord plus two separately authenticated tenants. Exercise
ordinary sign-in, role-locked invitation opening, wallet readiness, common-revision approvals,
finalization, exact shares, claims/no-claim, response/non-response, deadlines, withdrawals,
private document access, record export, stale links, wrong accounts, and inbox placement.

An Ohio-law profile must retain its statutory timing. Accelerated five-minute functionality
rehearsals belong to the explicitly generic test policy, not a relabeled Ohio profile. Mock
workspace completion is useful orientation but is not live-wallet, provider, or Ohio-law evidence.

Local automated checks and the hosted synthetic session precede any real-data collection. The
real-money gate additionally requires the completed matrix, provider/custody approval,
independent security review, approved operations and notices, and a committed pilot partner.
