# Testnet MVP checkpoint — updated 2026-07-30

This checkpoint records repository and delivery evidence without claiming legal approval,
production readiness, or authorization to hold real rental deposits.

## In progress

- **Verified:** A locally packaged Sites candidate includes the latest pilot rehearsal, security,
  accessibility, compliance-regression, funding-failure, and hidden-tab performance work.
- **Verified:** Seventeen credential-free rehearsals pass: five lifecycle scenarios covering
  archive/restore, record proof, disputed claim, accepted claim, and no-claim refund, plus five
  private-evidence and notification outage/recovery scenarios—including cleanup when storage
  succeeds before its D1 record—one isolated evidence-key backup restoration scenario, one
  arbiter-link/session reset, one targeted lost-tenant-link recovery with co-tenant continuity,
  one verified-arbiter identity recovery/isolation scenario, one verified-account session
  containment scenario, one realistic multi-agreement account data-inventory scenario with
  encrypted-evidence exclusion and clean post-containment rediscovery, and one durable sandbox
  funding recovery/refund scenario. The no-claim rehearsal now uses separately signed
  landlord/tenant identities and proves deposit funding, premature-withdrawal denial, the
  one-time refund and withdrawal, final report contents, and repeatable snapshot integrity.
- **Verified:** A separate 15-scenario incident-response rehearsal passes for identity forgery,
  cross-account isolation, cross-site read isolation, account-session containment, lost-tenant
  invitation recovery, privacy inventory, evidence tamper, retained-key loss/restoration,
  R2/encrypted-IPFS cleanup after metadata failure, outages, notification recovery, receipt
  spoofing, and RPC fallback.
- **Verified:** The full repository release check passes with 90 server tests, 142 client-logic
  tests, lint, browser account-switch, funding-recovery, accessibility/mobile, and load-recovery
  smoke checks, and the production build. These rendered checks are part of the required
  `npm run check` path rather than separate, potentially stale results.
- **Verified:** The complete Foundry suite passes 221 contract tests across 20 suites, with one
  opt-in Base Sepolia fork test skipped when no RPC URL is supplied. The candidate activity
  registry now authorizes the landlord, every nonzero-share tenant, and the current arbiter;
  a secondary-tenant regression proves independent snapshot anchoring and activity publishing.
  This source-level fix is not active until the owner broadcasts the version-matched registry and
  the release is configured to its validated address.
- **Verified:** Base Sepolia receipt verification now rejects a real event when its participant,
  amount, selected token, record hash, or activity type does not match the validated action.
  Finalization proves the complete approved tenant/share set, primary tenant, optional arbiter,
  deposit, deadlines, selected token at the confirmed block, and creating landlord. Aggregate
  agreement-funded and claim-response events no longer substitute for participant-specific
  events, and the verified landlord wallet is retained for later receipt checks. Adversarial
  lifecycle regressions now also reject a mismatched claim or amendment amount, a relabeled
  landlord, tenant, or arbiter, an altered tenant-response count, a wrong ruling allocation, a
  wrong withdrawal party or amount, and a wrong no-claim, response-timeout, or arbiter-timeout
  amount. Finalization regressions independently reject a tenant relabeled as creator, altered
  arbiter/deadline/share fields, missing participant logs, and split-match logs; operations-reserve
  regressions reject the wrong reserve, escrow, agreement, tenant, token, sender, or share.
- **Verified:** Address-routed compliance snapshots now recursively detach and freeze nested
  rules, sources, overlays, and claim checks. Snapshot-level regressions cover conditional Maine
  paths, every fact- and event-gated Florida deadline stage, Arizona business-day and holiday
  arithmetic, and fail-closed handling for unsupported day-count metadata without changing any
  legal rule.
- **Verified:** The frontend address bridge now runs an all-51 matrix proving each validated state
  code selects the exact versioned statewide profile. Foreign, unknown, and state-mismatched
  addresses fail closed; every generated snapshot remains detached after its source address and
  nested rules are edited, and current-page routing survives blocked browser storage.
- **Verified:** A validated statewide profile now shows its research date and official source
  link. A rate-limited, version-pinned recheck reports when that source was checked and flags
  possible changes without silently rewriting the reviewed profile or a finalized agreement.
- **Verified:** The compliance source registry is immutable, uniquely keyed, HTTPS-only, and
  version-matched to every statewide and overlay source. Missing exact sources now fail closed in
  automated proposal tests for all three reviewed local overlays: Chicago, Seattle, and Portland.
- **Verified:** Provider checkout reconciliation now prevents an immediate second purchase after
  submitted, confirmed, or indeterminate results. The user can refresh the destination wallet
  balance without recording agreement funding; only explicit cancellation or failure permits an
  immediate retry. A provider-neutral lifecycle now survives page refresh, rejects internally
  inconsistent state and conflicting duplicate events, and models delayed confirmation,
  cancellation, failure, and refunds. Real-money funding remains disabled.
- **Verified:** Tenant-authorized sandbox attempts are now saved in D1 before checkout opens and
  recover across sessions/devices without depending on browser storage. Server validation pins
  the finalized agreement, tenant, approved wallet, selected asset, Base USDC destination, and a
  bounded amount; production intents, cross-account access, cross-site writes, conflicting
  duplicate events, and parallel active attempts fail closed. Sandbox outcomes never create an
  agreement-funding event.
- **Verified:** Successful finalization, funding, reserve, record-anchor, and privacy-safe activity
  transactions no longer depend on writable browser storage to save their D1 receipt. Blocked
  storage degrades to an in-memory retry instead of interrupting the completed action; malformed
  persisted hashes and JSON are discarded before use.
- **Verified:** Invitation bearer tokens are scrubbed from the URL before browser persistence is
  attempted. If local and session storage are blocked, the invitation, proposal bundle,
  jurisdiction, tracked-agreement, preference, and notification caches degrade to current-session
  state instead of blanking the page or making a completed action look failed. Worker
  authorization remains unchanged.
- **Verified:** Workspace-role selection remains usable in current-page memory when session
  storage is blocked. History API failures no longer interrupt proposal close, invitation exit,
  or optional-yield dialog controls; invitation exit additionally attempts a clean navigation
  before suppressing a URL that the browser refuses to replace.
- **Verified:** Record archives, verification keys, private activity proofs, account-data
  inventories, wallet addresses, invitations, and claim notices share one browser download and
  clipboard recovery layer. Blocked downloads are cleaned up and remain retryable; rejected
  clipboard permissions attempt a local selection-copy fallback before showing explicit guidance.
  Popup-blocked Gmail actions also point users to the copy fallback. Failed copies or popup opens
  do not create misleading invitation or notice-prepared activity, and unsupported dialog
  behavior leaves the optional-yield explanation link recoverable with an explicit error.
- **Verified:** The privacy-request rehearsal now creates finalized and draft agreements, stores
  encrypted evidence, and saves archive and notification preferences before generating the
  verified-account inventory. The inventory contains only role-scoped metadata; it excludes
  participant identities, addresses, wallets, evidence content and metadata, encryption-key IDs,
  invitation links, and account-session tokens. Session containment preserves the other party,
  original invitation, evidence, and account preferences, and verified rediscovery restores only
  fresh account sessions.
- **Verified:** A browser-blocked account-inventory download now retains the already-authorized
  JSON only in current-page memory and offers a copy fallback instead of discarding it. The file
  name includes the complete server timestamp, identity-token changes discard the fallback and
  ignore a stale response, assistive descriptions remain connected to an atomic status message,
  and the recovery actions become full-width 44-pixel targets on mobile.
- **Verified:** Tenant removal, proposal cancellation, invitation-link rotation, and account-wide
  session revocation now share a fail-closed confirmation helper. If a browser refuses to show its
  confirmation prompt, no destructive request is sent and the affected workspace shows explicit
  retry guidance instead of silently ignoring the action.
- **Verified:** The rendered browser check creates a representative address-routed proposal,
  rejects its cancellation through a simulated blocked confirmation prompt, and proves the
  proposal stays available without sending the destructive request. App, workspace-section, and
  account-panel reload controls also fail with manual browser-refresh guidance when navigation is
  unavailable. Account-wide session cleanup distinguishes completed server revocation from a
  later provider-sign-out or page-reload failure instead of reporting the completed revocation as
  unsuccessful.
- **Verified:** Account-wide session containment now binds the provider sign-out to the stable
  account identity that requested revocation. If a different account becomes active while the
  server request is in flight, the completed server revocation is preserved, but global local
  cleanup, provider sign-out, and reload are skipped so the new account's fresh access is not
  disturbed. Notification preference saves and test-email responses also ignore stale
  cross-account completions.
- **Verified:** The authenticated workspace now remounts on stable Privy-account changes, clears
  account-derived proposals, records, archive state, panels, and discovery state, and scopes
  device-local tracked agreement ids to that account. Manual discovery and record-archive
  completions check the requesting identity before updating or announcing, while background
  polling is invalidated on the same boundary. The proposal editor delegates newly finalized
  onchain ids back to this account-scoped workspace owner instead of writing them through the
  legacy device-wide tracking key.
- **Verified:** Account-inventory delivery and copy recovery, wallet-address copy feedback, and
  embedded-wallet setup now check the stable requesting account before publishing success, error,
  slow-state, or completion feedback. Account changes reset pending wallet setup so the newly
  selected account can make its own fresh attempt instead of inheriting a stale busy state.
- **Verified:** A deterministic rendered browser regression switches between two signed-in
  identities while archive, inventory, wallet-setup, and record-session revocation operations are
  in flight. It proves old proposals and completion messages do not cross the account boundary,
  stale inventory bytes are not downloaded, both accounts can finish independent wallet setup,
  an old account's completed server revocation makes zero provider-logout calls against the newly
  selected identity, and delayed preference/test-email responses cannot update or announce inside
  the newly selected account.
- **Verified:** Dynamic wallet setup, test-fund, negotiation, role-mismatch, onchain-activity,
  record-export, account-security, notification, and receipt-recovery outcomes expose explicit
  status or alert semantics. Notification failures now use an explicit error flag and assertive,
  atomic announcement instead of inferring severity from English message text. This improves
  screen-reader feedback without stealing keyboard focus; moderated assistive-technology testing
  remains a separate pilot task.
- **Verified:** Proposal review now separates background-refresh feedback from user-action
  feedback. A successful poll cannot erase an approval or compliance-action failure, while a
  failed poll leaves the last known record visible with plain-language stale-data guidance and an
  immediate retry. Epoch guards reject refresh responses invalidated by an in-flight or completed
  action, preventing an older proposal response from replacing the mutation result.
- **Verified:** Encrypted Record export generation is bound to the active record and account.
  Switching scope or leaving the view invalidates pending work before it can download private
  bytes or announce a stale completion. Export and verification-key outcomes now use explicit
  success/error semantics, and snapshot-keyed anchor controls preserve a newer recovery
  transaction when an older receipt finishes late.
- **Verified:** Encrypted-record and private-activity-proof verification is bound to the active
  proposal and agreement. Switching records clears selected encrypted files and verification keys
  and rejects delayed file reads, decryption, transaction receipts, and registry log results
  before they can publish success or error state in the next view.
- **Verified:** A rendered Record rehearsal downloads the encrypted JSON and its separate
  verification key, rejects the wrong key, and verifies the exact SHA-256 hash through the real
  browser UI. Local decryption and integrity verification remain available when the Base Sepolia
  registry is unavailable, while the onchain result stays explicitly unverified.
- **Verified:** The authenticated wallet/workspace is loaded behind a lightweight bootstrap, and
  an automated browser bundle budget guards initial, total, and largest-chunk growth. Direct
  HTML-referenced JavaScript fell from 2,620,477 bytes to 212,630 bytes (about 92%) in the
  production build; the authenticated workspace then loads asynchronously.
- **Verified:** Agreement summaries no longer load every funding, withdrawal, claim, dispute, and
  timeout tool up front. Funding and claims groups load on first panel visit, remain mounted after
  first use so in-progress state survives panel switches, and have panel-local recovery if a
  deferred chunk fails. The agreement-card JavaScript chunk fell from about 76.7 KB to 22.1 KB
  (about 71%), with a dedicated regression budget preventing the tools from being folded back in.
- **Verified:** Onchain activity notifications and expanded agreement records share one registry
  cache per Base Sepolia client. The first caller queries both registry event types in bounded
  block ranges; concurrent callers reuse that scan, and later polls query only new blocks plus a
  12-block reorganization window. Completed tail scans atomically replace recent receipts,
  removed logs are ignored, and a failed refresh preserves the last known-good cache for retry.
  Empty and pre-deployment requests still avoid unnecessary log work.
- **Verified:** Agreement receipt panels and account-level onchain notifications are bound to the
  current agreement/account set. Scope changes clear the prior view and restart polling
  immediately, while late RPC completions are rejected before they can restore removed agreement
  activity. A current transient refresh failure keeps the last known-good agreement panel visible.
- **Verified:** Tenant funding and operations-reserve receipt recovery now combines scoped
  latest-operation guards with conditional browser-storage clearing. A late successful D1 save
  clears only its matching transaction hash and cannot erase a newer pending transaction,
  recovery control, or error message.
- **Verified:** Shared transaction controls now deliver a mined receipt to the callback captured
  when that exact transaction was submitted, rather than a callback from a later render. The
  privacy-safe publisher locks its activity type and private text while publication is pending,
  rejects completions after an agreement/account scope change, and pairs the transaction with the
  canonical hash payload that was actually sent.
- **Verified:** Private-activity D1 receipt recovery conditionally removes browser JSON only when
  the stored activity type, content hash, and transaction hash match the successful save. An older
  completion therefore cannot clear a newer proof's recovery control or feedback.
- **Verified:** Standard contract-write controls now treat wallet-write errors, synchronous
  submission failures, and mined-receipt failures as terminal failures. Each path unlocks the
  control, discards the submitted success callback, and announces the error instead of leaving a
  disabled button waiting forever. Tenant token approval uses the same shared boundary, and
  proposal finalization now surfaces a mined-receipt error for a safe retry.
- **Verified:** An interrupted no-money provider sandbox preview remains locked until the tenant
  explicitly closes its durable attempt. Closing records a terminal cancellation before enabling
  a new preview, while production checkouts with unknown outcomes remain fail-closed for provider
  reconciliation.
- **Verified:** Checkout recovery, opening, explicit sandbox closure, and wallet-refresh feedback
  are scoped to the tenant access session, proposal, wallet, selected asset, requested amount, and
  environment. A late result may finish saving its original durable attempt, but it cannot replace
  the visible state or refresh callback after any of those boundaries changes.
- **Verified:** Browser checkout recovery keys are scoped to the proposal and authorized tenant in
  addition to wallet, asset, amount, and environment. Two agreements or co-tenants using the same
  wallet and amount cannot import each other's local provider result, while a rotated invitation
  or account session can still recover the same tenant's durable sandbox attempt without storing
  its bearer token in the browser key.
- **Verified:** A rendered browser rehearsal holds three sandbox checkout calls open across two
  agreements and two co-tenants that intentionally share the same wallet, asset, and amount. It
  resolves the provider calls out of order and proves each scope gets a separate browser recovery
  key, each result is saved to its original durable attempt, bearer tokens are absent from key
  names, and late completions do not update the currently visible agreement.
- **Verified:** Funding events now durably distinguish an unverified browser callback from a
  future signed provider webhook or authorized operator reconciliation. The tenant sandbox API
  ignores client-supplied provenance and can save only the unverified class. Production checkout
  histories now also reject unsigned confirmation, cancellation, failure, and refund outcomes
  before they can be persisted. The reconciliation result cannot refresh balances or permit
  another purchase; it stays locked until a trusted server-side event exists.
- **Verified:** Future trusted checkout events must include both a SHA-256 reconciliation key and
  the exact payload digest. The lifecycle rejects missing, malformed, conflicting, or repeated
  identities, while a partial unique D1 index prevents the same non-null reconciliation key from
  being applied across attempts. Browser callbacks are required to keep both fields null.
- **Verified:** D1 insert and update guards enforce the same provenance pairing and lowercase
  SHA-256 identity format on already-migrated databases. Direct malformed writes therefore fail
  closed even if they bypass the application lifecycle validator.
- **Verified:** Arrow-key workspace navigation moves focus to the selected tab synchronously,
  eliminating an intermittent animation-frame race in the required accessibility smoke check.
- **Verified:** Supporting-evidence uploads now expose an explicit same-file retry, announce busy,
  success, and error states, restore keyboard focus after recovery, and reject a delayed completion
  after the agreement or access token changes. A rendered mobile regression covers this flow.
- **Verified:** The optional-yield dialog has explicit heading-to-card spacing and larger asset
  badges, with a rendered 80%-zoom regression. Technical hashes and receipt text in the Record
  activity feed now sit behind **Details for verification**, while the main feed uses
  consumer-readable descriptions.
- **Verified:** The exact validated candidate source is pushed to the existing Sites source
  branch and saved as a newer undeployed Sites version after each coherent slice. The public
  production deployment remains unchanged.

## Remaining

- **Planned:** Review the newest saved candidate and explicitly approve a production deployment
  when the testnet release envelope is acceptable.
- **Planned:** Configure and validate the seven hosted pilot gates: email delivery, scheduler,
  evidence encryption, version-matched activity registry, address attestation, official-source
  baseline, and source-monitor freshness.
- **Planned:** Run the separate-account landlord/tenant pilot plus moderated accessibility and
  usability sessions, then conduct the owner-led incident/privacy drill.
- **Planned:** Enable an eligible Privy provider sandbox only for sandbox evaluation; production
  fiat, mainnet contracts, FRNT, and USDY remain disabled.
- **Planned:** Complete external legal, smart-contract, application-security, privacy, provider,
  and operating-policy reviews before any real-money release.
- **Planned:** International compliance is now a lower-priority staged roadmap track behind the
  U.S. testnet pilot: generalize country/region/local routing first, then build versioned
  official-source profiles and regressions market by market. No foreign profile is implemented or
  approved yet.
- **Planned:** Sustainable monetization is a parallel discovery track behind MVP safety:
  preserve the free, self-hostable open-source core; validate demand for an optional managed
  service, professional workflows, support, and integrations before building billing. Provider
  economics require disclosure and legal/provider review, and essential records or user data
  must never become leverage for payment.
- **Verified:** Infrequently used proposal, deposit, funding, invitation, and record tools load
  only when their tab or expanded section needs them. This reduced the main workspace chunk from
  about 345.9 KB to 74.2 KB (about 79%) while preserving keyboard focus behavior.
- **Verified:** Failed app-bootstrap and deferred workspace loads now show a focused, actionable
  recovery panel instead of a blank page. An automated browser check intentionally fails both
  load paths and verifies that workspace navigation remains available after a section failure.
- **Verified:** Private-evidence upload/download and notification-provider outages fail closed
  with retry guidance. Failed attempts create no phantom evidence or sent-delivery events, and
  automated recovery tests verify one successful retry remains idempotent. If private R2 or
  encrypted-IPFS storage succeeds before the atomic D1 metadata/event batch fails, OpenEscrow
  makes a compensating delete or unpin attempt before returning retry guidance; dedicated
  rehearsals prove successful cleanup, no phantom D1 record/event, and one safe retry. Provider
  cleanup remains best-effort if that provider is also unavailable.
- **Verified:** New private-evidence actions expose only token-free document paths. The UI
  control sends agreement access in a same-origin POST body rather than an `href`, so the bearer
  does not enter copied document links, browser history, or referrers. Server regressions preserve
  party isolation, reject cross-site form submissions, and retain legacy GET compatibility.
- **Verified:** The hosted pilot checker requires both an active evidence-encryption key and every
  retained key referenced by stored ciphertext. Each new encrypted row records a non-secret
  master-key fingerprint, so a missing key, omitted keyring status, or wrong backup bytes under
  the expected key ID fail closed. An authorized legacy download can backfill a missing
  fingerprint only after successful decryption and plaintext-digest verification.
- **Verified:** End-to-end operator-command regressions exercise a completely ready hosted
  response, a missing-retained-key response, and a mislabeled backup with wrong key bytes. Each
  writes timestamped evidence to an explicit nested artifact path; degraded cases exit
  unsuccessfully while preserving exact recovery guidance in the artifact. A hosted-readiness
  HTTP failure also writes one focused endpoint blocker instead of throwing before evidence can
  be preserved.
- **Verified:** Readiness responses expose build-generated exact-commit provenance, and operator
  artifacts preserve that release identifier under a versioned schema. Missing provenance fails
  closed, while Sites packaging rejects uncommitted release inputs and verifies its generated
  commit against the exact source before an archive can be saved.
- **Verified:** Browser mutation routes reject requests marked cross-site by Fetch Metadata even
  when an `Origin` header is absent; the session-containment rehearsal proves the rejected request
  cannot revoke stored account sessions.
- **Verified:** Role-authorized agreement, report, snapshot, private-evidence, and notification
  preference reads reject cross-site browser requests even when `Origin` is absent. Public
  readiness and signed email-unsubscribe entry points remain available by design.
- **Verified:** Closing the optional-yield dialog returns keyboard focus to the visible
  **Earn yield?** control instead of its hidden tooltip link. The deterministic browser check
  guards this focus return along with workspace tabs, proposal focus recovery, keyboard address
  selection, and mobile-width overflow.
- **Verified:** Hosted arbiter replacement now follows the contract's full mutual-consent
  handshake. Exact proposal, confirmation, cancellation, and acceptance receipts are required;
  the nominee cannot open the private record before both parties confirm; accepting rotates the
  saved arbiter wallet/email and invalidates the former arbiter's direct and signed-in sessions.
  Nominee sessions are separately tagged so a lost invite or cancellation can revoke only the
  nominee without prematurely removing the current arbiter; a verified agreement-closing action
  also expires an unaccepted nominee. If a successful acceptance or cancellation reaches the
  chain but its hosted save is interrupted, the agreement UI accepts the original transaction
  hash and finishes the exact receipt-verified access update. The server suite covers wrong
  nominees, parties, senders, old/new arbiter fields, lost-link rotation, cancellation, signed-in
  discovery, terminal expiry, recovery by an authorized participant, and post-acceptance access
  isolation. Replacement invitations also use the shared permission-safe clipboard path, with a
  visible link that remains manually selectable if browser copy access is blocked.
- **Verified:** An active deposit that cannot be read from the chain now retains a clear,
  consumer-readable recovery card instead of a terse retry. It states that the deposit was not
  removed, warns the participant to check the wallet and Record before repeating a payment,
  claim, or withdrawal, announces retry progress and failure, and restores keyboard focus after a
  failed retry. The rendered load-recovery check covers keyboard retry, retry failure and success,
  duplicate-action guidance, and mobile-width behavior.
- **Verified:** The compliance evaluator now rejects malformed deadline metadata before a
  triggering event can make the error visible, propagates an invalid member into an
  earlier-of/later-of controlling deadline, and rejects a snapshot whose recorded jurisdiction
  conflicts with its validated address. The official-source gate also treats a future-dated
  verification as stale instead of trusting it indefinitely. These are integrity checks only;
  no legal rule, source, period, or jurisdiction profile changed.

## Material unknowns

- Which cities/counties should receive the next local compliance overlays.
- Whether the pilot needs a separate ACH/bank-deposit path.
- Provider sandbox eligibility, cancellation semantics, fees, and support requirements until an
  actual provider sandbox is configured and exercised.
- The exact timing and scope of qualified counsel and independent security reviews.
- Which customer segment will pay first, which managed-service outcome they value, and the
  actual cost to deliver that outcome without weakening the open-source or consumer-protection
  commitments.
