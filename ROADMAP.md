# OpenEscrow roadmap

This roadmap is organized by dependency and release evidence. Checked items are implemented in
the repository; they are not claims of legal approval or production readiness.

## 1. Testnet protocol and optional-yield foundation

**Status: implemented and internally validated; external evaluation still required**

- [x] Pinned-token non-custodial escrow, claims, disputes, deadlines, and pull withdrawals
- [x] Multi-tenant funding shares and operations-reserve receipts
- [x] Authorization, boundary, fuzz, and stateful invariant coverage
- [x] Base Sepolia deployment and public testnet demonstration
- [x] Isolated yield-enabled V2 escrow and official Base Sepolia Aave adapter prototype
- [x] Principal/yield/loss allocation and direct USDC redemption tests
- [ ] Five moderated usability sessions across no-claim, accepted-claim, and disputed-claim paths
- [ ] Independent smart-contract audit of the exact release candidate

## 2. Agreement discovery, records, and private evidence

**Status: implemented for testnet; hosted operations remain**

- [x] Account-based proposal and finalized-agreement discovery
- [x] Role-safe multi-tenant records and lifecycle receipt verification
- [x] Collapsed agreement list with local archive/restore controls
- [x] Timestamped report plus encrypted canonical JSON archive and verification key
- [x] Version-bound onchain record receipts and private proof verification
- [x] Private R2 evidence with file-signature validation and optional encryption/decentralized mode
- [x] Landlord-controlled tenant invitation reset with old-link and active-session invalidation
- [x] Short-lived, capped account-discovery sessions per user, role, and agreement
- [x] Verified-user record-session containment with other-party and invitation-link isolation
- [x] Privacy-safe verified-account data inventory with role isolation, realistic multi-agreement
  and encrypted-evidence rehearsal, no access secrets, and clean post-containment rediscovery
- [ ] Configure and test the hosted evidence master key, backup, versioned rotation, retention,
  and deletion (rotation/keyring support is implemented; hosted operations remain)
- [x] Design credential-free landlord/arbiter recovery, session containment, privacy inventory,
  and incident-response exercises with exact-source evidence
- [ ] Complete supervised recovery, privacy-request, evidence-key-restoration, and incident drills

## 3. Validated-address nationwide compliance

**Status: statewide engineering complete for 50 states plus D.C.; local/legal review remains**

- [x] Server-attested U.S. address validation and deterministic state routing
- [x] Versioned immutable compliance snapshots attached to accepted agreements
- [x] Statewide profiles for all 50 states plus D.C.
- [x] Versioned claim packets, source monitoring, freshness checks, and fail-closed release gates
- [x] Deadline events that require party confirmation when based on off-chain facts
- [x] Regression coverage for registry completeness, holiday-aware business days, conditional
  deadline branches, and address-applied local-overlay source gates
- [ ] Select initial cities/counties and implement approved local overlays
- [ ] Complete official-source baselines and resolve every change/unreachable-source alert
- [ ] Obtain qualified counsel review for each launched jurisdiction and tenancy segment

## 4. Funding and asset routing

**Status: provider-neutral sandbox architecture implemented; production disabled**

- [x] USDC remains the default principal and settlement asset
- [x] Privy-brokered Base USDC onramp intent with provider-managed regional selection
- [x] Exact wallet, asset, chain, amount, sandbox, and production release gates
- [x] Fail-closed checkout result handling for submitted, confirmed, cancelled, failed, and
  malformed provider outcomes
- [x] Tenant-authorized D1 sandbox checkout recovery across sessions/devices, with idempotent
  events, duplicate-purchase locking, refund/cancellation retry gates, and no agreement-funding
  side effect
- [x] Direct Aave supply/withdrawal route modeled without a DEX swap
- [x] FRNT and USDY routes fail closed pending official availability and eligibility
- [x] Validate the provider-neutral sandbox intent, UI states, and failure handling locally
- [x] Let a tenant explicitly close an interrupted no-money sandbox preview before retrying while
  keeping production checkouts with unknown outcomes locked for provider reconciliation
- [x] Bind checkout recovery, opening, closure, and balance-refresh feedback to the tenant access
  session, proposal, wallet, asset, amount, and environment so late completions cannot cross scope
- [x] Isolate browser checkout recovery by proposal and authorized tenant as well as wallet,
  asset, amount, and environment, without storing invitation or account-session bearer tokens
- [x] Rehearse the rendered funding UI across same-wallet agreements and co-tenants with
  out-of-order provider completions, isolated browser caches, and correctly scoped durable events
- [x] Persist provider-neutral event provenance and keep unsigned browser terminal outcomes
  locked in production until a signed webhook or authorized operator reconciliation exists
- [x] Reserve replay-resistant reconciliation keys and exact payload digests for future trusted
  events, with a global D1 uniqueness gate and no client path for minting trusted provenance
- [ ] Enable and validate an eligible provider sandbox in the Privy dashboard
- [ ] Decide whether the pilot needs separate ACH/bank-deposit support
- [ ] Complete provider approval, KYC/AML, fees, refunds, webhooks, reconciliation, and support
- [ ] Audit and deploy mainnet contracts before any real-money route can be enabled

## 5. Security, privacy, reliability, and release readiness

**Status: local testnet gate implemented; external and hosted gates remain**

- [x] CI contract tests and `frontend` release check
- [x] High/critical production-dependency advisory gate with moderate-advisory reporting
- [x] Fail-closed Sites project/binding, asset, eligibility, and fiat-production configuration checks
- [x] Hosted readiness endpoint for email, scheduler, evidence, receipts, registry, address, and sources
- [x] Credential-free pilot rehearsals for no-claim, accepted-claim, disputed-claim, withdrawals,
  account archive/restore, and record-proof paths
- [x] Auth/evidence threat model plus expired/forged identity, cross-account evidence, ciphertext,
  key-material, and digest-tamper regression coverage
- [x] Hosted evidence readiness detects retained-key loss and wrong backup bytes through
  per-key fingerprints; a credential-free rehearsal restores isolated D1/R2 copies and proves
  exact-byte recovery, while authorized legacy downloads backfill fingerprints only after
  successful decryption and plaintext-digest verification
- [x] Fail-closed, retryable private-evidence and notification-provider outage handling without
  phantom evidence or delivery events
- [x] Landlord-authorized optional-arbiter invitation rotation with old-link and account-session
  invalidation, verified-email rediscovery, and cross-account isolation, retained behind the
  disabled-by-default arbiter UI
- [x] Landlord-authorized lost-tenant invitation replacement with old-link/session invalidation,
  approved-term continuity, and uninterrupted access for unaffected co-tenants
- [x] Self-service verified-account record-session revocation and local account-session cleanup
  without changing agreements, other participants, invitation links, or wallet-provider sessions;
  an in-flight revocation cannot clear access for or sign out a newly selected account
- [x] Stable-account workspace isolation: account changes remount and clear account-derived
  proposals, records, archives, panels, and discovery state; device-local tracked agreement ids
  are account-scoped—including ids emitted by newly finalized proposals—and stale discovery,
  archive, inventory, wallet-copy, or embedded-wallet setup completions cannot update the new
  account; a deterministic rendered switch regression also proves stale revocation cannot invoke
  provider logout for the newly selected identity
- [x] Exact-source credential-free incident rehearsal plus testnet containment/privacy runbook
- [x] End-to-end operator readiness evidence for a ready pilot, fail-closed retained-key recovery,
  and hosted-readiness endpoint outages, including explicit nested artifact paths and actionable
  remediation
- [x] Build-generated exact-commit provenance in readiness responses and artifacts, with
  fail-closed operator validation and a clean-source Sites packaging gate
- [x] Push the validated exact source and save a newer undeployed Sites candidate without
  changing production or hosted D1/R2 data
- [x] Internal keyboard/mobile accessibility smoke coverage plus workspace tab, address combobox,
  proposal focus-recovery, async announcement, reduced-motion, mobile-overflow fixes, and an
  accessible in-memory copy fallback for blocked account-inventory downloads; notification
  outcomes use explicit atomic status/error semantics rather than message-text inference
- [x] Visibility-aware background proposal and onchain polling with foreground catch-up, plus a
  shared deadline clock
- [x] Proposal-review polling is isolated from user actions: stale refreshes cannot replace a
  newer mutation result, background failures cannot erase action feedback, and current records
  remain visible with an explicit retry control
- [x] Encrypted Record exports are scoped to the active record and account: leaving or switching
  scope invalidates pending downloads and feedback, export outcomes use explicit success/error
  semantics, and an older anchor receipt cannot erase a newer recovery transaction
- [x] Encrypted-record and private-activity-proof verification is scoped to the active proposal
  and agreement: switching records clears selected private inputs and invalidates delayed file,
  decryption, receipt, and registry results before they can populate the next view
- [x] Consolidated onchain activity receipt polling into a shared bounded dual-event registry
  cache: the initial history scan is reused across notifications and expanded records, later polls
  rescan only a reorganization-safe tail, and failed refreshes preserve the last known-good view
- [x] Onchain receipt panels and account notifications are agreement/account scoped: a scope
  change clears the old view, triggers an immediate current-scope refresh, and prevents delayed
  RPC results from repopulating removed agreements; current refresh failures retain known-good data
- [x] Tenant funding and operations-reserve receipt recovery is newest-transaction safe: an older
  D1 receipt save can clear only its matching browser recovery hash and cannot erase or overwrite
  a newer pending transaction or its feedback
- [x] Privacy-safe activity publication is exact-payload bound: shared transaction controls retain
  the callback captured at submission, proof inputs lock while the receipt is pending, scope
  changes reject late completions, and D1 recovery clears only matching structured receipt data
- [x] Standard transaction controls recover from wallet-write, synchronous submission, and mined
  receipt failures: busy state unlocks, stale success callbacks are discarded, and approval and
  finalization failures remain visible for a safe retry
- [x] Establish an initial browser performance budget and split the bootstrap from the
  authenticated wallet/workspace bundle
- [x] Split infrequently used proposal, deposit, and record tools into tab-level chunks
- [x] Load each agreement's funding and claims tools only after that panel is visited, preserve
  the mounted panel after first use, and contain deferred-load failures within the agreement
- [x] Prevent bootstrap and deferred workspace failures from blanking the page, with focused,
  privacy-safe reload recovery and automated browser regression coverage
- [ ] Configure hosted email, Cron, encryption, registry, address, and compliance-source services
- [ ] Run separate-account testnet pilot and accessibility/usability reviews
- [ ] Commission independent contract/application security and privacy/threat-model reviews
- [ ] Approve operating policies, support, incident response, stop conditions, and release envelope

## Production boundary

OpenEscrow remains a Base Sepolia demonstration until legal, provider, security, privacy,
operational, and supervised-pilot evidence is complete. No roadmap checkbox, automated test, or
AI-assisted review is authorization to hold real rental deposits.
