# OpenEscrow frontend (Base Sepolia demo)

Minimal React + wagmi/viem frontend implementing the user journey in `docs/mvp-spec.md` §14. Talks
directly to the deployed contracts on Base Sepolia - no backend, no indexer.

## Deployed addresses (Base Sepolia, chain id 84532)

- `OpenEscrow`: `0xFe0270679261cFC546822Cc453C5aD73f29a721C`
- `MockUSDC` (test token, freely mintable): `0xE129b23BD89904D363ba226eE52deC74185D7789`

See `../script/DeployOpenEscrow.s.sol` and `../script/DeployMockUSDC.s.sol` if you need to redeploy;
update `src/contracts/config.ts` with the new addresses afterward.

## Running locally

```bash
npm install
npm run dev
```

Requires an injected wallet (MetaMask etc.) connected to Base Sepolia, and some test USDC. Mint some
to your address with:

```bash
cast send 0xE129b23BD89904D363ba226eE52deC74185D7789 "mint(address,uint256)" <your address> 1000000000 \
  --rpc-url https://sepolia.base.org --private-key <a funded Base Sepolia key>
```

(1000000000 = 1000 USDC, since the token uses 6 decimals.)

## What's here vs. what isn't

Implemented: propose -> arbiter accept/decline -> tenant approve+fund -> claim submit/amend ->
tenant respond (accept/partial/dispute) -> arbiter resolve -> permissionless timeout triggers ->
pull-based withdraw, plus a live deadline countdown and an evidence trail view.

Not implemented (see `../docs/open-questions.md` and the spec for why): an indexer (agreement
discovery is manual, by id, stored per-browser in `localStorage`), the mutual-consent arbiter
replacement flow (contract supports it; no UI yet), and any production-grade wallet UX
(WalletConnect, mobile, etc.) - this is a testnet demo, not a production app.
