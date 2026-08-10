# OpenEscrow frontend (Base Sepolia demo)

React + wagmi/viem frontend implementing the user journey in `docs/mvp-spec.md` §14. Contract
custody talks directly to Base Sepolia. A small hosted worker persists proposal negotiations,
role-scoped account discovery, notification preferences, delivery receipts, and private evidence
metadata; the small testnet deployment uses bounded client-side agreement enumeration as an
onchain recovery path.

Canonical testnet app: https://openescrow.io

Canonical walkthrough: https://openescrow.io/demo

The working tree also contains a public `/funding` transparency route. Its typed source is
`src/lib/fundingTransparency.ts`; the default `openingBalanceConfirmed: false` state intentionally
publishes no balance or ledger rows until the owner verifies an opening date, recipient and every
public record. The route is local and undeployed until an owner-approved release proves otherwise.

Do not promote or link users to operational rollback origins. Their purpose and restrictions are
documented in `../docs/cloudflare-landing-and-mvp-plan.md`.

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
faucet: plain testUSDC or taUSDC shares. Both are freely mintable and worthless. The taUSDC display
value grows from each agreement's funding time at 1% per hour and stops at 5%, solely so short
usability tests can observe yield movement without a deployment-age balance running away; it has no
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
the notification bell includes role-scoped agreement deadlines and wallet-scoped Base Sepolia
registry receipts and keeps read state locally per account.

Agreement discovery has two paths: the signed-in account loads role-scoped records from D1, while
the connected-wallet recovery path enumerates the contract's bounded current agreement IDs and
checks the current landlord, arbiter, and tenant share directly (see
`src/lib/agreementDiscovery.ts`). Manual add-by-id and shared `?id=` links remain available. This
avoids a nearly thousand-request historical log walk on today's deployment and uses two public
Base Sepolia providers with failover. Separately, the hosted Worker indexes confirmed lifecycle
events from the active deployment for D1 reconciliation and notification delivery; it binds only
to an existing unique finalized record and never infers account ownership from a wallet address.

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

Not implemented: production evidence retention controls or a fiat-to-USDC security-deposit
onramp. See `../docs/open-questions.md` for the non-UI
(legal/product) gaps.
