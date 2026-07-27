# OpenEscrow — Security Review

**Scope:** the `contracts/OpenEscrow.sol` source and OpenZeppelin v5.1.0 library code it depends on
(`SafeERC20`, `ReentrancyGuard`, `Address`). The historical first review referenced the now-retired
Base Sepolia deployment at `0x4365f7B9632d083F1a03D57AE56a0e6d239ef62F`. The reviewed and
regression-tested source was redeployed at the currently configured testnet address
`0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99` after the multi-tenant lifecycle changes. The separate
`OperationsReserve`, mock-token, and `AgreementActivityRegistry` contracts have automated tests
but are not covered by the original line-by-line review described below.
**Method:** manual line-by-line review (access control matrix, state-machine transition
completeness, arithmetic/overflow analysis, external-call/reentrancy analysis, timestamp
sensitivity, economic/griefing vectors) plus automated static analysis (Slither 0.11.5).
**Reviewer:** Claude (Anthropic), acting as the project's own developer.

## What this is, and what it is not

This is a thorough, good-faith review by the same party who wrote the contract. It found and
fixed a real, concrete bug (§1 below) that automated tooling did not catch. It is **not** a
substitute for an audit by an independent, professionally credentialed security firm (e.g.
Trail of Bits, OpenZeppelin, Spearbit, Consensys Diligence). Before any deployment holding
real, non-testnet funds:

- Commission an independent audit. A reviewer who also wrote the code has structural blind
  spots a fresh set of eyes does not.
- Treat every finding below as a starting point for that engagement, not a replacement for it.

## Summary

| # | Title | Severity | Status |
|---|---|---|---|
| 1 | Arbiter-replacement steps didn't re-validate phase after the initial proposal | Medium | **Fixed** |
| 2 | Evidence array can grow unboundedly per agreement | Low / Informational | Accepted (documented) |
| 3 | Timestamp-manipulation tolerance shrinks proportionally at very short (near-`MIN_PERIOD`) deadlines | Low / Informational | Accepted (documented) |
| 4 | `withdraw()` has no balance-delta check on the outgoing transfer | Low / Informational | Accepted (documented) |

No High or Critical findings. No reentrancy, fund-theft, or unauthorized-withdrawal path was
found in the deposit/claim/dispute/withdrawal core logic; the invariants that logic depends on
are additionally exercised by 32,768 randomized calls per property in the existing invariant
test suite with zero violations.

---

## Finding 1 (Medium, Fixed): arbiter replacement didn't re-validate phase at every step

**Location:** `confirmArbiterReplacement` (was line 482), `acceptArbiterRole`'s
replacement-finalization branch (was line 236).

**Description.** Arbiter replacement is a three-step process: `proposeArbiterReplacement` →
`confirmArbiterReplacement` → `acceptArbiterRole`. Only the first step checked that the
agreement was in a phase where replacement makes sense
(`ReadyToFund`/`Active`/`ClaimOpen`/`Disputed`, via `_requireReplaceablePhase`). The other two
steps checked *who* could call them, but never re-checked *when* — so if the agreement's phase
changed between steps (which nothing prevents, since propose/confirm/accept can be arbitrarily
far apart in time), the later steps completed anyway.

**Exploit scenario A — mutating a closed agreement.** A dispute is live; the two parties agree
to replace an unresponsive arbiter and complete propose+confirm. Before the new arbiter calls
`acceptArbiterRole`, the *original* arbiter (or the timeout path) resolves the dispute — the
agreement is now `Closed`, `locked == 0`, nothing more should ever change. The new arbiter's
`acceptArbiterRole` call still succeeded: it overwrote `arbiter`, set `arbiterAccepted = true`,
and emitted `ArbiterReplaced` — on a supposedly terminal agreement. No funds could move (the
Closed agreement's `locked` was already zero and no function reintroduces a dispute once
Closed), but any UI, indexer, or dashboard reading "current arbiter" for a resolved agreement
would show a value that was mutated after the fact, and a stale event fires against a deal
that's actually done.

**Exploit scenario B — hijacking after renomination.** Pre-funding, while `ReadyToFund`, a
replacement is proposed and confirmed. Before the new candidate accepts, the landlord changes
their mind and calls `renominateArbiter` with someone else entirely — this sets a new `arbiter`
directly and resets phase to `Proposed`, but (in the original code) left the stale
`pendingArbiter`/`pendingArbiterConfirmed` fields untouched. The original replacement candidate
could still call `acceptArbiterRole` afterward, and the check inside that branch had no phase
condition at all — so it succeeded, overwriting the landlord's renomination and setting
`arbiterAccepted = true` while `phase` stayed at `Proposed` (only the *other* accept branch
advances phase to `ReadyToFund`). Net effect: the landlord's intended arbiter was silently
displaced by a stale candidate, and the agreement became stuck — unable to reach `ReadyToFund`
through the normal path, so the tenant could never fund it — until the landlord noticed and
renominated again.

Neither path allows a direct theft of deposited funds (both are pre-funding or post-closure, so
`locked` is either 0 or not yet meaningfully at risk in the sense of theft), but both are real,
concrete state-machine integrity violations with a plausible operational trigger (races between
"let's fix our unresponsive arbiter" and "the dispute/proposal is also naturally concluding"),
not theoretical edge cases requiring an attacker to control anything unusual.

**Fix applied:**
- `confirmArbiterReplacement` now calls `_requireReplaceablePhase(a.phase)` before proceeding.
- The replacement-finalization branch inside `acceptArbiterRole` now calls the same guard
  before mutating state.
- `renominateArbiter` now also clears `pendingArbiter`/`pendingArbiterProposer`/
  `pendingArbiterConfirmed`, so a stale proposal doesn't linger in reads (e.g. the frontend)
  even though the phase guards above already make it inert.

**Regression tests added** (`test/Arbiter.t.sol`):
`test_replacement_acceptRevertsIfAgreementClosedBeforeAcceptance`,
`test_replacement_confirmRevertsIfAgreementClosedBeforeConfirmation`,
`test_renominateArbiter_invalidatesStaleConfirmedReplacement`. All three fail against the
pre-fix code and pass against the fix.

---

## Finding 2 (Low/Informational): unbounded per-agreement evidence array

`submitEvidence`, `submitClaim`, and `amendClaim` all push to `_evidence[id]`, an
unbounded-length array. Either party can call `submitEvidence` repeatedly during
`ClaimOpen`/`Disputed`. The gas cost of each push is borne by whoever calls it, not shared or
imposed on others, and `getEvidence`/`evidenceCount` are `view` functions with no on-chain
caller ever paying to iterate a long array (only off-chain `eth_call` reads do, which don't
consume real gas). This is not exploitable as a protocol-level denial of service; at most it
lets a party waste their own gas. No action taken beyond documenting it here.

## Finding 3 (Low/Informational): timestamp-manipulation tolerance at short periods

Block producers can shift `block.timestamp` by a small amount (commonly cited as low
single-digit seconds on OP-stack chains like Base). Every deadline in this contract is
day/week-scale in the intended use case, making this immaterial. However, `MIN_PERIOD` (5
minutes) exists specifically for fast testnet iteration — an agreement actually configured at
or near that floor has a proportionally much larger exposure to timestamp drift (a few seconds
against a 300-second window is a few percent, not negligible). Already implicitly covered by
`docs/mvp-spec.md`'s framing of `MIN_PERIOD` as a testnet convenience, not a production value;
worth restating explicitly here so it isn't missed. No code change — this is a configuration/
usage caveat, not a bug.

## Finding 4 (Low/Informational): no balance-delta check on outgoing transfers

`tenantAcceptAndFund` verifies the *incoming* transfer amount via a balance-delta check
(`DepositMismatch` if the received amount doesn't match what was requested) — this was a
deliberate defensive measure per ADR-0002. `withdraw()` has no equivalent check on the
*outgoing* `safeTransfer`. If the pinned token ever charged a fee on outgoing transfers, a
withdrawer would receive less than their credited `amount`, while the contract's internal
books still correctly record the full `amount` as withdrawn (no double-spend or accounting
corruption results — the shortfall is simply absorbed by the recipient, not created or hidden).
This only matters if a fee-on-transfer token were ever used, which contradicts the project's
own single-pinned-well-behaved-token assumption (ADR-0002) and is not the case for the
currently deployed test USDC. No code change — flagged as a documented assumption that would
need revisiting if the pinned token ever changes.

---

## Areas reviewed with no issues found

- **Reentrancy:** only two external calls exist (`safeTransferFrom` in `tenantAcceptAndFund`,
  `safeTransfer` in `withdraw`), both behind `nonReentrant` (a single shared guard across the
  whole contract, so cross-function reentrancy is blocked too, not just same-function
  reentrancy), both using OpenZeppelin's `SafeERC20`. Verified further by two dedicated
  reentrancy tests using a token mock that attempts to reenter mid-transfer.
- **Arithmetic:** every subtraction in the fund-accounting paths (`submitClaim`, `amendClaim`,
  `_settleResponse`, `resolveDispute`) is bounded by an explicit prior check or a maintained
  invariant (`locked == claimedAmount` while a claim is open and unamended/unresolved),
  confirmed both by manual trace and by 32,768 randomized invariant-test calls with zero
  violations of `depositAmount == tenantWithdrawable + landlordWithdrawable + locked +
  withdrawn`.
- **Access control:** every state-mutating function's caller restriction was checked against
  its intended role (landlord/tenant/arbiter/permissionless) and matches the 18 dedicated
  authorization tests in `test/Auth.t.sol`.
- **Integer overflow on deadlines:** `claimSubmissionDeadline`, `responseDeadline`, and
  `arbiterRulingDeadline` are all `block.timestamp + (a value bounded by MAX_PERIOD or
  MAX_CLAIM_WINDOW_OFFSET)`; the sums stay far below `type(uint64).max` given current and any
  realistic future `block.timestamp`.
- **Upgradeability / admin risk:** none exists by design (spec decision 7) - there is no owner,
  no pause, no proxy, and therefore no admin-key compromise scenario to consider.
- **Role-conflict validation:** `createAgreement`, `renominateArbiter`, and
  `proposeArbiterReplacement` all correctly reject landlord/tenant/arbiter collisions.

## Independent review addendum — 2026-07-24

A separate Codex review of the contract, tests, and written specification identified four
additional state-integrity and assurance gaps. This is still an AI-assisted internal review, not
an external audit.

| Severity | Finding | Resolution |
| --- | --- | --- |
| Low | `declineArbiterRole` emitted an event but did not persist the decision, so the same nomination could later be accepted. | Added `arbiterDeclined`, blocked later acceptance, reset it only on explicit renomination, and added regression tests. |
| Low | A pending replacement could be cancelled after an agreement was terminal, and pending replacement fields could remain populated after closure. | Restricted cancellation to replaceable phases and clear pending replacement state on every terminal transition. |
| Informational | Repeat arbiter resignation produced duplicate state-change events. | Repeat resignation now reverts with `ArbiterHasResigned`. |
| Informational | The contract-wide invariant incorrectly required exact token-balance equality, which harmless direct token donations violate; the stateful handler also omitted several public actions. | Corrected the solvency property to `balance >= liabilities` and expanded randomized coverage to decline, renomination, proposal cancellation, replacement cancellation, and direct donation. |

The review also corrected a getter test that claimed to verify nonexistent-agreement behavior
without calling the getter. `getAgreement` now explicitly reverts `AgreementDoesNotExist`, matching
the test name, the rest of the read API, and frontend expectations.

## Frontend dependency check — 2026-07-25

`npm audit --omit=dev` reports ten moderate `uuid` advisories in transitive MetaMask connector
dependencies pulled through Privy/wagmi. The suggested forced remediation would downgrade
`@privy-io/react-auth` across a breaking boundary, so it was not applied automatically. No high or
critical advisory was reported. This should be rechecked when Privy/wagmi publish a compatible
dependency update and is another reason the current build remains testnet-only.

## Testnet release gate addendum — 2026-07-26

The frontend CI now runs `npm run release:check`, which combines:

- lint, all hosted/server tests, all client-logic tests, and a production build;
- `npm audit --omit=dev --audit-level=high`, which blocks high or critical production-dependency
  advisories while continuing to report the known moderate transitive advisories;
- exact preservation of the existing Sites project ID and D1/R2 binding names;
- a fail-closed testnet configuration check that rejects an enabled real-fiat onramp or production
  approval flag;
- catalog checks that preserve USDC as the non-yield default, keep USDY unavailable for U.S. and
  Canadian contexts, and keep FRNT without a funding route.

This is a local release-candidate gate, not the hosted pilot-service gate. After deployment,
`npm run pilot:check` separately verifies email, Cron, evidence encryption, registry binding,
address attestations, and official-source baselines against the live readiness endpoint.

## Hosted workflow and evidence addendum — 2026-07-25

A separate review covered the hosted D1 agreement record, notification scheduler, private evidence
routes, and the frontend-to-record action boundary. This remains an AI-assisted internal review.

The review found that the readable secondary record accepted syntactically valid transaction
hashes and action payloads without enforcing enough lifecycle order. A party could not move
onchain funds through that API, but could create a misleading off-chain audit trail: for example,
recording a tenant response before a claim, recording a ruling without a dispute, recording a
withdrawal before resolution, or recording the same party's funding more than once under different
transaction hashes.

The hosted action handler now:

- enforces one reserve and one deposit contribution per tenant;
- requires a positive, deposit-bounded claim and permits only one original claim;
- restricts amendments to an unanswered original claim and prevents increases;
- requires one valid response from every invited tenant;
- computes whether a real disputed balance exists before accepting an arbiter ruling;
- bounds the arbiter award by the disputed amount;
- rejects withdrawals until a response, ruling, retraction, or refund resolves the claim;
- validates timeout actions against their prerequisite lifecycle state; and
- records tenant IDs on funding, response, and withdrawal events so co-tenants cannot be
  conflated.

Base Sepolia receipt verification is enabled by default. Every recorded transaction must have a
successful receipt with the current deployment address, expected event signature, and agreement
ID. It can be disabled only through an explicit emergency diagnostics setting.

Evidence upload now checks PDF/JPEG/PNG/WebP file signatures instead of trusting a browser-provided
MIME type. Evidence downloads and printable reports add no-referrer, no-sniffing, anti-framing, and
restrictive content-security headers. Static app responses also receive no-referrer and no-sniffing
headers.

Automated coverage at this addendum is 173 passing Solidity tests across 15 suites, including the
three 32,768-call stateful invariants and 512-run fuzz cases, plus 38 passing hosted workflow tests.
The workflow suite contains a complete two-tenant/optional-arbiter negotiation, funding, claim,
response, dispute, ruling, refund, and withdrawal scenario.

### Residual hosted-workflow risks

- Receipt verification depends on a Base Sepolia RPC endpoint. A temporary provider outage can
  delay saving the readable receipt record, although it does not alter the completed onchain
  transaction and the UI retains a retry path.
- Invitation URLs are bearer credentials. Account-discovery access expires, but direct invitation
  revocation and a complete recovery flow still need product design. Invitations must not be
  forwarded or logged.
- The server record cannot prove that the human-readable note or uploaded document accurately
  describes the onchain action. Its hash and transaction receipt prove integrity and occurrence,
  not truth.
- Email delivery, evidence-key backup, scheduler operation, and separate-account browser testing
  remain operator responsibilities documented in `pilot-services-setup.md`.

## Disclaimer

This review was performed by an AI system acting as the project's developer, not by a licensed
or professionally credentialed security firm. It should materially reduce risk relative to no
review at all, and the one Medium finding above was a genuine bug that a real audit firm would
also be expected to catch — but it carries none of the professional liability, methodology
guarantees, or breadth of a paid audit engagement. Do not treat this document as sufficient
sign-off for a deployment holding real user funds.
