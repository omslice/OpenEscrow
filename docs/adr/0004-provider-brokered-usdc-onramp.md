# ADR-0004: Provider-brokered Base USDC onramp

## Status

Accepted for sandbox implementation. Production remains disabled.

## Context

OpenEscrow needs a funding experience that can support card and bank payment methods without
making OpenEscrow a custodian of payment credentials or fiat. The current application uses Privy
for authenticated embedded wallets and already calls Privy's experimental `useFiatOnramp` hook.
The deposit-asset catalog includes plain USDC, a simulated Aave USDC strategy, FRNT, and a
restricted future USDY option.

An onramp and an asset conversion are separate operations:

1. An onramp converts fiat into an asset in the user's wallet.
2. A strategy adapter may then transform that asset into the agreement's approved escrow asset.

Treating these as one opaque "swap" would hide fees, slippage, eligibility, and settlement risk.
It would also incorrectly imply that a DEX is needed to enter or exit Aave.

## Decision

1. Use Privy's brokered fiat-funding layer for the first sandbox. Privy handles the hosted
   checkout and presents an eligible provider for the user's region rather than OpenEscrow
   hard-wiring Coinbase, MoonPay, or another vendor into the browser.
2. Pin every onramp intent to `usdc` on Base mainnet (`eip155:8453`) and to the user's own wallet.
   Reject token-address destinations, alternate assets, and alternate chains.
3. Keep plain USDC as the only production-mode route represented as ready.
4. Model Aave separately as:

   `USD -> Base USDC in user wallet -> direct Aave supply -> fixed strategy shares in escrow -> direct Aave withdrawal -> USDC settlement`

   The Aave conversion adapter remains disabled in the application even though its isolated Base
   Sepolia prototype exists. There is no DEX swap in this route.
5. Keep FRNT and USDY funding disabled. FRNT needs a reviewed Base-native acquisition/liquidity
   route and audited escrow deployment. USDY is unavailable to U.S. and Canadian persons or
   locations and lacks a Base deployment in the current official materials.
6. Require a second build flag for production onramp activation in addition to the general
   onramp-enabled flag.
7. Keep Base Sepolia funding on free test tokens. A sandbox checkout previews provider UX but
   cannot fund a testnet agreement.
8. Treat submitted, confirmed, or indeterminate checkout outcomes as non-retryable in the active
   screen. Refresh the wallet balance without recording agreement funding; permit an immediate
   new checkout only after an explicit provider cancellation or failure result. This reduces the
   risk of a duplicate purchase while provider settlement is pending or uncertain.
9. Persist a provider-neutral checkout lifecycle in D1 before opening the provider sandbox. The
   tenant-authorized ledger binds the agreement, tenant, route, environment, asset, wallet, and
   amount; accepts only monotonic opening, submission, confirmation, cancellation, failure, and
   refund transitions; and rejects conflicting duplicate events or internally inconsistent
   history. A partial unique index prevents a second active checkout for the same tenant and
   agreement, even if a later browser request supplies a different amount. Optimistic transition
   guards prevent simultaneous provider results from forking the saved lifecycle.
10. Use browser storage only as a best-effort recovery cache. On a later page load or device, the
    authenticated tenant recovers the D1 lifecycle and may reconcile a locally retained provider
    result. An interrupted opening remains locked until its status is resolved.
11. Keep this ledger explicitly sandbox-only. Every event durably records its source and
    verification class. The tenant endpoint ignores any client-supplied provenance and stamps
    checkout-window callbacks as `browser_callback` plus `unverified`; those events never create
    an agreement-funding event and are not evidence that assets reached the wallet or escrow.
    Future production terminal outcomes may unlock balance refresh or retry only when they come
    from a `provider_webhook` plus `provider_signed` event or an
    `operator_reconciliation` plus `operator_verified` event. No current endpoint can mint either
    trusted class, because provider-specific signature verification and operator authorization
    have not been implemented. A trusted event must also carry a SHA-256 reconciliation key and
    exact payload digest. D1 enforces global uniqueness for non-null reconciliation keys so one
    verified external event cannot be applied to two attempts; browser callbacks carry neither
    field.

## Why not choose a single onramp vendor now?

Provider coverage, payment methods, transaction limits, fees, KYC, and approval vary by region and
change over time. Privy's current funding API already abstracts eligible provider selection while
delivering crypto directly to the requested wallet. A direct Coinbase integration remains a
reasonable fallback if provider routing or commercial terms later require it, but it would add a
server-side session-token service, provider webhooks, and another credential boundary before the
pilot needs them.

## Why no general swap service now?

- Plain USDC requires no swap.
- Aave supports direct supply and withdrawal of the underlying asset, subject to protocol
  liquidity.
- FRNT and USDY should not be reached through a DEX as a workaround for issuer, deployment,
  eligibility, or liquidity constraints.
- Cross-chain or alternate-token deposits are outside the current single-chain escrow boundary.

If a later pilot accepts assets other than Base USDC as funding input, select a quote-based
aggregator only after adding exact input/output asset validation, chain validation, quote expiry,
minimum received, slippage caps, fee disclosure, transaction simulation, and receipt reconciliation.

## Release gates

Production remains blocked until all of the following are true:

- audited Base mainnet escrow contracts use supported real USDC;
- provider application approval and KYC/AML/support flows are complete;
- signed provider webhooks feed an idempotent server-side checkout ledger;
- legal review approves the exact funding and optional-yield flow;
- quote, funding, failure, refund, and reconciliation monitoring is operational;
- the production build has both onramp and production-approval flags enabled; and
- a supervised end-to-end pilot passes with separate accounts.

## Official references checked

- [Privy fiat-to-crypto onramps](https://docs.privy.io/wallets/funding/fiat-onramp)
- [Privy funding overview](https://docs.privy.io/wallets/funding/overview)
- [Coinbase Onramp overview](https://docs.cdp.coinbase.com/onramp/introduction/welcome)
- [Coinbase Onramp sandbox testing](https://docs.cdp.coinbase.com/onramp/additional-resources/sandbox-testing)
- [Aave withdrawal behavior and liquidity dependency](https://aave.com/help/supplying/withdraw-tokens)
