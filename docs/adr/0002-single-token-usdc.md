# ADR-0002: Single hardcoded token (test USDC, Base Sepolia), no generic ERC20 support

## Status
Accepted for MVP (Base Sepolia, testnet/demo). Implemented as `contracts/OpenEscrow.sol`: `TOKEN` is an `immutable IERC20` set once in the constructor, with no setter anywhere.

**Addendum (2026-07-23):** funding additionally uses a balance-delta check (record `TOKEN.balanceOf(address(this))` before and after `safeTransferFrom`, and revert if the actual delta doesn't match the agreed amount) rather than trusting the transfer to have moved exactly the requested amount. This was approved as a defensive measure even though the pinned test-USDC token is assumed well-behaved — it costs one extra `balanceOf` call and closes off an entire class of accounting-mismatch bugs if that assumption ever turns out to be wrong (e.g. a future redeploy accidentally pointed at a fee-on-transfer or rebasing token).

## Context
The README and technical-overview describe eventual support for native ETH plus multiple stablecoins (WYST, USDC, USDY) with DEX/CEX swap prompts for users without the target token. None of that is implemented in the current contracts, which only accept native ETH. The MVP scope explicitly restricts to "test USDC only."

Options considered:
1. **Native ETH**, as the current contracts do.
2. **Generic ERC20**, with a `token` address passed per-agreement at `createAgreement`.
3. **One hardcoded token address**, set immutably at contract deployment, used by every agreement.

## Decision
Use option 3: deploy the contract once per environment with an immutable `TOKEN` address pointing at a specific Base Sepolia test USDC contract. No per-agreement token choice, no native ETH path.

## Rationale
- The MVP scope statement is explicit: "test USDC only." Options 1 and 2 both do more than that scope asks for.
- A single known token means the contract can rely on a specific, tested decimals value (6) and known transfer semantics, rather than defensively handling arbitrary ERC20 behavior (fee-on-transfer tokens, non-standard return values, rebasing, etc.) that a generic `token` parameter would expose it to. That defensive coding is real engineering effort the MVP doesn't need to spend yet.
- Native ETH support would require a second code path (payable functions, no `approve`/`transferFrom` step) diverging from the ERC20 path throughout the claim/dispute/withdraw logic — effectively doubling the surface area for no MVP benefit.
- All amounts spec-wide (deposit, claimed, accepted, disputed, awarded) are defined in raw USDC base units. Locking this in now avoids ambiguity in the accounting invariants (spec §9) that a variable-decimals multi-token design would introduce.

## Consequences
- Every future token (WYST, USDY, real USDC on a different chain, native ETH) requires either a new contract deployment or a genuine redesign of this ADR's decision — this is a deliberate deferral, not an oversight.
- The frontend does not need any token-selection UI, swap prompts, or balance-checking-across-tokens logic for MVP — one "you need test USDC on Base Sepolia" onboarding path plus a faucet link is sufficient.
- If/when multi-token support is added, revisit ADR-0001 at the same time: a generic-ERC20, multi-token version of this contract may change the calculus on shared-contract-vs-factory, since per-token accounting and per-token pause/circuit-breaker needs become more relevant.
- The specific test USDC contract address on Base Sepolia must be pinned in deployment config and documented in the repo's deployment notes; it is out of scope for this ADR to name it, since testnet token addresses can change.
