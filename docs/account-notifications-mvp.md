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
- A verified user can end every derived OpenEscrow record session issued to that account and sign
  out the current device without changing agreements, archive preferences, invitation links, or
  another participant's access.
- Agreement-activity and deadline-reminder preferences are collected per authenticated user.
- Notification preferences and their consent timestamp are persisted against the verified Privy
  account, with device-local storage retained only as an offline fallback.

Invitation and deduction-claim email delivery is available when the server-side email provider is
configured; Gmail and copy-email fallbacks remain available without it. Repeated identical claim
notices are deduplicated before provider delivery. Users who explicitly enable agreement-activity
email also receive privacy-minimal notices for finalization, funding, claim amendments, tenant
responses, and arbiter rulings. These messages omit evidence pointers, tenancy details, amounts,
and private notes. The hosted worker also has idempotent reminder checks for the landlord claim
window, tenant response window, and optional arbiter ruling window. Checks run opportunistically
when the app is opened and through a scheduled-worker handler where that trigger is configured.
It sends allocation-ready notices after recorded decisions or refund timeouts. Optional messages include a durable
unsubscribe link that disables activity and deadline email. Contract activity performed outside
the OpenEscrow UI still needs a production event indexer before it can reliably trigger an email.

For transaction-backed proposal actions, the browser keeps a narrowly scoped pending receipt after
the chain confirms but before the D1 activity record succeeds. Finalization, the operations reserve,
record anchors, and privacy-safe activity receipts survive a refresh and can be retried; their
storage keys are scoped to the proposal, role where applicable, and active wallet. Claim, response,
and ruling screens retain a retry during the current session. Server-side transaction actions are
idempotent by transaction hash, preventing a retry from duplicating the event timeline.

The proposal form collects a landlord and one or more tenants. Each tenant receives a separate
role-locked invitation, approves the same revision, and owns an explicit percentage of the deposit.
Shares default evenly, must total exactly 100%, and any tenant or share change creates a new
revision that resets approvals. After finalization, each approved tenant wallet funds only its
onchain share. The agreement remains in a partially funded state until the complete refundable
deposit is received. The separate 5 testUSDC pilot operations reserve is divided equally among
tenant wallets and is never counted as refundable deposit principal. The optional arbiter
implementation remains in the codebase but its normal proposal UI is feature-flagged off for the
tenant/landlord-only pilot.

Supporting PDFs and images default to a private R2 evidence vault when the hosted binding is
available. D1 stores ownership metadata and a SHA-256 receipt; only a valid agreement-party token
can retrieve the bytes. When `EVIDENCE_ENCRYPTION_KEY` is configured, the Worker derives a
different AES-256-GCM key for each file and stores only ciphertext. Experimental
`encrypted-ipfs` mode refuses to upload unless that encryption key and the Pinata adapter are both
configured, then returns an authorized OpenEscrow retrieval link rather than exposing readable
evidence through a public gateway.

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
2. Reconcile indexed events with the current action-triggered and scheduled delivery records.
3. Monitor failed deliveries, chain reorganizations, RPC outages, delayed event processing, and
   evidence-bucket failures.
4. Add retention and deletion controls approved by counsel and the pilot partner.

Before real participants are invited, counsel and the pilot partner must approve consent language,
retention, deletion, access controls, incident response, and the legal status of email notices.

## Funding abstraction phases

1. Testnet MVP: sponsor the transaction that mints freely available testUSDC to the active wallet.
2. Pilot: add rate limits and abuse controls around test funding and monitor sponsorship spend.
3. Sandbox phase: enable the guarded Privy card/bank checkout with supported Base mainnet USDC
   identifiers and verify provider status and balance refresh without representing it as testnet
   escrow funding.
4. Later production phase: deploy reviewed Base mainnet contracts, let a compliant provider deliver
   supported USDC to the tenant's resolved wallet, then guide the tenant through approval and escrow
   funding. Provider availability, fees, KYC, geography, refunds, and custody boundaries must be
   reviewed before this is presented as an abstracted security-deposit payment.

See [`pilot-services-setup.md`](./pilot-services-setup.md) for the current external setup checklist.
