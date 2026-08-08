# OpenEscrow frontend (Base Sepolia demo)

React + wagmi/viem frontend implementing the user journey in `docs/mvp-spec.md` §14. Contract
custody talks directly to Base Sepolia. A small hosted worker persists proposal negotiations,
role-scoped account discovery, notification preferences, delivery receipts, and private evidence
metadata; onchain agreement discovery still uses a client-side event-log scan.

Canonical testnet app: https://openescrow.io

Fallback hosts: https://openescrow.omslice.workers.dev and
https://openescrow-demo.omrigross.chatgpt.site

## Deployed addresses (Base Sepolia, chain id 84532)

- `OpenEscrow`: see `src/contracts/config.ts` for the active deployment.
- `OperationsReserve` (separate 5 testUSDC pilot service reserve): `0x5d2E9c429F9d117c7b028c8f0f67d37252aDceC0`
- `AgreementActivityRegistry` (party-authorized record hashes): see
  `src/contracts/config.ts`. The retired `0xC004...1951` registry is bound to an
  earlier escrow release and must not be reused.
- `MockUSDC` (test token, freely mintable): `0xE129b23BD89904D363ba226eE52deC74185D7789` (unchanged)
- `MockYieldUSDC` (freely mintable yield-test shares): `0x2746034FF16371A65c133016470f85535992dabC`

See `../script/DeployOpenEscrow.s.sol`, `../script/DeployOperationsReserve.s.sol`,
`../script/DeployAgreementActivityRegistry.s.sol`, and
`../script/DeployMockUSDC.s.sol` if you need to redeploy;
update `src/contracts/config.ts` (address and matching deployment block) with the new values
afterward. The registry must be freshly deployed for every escrow release; follow
`../docs/agreement-activity-registry-deployment.md`.

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

Implemented: choose plain or yield-test token -> create a multi-tenant proposal with explicit
deposit shares -> every tenant approves -> each tenant pays an equal portion of the separate
operations reserve and funds only their deposit share ->
claim submit/amend ->
tenant respond (accept/partial/dispute) -> arbiter resolve -> permissionless timeout triggers ->
pull-based withdraw, mutual-consent arbiter replacement, plus a live deadline countdown and an
evidence trail view. The optional account layer supports Google authentication, automatically
provisioned embedded EVM wallets, linked external EVM wallets, active-wallet selection, and
server-persisted email notification consent, deadline reminders, unsubscribe links,
party-authorized evidence uploads, and multi-tenant proposal review. Saved proposal activity refreshes automatically, while
the notification bell includes wallet-scoped Base Sepolia registry receipts and keeps read state
locally per wallet.

Agreement discovery has two paths: a "Scan for my agreements" button that takes one chain-head
snapshot, then chunked-scans `AgreementProposed`, `TenantParticipantAdded`, and `ArbiterReplaced`
event logs for the connected address (see `src/lib/agreementDiscovery.ts`), and manual add-by-id
(or a shared `?id=` link) as a fallback. The unfiltered proposal stream is reused for both
landlord and original-arbiter matching, rather than scanning the full proposal history twice.
This is a reasonable trade-off for a testnet demo with a handful of agreements - it is not how a
production version should do discovery at scale (that needs a real indexer/subgraph).

The create form also collects optional jurisdiction context. That value travels in the shared
agreement link and is stored in the browser for display on the dashboard; it is not stored or
validated on-chain and does not change contract behavior. The UI labels it as off-chain research
context because none of the listed jurisdiction profiles have completed legal review.

The proposal form is email-first: the signed-in identity is the landlord, with one or more tenants.
Every tenant must approve the same revision. Deposit percentages default evenly, must total 100%,
and remain editable before finalization; adding, removing, editing, or reallocating tenants resets
all approvals. Each approved wallet funds its exact onchain share and the agreement activates only
after the full amount is received. The optional arbiter workflow remains implemented but is
feature-flagged out of the normal pilot UI. The D1 negotiation registry verifies Privy identity
tokens and restores role-scoped proposal access by verified email across browser sessions.
Its email-led discovery, session cleanup, notification-consent, and finalized-agreement scheduler
queries have migration-backed indexes with checked query plans. A visible account workspace
rechecks membership every five minutes, refreshes saved records every 30 seconds, and limits
record reads to six at a time; larger session sets are written in bounded D1 batches rather than
one remote batch per agreement.
Participant wallet addresses are recorded when the invited parties approve the current revision.

Not implemented: a production onchain event indexer, production evidence retention controls, or a
fiat-to-USDC security-deposit onramp. See `../docs/open-questions.md` for the non-UI
(legal/product) gaps.
