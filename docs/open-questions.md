# OpenEscrow MVP — Unresolved decisions

Companion to [`mvp-spec.md`](./mvp-spec.md). Category A below needs **legal review** because the contract encodes an assumption about real-world rules it has no way to actually enforce or verify — none of it is resolved by engineering and all of it remains open. Category B was a list of product/engineering decisions made by default; as of 2026-07-23 all of them have been explicitly reviewed and approved (see the decision log at the top of `mvp-spec.md`), so they're kept here only as a record of what was decided and why, not as open items.

This contract cannot know or enforce anything about real tenancy law. Every item below is a place where the MVP either hardcodes a specific behavior as a stand-in, or explicitly declines to model something. None of it should be read as "solved" — it's "scoped out and named," which is different.

## A. Requires legal review before any non-testnet use

1. **What legally starts the move-out and claim period.** The MVP uses a single fixed timestamp (`claimWindowStart`) chosen by the landlord at proposal and implicitly accepted by the tenant at funding. Real security-deposit law typically ties the claim-period start to an actual event (move-out date, key return, lease termination) that the contract has no way to observe or verify. If the real move-out date differs from the pre-agreed `claimWindowStart` (early move-out, holdover tenancy, eviction, lease renewal), this contract's timeline and the legally operative timeline will diverge, and the contract will not know.

2. **Who may initiate move-out.** Not modeled at all — there is no on-chain "move-out" event, only the fixed date above. If your jurisdiction/product requires either party to be able to trigger or confirm move-out (rather than a date fixed weeks or months in advance), this is a design gap, not an oversight to patch later — it changes the state machine.

3. **Required claim and response periods.** `claimPeriod`, `responsePeriod`, and `arbiterRulingPeriod` are landlord-set, bounded only by MVP sanity constants (proposed: 5 minutes to 365 days), with no jurisdiction-specific minimums or maximums enforced. Many jurisdictions mandate specific windows (e.g. 14, 21, 30, 60 days) for a landlord to return or account for a deposit. The contract does not know or enforce your jurisdiction's number.

4. **Permitted deduction categories.** The contract has no concept of what a claim is *for* — `claimedAmount` and `evidenceURI` are unstructured. Legitimate deduction categories (unpaid rent, damage beyond normal wear, cleaning) versus impermissible ones are entirely a matter for the arbiter's off-chain judgment. There is no on-chain guardrail preventing a claim for something a court would reject outright.

5. **Evidence and itemization requirements.** One `evidenceURI` per claim (overwritten on amendment, full history preserved only in event logs). No structured itemization (list of specific damages with individual costs), no minimum evidence requirement enforced by the contract. Whether this is sufficient for a claim to be taken seriously — by the arbiter, or later by a court — is outside the contract's scope.

6. **Arbiter authority and enforceability.** The "arbiter" here is a wallet address the two parties pick; nothing establishes them as a licensed mediator, arbitrator, or any legally recognized dispute-resolution role. Their ruling is enforced *only* to the extent it moves tokens already in the contract — it carries no independent legal weight, isn't binding outside the contract, and there's no vetting of who's allowed to serve as one. If the product intends for arbiter rulings to be legally meaningful (e.g. admissible, or a substitute for small-claims proceedings), that requires a real legal/process framework this spec does not attempt to provide.

7. **Rules for abandoned or unavailable arbiters.** The MVP default (spec §8) is: if the arbiter doesn't rule within `arbiterRulingDeadline`, the entire disputed amount goes to the tenant. This is a strong, tenant-favoring default with no nuance (no partial-fault split, no extension request, no escalation). Confirm this is the intended policy rather than an engineering convenience — see item B4 below, which covers the same question from the product-decision angle.

## B. Product/engineering decisions — approved 2026-07-23

1. **Tenant non-response defaults to full dispute, not acceptance** (spec §6). Chosen because it matches the project's "burden of proof on the claimant" philosophy and because auto-accepting a claim on tenant inaction is exactly the failure mode flagged in the earlier feasibility review of the original design (non-blocking disputes). Approved as-is: every unresponsive-tenant claim requires the arbiter to actually engage, even when the claim is legitimate and the tenant just never opened the notification — that friction is accepted as the cost of never auto-paying the landlord from tenant silence.

2. **Amend-only-downward, capped at exactly one amendment, deadline never resets.** *Revised from the original draft*, which had capped amendments at 3 and reset `responseDeadline` on each one. The approved version is stricter on both axes: at most one amendment ever, and it can never touch the response deadline in either direction. This fully (not just partially) eliminates the amendment-based griefing vector described in the original draft, at the cost of landlords having a single, non-extendable chance to revise a claim.

3. **Acceptance and funding are one atomic action** (`tenantAcceptAndFund`, spec §3/§6), not two separate steps. Approved as-is. Off-chain negotiation and terms review happen before `createAgreement`; once the tenant funds, there is no separate prior "I agree to these terms but haven't paid yet" state.

4. **Arbiter-timeout default favors the tenant fully** (spec §8). Approved as-is, for consistency with the "deposit is tenant's property unless proven otherwise" framing. This remains the single most consequential default value in the spec — worth re-confirming again specifically if the product's target users or market ever shift away from being explicitly tenant-protective.

5. **No admin role of any kind** (spec §10). *Revised from the original draft*, which proposed a deployer-gated `pauseNewAgreements()` circuit breaker. That proposal is withdrawn — the approved contract has zero privileged addresses, full stop. Revisit only if a future non-MVP version needs an incident-response mechanism; that would be a deliberate re-introduction of centralization, not a default to fall back on.

6. **Onchain evidence limited to hash + opaque pointer + type + timestamp + submitter, no raw content** (spec §2, §9, decision 6). Approved as-is. This bounds what the *contract* can leak, but does not and cannot prevent someone from publishing sensitive unencrypted content at the URI a hash points to — that remains a usage risk, not something enforceable in Solidity. Any production frontend must make the "public IPFS is not private" warning impossible to miss before a user uploads anything.

7. **No on-chain negotiation.** The landlord sets every term; the tenant's only on-chain choice is fund-as-proposed or don't. Approved as-is, unchanged from the original draft.

8. **Role identity is wallet-address-only, no KYC/verification of any kind.** Approved as-is for testnet/demo scope, unchanged from the original draft. A production version holding real deposits will need to decide how much (if any) identity binding matters, especially for the arbiter role given item A6 above.
