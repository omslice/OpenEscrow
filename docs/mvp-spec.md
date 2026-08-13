# OpenEscrow — MVP Specification (Base Sepolia / Test USDC)

Status: implemented for the Base Sepolia testnet MVP. Category A in [`open-questions.md`](./open-questions.md) remains unresolved and blocks non-testnet use.
Related: [ADR-0001 shared escrow contract](./adr/0001-shared-escrow-contract.md), [ADR-0002 single-token USDC](./adr/0002-single-token-usdc.md).

This spec supersedes the flow described in `protocol-flow.md` and `technical-overview.md` for MVP purposes. Those documents describe a longer-term vision (multi-token, notice periods, non-blocking disputes); this MVP intentionally narrows and, in one important place, **corrects** that vision: disputes here block release of the disputed amount. They do not just get logged.

**Approved decisions (updated 2026-08-12), superseding the first draft of this spec:** the items below are normative wherever they conflict with earlier wording. Sections below distinguish the default no-arbiter record workflow from the optional arbiter-backed workflow.

1. In the default no-arbiter workflow, a tenant response is recorded but does not control the landlord's documented claim allocation. Tenant silence is recorded as **No response**—not consent and not a dispute—and, after the response deadline, the documented claim is allocated to the landlord while the remainder is allocated to tenants. In an explicitly arbiter-backed agreement, an unaccepted amount follows the agreed dispute process (§6).
2. **Changed from the first draft:** at most **one** claim amendment is permitted (not three), and amendment **never resets or extends** `responseDeadline` (the first draft reset it on every amendment). See §5.
3. Arbiter ruling timeout sends the disputed amount to the tenant via an explicit, permissionless transaction — already the design (§8), now confirmed.
4. **Revised for the experiment:** an arbiter is optional at creation. A named arbiter must accept
   before funding; a zero-address arbiter makes the agreement immediately ready to fund and selects
   the record-only claim workflow. A no-arbiter agreement does not enter `Disputed`. Optional
   arbiter-backed agreements retain the fixed dispute and timeout workflow.
5. **Changed from the first draft:** arbiter replacement requires mutual consent (already the design) but `arbiterRulingDeadline` is now **never** reset by a replacement, even mid-dispute (the first draft reset it to give the incoming arbiter a fresh window). A fixed, replacement-proof deadline is the simplest way to guarantee neither party can use replacement to unilaterally extend a dispute. See §8.
6. **New:** onchain evidence is a structured record — content hash, privacy-safe URI/opaque identifier, evidence type code, timestamp, submitting party — and nothing else. No names, physical addresses, lease documents, invoices, or photographs go onchain directly. Public IPFS (or any public pointer) is explicitly documented as not private storage. See §9 and the data model in §2.
7. **Changed from the first draft:** there is no administrator role at all — not even the creation-only `pauseNewAgreements()` proposed in the first draft of §10. Every function is permissionless or role-gated to landlord/tenant/arbiter; nothing is gated to a deployer/owner address.
8. Two immutable, allowlisted test-token addresses are supplied at deployment; no generic ERC20,
   ETH, fees, upgradeability, or multi-chain support. The candidate deployment uses static `taUSDC`
   shares whose testUSDC-equivalent demo value grows from agreement funding at 1% per hour and stops
   at 5%. At terminal settlement, the contract burns the valueless `taUSDC` shares and the test token
   mints the deterministic testUSDC-equivalent amount to escrow. The landlord can receive only the
   principal-equivalent documented deduction; the remaining principal and all positive demo yield are
   allocated to tenants. This is experimental test-token conversion, not an underlying asset,
   real redemption, real yield, or monetary value.

**Operations-reserve addendum (2026-07-25):** decision 8 still governs the core `OpenEscrow`
contract: no fee is taken from deposit principal and the deposit invariant is unchanged. New
email-negotiated proposals separately disclose a fixed 5 testUSDC pilot service reserve, paid to an
independent `OperationsReserve` contract atomically with deposit funding. It covers the product's sponsored
transactions and document-storage budget, has a separate onchain receipt, and is never deductible
as part of the security deposit. The current MVP does not meter actual costs, so the full reserve
remains a refundable tenant liability and is returned in the original agreement token when the
tenant withdraws after closure.

## 0. Scope lock (as given)

Base Sepolia only · two allowlisted test tokens (plain and yield-test shares) · one shared contract · optional,
mutually-accepted arbiter · testnet/demo use only. Explicitly out of scope: real yield, real-asset redemption,
fiat ramps, reputation, DAO governance, multi-chain, upgradeability, and decentralized arbitration.

Because upgradeability is out of scope, bugs found post-deploy are fixed by deploying a new contract and starting new agreements there. Existing agreements on a superseded contract keep running to completion under the old code. This is acceptable for a testnet demo and should not be treated as acceptable for a mainnet deployment holding real deposits — flagged again in §12.

---

## 1. Product hypothesis and non-goals

**Hypothesis:** A rental security deposit can be held in a shared, non-custodial escrow contract such that (a) tenants recover the full deposit if the landlord raises no timely claim, (b) the landlord can submit and receive a documented claim while tenant responses and non-responses remain independently verifiable in a shared record, and (c) parties who explicitly choose an arbiter can use the contract's bounded dispute workflow. If this holds under adversarial testing on testnet, it is worth taking to legal, security, and compliance review before considering real funds.

**Explicit non-goals for this MVP:**
- Not a production custody system. Test USDC on a testnet, demo/pilot use only.
- Not a source of legal truth about lease terms, move-out dates, or deduction legality — see §15 / `open-questions.md`.
- Not decentralized dispute resolution. The arbiter is a single address the two parties pick and trust; there is no juror pool, staking, or appeal.
- Not a generic multi-token or multi-chain product. The accelerated yield and terminal test-token
  conversion are a test harness, not an investment product or claim on underlying assets.
- Not upgradeable. No admin can change a live agreement's outcome.
- Does not model lease renewal, month-to-month rollover, or early termination. One agreement = one fixed claim-window start date, set once at proposal.
- Does not verify identity of landlord, tenant, or arbiter beyond wallet address control. No KYC.
- Does not validate *what* a claim is about (deduction category, itemization) — see §5, §9, §15.

---

## 2. Roles and data model

**Roles:** `landlord` (proposes, submits/amends claims), `tenant` (accepts, funds, responds to claims), `arbiter` (adjudicates disputes for one specific agreement). A single address may hold at most one of these roles per agreement (`landlord != tenant`, `landlord != arbiter`, `tenant != arbiter`, enforced at proposal and at any arbiter replacement).

**Per-agreement fields** (conceptual — not a Solidity struct yet):

| Field | Type (concept) | Set when | Mutability |
|---|---|---|---|
| `id` | uint256 | creation | immutable |
| `landlord`, `tenant` | address | creation | immutable |
| `arbiter` | address | creation | replaced only via mutual-consent flow (§8) |
| `arbiterAccepted`, `arbiterDeclined` | bool | arbiter action | acceptance and decline are explicit; renomination resets both, and a declined nominee cannot later accept |
| `arbiterResigned` | bool | arbiter action | settable true; cleared when a replacement is accepted |
| `depositAmount` (`D`) | uint256, USDC base units (6 decimals) | funding | immutable after funding |
| `claimWindowStart` | timestamp | creation | immutable |
| `claimPeriod`, `responsePeriod`, `arbiterRulingPeriod` | duration (seconds) | creation | immutable |
| `claimSubmissionDeadline` | timestamp | derived = `claimWindowStart + claimPeriod` | — |
| `claimedAmount` (`C`) | uint256 | claim submission/amendment | decreases-or-equal only, never increases (§5) |
| `claimAmended` | bool | claim amendment | flips true once; a second amendment attempt reverts (at most one amendment total, §5) |
| `responseDeadline` | timestamp | claim submission (first time only) | **fixed** — never touched by amendment (§5) |
| `disputeCreatedAt`, `arbiterRulingDeadline` | timestamp | dispute created | **fixed** — never touched by arbiter replacement (§8) |

Evidence is **not** a field on the agreement struct. It is a separate append-only list per agreement, `Evidence[]`, where each entry is exactly:

| Field | Type | Notes |
|---|---|---|
| `contentHash` | bytes32 | hash of the actual off-chain content; required, nonzero |
| `uri` | string | pointer or opaque identifier to the off-chain content (e.g. an IPFS URI) — **not** the content itself, and **not** private: anything published this way, including on IPFS, should be treated as public and permanent |
| `evidenceType` | uint8 | caller-defined code (e.g. distinguishing an initial claim, an amendment, or a rebuttal); the contract does not interpret this value |
| `timestamp` | uint64 | block timestamp of submission |
| `submittedBy` | address | landlord or tenant only |

Landlord and tenant may each append evidence entries while a claim is open or disputed (`submitEvidence`), in addition to the entry automatically recorded on `submitClaim`/`amendClaim`. The contract never stores raw evidence content, never stores anything resembling a name or physical address, and never validates or dereferences the `uri` — it is an opaque pointer as far as the contract is concerned.
| `phase` | enum | see §3 | forward-only, no phase is re-enterable |
| `tenantWithdrawable` (`T`), `landlordWithdrawable` (`Ld`), `locked` | uint256 | every fund-moving transition | see §7/§9 |
| `withdrawn` (`W`) | uint256 | `withdraw()` | monotonically increasing |
| `pendingArbiter`, `pendingArbiterProposer`, `pendingArbiterConfirmed` | address / address / bool | replacement flow | cleared once resolved |

All amounts are raw USDC base units (6 decimals). No floating point anywhere, on-chain or in the frontend's transaction-building code — only in display formatting.

---

## 3. States and transitions

```
Proposed --arbiter accepts--> ReadyToFund --tenant funds--> Active
Proposed --landlord cancels--> Cancelled
ReadyToFund --landlord cancels--> Cancelled
Active --landlord submits claim--> ClaimOpen
Active --tenant withdraws, no claim, past claimSubmissionDeadline--> Closed (NoClaim)
ClaimOpen --landlord amends to 0--> Closed (ClaimRetracted)
ClaimOpen --no arbiter; every tenant responds--> Closed (Settled; responses recorded, documented claim allocated)
ClaimOpen --no arbiter; responseDeadline passes--> Closed (Settled; non-response recorded, documented claim allocated)
ClaimOpen --arbiter; tenant fully accepts (disputedAmount == 0)--> Closed (Settled)
ClaimOpen --arbiter; tenant partially accepts / disputes (disputedAmount > 0)--> Disputed
ClaimOpen --arbiter; responseDeadline passes, no tenant response--> Disputed (via finalizeNoResponse)
Disputed --arbiter rules, before arbiterRulingDeadline--> Closed (ResolvedByArbiter)
Disputed --arbiterRulingDeadline passes, no ruling--> Closed (ResolvedByTimeout)
```

`Cancelled` and `Closed` are terminal. `Closed` has five possible *reasons* (`NoClaim`, `ClaimRetracted`, `Settled`, `ResolvedByArbiter`, `ResolvedByTimeout`) recorded for UI/events but they are not separate FSM phases — nothing behaves differently between them except the accounting that already happened to get there. `withdraw()` is callable only after the agreement reaches `Closed` or `Cancelled` and the caller has a nonzero credited balance. Allocations may be calculated earlier, but no party can remove funds while a deduction claim or dispute remains unresolved.

Arbiter-replacement (§8) and arbiter-resignation are **not** phase transitions — they can happen inside `ReadyToFund`, `Active`, `ClaimOpen`, or `Disputed` without changing `phase`.

### 3a. Full state-transition table

| # | From | Action | To | Caller | Key guards |
|---|---|---|---|---|---|
| T1 | (none) | `createAgreement` / `createMultiTenantAgreementWithToken` | `Proposed` | anyone (becomes landlord) | one to ten unique tenants; positive shares total 10,000 bps; tenant/arbiter/landlord roles are disjoint; `depositAmount > 0`; valid timing |
| T2 | `Proposed` | `acceptArbiterRole` | `ReadyToFund` | nominated arbiter | not already accepted |
| T3 | `Proposed` | `declineArbiterRole` | `Proposed` (unchanged; landlord must renominate or cancel) | nominated arbiter | records `arbiterDeclined=true`; this nominee cannot later accept unless renominated |
| T4 | `Proposed` / `ReadyToFund` | `renominateArbiter(newArbiter)` | `Proposed` | landlord | pre-funding only; resets `arbiterAccepted=false` and `arbiterDeclined=false` |
| T5 | `Proposed` / `ReadyToFund` | `cancelProposal` | `Cancelled` | landlord | pre-funding only |
| T6 | `ReadyToFund` | `fundTenantShareWithReserve` (`fundTenantShare` and `tenantAcceptAndFund` remain test-compatible deposit-only aliases) | `ReadyToFund` or `Active` | any recorded tenant | atomically pulls that tenant's approved deposit portion plus disclosed reserve share; remains `ReadyToFund` until all deposit portions total the agreed deposit |
| T7 | `Active` | `submitClaim(C, evidenceURI)` | `ClaimOpen` | landlord | `now < claimSubmissionDeadline`; `0 < C <= D` |
| T8 | `Active` | `withdrawNoClaim` | `Closed(NoClaim)` | tenant | `now >= claimSubmissionDeadline`; no claim ever submitted |
| T9 | `ClaimOpen` | `amendClaim(newC, newEvidence)` | `ClaimOpen` (or `Closed(ClaimRetracted)` if `newC == 0`) | landlord | tenant has not yet responded; `!claimAmended` (at most one amendment, ever); `now < responseDeadline`; `newC <= currentC` (never increases, see §5); `responseDeadline` is **not** touched |
| T10 | `ClaimOpen` | `respondToClaim(A)` | No arbiter: `Closed(Settled)` after every tenant responds; arbiter: `Closed(Settled)` if accepted in full, else `Disputed` | tenant | `now < responseDeadline`; `0 <= A <= C` |
| T11 | `ClaimOpen` | `finalizeNoResponse` | No arbiter: `Closed(Settled)`; arbiter: `Disputed` | anyone | `now >= responseDeadline`; at least one tenant never responded |
| T12 | `Disputed` | `resolveDispute(X)` | `Closed(ResolvedByArbiter)` | current arbiter, `!arbiterResigned` | `now < arbiterRulingDeadline`; `0 <= X <= disputedAmount` |
| T13 | `Disputed` | `claimArbiterTimeout` | `Closed(ResolvedByTimeout)` | anyone | `now >= arbiterRulingDeadline`; no ruling made |
| T14 | `ReadyToFund`/`Active`/`ClaimOpen`/`Disputed` | `proposeArbiterReplacement(newArbiter)` | same phase | landlord or tenant | `newArbiter` passes the role-disjointness check |
| T15 | (pending replacement) | `confirmArbiterReplacement` | same phase | the *other* party from T14 | must not be same address as proposer |
| T16 | (pending replacement) | `acceptArbiterRole` (new arbiter) | same phase | `pendingArbiter` | both parties confirmed; swaps `arbiter`, clears `arbiterResigned`; `arbiterRulingDeadline` is **never** touched, including mid-dispute — see §8 |
| T17 | `ReadyToFund` / `Active` / `ClaimOpen` / `Disputed` | `cancelArbiterReplacementProposal` | same phase | original proposer of T14 | pending proposal exists and not yet accepted |
| T18 | `ReadyToFund`/`Active`/`ClaimOpen`/`Disputed` | `resignAsArbiter` | same phase | current arbiter | sets `arbiterResigned = true`; blocks `resolveDispute` until replaced |
| T19 | `Closed` / `Cancelled` | `withdraw` | unchanged | tenant or landlord | landlord has `Ld > 0`, or tenant has `T > 0` and/or a refundable operations reserve |

---

## 4. Deadline semantics

Single convention, applied uniformly: every deadline defines a half-open window **`[start, deadline)`**.
- "Still open" checks use strict `<` against the deadline (`now < deadline`).
- "Expired" checks use `>=` against the same deadline (`now >= deadline`).

At the exact instant `now == deadline`, the window is expired, never open. This means the two guard conditions on either side of any deadline (e.g. `submitClaim` vs `withdrawNoClaim`) are perfect logical complements — never both true, never both false, no dead second where neither action is available.

Derived deadlines:
- `claimSubmissionDeadline = claimWindowStart + claimPeriod`
- `responseDeadline = (time of original claim submission) + responsePeriod`
- `arbiterRulingDeadline = (time dispute created, or time replacement arbiter accepted if later) + arbiterRulingPeriod`

`claimWindowStart` is a fixed timestamp chosen by the landlord at proposal time and implicitly accepted by the tenant when they fund (§15 / `open-questions.md` item A1 — real move-out timing is a legal question this MVP does not attempt to solve). If `claimWindowStart` has already passed by the time the tenant funds, the claim window is simply open immediately — useful for demos, and not a bug.

No function executes automatically at a deadline. Every transition in §3a that depends on a deadline requires someone (a party, or "anyone" for the permissionless ones) to send a transaction after the deadline has passed. Nothing changes state on its own.

---

## 5. Claims: full, partial, absent, late, amended

- **Full claim:** `C == D`. Handled identically to partial in all logic; `D - C == 0` unclaimed remainder, so no tenant-withdrawable amount is created at submission.
- **Partial claim:** `0 < C < D`. For a plain testUSDC agreement, `D - C` is allocated to tenants immediately for accounting, but remains inside escrow until terminal resolution (T7 accounting, §9). For a yield-test agreement, distribution is deferred until terminal settlement so the deterministic testUSDC conversion can allocate all positive demo yield to tenants.
- **Absent claim:** no `submitClaim` before `claimSubmissionDeadline`. Tenant recovers everything via `withdrawNoClaim` (T8).
- **Late claim:** `submitClaim` after `claimSubmissionDeadline` reverts (`ClaimWindowClosed`). There is no grace period. A landlord who misses the deadline has no further on-chain recourse in this agreement.
- **Amended claim:** `amendClaim` is permitted **at most once** per agreement, only before the tenant has responded, and may only **decrease or hold** `C`, never increase it. It never touches `responseDeadline` — that deadline is fixed at the moment of the *original* `submitClaim` and nothing after that can move it, up or down.
  - The non-increasing rule is a fund-safety requirement, not a stylistic choice. In a plain testUSDC agreement, `D - C` is allocated to tenants when the claim is submitted; in a yield-test agreement, the corresponding distribution is deferred but the landlord's principal claim is still fixed. Increasing the claim later would reverse an accepted accounting boundary. Capping amendments to non-increasing values keeps both paths monotonic and auditable.
  - The fixed-deadline rule eliminates a griefing vector present in an earlier draft of this spec, where a landlord could repeatedly amend right before `responseDeadline` to indefinitely reset the tenant's response window. With the deadline fixed at first submission and only one amendment ever permitted, there is nothing left to reset — the griefing vector doesn't just get bounded, it's structurally impossible. The tradeoff: if a landlord amends late in the original response window, the tenant may have very little time left to react to the amended figure before `finalizeNoResponse` becomes callable. This is accepted as intended behavior per the approved decision, not a bug — a tenant facing a shrinking claim close to the deadline is never worse off in dollar terms than facing the original (larger) claim, since amendment can only reduce what's at stake.
  - `newC == 0` is treated as claim retraction and closes the agreement in the tenant's favor immediately (§3a, T9) — this is also the only way for a landlord to voluntarily withdraw a claim in this MVP; there is no separate "cancel claim" function, and retraction consumes the single amendment allowance like any other amendment.

---

## 6. Tenant acceptance, partial acceptance, and disputes

There is a single tenant-facing function, `respondToClaim(A)`, that records approval, partial approval, or dispute. Every tenant may record one response.

**No-arbiter agreement (default public MVP):** responses are evidence in the shared record and do not control the documented claim allocation. After every tenant responds—or after anyone records a missed response deadline—`Ld += C`, tenants receive the remaining deposit, `locked` becomes zero, and the agreement closes `Settled`. `A` and the tenant's decision remain available in the event record. A missing response is expressly recorded as non-response; it is not treated as consent or a dispute.

**Arbiter-backed agreement:** the lowest amount approved by every tenant is undisputed. `A == C` closes as full acceptance; `0 < A < C` allocates the accepted amount and disputes the remainder; `A == 0` disputes the full claim. A missing response moves the claimed amount into the agreed dispute workflow.

---

## 7. Which funds become withdrawable, and when

See §9 for the full transition-by-transition ledger. Summary of the required behaviors and how this design satisfies them:

- Before any claim: nothing is withdrawable by either party; the full deposit sits in `locked`.
- On claim submission in a plain testUSDC agreement, `D - C` is credited to tenants for accounting. In a yield-test agreement, no payout is credited yet because the final testUSDC-equivalent value is calculated only at terminal settlement.
- On terminal settlement, a plain agreement exposes its credited balances. A yield-test agreement first converts the complete taUSDC position to its deterministic testUSDC-equivalent value, credits the landlord no more than the principal-denominated claim, and allocates every remaining unit to tenants.
- Only the actively disputed amount (`disputedAmount`, tracked as `locked` while `phase == Disputed`) is ever locked pending a third party. Nothing else waits on the arbiter.
- `withdraw()` is available only after the agreement reaches `Closed` or `Cancelled`. This prevents either party from removing funds while a claim or optional dispute remains unresolved.

---

## 8. Arbiter appointment, acceptance, replacement, ruling limits

- **Default no-arbiter path:** the landlord supplies the zero address at creation. The agreement
  becomes `ReadyToFund` after participant approval without an arbiter action and uses the
  record-only claim workflow in §6.
- **Optional appointment:** the landlord may instead nominate an arbiter at creation. A nonzero
  nominee must explicitly `acceptArbiterRole` before any tenant can fund (T2 before T6 is enforced
  by the `ReadyToFund` phase gate). Funds therefore enter an arbiter-backed agreement only after
  that person has accepted the role.
- **Decline:** the nominee can `declineArbiterRole`; this decision is recorded and blocks that nomination from being accepted later. The landlord then either renominates (T4), which resets the decline state, or cancels (T5). Pre-funding, this is entirely the landlord's problem to solve — the tenant has not committed anything yet.
- **Replacement (post-funding):** requires both parties' consent (T14 propose → T15 confirm by the other party) *and* the new arbiter's acceptance (T16). The old arbiter remains fully active and able to rule for the entire duration of this process — there is never a window with zero valid arbiter. `arbiterRulingDeadline` is **never** reset or extended by a replacement, including one that happens mid-dispute: it is fixed once, at the moment the dispute is created, and stays fixed regardless of how many times the arbiter changes afterward. This is a deliberate simplification over an earlier draft (which reset the deadline for an incoming arbiter) — a fixed, replacement-proof deadline is the simplest guarantee that neither party can use the mutual-consent replacement process to unilaterally (or even collusively) extend how long funds stay locked. The cost is that a very late replacement could leave the incoming arbiter little time to review before timeout; that's an accepted tradeoff, not an oversight — parties who want a working replacement should propose one early in the dispute window, and the permissionless `claimArbiterTimeout` remains the backstop regardless.
- **Resignation:** the arbiter can unilaterally resign at any time (`resignAsArbiter`). This does not by itself change `phase` or move funds — it only blocks `resolveDispute` until either a replacement is accepted or the ruling deadline lapses.
- **Ruling limits:** `resolveDispute(X)` requires `0 <= X <= disputedAmount`. The arbiter cannot award more than what is disputed, and by construction (§5, §6) `disputedAmount <= claimedAmount <= D`, so the landlord can never receive more than they claimed, and the arbiter can never award more than was locked. The arbiter has no power over the already-settled `D - C` or already-accepted `A` portions — those are gone from `locked` before the arbiter is ever invoked.
- **Abandoned/unresponsive arbiter (no decentralized fallback, per scope):** if `arbiterRulingDeadline` passes with no ruling, `claimArbiterTimeout` is permissionlessly callable and sends the *entire* disputed amount to the tenant. This mirrors the project's default-to-tenant philosophy (an unproven claim, including one the arbiter failed to timely adjudicate, is treated as unproven) and guarantees the system never deadlocks: even if landlord and tenant cannot agree on a replacement in bad faith, the timeout eventually resolves the agreement unilaterally. This specific default (tenant wins on arbiter timeout, rather than e.g. a 50/50 split or landlord wins) is flagged in `open-questions.md` as a policy choice worth explicit confirmation, even though it's the one I'd recommend.

---

## 9. Funds accounting

Note on terminology: `disputedAmount`, used throughout §6/§8/§12/§13, is not a separately stored field. It is defined as `locked` at any point where `phase == Disputed` (and, loosely, "the amount that *would become* disputed" for `locked` at the moment `respondToClaim`/`finalizeNoResponse` is evaluated, before the phase flips). There is exactly one mutable "amount not yet finalized" number per agreement (`locked`); `disputedAmount` is a name for what that number means during the `Disputed` phase specifically, not a second variable to keep in sync.

For a plain testUSDC agreement, this invariant holds in every phase after funding:

```
depositAmount (D) == tenantWithdrawable (T) + landlordWithdrawable (Ld) + locked + withdrawn (W)
```

Before the first contribution, `D = T = Ld = locked = W = 0`. During partial funding,
`depositAmount` and `locked` increase by the exact contribution received while the agreement
remains `ReadyToFund`. Once contributions equal `agreedAmount`, the agreement becomes `Active`;
no later action can increase `depositAmount`.

For a yield-test agreement before terminal settlement, the same invariant applies to the fixed
taUSDC shares. At terminal settlement all escrowed taUSDC is burned and `settledValue (S)` records
the deterministic testUSDC-equivalent amount actually received. From that point forward:

```
settledValue (S) == tenantWithdrawable (T) + landlordWithdrawable (Ld) + withdrawn (W)
```

The landlord component is always bounded by the principal-denominated documented claim; therefore
every positive difference `S - D` belongs to tenants.

Contract-wide invariant (sum over all agreements `i`), useful for Foundry invariant tests against actual token balance:

```
testUSDC.balanceOf(contract) + taUSDC.balanceOf(contract)
  >= Σ_i ( T_i + Ld_i + locked_i )
```

The contract may hold harmless excess tokens because anyone can transfer the pinned ERC-20 directly
to its address without creating an agreement. Such donations are not assigned to any party and do
not weaken solvency. The required property is that the balance always covers liabilities.

### 9a. Plain-testUSDC funds-accounting table

| Transition | Precondition | ΔT | ΔLd | Δlocked | ΔW | Resulting phase |
|---|---|---|---|---|---|---|
| `fundTenantShare` | tenant has not funded | 0 | 0 | `+tenant portion` | 0 | `ReadyToFund`, or `Active` when the agreed total is reached |
| `submitClaim(C)` | `locked == D` (no prior claim) | `+(D-C)` | 0 | `= C` (i.e. `-(D-C)`) | 0 | `ClaimOpen` |
| `amendClaim(newC)`, `newC > 0` | tenant hasn't responded; `!claimAmended`; `now < responseDeadline` (unchanged by this call) | `-(newC-C)`* | 0 | `+(newC-C)`* | 0 | `ClaimOpen` |
| `amendClaim(0)` | tenant hasn't responded; `!claimAmended`; `now < responseDeadline` (unchanged by this call) | `+C` | 0 | `-C` | 0 | `Closed(ClaimRetracted)` |
| `respondToClaim(A)`, no arbiter, final required response | — | 0 | `+C` | `-C` | 0 | `Closed(Settled)` |
| `respondToClaim(A)`, arbiter, `A == C` | — | 0 | `+C` | `-C` | 0 | `Closed(Settled)` |
| `respondToClaim(A)`, arbiter, `A < C` | — | 0 | `+A` | `-A` | 0 | `Disputed` |
| `finalizeNoResponse`, no arbiter | `now >= responseDeadline`, missing response | 0 | `+C` | `-C` | 0 | `Closed(Settled)` |
| `finalizeNoResponse`, arbiter | `now >= responseDeadline`, missing response | 0 | 0 | 0 (relabeled `Disputed`, not moved) | 0 | `Disputed` |
| `resolveDispute(X)` | `0<=X<=locked` | `+(locked-X)` | `+X` | `= 0` | 0 | `Closed(ResolvedByArbiter)` |
| `claimArbiterTimeout` | — | `+locked` | 0 | `= 0` | 0 | `Closed(ResolvedByTimeout)` |
| `withdrawNoClaim` | `locked == D`, no claim ever | `+D` | 0 | `= 0` | 0 | `Closed(NoClaim)` |
| `withdraw` (tenant) | terminal phase; `T > 0` or refundable reserve > 0 | `= 0` | 0 | 0 | `+T` (old value) | unchanged |
| `withdraw` (landlord) | terminal phase; `Ld > 0` | 0 | `= 0` | 0 | `+Ld` (old value) | unchanged |

\* `newC - C` is negative when amending downward (the only direction allowed, per §5), so `ΔT` is positive and `Δlocked` is negative in the actual (permitted) case. Table shown in general form for clarity of derivation.

Every row's deltas sum to zero — no transition creates or destroys value, it only reclassifies it between the four buckets.

For a yield-test agreement, claim submission and amendment do not release shares. The relevant
terminal transition redeems the full taUSDC position, sets `S`, credits the landlord's bounded
principal claim, and credits tenants with `S - landlord principal`. Later withdrawals reduce those
testUSDC credits and increase `W`. The separate operations reserve is not part of `D` or `S`; until
real cost metering exists, each tenant's complete reserve payment is a refundable liability returned
in the original agreement token during terminal withdrawal.

---

## 10. Emergency behavior and administrative powers

**Approved (decision 7): there is no administrator role of any kind.** No address — not the deployer, not any other privileged key — can change an agreement's terms, reallocate funds, select or override an arbiter, resolve a dispute, or pause any part of the contract, including new-agreement creation. Every function is either fully permissionless or gated only to the landlord/tenant/arbiter of the specific agreement it acts on. This supersedes an earlier draft of this section, which proposed a deployer-gated `pauseNewAgreements()` circuit breaker; that proposal is withdrawn in favor of zero privileged roles.

Rationale: this is a testnet/demo contract with no upgrade path and no real funds, deployed by a project whose pitch is explicitly "no centralized control." Any privileged address — even one scoped to blocking new agreements only — is a piece of trust infrastructure someone has to hold a key for, secure, and be trusted not to misuse or lose, for a benefit (stopping new demo agreements slightly faster than just telling people to stop using the old deployment) that isn't worth the centralization cost at this stage. If a critical bug is found, the mitigation is entirely social/off-chain: stop pointing any frontend or documentation at the affected deployment, and deploy a corrected contract for new agreements. Existing agreements on the old deployment keep running to completion under their own timeouts and arbiters regardless — nothing about removing the pause capability changes that.

---

## 11. Invariants and threat model

### Invariants (contract must never violate)
- `D == T + Ld + locked + W` per agreement, at all times, including mid-transaction.
- No single unit of a given agreement's deposit is ever counted in more than one of `{T, Ld, locked}` simultaneously — i.e. the buckets are a strict partition, not overlapping claims on the same tokens. (This is the correct reading of "funds may never become simultaneously withdrawable by both parties": it governs double-counting of the *same* tokens, not whether both parties may have some nonzero balance at once — they routinely will, e.g. right after a partial claim.)
- `resolveDispute(X)`: `0 <= X <= disputedAmount` always.
- Cumulative `Ld` for an agreement can never exceed the `claimedAmount` in effect at the time each increment happened (and, since amendment is non-increasing, never exceeds the *original* submitted claim either).
- `landlord != tenant != arbiter != landlord` at all times an arbiter is attached (creation and every replacement).
- One agreement's functions only ever read/write that agreement's own struct (plus the token contract, plus its own arbiter-replacement sub-fields) — never another agreement's storage, never a global pooled balance.
- `phase` only moves forward through the graph in §3; no function can move an agreement backward or skip a required step (e.g. no path funds an agreement without a prior `acceptArbiterRole`).
- At most one successful `amendClaim` call per agreement, ever (`claimAmended` is set-once).
- `responseDeadline` and `arbiterRulingDeadline`, once set, are never modified by any subsequent call, including amendment and arbiter replacement — they are write-once fields in practice, not just in intent.
- No function is callable by a deployer, owner, or any other privileged address — there is no such address anywhere in the contract (decision 7).

### Threat model
| Threat | Mitigation | Residual risk |
|---|---|---|
| Reentrancy during funding, reserve transfer, or `withdraw` | Pull-payment withdrawals; all public lifecycle mutations share one `nonReentrant` guard; the shared funding path records effects before token and reserve calls; balance-delta checks cover incoming deposit/reserve transfers | Low |
| Malicious/inflated landlord claim | Itemized documentation, shared response record, amend-only-downward; optional arbiter-backed agreements add dispute review | A no-arbiter agreement does not prevent a landlord from receiving an improper documented claim; legal remedies remain outside the prototype |
| Unresponsive tenant | `finalizeNoResponse` records non-response; no-arbiter agreements settle the documented claim, while arbiter-backed agreements move it to dispute | The no-arbiter outcome is deterministic but does not decide legal validity |
| Unresponsive/malicious arbiter | Timeout defaults disputed funds to tenant; mutual-consent replacement path | A colluding arbiter can still rule wrongly *within* their ruling period — there is no appeal in this MVP. This is the single biggest trust dependency in the system and is inherent to the "mutually accepted arbiter, no decentralized arbitration" scope decision, not a bug to fix here. |
| Front-running / MEV on deadline-crossing calls (`finalizeNoResponse`, `claimArbiterTimeout`, `withdrawNoClaim`) | All are permissionless and produce the same deterministic outcome regardless of who calls them or when after the deadline — nothing to extract | None |
| Integer over/underflow | Solidity ^0.8 checked arithmetic; explicit bound checks on all user-supplied amounts | Low |
| Non-standard token behavior | Fixed to a single known Base Sepolia test USDC address; SafeERC20 | Low (test token; real USDC is well-behaved anyway) |
| Amendment-based griefing (resetting `responseDeadline` to stall the tenant) | Eliminated structurally: at most one amendment, and it never touches `responseDeadline` (decision 2) | None |
| Replacement-based griefing (extending `arbiterRulingDeadline` via arbiter swaps) | Eliminated structurally: `arbiterRulingDeadline` is fixed at dispute creation and never touched by replacement (decision 5) | None |
| Duplicate/replay of role addresses (landlord acting as tenant's arbiter, etc.) | Disjointness checks at creation and replacement | Low |
| Sensitive data permanently exposed via onchain evidence | Onchain schema limited to content hash + opaque URI/identifier + type + timestamp + submitter; raw content, names, physical addresses, lease documents, invoices, and photographs are never accepted as onchain fields (decision 6) | The `uri` field is still a public, permanent pointer once emitted in an event/stored onchain — if the *content* at that URI is itself sensitive and unencrypted (e.g. an unencrypted IPFS-hosted photo), it is exposed regardless of what the contract stores. This is a usage/product risk the contract cannot enforce away — the schema only guarantees the *raw sensitive content* is never itself a contract field. See `open-questions.md`. |
| A privileged admin key being compromised, misused, or lost | Eliminated structurally: no admin role exists in the contract at all (decision 7) | None |
| Cross-agreement interference | Per-agreement struct in a mapping; no shared mutable balances | Low, verified by invariant fuzz tests (§13) |

---

## 12. Events and custom errors

Presented as name + parameters (not Solidity syntax — implementation detail for the coding phase).

**Events:** `AgreementProposed(id, landlord, tenant, arbiter, agreedAmount, claimWindowStart, claimPeriod, responsePeriod, arbiterRulingPeriod)` · `ArbiterAccepted(id, arbiter)` · `ArbiterDeclined(id, arbiter)` · `ArbiterRenominated(id, oldArbiter, newArbiter)` · `ProposalCancelled(id)` · `AgreementFunded(id, amount)` · `ClaimSubmitted(id, amount, unclaimedReleased)` · `ClaimAmended(id, newAmount, additionalReleasedToTenant)` · `ClaimRetracted(id)` · `EvidenceSubmitted(id, index, submittedBy, contentHash, evidenceType)` · `ClaimResponded(id, acceptedAmount, disputedAmount)` · `ResponseTimedOut(id, claimedAmount)` · `DisputeCreated(id, disputedAmount, arbiterRulingDeadline)` · `DisputeResolved(id, awardedToLandlord, awardedToTenant)` · `ArbiterTimedOut(id, awardedToTenant)` · `NoClaimWithdrawal(id, amount)` · `ArbiterReplacementProposed(id, proposer, newArbiter)` · `ArbiterReplacementConfirmed(id, confirmer)` · `ArbiterReplacementCancelled(id)` · `ArbiterReplaced(id, oldArbiter, newArbiter)` · `ArbiterResigned(id, arbiter)` · `YieldSettled(id, sharesBurned, testAssetsReceived, landlordPrincipal, tenantAssets, tenantYield)` · `OperationsReserveRefunded(id, recipient, token, amount)` · `Withdrawn(id, party, amount)` · `WithdrawalCompleted(id, party, payoutToken, payoutAmount, reserveToken, reserveAmount)`

No admin/pause events exist (decision 7 — there is nothing to pause).

**Custom errors:** `NotAuthorized()` · `InvalidPhase()` · `AgreementDoesNotExist()` · `ZeroAddress()` · `InvalidRoleAssignment()` · `ZeroDeposit()` · `InvalidPeriod()` · `InvalidClaimWindowStart()` · `DepositMismatch()` · `ClaimWindowNotOpen()` · `ClaimWindowClosed()` · `ClaimWindowStillOpen()` · `InvalidClaimAmount()` · `ClaimAlreadyAmended()` · `AmendmentMustNotIncrease()` · `ResponseWindowClosed()` · `ResponseWindowStillOpen()` · `InvalidResponseAmount()` · `ArbiterRulingWindowClosed()` · `ArbiterRulingWindowStillOpen()` · `InvalidAward()` · `ArbiterHasResigned()` · `ArbiterHasDeclined()` · `NoReplacementPending()` · `ReplacementAlreadyConfirmed()` · `CannotConfirmOwnProposal()` · `NothingToWithdraw()` · `InvalidEvidence()` · `YieldSettlementMismatch()`

Naming convention: "...Closed"/"...StillOpen" pairs are deliberate opposites straddling the same deadline (e.g. `ClaimWindowClosed` on `submitClaim` vs `ClaimWindowStillOpen` on `withdrawNoClaim`), matching the half-open interval convention in §4 — at any given timestamp exactly one side of each pair is true, never both, never neither. Most "double action" cases (double funding, double ruling, double no-claim-withdrawal, etc.) are caught for free by `InvalidPhase()`, since a successful transition always moves `phase` away from the state that made the action valid — no separate one-time-use guard is needed for those. The two genuine exceptions are `claimAmended` (amendment is capped independently of phase, since phase stays `ClaimOpen` across the allowed amendment) and the arbiter-replacement handshake fields (`pendingArbiter`/`pendingArbiterConfirmed`), which are orthogonal to phase by design.

---

## 13. Foundry test matrix

Legend: U = unit, F = fuzz, I = invariant.

| Coverage target | Test type(s) | Notes |
|---|---|---|
| T1–T19 happy path | U | One test per row of §3a |
| T1–T19 wrong caller | U | Every authorization in §3a's "Caller" column, negative-tested |
| T1–T19 wrong phase | U | Calling each function from every *other* phase reverts `InvalidPhase` |
| Deadline boundaries (§4) | U + F | Exact-second boundary tests at `deadline-1`, `deadline`, `deadline+1` for every deadline; fuzz `now` across a wide range to confirm the half-open convention holds |
| §5 claim amount bounds | U + F | `C == 0` reverts on submit; `C > D` reverts; fuzz `C` in `[1, D]` succeeds; fuzz amendment `newC > C` reverts, `newC <= C` succeeds |
| §5 amendment cap | U | A second `amendClaim` attempt (any amount) reverts `ClaimAlreadyAmended`; confirm `responseDeadline` is bit-for-bit unchanged before vs. after the one permitted amendment |
| §5 late claim | U | `submitClaim` at `claimSubmissionDeadline` and after reverts |
| §6 respond bounds | U + F | Fuzz `A` in `[0, C]` succeeds and produces correct `Ld`/`disputedAmount` split; `A > C` reverts |
| §6 non-response modes | U | No arbiter: no response records `ResponseTimedOut(C)` and settles the documented claim; arbiter: no response opens a dispute. Neither path records silence as tenant approval. |
| §7/§9 accounting table | U + F | For every transition row, assert exact `ΔT/ΔLd/Δlocked/ΔW` for both boundary and fuzzed amounts |
| §9 per-agreement invariant | I | Plain agreements preserve `D == T + Ld + locked + W`; focused yield suites preserve share conservation before settlement and `S == T + Ld + W` afterward, with `Ld` bounded by principal. |
| §9 contract-wide invariant | I | The combined allowlisted test-token balances cover all live liabilities across concurrently-open agreements; direct token donations remain harmless excess. |
| §11 cross-agreement isolation | F + I | Randomized interleaved actions across ≥3 concurrently open agreements; assert agreement B's state/balances never change from any action on agreement A |
| §11 arbiter award bound | F | Fuzz `resolveDispute(X)` with `X > disputedAmount` reverts; `X` at exactly `disputedAmount` and `0` both succeed |
| §11 landlord-receives-≤-claim | F | Across randomized amend/respond/resolve sequences, assert cumulative `Ld` never exceeds original submitted `C` |
| §8 arbiter lifecycle | U | Accept/decline/renominate pre-funding, including persistent decline and repeat-action guards; propose/confirm/cancel/accept replacement post-funding, including terminal-state cleanup, "old arbiter still valid mid-replacement," and "`arbiterRulingDeadline` is bit-for-bit unchanged by a replacement that happens while `Disputed`" |
| §8 arbiter timeout | U + F | Fuzz time past `arbiterRulingDeadline`; confirm full `locked` goes to tenant; confirm `resolveDispute` reverts after timeout is claimable |
| §8 resignation blocks ruling | U | `resolveDispute` reverts `ArbiterHasResigned` after `resignAsArbiter`, until replaced |
| §10 no admin | U | No function reverts with an authorization error for a "deployer"/"owner" concept because no such role exists; the contract has no constructor argument, storage slot, or function gated to any address other than a specific agreement's landlord/tenant/arbiter |
| Reentrancy | U | Malicious ERC20 mock (reentering on `transfer`/`transferFrom`) attempts same-function reentry on funding/withdrawal and cross-function lifecycle mutation during funding; every attempt must revert atomically |
| Token edge cases | U | `depositAmount` = 1 (dust); very large `depositAmount` near `type(uint256).max` guarded by realistic USDC supply assumptions |
| Gas sanity | U (gas-report) | Not a correctness test, but track gas per action to catch accidental storage-layout regressions |

---

## 14. Minimal frontend journey

1. **Connect wallet.** Detect/prompt switch to Base Sepolia.
2. **Landlord: create agreement.** Form for tenant names/emails, deposit ownership percentages
   (even by default), property, deposit amount, token, and jurisdiction timing. Every tenant must
   approve the saved offchain revision before the landlord finalizes it onchain.
3. **Optional arbiter (shelved in the pilot UI).** The underlying accept/decline and replacement
   flow remains implemented, but new tenant/landlord-only pilot proposals omit an arbiter.
4. **Each tenant: review and fund.** Every tenant approves only their exact onchain deposit portion,
   pays an equal share of the separately disclosed operations reserve, and calls
   `fundTenantShareWithReserve` once so both transfers succeed or revert together. The dashboard
   shows partial progress until the agreed deposit total is received.
5. **Agreement dashboard** (all parties). Current phase, countdown to the next relevant deadline, deposit amount, claimed amount if any, evidence link, withdrawable balance for the connected address with a withdraw button.
6. **Landlord: submit/amend claim.** Amount + a content hash and a privacy-safe pointer/URI (evidence content itself is uploaded off-chain, e.g. to IPFS via a pinning service, with a clear warning that public IPFS is not private). Once amended, the amendment control disappears — only one is ever allowed, and the response deadline shown to the landlord does not move when they use it.
7. **Tenant: respond to claim.** Accept in full, accept a partial amount with the rest disputed, or dispute in full — one slider/input driving `respondToClaim(A)`.
8. **Arbiter: rule on dispute.** View both parties' evidence URIs and claimed/disputed amounts; input an award amount; submit `resolveDispute`.
9. **Anyone: trigger timeout transitions.** Buttons for `withdrawNoClaim`, `finalizeNoResponse`, `claimArbiterTimeout` become active (and highlighted) only once their respective deadline has passed — since nothing executes automatically (§4), the UI's job is to make it obvious when someone needs to click.

---

## 15. Unresolved decisions

The eight decisions logged at the top of this document are approved and implemented. What remains open is entirely in category A of [`open-questions.md`](./open-questions.md) — the jurisdiction-specific legal questions the contract deliberately does not attempt to answer: what legally starts the claim period, who may initiate move-out, required claim/response periods, permitted deduction categories, evidence/itemization sufficiency, and arbiter authority/enforceability. None of these are blockers for a testnet/demo deployment; all of them are blockers for any deployment touching real deposits.
