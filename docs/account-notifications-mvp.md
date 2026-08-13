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
  by landlord, tenant, or arbiter email across browser sessions. Key responses and token time
  claims are bounded, only ES256 P-256 signing keys are accepted, and repeated verification reuses
  a short-lived shared cache rather than requesting keys for every account action.
- Verified-email discovery uses migration-backed expression indexes for landlord, tenant, original-
  arbiter, and confirmed replacement-arbiter lookup. The replacement path uses indexed candidate
  IDs instead of a cross-table `OR` scan. A 45-agreement regression proves derived sessions are
  created in three bounded D1 batches; the visible workspace rechecks account membership every
  five minutes, refreshes records every 30 seconds, permits at most six record reads at once, and
  retains the matching last-known record through a transient discovery or read failure.
- A verified user can end every derived OpenEscrow record session issued to that account and sign
  out the current device without changing agreements, archive preferences, invitation links, or
  another participant's access. Global local cleanup and provider sign-out are skipped if a
  different account becomes active while revocation is in flight.
- The authenticated workspace is keyed to Privy's stable user id. Selecting a different account
  immediately remounts and clears account-derived proposals, records, archives, panels, and
  discovery state. Device-local tracked agreement ids use an account-scoped recovery key, and
  in-flight discovery, archive, account-inventory, wallet-copy, and embedded-wallet setup
  completions are ignored after an account change. A newly selected account receives a fresh
  wallet-setup attempt instead of inheriting the prior account's pending state. Newly finalized
  proposal ids are persisted through that same account-scoped workspace owner rather than the
  legacy device-wide recovery key. A rendered two-identity regression holds these operations,
  record-session revocation, preference saves, and test-email delivery in flight and verifies that
  stale work cannot download data into, change preferences, publish notification feedback, or
  invoke provider logout against the new account.
- The account panel can download a role-isolated metadata inventory without agreement content,
  other-party details, evidence, addresses, or bearer access secrets.
- Notification preference saves and test-email results are account-bound, ignore stale responses
  after an identity change, and expose explicit accessible success/error announcements.
- Agreement-activity and deadline-reminder preferences are collected per authenticated user.
- Notification preferences and their consent timestamp are persisted against the verified Privy
  account, with device-local storage retained only as an offline fallback.

Invitation and deduction-claim email delivery is available when the server-side email provider is
configured; Gmail and copy-email fallbacks remain available without it. Repeated identical claim
notices are deduplicated before provider delivery. Automatic claim messages are generated from the
latest saved claim event rather than repeated claim copy from the browser, and each tenant gets
only their own validated review link. Automatic response messages must match that tenant's exact
saved response transaction; the Worker derives the decision and canonical landlord dashboard link
instead of accepting them from the browser. Users who explicitly enable agreement-activity
email also receive privacy-minimal notices for finalization, funding, claim amendments, tenant
responses, and arbiter rulings. These messages omit evidence pointers, tenancy details, amounts,
and private notes. The hosted worker also has idempotent reminder checks seven days and one day
before the agreed possession-return date, for the landlord claim window, tenant response window,
and optional arbiter ruling window. Checks run opportunistically
when the app is opened and through a scheduled-worker handler where that trigger is configured.
It sends allocation-ready notices after recorded decisions or refund timeouts. Optional messages include a durable
unsubscribe link that disables activity and deadline email. A scheduled Base Sepolia indexer now
reads confirmed lifecycle events from the active OpenEscrow deployment, reconciles them to exactly
one finalized D1 agreement, and sends the same opted-in activity notices for actions submitted
outside the OpenEscrow UI. It never guesses an email-to-wallet association; unknown agreements are
retained as unmatched public events without exposing them to hosted accounts.
Transaction-bound delivery keys also let the indexer retry an email that failed after an in-app
onchain action was recorded, without duplicating the agreement action or a provider-accepted send.
Readiness is healthy only after the durable cursor is caught up to the confirmation-delayed chain
head and no matched event remains pending.

Every due agreement reminder is also written once to the shared D1 timeline independently of email
consent or provider availability. The notification menu shows that reminder only to its intended
landlord, tenant, or arbiter role. Email remains a second, consent-based channel with its own
idempotency and delivery ledger. Saving a proposal never sends an invitation: participant invites
remain an intentional landlord action through **Send invite**.

For transaction-backed proposal actions, the browser keeps a narrowly scoped pending receipt after
the chain confirms but before the D1 activity record succeeds. Finalization, the operations reserve,
record anchors, privacy-safe activity receipts, claims, tenant responses, arbiter rulings,
withdrawals, and deadline outcomes survive a same-tab refresh and can be retried; their storage
keys are scoped to the proposal, agreement, role where applicable, and active wallet. The bounded
response, ruling, withdrawal, and deadline-action payloads do not contain invitation or
account-session bearer access. Server-side transaction actions are idempotent by transaction
hash, and an append-only receipt guard prevents simultaneous retries from duplicating the event
timeline. Reserve, deposit-funding, response, tenant-withdrawal, and tenant-triggered deadline
retries must also match the exact invited tenant, and ruling retries must match the appointed
arbiter, before the server returns an existing event. Historical single-tenant events that predate
participant metadata retain their compatible idempotent behavior; an unattributed receipt on a
multi-tenant agreement fails closed instead of guessing which tenant submitted it.
Browser storage is treated as best-effort: blocked storage cannot interrupt the D1 receipt update,
corrupt recovery values are discarded, and an in-memory retry remains available for the current
page session. A browser that blocks storage cannot preserve that retry across a refresh, so the
wallet or Base Sepolia explorer remains the fallback source for the transaction hash.

The proposal form collects a landlord and one or more tenants. Each tenant receives a separate
role-locked invitation, approves the same revision, and owns an explicit percentage of the deposit.
Shares default evenly, must total exactly 100%, and any tenant or share change creates a new
revision that resets approvals. After finalization, each approved tenant wallet funds only its
onchain share. The agreement remains in a partially funded state until the complete refundable
deposit is received. The separate 5 testUSDC pilot operations reserve is divided equally among
tenant wallets, is never counted as security-deposit principal, and is fully returned at terminal
tenant withdrawal because the current MVP does not meter actual costs. The optional arbiter
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

1. Monitor failed deliveries, chain reorganizations, RPC outages, and delayed event processing.
2. Rehearse all activity, deadline, invitation, suppression, and unsubscribe paths with genuinely
   separate hosted participant accounts.
3. Add retention and deletion controls approved by counsel and the pilot partner.

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
