# OpenEscrow frontend (Base Sepolia demo)

Minimal React + wagmi/viem frontend implementing the user journey in `docs/mvp-spec.md` §14. Talks
directly to the deployed contracts on Base Sepolia - no backend server, no persistent indexer
(agreement discovery is a client-side event-log scan, see below).

Public demo: https://openescrow-demo.omrigross.chatgpt.site

## Deployed addresses (Base Sepolia, chain id 84532)

- `OpenEscrow`: `0x4365f7B9632d083F1a03D57AE56a0e6d239ef62F` (deployed 2026-07-24 after the
  independent review addendum in `../docs/security-review.md`; earlier addresses run superseded
  bytecode and are intentionally retired)
- `MockUSDC` (test token, freely mintable): `0xE129b23BD89904D363ba226eE52deC74185D7789` (unchanged)

See `../script/DeployOpenEscrow.s.sol` and `../script/DeployMockUSDC.s.sol` if you need to redeploy;
update `src/contracts/config.ts` (address *and* `DEPLOYMENT_BLOCK`) with the new values afterward.

## Running locally

```bash
npm install
npm run dev
```

Requires an injected wallet (MetaMask etc.) connected to Base Sepolia. Once connected, use the
in-app **Get 1,000 test USDC** button. The mock token is freely mintable and has no value.

Run all frontend checks with:

```bash
npm run check
```

For a live three-wallet test after configuring `.env` and `.env.testroles`:

```bash
npm run e2e:live
```

## What's here vs. what isn't

Implemented: propose -> arbiter accept/decline/renominate -> tenant approve+fund -> claim submit/amend ->
tenant respond (accept/partial/dispute) -> arbiter resolve -> permissionless timeout triggers ->
pull-based withdraw, mutual-consent arbiter replacement, plus a live deadline countdown and an
evidence trail view.

Agreement discovery has two paths: a "Scan for my agreements" button that chunked-scans
`AgreementProposed`/`ArbiterReplaced` event logs for the connected address (see
`src/lib/useDiscoverAgreements.ts`), and manual add-by-id (or a shared `?id=` link) as a fallback.
This is a reasonable trade-off for a testnet demo with a handful of agreements - it is not how a
production version should do discovery at scale (that needs a real indexer/subgraph).

Not implemented: any production-grade wallet UX (WalletConnect, mobile, etc.) - this is a testnet
demo, not a production app. See `../docs/open-questions.md` for the non-UI (legal/product) gaps.
