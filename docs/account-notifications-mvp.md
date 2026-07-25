# Account, wallet abstraction, and notifications MVP

This document describes the first account layer for the Base Sepolia demonstration. It is not a
production identity, custody, privacy, or communications design.

## Implemented foundation

- Google and external EVM wallet sign-in are handled by Privy when `VITE_PRIVY_APP_ID` is set.
- A Google user without a wallet receives a client-side embedded EVM wallet automatically.
- A user can link additional external EVM wallets and select the active wallet used by wagmi.
- Installed EVM wallets, including Rabby, are detected; WalletConnect provides a searchable
  fallback when an extension is not available.
- The existing injected-wallet flow remains available when Privy is not configured.
- A verified Google/email identity is displayed in the account panel.
- Privy identity tokens are verified against the app's public JWKS before proposals are discovered
  by landlord, tenant, or arbiter email across browser sessions.
- Agreement-activity and deadline-reminder preferences are collected per authenticated user.
- Notification preferences and their consent timestamp are persisted against the verified Privy
  account, with device-local storage retained only as an offline fallback.

Invitation and deduction-claim email delivery is available when the server-side email provider is
configured; Gmail and copy-email fallbacks remain available without it. Repeated identical claim
notices are deduplicated before provider delivery. Automated event indexing, deadline reminders,
and unsubscribe handling are still future work.

The proposal form collects landlord, tenant, and optional arbiter email identities. The landlord is
the signed-in account. Tenant and arbiter wallet addresses are recorded when the invited parties
approve the current proposal revision.

## Configuration

1. Create a Privy application.
2. Enable Google and wallet login methods.
3. Add the local and production OpenEscrow origins to the app's allowed origins.
4. Put the public Privy app ID in `frontend/.env.local` as `VITE_PRIVY_APP_ID`.
5. Enable **Return user data in an identity token** under Authentication > Advanced. The worker
   validates those ES256 tokens against Privy's public JWKS endpoint; no app secret is placed in the
   browser.
6. Build and test Google login, embedded wallet creation, external wallet linking, wallet switching,
   sign-out, and sign-in recovery before enabling the value in production.
7. Enable native gas sponsorship for Base Sepolia. The test-token faucet, approval, and escrow
   funding calls use Privy's sponsored transaction path so embedded-wallet users do not need Base
   Sepolia ETH.

The app ID is a public browser identifier, not a server secret. Any future Privy app secret,
webhook signing secret, or email-provider API key must remain server-side.

## Notification delivery phase

Email delivery needs a server-side service; it must not be implemented by putting an email API key
in this Vite client. The minimum credible service should:

1. Index OpenEscrow events from the configured deployment block and map affected wallet addresses
   to opted-in accounts.
2. Extend idempotent delivery beyond invitations and claims to funding, responses, rulings, and
   withdrawals.
3. Run scheduled deadline checks with a durable record preventing duplicate reminders.
4. Include unsubscribe links in messages; authenticated in-app preference changes are already
   honored immediately.
5. Avoid putting evidence URIs, tenancy details, or unnecessary wallet data in email.
6. Monitor failed deliveries, chain reorganizations, RPC outages, and delayed event processing.

Before real participants are invited, counsel and the pilot partner must approve consent language,
retention, deletion, access controls, incident response, and the legal status of email notices.

## Funding abstraction phases

1. Testnet MVP: sponsor the transaction that mints freely available testUSDC to the active wallet.
2. Pilot: add rate limits and abuse controls around test funding and monitor sponsorship spend.
3. Later production phase: integrate a compliant fiat onramp that can deliver supported USDC to the
   tenant's resolved wallet, then guide the tenant through approval and escrow funding. Provider
   availability, fees, KYC, geography, refunds, and custody boundaries must be reviewed before this
   is presented as an abstracted security-deposit payment.
