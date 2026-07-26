# ADR-0003: Fixed-share yield adapter and USDC settlement accounting

## Status

Prototype and Base Sepolia Aave StataToken adapter implemented locally for post-MVP evaluation.
The interface, allocation library, isolated `YieldEscrowV2Prototype`, adapter, and tests are not
wired into or deployed with the current OpenEscrow contract.

## Context

The Base Sepolia demo represents `ytUSDC` as fixed shares whose displayed value increases. A production Aave position behaves differently: a supplied USDC position accrues value through protocol accounting, and a directly held rebasing receipt balance cannot safely replace the fixed token in the current shared escrow.

The deployed contract stores one fixed `depositAmount` per agreement and relies on:

`depositAmount == tenantWithdrawable + landlordWithdrawable + locked + withdrawn`

If a shared contract held a rebasing receipt token directly, its aggregate balance could grow without a deterministic per-agreement share ledger. If it treated the increased balance as principal, landlord claims could also receive yield that the product promises to tenants.

## Decision

The next yield-enabled escrow design will:

1. Accept and settle claims in USDC base units.
2. Route yield strategies through `IDepositAssetAdapter`.
3. Require the adapter's receipt asset to use fixed, non-rebasing shares.
4. Track receipt shares per agreement, never just a pooled token balance.
5. Redeem an agreement's entire share position to USDC before final claim distribution.
6. Use the escrow's observed USDC balance delta as the authoritative redemption result.
7. Keep landlord awards principal-denominated.
8. Allocate all positive yield to the tenant.
9. Allocate a principal shortfall pro rata between the final principal beneficiaries, with any integer rounding remainder assigned to the tenant.

The pure `YieldEscrowAccounting.allocate` function records this proposed distribution rule:

- If redemption is at or above principal, the landlord receives exactly the principal award and the tenant receives the remaining principal plus all yield.
- If redemption is below principal, the available USDC is divided pro rata according to the landlord and tenant principal allocations.
- The landlord allocation plus tenant allocation must always equal the actual USDC received.

## Lifecycle boundary

Yield must stop before final claim distribution mutates fixed USDC balances. Strategy redemption
and claim review are independent so an unavailable adapter cannot prevent a landlord from preserving
a claim within the fixed submission deadline. The V2 transition is:

1. Fund: collect each tenant's approved principal share as USDC. Invest the combined principal only
   after every tenant has funded, then assign the fixed receipt shares to the agreement.
2. Accrue: leave those shares invested through the deposit period.
3. Open claims: at the fixed settlement time, allow the landlord to submit a principal-denominated
   claim even if strategy redemption has not completed.
4. Settle strategy: permissionlessly redeem all agreement shares to USDC once and record the actual
   balance delta. This may occur before, during, or after claim review.
5. Resolve claims: require every tenant response, send unaccepted amounts to the arbiter, and default
   unproven disputed principal to tenants at timeout.
6. Distribute: after both the claim outcome and strategy redemption exist, apply the final principal
   award to actual redeemed USDC using `YieldEscrowAccounting`.

An automation may prompt or submit the settlement transaction, but correctness cannot depend on the web server or a scheduled job. The contract needs an idempotent, permissionless settlement entry point and an explicit state transition.

## Security requirements before integration

- Do not connect the current deployed `OpenEscrow` contract to a real yield token.
- Do not accept arbitrary adapters per agreement. Use an immutable or tightly allowlisted adapter in a new deployment.
- Verify settlement and receipt token addresses, chain ID, and strategy identity in the constructor.
- Reject fee-on-transfer settlement assets by checking actual balance deltas.
- Use a minimum-assets-out parameter for redemption and define who may choose it.
- Prevent deposits after strategy settlement and prevent settlement more than once.
- Account for emergency withdrawal, paused markets, unavailable liquidity, and protocol losses.
- Cap per-agreement and aggregate strategy exposure during the pilot.
- Add reentrancy protection around adapter calls and update state before external calls.
- Obtain an independent smart-contract audit before any real-funds deployment.

## Consequences

- This requires a new escrow deployment; it is not a safe in-place modification of the MVP.
- Existing testnet agreements remain on the current fixed-token contract.
- Yield becomes a clearly separated strategy concern, while claims remain stable USDC accounting.
- A fixed-share wrapper or vault is required when the underlying protocol exposes a rebasing position.
- The loss-allocation rule is now explicit and testable, but it still requires product and legal approval before a real-money pilot.

## Prototype evidence

The isolated prototype now demonstrates:

- tenant funding through an immutable adapter;
- exact refunds while a proposal is only partially funded;
- multi-tenant funding and ownership shares;
- fixed receipt shares attributed per agreement in shared custody;
- permissionless, once-only redemption after a fixed settlement time;
- minimum-assets-out protection;
- validation of adapter return values against actual token balance deltas;
- claim submission that does not depend on adapter availability;
- unanimous multi-tenant response aggregation using the lowest commonly accepted amount;
- downward amendment, retraction, no-response dispute, arbiter ruling, and tenant-favoring timeout;
- claim outcomes held safely until delayed strategy redemption completes;
- pull-based USDC withdrawals; and
- gain, loss, rounding, malicious-reporting, retry, isolation, fuzz, and stateful invariant tests.

The external-protocol adapter spike now pins and verifies the official Aave V3 Base Sepolia USDC
StataToken V2 deployment. Adapter and escrow capacity checks expose paused deposits and unavailable
redemption liquidity as explicit retryable failures. See
[`docs/aave-base-sepolia-adapter.md`](../aave-base-sepolia-adapter.md) for addresses, fork validation,
and residual risks.

The next contract milestone is exposure caps, emergency strategy migration, adapter governance, and
operational monitoring. Evidence manifests, arbiter replacement, and production compliance
integration remain separate required workstreams.

## Deferred decisions

- Production/mainnet Aave market and fixed-share wrapper approval.
- Settlement timing relative to the lease end and statutory claim window.
- Who pays entry/exit gas and any protocol or onramp fees.
- Emergency strategy migration and governance model.
- Whether each agreement uses isolated custody or the shared-contract model is retained.
