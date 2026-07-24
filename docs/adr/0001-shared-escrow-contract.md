# ADR-0001: One shared escrow contract, not a factory or vault-per-agreement

## Status
Accepted for MVP (Base Sepolia, testnet/demo). Implemented as `contracts/OpenEscrow.sol`.

**Addendum (2026-07-23):** the MVP was additionally approved to ship with **no administrator role at all** (see `mvp-spec.md` §10, decision 7) — not even the creation-only pause originally floated in this ADR's "Consequences" section below. This strengthens, rather than changes, the decision here: with zero privileged addresses in the contract, there is no admin-bug surface to worry about containing per-agreement in the first place, which removes what would have been the main argument for preferring per-agreement isolation (option 2) at this stage. The invariant-fuzz-testing mitigation described below still stands as the primary correctness safeguard.

## Context
The existing repo has an `EscrowFactory` that deploys a brand-new `OpenEscrowCore` contract per `createEscrow()` call, while `OpenEscrowCore` itself already supports multiple agreements internally via an `agreements` mapping keyed by an auto-incrementing ID. These two patterns are redundant with each other, and the existing tests exercise the mapping-based core directly, bypassing the factory entirely — the two pieces of the codebase disagree about which pattern is authoritative.

Three options were considered for the MVP:
1. **Vault-per-agreement, full contract deploy** (current factory behavior): each agreement gets its own `OpenEscrowCore` instance.
2. **Vault-per-agreement, minimal proxy (EIP-1167) clones**: cheaper than (1), still one deployed address per agreement.
3. **One shared contract, all agreements as entries in a mapping**: a single deployed address; agreements are structs keyed by ID, isolated only by the correctness of the contract's own logic, not by address separation.

## Decision
Use option 3: a single shared contract holding all agreements in a `mapping(uint256 => Agreement)`.

## Rationale
- The MVP is explicitly testnet/demo scope with a small number of agreements — the gas savings from cloning don't matter yet, and the isolation benefits of separate addresses matter less when nothing here custodies real funds.
- One contract is one thing to read, test, and (eventually) audit. Options 1 and 2 both require reasoning about a factory *and* a template contract *and* the interaction between them; option 3 requires reasoning about one contract and one invariant ("agreement isolation," §11 of the spec), which is directly testable with Foundry invariant/fuzz tests across many concurrently open agreements.
- No upgradeability is in scope for this MVP (explicit non-goal). If a bug is found, the fix is a new deployment regardless of which pattern is used — vault-per-agreement doesn't give us an upgrade path here, so it buys nothing on that axis.
- Per-agreement isolation ("one agreement's actions must never affect another") is preserved by construction as long as every function only reads/writes its own agreement's struct fields plus the shared token contract — this is a code-review/test property, not something that requires separate deployed addresses to guarantee.

## Consequences
- All agreements share one token balance in aggregate; the contract-wide solvency invariant `USDC.balanceOf(contract) >= Σ(T_i + Ld_i + locked_i)` (spec §9) becomes the load-bearing safety property and must be invariant-fuzz-tested, not just unit-tested per agreement. The inequality permits harmless direct token donations, which the contract cannot prevent or assign to an agreement.
- A single contract-level bug affects every open agreement simultaneously, rather than being contained to one deployment. Given no admin fund-recovery powers are planned (spec §10) and no upgradeability, this raises the bar on pre-deploy testing (§13's invariant suite) as the primary mitigation, rather than relying on blast-radius containment.
- Revisit this decision before any mainnet/real-funds deployment — at that point, per-agreement isolation via separate addresses (option 2, minimal proxies) becomes more attractive precisely because the blast radius of a single bug becomes a real financial concern rather than a testnet inconvenience.
- The existing `EscrowFactory.sol` should be removed or repurposed (e.g. as a thin registry/indexer emitting no funds-relevant logic) rather than left as a second, unused code path.
