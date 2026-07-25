# OpenEscrow frontend (Base Sepolia demo)

Minimal React + wagmi/viem frontend implementing the user journey in `docs/mvp-spec.md` §14. Talks
directly to the deployed contracts on Base Sepolia - no backend server, no persistent indexer
(agreement discovery is a client-side event-log scan, see below).

Public demo: https://openescrow-demo.omrigross.chatgpt.site

## Deployed addresses (Base Sepolia, chain id 84532)

- `OpenEscrow`: see `src/contracts/config.ts` for the active deployment.
- `OperationsReserve` (separate 5 testUSDC pilot service reserve): `0xf0aa0C72d240b86E7AaE328912CF8737069a0f5d`
- `MockUSDC` (test token, freely mintable): `0xE129b23BD89904D363ba226eE52deC74185D7789` (unchanged)
- `MockYieldUSDC` (freely mintable yield-test shares): `0x2746034FF16371A65c133016470f85535992dabC`

See `../script/DeployOpenEscrow.s.sol`, `../script/DeployOperationsReserve.s.sol`, and
`../script/DeployMockUSDC.s.sol` if you need to redeploy;
update `src/contracts/config.ts` (address *and* `DEPLOYMENT_BLOCK`) with the new values afterward.

## Running locally

```bash
npm install
npm run dev
```

Requires an EVM wallet connected to Base Sepolia. Once connected, use either in-app gas-covered
faucet: plain testUSDC or ytUSDC shares. Both are freely mintable and worthless. The ytUSDC display
index grows 20% per day solely so short usability tests can observe yield movement; it has no
underlying asset or redemption.

### Optional account and embedded-wallet setup

Set `VITE_PRIVY_APP_ID` in `.env.local` to enable Google account creation, automatic embedded EVM
wallet creation for Google users without a wallet, and external-wallet linking:

```bash
cp .env.example .env.local
```

Google and wallet login must also be enabled in the Privy dashboard, with the local and production
OpenEscrow origins added to the allowed-origin list. Enable native gas sponsorship for Base Sepolia
and enable **Return user data in an identity token** before using signed-in proposal discovery.
The test-token faucet and embedded-wallet approval/funding flow use sponsored transactions. The
wallet picker detects installed EVM extensions
(including Rabby) and includes the searchable WalletConnect registry as a fallback. When the
variable is absent, the existing injected-wallet connection remains active. See
`../docs/account-notifications-mvp.md` for the implemented boundary and the server-side work still
required before email delivery is active.

Run all frontend checks with:

```bash
npm run check
```

For a live three-wallet test after configuring `.env` and `.env.testroles`:

```bash
npm run e2e:live
```

## What's here vs. what isn't

Implemented: choose plain or yield-test token -> propose with optional arbiter ->
arbiter accept/decline/renominate -> tenant pays the separate operations reserve and funds ->
claim submit/amend ->
tenant respond (accept/partial/dispute) -> arbiter resolve -> permissionless timeout triggers ->
pull-based withdraw, mutual-consent arbiter replacement, plus a live deadline countdown and an
evidence trail view. The optional account layer supports Google authentication, automatically
provisioned embedded EVM wallets, linked external EVM wallets, active-wallet selection, and
device-local notification preferences.

Agreement discovery has two paths: a "Scan for my agreements" button that chunked-scans
`AgreementProposed`/`ArbiterReplaced` event logs for the connected address (see
`src/lib/useDiscoverAgreements.ts`), and manual add-by-id (or a shared `?id=` link) as a fallback.
This is a reasonable trade-off for a testnet demo with a handful of agreements - it is not how a
production version should do discovery at scale (that needs a real indexer/subgraph).

The create form also collects optional jurisdiction context. That value travels in the shared
agreement link and is stored in the browser for display on the dashboard; it is not stored or
validated on-chain and does not change contract behavior. The UI labels it as off-chain research
context because none of the listed jurisdiction profiles have completed legal review.

The proposal form is email-first: the signed-in identity is the landlord, with tenant and arbiter
emails collected as the participant identifiers. The D1 negotiation registry verifies Privy
identity tokens and restores role-scoped proposal access by verified email across browser sessions.
Participant wallet addresses are recorded when the invited parties approve the current revision.

Not implemented: automatic invitation delivery and wallet resolution, a production indexer, or a
fiat-to-USDC security-deposit onramp. See `../docs/open-questions.md` for the non-UI
(legal/product) gaps.
