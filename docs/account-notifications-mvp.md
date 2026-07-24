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
- Agreement-activity and deadline-reminder preferences are collected per authenticated user.

The preference values are currently device-local. No email is sent yet, and the interface says so
explicitly.

The proposal form now collects landlord, tenant, and arbiter email identities before wallet
addresses. The landlord is the signed-in account. Tenant and arbiter wallet addresses remain a
temporary explicit resolution step until the invitation service and durable account registry are
online.

## Configuration

1. Create a Privy application.
2. Enable Google and wallet login methods.
3. Add the local and production OpenEscrow origins to the app's allowed origins.
4. Put the public Privy app ID in `frontend/.env.local` as `VITE_PRIVY_APP_ID`.
5. Build and test Google login, embedded wallet creation, external wallet linking, wallet switching,
   sign-out, and sign-in recovery before enabling the value in production.
6. Enable native gas sponsorship for Base Sepolia. The test-USDC claim uses Privy's sponsored
   transaction path so first-time embedded-wallet users do not need Base Sepolia ETH.

The app ID is a public browser identifier, not a server secret. Any future Privy app secret,
webhook signing secret, or email-provider API key must remain server-side.

## Notification delivery phase

Email delivery needs a server-side service; it must not be implemented by putting an email API key
in this Vite client. The minimum credible service should:

1. Persist the Privy user ID, verified email, linked wallet addresses, consent state, and consent
   timestamp in a server-side database.
2. Verify Privy access tokens before accepting profile or preference changes.
3. Index OpenEscrow events from the configured deployment block and map affected wallet addresses
   to opted-in accounts.
4. Send idempotent messages for invitations, funding, claims, responses, rulings, and withdrawals.
5. Run scheduled deadline checks with a durable record preventing duplicate reminders.
6. Include unsubscribe and preference-management links and honor changes immediately.
7. Avoid putting evidence URIs, tenancy details, or unnecessary wallet data in email.
8. Monitor failed deliveries, chain reorganizations, RPC outages, and delayed event processing.

Before real participants are invited, counsel and the pilot partner must approve consent language,
retention, deletion, access controls, incident response, and the legal status of email notices.

## Funding abstraction phases

1. Testnet MVP: sponsor the transaction that mints freely available testUSDC to the active wallet.
2. Pilot: add rate limits and abuse controls around test funding and monitor sponsorship spend.
3. Later production phase: integrate a compliant fiat onramp that can deliver supported USDC to the
   tenant's resolved wallet, then guide the tenant through approval and escrow funding. Provider
   availability, fees, KYC, geography, refunds, and custody boundaries must be reviewed before this
   is presented as an abstracted security-deposit payment.
