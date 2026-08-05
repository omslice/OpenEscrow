# Testnet MVP checkpoint — updated 2026-08-05

This checkpoint records repository and delivery evidence without claiming legal approval,
production readiness, or authorization to hold real rental deposits.
For the concise current roadmap, use [`mvp-roadmap.md`](./mvp-roadmap.md); this file is the
detailed validation ledger.

## In progress

- **Verified:** A locally packaged Sites candidate includes the latest pilot rehearsal, security,
  accessibility, compliance-regression, funding-failure, and hidden-tab performance work.
- **Verified:** The credential-free candidate command now runs the release, pilot rehearsal,
  incident rehearsal, and exact-source Sites packaging gates in dependency order, fails closed on
  the existing project/D1/R2 bindings, and records machine-readable evidence without querying or
  changing the live site. The versioned candidate manifest also verifies the exact commit in both
  rehearsal summaries, binds their JUnit reports by SHA-256, and records a deterministic digest of
  every packaged Sites file. Schema v4 additionally rejects dirty source before the gates,
  rechecks it after packaging, and binds deterministic contract-assurance evidence for the exact
  commit. The live-deploy wrapper runs readiness only after a successful
  publish and passes the new deployment URL positionally to the readiness checker.
- **Verified:** Twenty-three credential-free rehearsals pass: lifecycle scenarios cover
  archive/restore, record proof, disputed claim, accepted claim, and no-claim refund, while a
  rendered Record scenario proves encrypted JSON export, separate-key download, wrong-key
  rejection, keyboard disclosure, narrow-screen layout, and local verification during a public-
  proof outage. Five private-evidence and notification outage/recovery scenarios include cleanup
  when storage succeeds before its D1 record; the remaining rehearsals cover isolated evidence-key
  backup restoration, arbiter and tenant link/session recovery, verified identity and account-
  session isolation, privacy inventory, and durable sandbox funding recovery/refund. The no-claim
  rehearsal uses separately signed landlord/tenant identities and proves deposit funding,
  premature-withdrawal denial, the one-time refund and withdrawal, final report contents, and
  repeatable snapshot integrity. The added shared rendered lifecycle uses four isolated mobile
  browser sessions for one landlord, two tenants, and one arbiter; it proves exact participant
  handoffs, a 225/465/310 USDC allocation, one withdrawal per party, complete report contents,
  44-pixel action targets, and no bearer in the URL or browser storage. A second rendered account
  rehearsal moves one proposal and its Record entry through their separate archived views and
  restores each to the current list at mobile width, including focus recovery and live account-
  switch isolation; every rendered archive and restore action retains a 44-pixel touch target.
  A rendered provider-neutral funding rehearsal now also proves sandbox failures can retry,
  unknown results require explicit no-money closure, and an unverified production browser success
  remains locked across wallet refresh and page reload without opening another checkout or
  exposing a sandbox reset. The private-record rehearsal also interrupts a confirmed privacy-safe
  activity receipt, proves another agreement cannot inherit it, restores keyboard focus to its
  mobile-size retry after reload, and completes the record without another onchain publication.
  Production funding remains disabled outside these deterministic tests.
- **Verified:** A separate 19-scenario incident-response rehearsal passes for identity forgery,
  cross-account isolation, cross-site read isolation, evidence URL-bearer denial, account-session
  containment, lost-tenant invitation recovery, multi-tenant notice isolation, recorded-response
  notice integrity, privacy inventory, evidence tamper, retained-key loss/restoration,
  R2/encrypted-IPFS cleanup after metadata failure, outages, notification recovery,
  legacy-landlord receipt recovery, receipt spoofing, and RPC fallback.
- **Verified:** The hosted Worker bounds declared and streamed request bodies by route, rejects
  malformed multipart uploads, applies atomic D1 rate windows without persisting raw client
  addresses or credentials, and fails closed if that counter cannot be updated. Its indexed daily
  cleanup, bounded/cached Privy JWKS validation, constrained token time claims, and sanitized
  correlation-ID error boundary are covered by server regressions, including a forced failure with
  a sentinel secret in the query, authorization header, and exception.
- **Verified:** Migration `0020_query_path_indexes.sql` adds expression and covering indexes for
  the account-discovery, expired-session cleanup, notification-consent, and finalized-agreement
  scheduler queries, with `EXPLAIN QUERY PLAN` regressions proving each hot lookup uses its named
  index. Confirmed replacement-arbiter discovery now builds an indexed candidate-ID set instead
  of scanning a cross-table `OR`. A 45-agreement regression creates all access sessions in three
  bounded D1 batches. The visible account workspace rechecks membership every five minutes,
  refreshes saved records every 30 seconds, and caps record-read concurrency at six while
  preserving ordered partial-failure handling and the matching last-known record during a
  transient discovery or read outage.
- **Verified:** Registry and transaction-receipt verification consume bounded JSON-RPC 2.0
  envelopes with exact response IDs. Custom endpoints must report Base Sepolia, receipt objects
  must identify the submitted transaction and confirmed block before log matching, and concurrent
  identical receipt/state reads share one network request. Server regressions reject wrong-chain,
  wrong-ID, oversized, and wrong-transaction responses and prove a later exact retry succeeds.
- **Verified:** The full repository release check passes the complete server and client-logic
  suites, lint, browser account-switch, funding-recovery, record-verification,
  accessibility/mobile, landing-budget, and load-recovery checks, plus the production build.
  These rendered checks are part of the required `npm run check` path rather than separate,
  potentially stale results.
- **Verified:** The complete Foundry suite passes 234 contract tests across 22 suites, with one
  opt-in Base Sepolia fork test skipped when no RPC URL is supplied. The candidate activity
  registry now authorizes the landlord, every nonzero-share tenant, and the current arbiter;
  a secondary-tenant regression proves independent snapshot anchoring and activity publishing.
  This source-level fix is not active until the owner broadcasts the version-matched registry and
  the release is configured to its validated address.
- **Verified:** The contract release gate forces a clean offline Solidity 0.8.26 build using the
  declared optimizer and IR profile, then records compiled ABI, runtime/creation bytecode,
  storage-layout, selector-collision, runtime-size-margin, and exact dependency-tree evidence for
  the escrow, reserve, and registry. Three reserve invariants pass 98,304 stateful calls, and an
  overlapping-ID cohort regression proves retired/candidate deployment isolation. The reviewed
  dependency source manifests, threat model, and independent-audit handoff are checked in.
- **Verified:** The no-broadcast deployment rehearsal deploys and funds two complete immutable
  cohorts on local Anvil, confirms the escrow/reserve/registry and token/treasury/runtime bindings,
  rejects both cross-cohort registry attempts with the exact authorization error, closes only the
  retired agreement, and preserves the candidate's full principal and Active state. A 12-field
  in-memory client/server switch parses back to the candidate manifest and rolls back to the exact
  original bytes. Pilot-candidate schema v4 binds this local artifact after contract assurance.
- **Verified:** A secondary-contract review hardened the atomic deposit-plus-reserve boundary,
  reserve deployment binding, reserve phase gates, and registry arbiter authorization. Every
  externally callable escrow lifecycle mutation now shares the same reentrancy lock, funding
  records effects before token/reserve interactions, and a malicious-token regression proves a
  cross-function replacement callback reverts without leaving state or funds. Slither no longer
  reports the funding reentrancy path. The configured Base Sepolia contracts predate this source;
  activating it requires an explicitly approved new escrow/reserve pair and exact registry.
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
  addresses fail closed; a parsed snapshot must retain its exact canonical validated provider and
  address fields instead of normalizing a missing, spoofed, or unclean stored identity. Every
  generated snapshot remains detached after its source address and nested rules are edited, and
  current-page routing survives blocked browser storage.
- **Verified:** A validated statewide profile now shows its research date and official source
  link. A rate-limited, version-pinned recheck reports when that source was checked and flags
  possible changes without silently rewriting the reviewed profile or a finalized agreement.
- **Verified:** Source recheck responses must match the selected profile version, citation, and
  URL before the client displays them. Status and review flags must agree; impossible timestamp
  strings, reversed verification chronology, and incomplete changed/unreachable checks fail
  closed. Unreachable sources require attention rather than receiving success styling; failed
  retries clear the prior green result and remain retryable. Same-source
  requests share one in-flight fetch per runtime, while timestamp and version guards prevent an
  older or superseded completion from overwriting a newer D1 result across runtimes.
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
- **Verified:** New invitation credentials are generated in a client-only URL fragment rather than
  the query sent with the initial document request. Legacy query links remain readable once and
  are immediately scrubbed; malformed, empty, or conflicting query/fragment credentials fail
  closed. A valid role-restricted invitation preserves a same-tab recovery copy before the
  deferred workspace request, so an interrupted bundle download can reload without restoring the
  bearer to browser history or accepting a different proposal, role, or account-discovery token.
  Invitee recovery remains session-scoped; a legacy persistent invitation is migrated into the
  current tab and removed from local storage, without changing durable landlord-created access or
  verified account-discovery sessions. A sanitized proposal-only remount resumes only one unique
  invitation role and fails closed when multiple roles match.
- **Verified:** A multi-tenant deduction claim now produces one private message per exact tenant.
  Each server-validated fragment credential must hash to that tenant's current invitation and each
  provider request has a tenant-specific idempotency key. Missing, duplicate, query-based,
  relabeled, and cross-tenant links fail before delivery. The rendered mobile rehearsal shows two
  separately named 44-pixel email/copy actions and verifies the automatic request contains neither
  a query credential nor another tenant's credential.
- **Verified:** Automatic claim and response notices no longer trust repeated client-supplied
  agreement, amount, itemization, decision, note, or dashboard-link text. The Worker derives the
  claim from the latest saved claim event, binds a tenant response to that tenant's exact saved
  transaction, and creates the canonical signed-in landlord link. Forged response receipts and
  injected notification copy fail closed or are ignored before provider delivery.
- **Verified:** Claim and response notification feedback uses structured progress, success, and
  error state instead of guessing from message words. The rendered 390-pixel rehearsal forces a
  claim-email failure containing “sent,” proves it remains an assertive error and restores the
  enabled send control, then proves a response-email outage focuses a full-width 44-pixel manual
  fallback. Access-scope changes clear old feedback and discard late async completion.
- **Verified:** The long-form private-record browser rehearsal now closes each isolated browser
  context as soon as its scenario finishes and explicitly proves the arbiter resolution view is
  ready before exercising it. The complete release sequence reaches the late ruling, deadline,
  activity-proof, lifecycle, build, and landing-load gates without accumulating stale test pages.
  Every rendered test mode now has a separate dependency cache. Account-workspace and load-
  recovery rehearsals prewarm their deferred modules, select per-process ports, close completed
  browser contexts, and wait for server shutdown. Two account runs separated by another mocked
  mode, the complete 23-scenario pilot rehearsal, and the consecutive record/accessibility/load/
  deposit checks pass without a stale dynamic import.
  If local and session storage are blocked, the invitation, proposal bundle, jurisdiction,
  tracked-agreement, preference, and notification caches degrade to current-page state instead
  of blanking the page or making a completed action look failed. Worker authorization remains
  unchanged.
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
- **Verified:** Primary recovery controls no longer tell consumers to save a technical receipt.
  Confirmed finalization, funding, claim, response, ruling, deadline, withdrawal, arbiter-
  replacement, and public-proof interruptions use one action-oriented “finish adding to Record”
  model and make clear that the testnet action will not run again. Receipt and hash details remain
  available in the appropriate technical/history views.
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
- **Verified:** The Deposits tab no longer mounts every agreement card and its live contract
  polling at once. Multi-agreement accounts start as a compact address-labeled list, opening a row
  replaces the previously mounted live view, and single-deposit accounts retain direct access.
  Proposal and activity navigation opens the exact requested deposit. A rendered narrow-screen
  regression proves one-at-a-time mounting, keyboard expansion/collapse with focus retention,
  44-pixel touch targets, and no horizontal overflow.
- **Verified:** Collapsed proposal and agreement records now keep an empty, hidden detail region in
  the document so every disclosure control's `aria-controls` target remains valid, without
  mounting report, encrypted-backup, verification, or onchain tools before expansion. A rendered
  two-record regression proves independent expansion for comparison, child unmounting on
  collapse, exact keyboard-focus retention, archive actions that do not toggle details, 44-pixel
  touch targets, and no horizontal overflow at 390 pixels.
- **Verified:** Onchain activity notifications and expanded agreement records share one registry
  cache per Base Sepolia client. The first caller queries both registry event types in bounded
  block ranges; concurrent callers reuse that scan, and later polls query only new blocks plus a
  12-block reorganization window. Completed tail scans atomically replace recent receipts,
  removed logs are ignored, and a failed refresh preserves the last known-good cache for retry.
  Empty and pre-deployment requests still avoid unnecessary log work.
- **Verified:** Wallet-only agreement discovery now snapshots the chain head once per manual
  search and scans each required event family once. The same unfiltered proposal stream identifies
  both landlord and original-arbiter records, removing one full historical log scan and three
  redundant block-number requests while retaining bounded ranges, co-tenant discovery, replacement
  arbiters, duplicate suppression, and pre-deployment short-circuiting.
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
- **Verified:** Private timestamped-proof publishing and verification now lead with consumer
  language while preserving exact fingerprints, wallet attribution, test-network blocks, and
  public receipts inside collapsed technical disclosures. A rendered mobile rehearsal downloads
  the private verification file, isolates an interrupted record save to the exact agreement,
  reloads and retries without another blockchain action or stored bearer, and verifies the same
  file against its public receipt.
- **Verified:** Standard contract-write controls now treat wallet-write errors, synchronous
  submission failures, and mined-receipt failures as terminal failures. Each path unlocks the
  control, discards the submitted success callback, and announces the error instead of leaving a
  disabled button waiting forever. Tenant token approval uses the same shared boundary, and
  proposal finalization now surfaces a mined-receipt error for a safe retry.
- **Verified:** Sponsored testnet writes now enforce the same mined-receipt boundary. Funding,
  approval, test-token, record-anchor, and private-activity follow-up actions run only after a
  receipt reports success; a reverted or unknown receipt creates no optimistic funded state,
  private activity record, or browser recovery receipt.
- **Verified:** Durable sandbox recovery distinguishes the current funding intent from an earlier
  active attempt after an amount, asset, or wallet change. The client verifies the returned intent
  key, keeps the stale attempt out of the new local recovery key, and requires an explicit
  no-money close before it can open the updated preview.
- **Verified:** An interrupted no-money provider sandbox preview remains locked until the tenant
  explicitly closes its durable attempt. Closing records a terminal cancellation before enabling
  a new preview, while production checkouts with unknown outcomes remain fail-closed for provider
  reconciliation.
- **Verified:** Every active no-money sandbox rehearsal now has an explicit safe reset. Opening,
  submitted, and unknown previews use the valid cancellation transition; confirmed and
  refund-pending previews use the valid refunded transition. Logic, D1 endpoint, and rendered
  browser regressions prove the terminal record permits a new preview. Production terminal
  outcomes remain locked unless a trusted provider or authorized operator reconciles them.
- **Verified:** Checkout recovery, opening, explicit sandbox closure, and wallet-refresh feedback
  are scoped to the tenant access session, proposal, wallet, selected asset, requested amount, and
  environment. A late result may finish saving its original durable attempt, but it cannot replace
  the visible state or refresh callback after any of those boundaries changes.
- **Verified:** Funding explanations now lead with the user-visible payment path, provider-role,
  and payment-data boundary. Raw provider and adapter identifiers remain available only after the
  participant expands technical route details, with rendered regression coverage.
- **Verified:** Proposal asset cards no longer expose ambiguous internal implementation badges.
  Larger availability-aware labels distinguish the testnet USDC option, simulated Aave option,
  and unavailable FRNT/USDY options without changing the versioned asset catalog or snapshots.
- **Verified:** Static delivery now gives content-hashed assets a one-year immutable cache lifetime
  and makes the app shell, public files, and SPA fallbacks revalidate. This improves repeat-load
  performance while preventing a cached HTML entry point from pinning users to an older release.
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
- **Verified:** Durable funding history now requires each event's normalized raw provider result
  to equal its recorded lifecycle state. The shared validator rejects tampered stored histories,
  and the tenant sandbox endpoint rejects contradictory new events before D1 persistence.
- **Verified:** Arrow-key workspace navigation moves focus to the selected tab synchronously,
  eliminating an intermittent animation-frame race in the required accessibility smoke check.
- **Verified:** The validated-address combobox now retains the listbox referenced by
  `aria-controls` as an empty hidden target before lookup and after selection, declares its
  listbox popup relationship, and mounts interactive options only while suggestions are open.
  The rendered proposal regression proves the target, arrow-key selection, collapsed state, and
  option unmounting together.
- **Verified:** Proposal Continue actions, new-proposal resets, tenant replacements, and finalized-
  proposal replacement edits share one focus-aware step transition. The rendered regression proves
  forward navigation and a reset from the review panel focus the newly visible panel instead of
  leaving keyboard focus on a removed control.
- **Verified:** Supporting-evidence uploads now expose an explicit same-file retry, announce busy,
  success, and error states, restore keyboard focus only after the completed upload state is
  committed, and reject a delayed completion after the agreement or access token changes. A
  rendered mobile regression covers this flow.
- **Verified:** Private supporting-file downloads are now same-origin POST-only. The server rejects
  the retired `?token=` evidence URL before reading D1 metadata or R2 bytes, returns no-store and
  no-referrer protections, and retains authorized landlord/tenant access through the token-free
  agreement UI. The incident rehearsal makes this browser-history and referrer boundary explicit.
- **Verified:** Confirmed tenant responses and arbiter rulings now preserve a bounded private-
  record retry across a same-tab reload without storing bearer access. Rendered mobile checks
  prove focus restoration, 44-pixel retry controls, matching-payload cleanup, and exactly one
  blockchain transaction. A new append-only D1 guard makes response and ruling event insertion
  atomic under simultaneous retries; exact participant authorization precedes idempotent replay,
  and cross-tenant or cross-role receipt reuse is rejected without rewriting prior events.
- **Verified:** Confirmed withdrawals and the no-claim, no-response, and arbiter-timeout actions
  now preserve session-only, account/agreement-scoped private-receipt recovery after an interrupted
  D1 save. The rendered 390-pixel rehearsals change accounts, reload, restore focus to a 44-pixel
  record-only retry, and prove each wallet action remains single-submit with no bearer token in
  browser recovery. Concurrent withdrawal retries are atomic and exact-tenant bound.
- **Verified:** Multi-tenant reserve, deposit-funding, response, withdrawal, and deadline receipt
  retries now authorize the exact invited tenant before returning an existing event. Concurrent
  same-tenant writes remain idempotent, co-tenant reuse of the hash conflicts, and new deadline
  events retain the initiating tenant ID without rewriting historical records. Old receipts without
  participant attribution remain compatible only on single-tenant agreements and otherwise fail
  closed.
- **Verified:** The optional-yield dialog has explicit heading-to-card spacing and larger asset
  badges, with a rendered 80%-zoom regression. Technical hashes and receipt text in the Record
  activity feed now sit behind **Details for verification**, while the main feed uses
  consumer-readable descriptions.
- **Verified:** The canonical high-level roadmap now separates verified candidate evidence,
  planned work, material unknowns, and owner-only actions. The required release check rejects
  misplaced status labels, stale hard-coded production-version claims, and obsolete handoffs that
  still look authoritative.
- **Verified:** The stricter release envelope now parses the production dependency audit instead
  of relying only on a severity threshold. High/critical findings, unknown moderate advisories,
  expired exceptions, and stale exceptions all fail closed. The current transitive `uuid`
  advisory is documented as one exact testnet-only exception through 2026-08-30; it cannot
  authorize a production release.
- **Verified:** A fresh 2026-07-31 check returned HTTP 200 for both the public site and readiness
  endpoint and exposed exact release provenance for the approved source. Seven hosted actions
  remain: email, scheduler health, evidence keyring, version-matched activity registry, address
  attestation, official-source baseline, and monitor freshness.
- **Verified:** The approved public deployment matches its exact validated and pushed source.
  Later coherent slices are release-checked, pushed, and saved as separate undeployed candidates
  so public promotion remains an explicit owner decision.

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
- **Verified:** Agreement, complete-report, and canonical-snapshot reads now require a strict
  authorization header. Query-only agreement bearers are rejected across all three routes, and a
  malformed or wrong header cannot downgrade to a URL credential. Invitation entry remains
  available because the client captures that capability into same-tab recovery, scrubs the page
  URL, and uses the header-only API boundary afterward.
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
  chain but its hosted save is interrupted, the agreement UI searches bounded Base Sepolia event
  ranges from the saved proposal window and submits the matching confirmation to the exact
  receipt-verified access update. Removed, malformed, wrong-agreement, and wrong-nominee events
  are ignored, while manual transaction-hash entry remains in a collapsed technical fallback.
  The rendered 390-pixel rehearsal proves lookup failure and retry, keyboard-focus restoration,
  44-pixel automatic and technical controls, no overflow, and one successful Record update.
  The server suite covers wrong nominees, parties, senders, old/new arbiter fields, lost-link
  rotation, cancellation, signed-in
  discovery, terminal expiry, recovery by an authorized participant, and post-acceptance access
  isolation. Replacement invitations also use the shared permission-safe clipboard path, with a
  visible link that remains manually selectable if browser copy access is blocked.
- **Verified:** An active deposit that cannot be read from the chain now retains a clear,
  consumer-readable recovery card instead of a terse retry. It states that the deposit was not
  removed, warns the participant to check the wallet and Record before repeating a payment,
  claim, or withdrawal, announces retry progress and failure, and restores keyboard focus after a
  failed retry. Focus restoration now waits for React to commit the enabled retry control instead
  of racing the parent's loading-state update; five consecutive rendered checks passed. The
  load-recovery check covers keyboard retry, retry failure and success, duplicate-action guidance,
  and mobile-width behavior.
- **Verified:** Claim line-item editing now announces each addition and removal, moves keyboard
  focus to the new or surviving deduction after React commits the change, gives removal controls
  distinct accessible names, and uses 44-pixel mobile targets without horizontal overflow. The
  rendered private-record recovery rehearsal covers the full keyboard interaction.
- **Verified:** A confirmed testnet claim now writes its unsaved private receipt retry to
  session-only browser recovery before contacting the record service. The key is scoped by
  agreement, proposal, landlord wallet, and role and contains no bearer token. The rendered
  rehearsal interrupts the first receipt save, reloads the page, verifies focused recovery,
  completes the idempotent save, clears the matching payload, and proves no second transaction
  occurred.
- **Verified:** The compliance evaluator now rejects malformed deadline metadata before a
  triggering event can make the error visible, propagates an invalid member into an
  earlier-of/later-of controlling deadline, and rejects a snapshot whose recorded jurisdiction
  conflicts with its validated address. The official-source gate also treats a future-dated
  verification as stale instead of trusting it indefinitely. These are integrity checks only;
  no legal rule, source, period, or jurisdiction profile changed.
- **Verified:** Event timestamps now require a possible calendar date and an explicit UTC or
  numeric offset at both the API and evaluator boundaries. Date-only deadline anchors remain
  deterministic UTC dates; timezone-less event times, impossible dates, malformed holiday
  calendars, and inherited event properties fail closed. Participant-facing timeline copy keeps
  the affected requirement visible as needing review, and the entry form states that the testnet
  uses the participant device timezone without yet attesting the property's timezone. Server and
  client regressions cover the failure states. No jurisdiction rule or deadline period changed.
- **Verified:** The critical Record workspace now introduces the complete report, encrypted
  backup, optional public proof, and independent verification in plain language. AES-256-GCM,
  SHA-256, and the exact fingerprint remain available in collapsed technical disclosures. The
  rendered rehearsal proves the raw fingerprint is hidden by default but keyboard-accessible on
  request, the expanded workflow fits a narrow viewport, and encrypted export, separate-key
  download, wrong-key rejection, and local verification remain usable during a public-proof
  service outage.
- **Verified:** Claim supporting-file lists now present a readable category, timestamp, and
  44-pixel file action without requiring a participant to understand a content URI, wallet, or
  hash. Each exact wallet and digital fingerprint remains available in an independently collapsed
  44-pixel verification disclosure. The rendered mobile rehearsal proves private file access uses
  a token-free URL, retains agreement-scoped POST authorization, and preserves same-file upload
  retry, focus, announcements, and scope isolation.
- **Verified:** Public activity-receipt query failures now render as a visible alert instead of
  being hidden in a closed receipt-history disclosure. The alert distinguishes a connection
  problem from missing agreement data, retains a manual retry, and keeps raw RPC text collapsed.
  An unexpected retry rejection is contained as another safe failure, plain-language feedback is
  visible, and a layout effect restores the exact enabled button after each consecutive keyboard
  failure. The rendered regression no longer treats focus on the document body as success, fits a
  390-pixel viewport, clears busy state after every failure, and proves later recovery does not
  repeat an agreement action.
- **Verified:** The temporary transitive `uuid` dependency exception has been eliminated. Every
  locked Privy/Wagmi wallet-provider UUID path now resolves to 11.1.1, the production audit
  reports zero vulnerabilities, and a required candidate check imports the affected connector
  modules, verifies UUID generation/validation, and proves an undersized output buffer fails
  closed.
- **Verified:** A newly disclosed Hono CORS middleware advisory is eliminated without a policy
  exception. The wallet tree pins Hono 4.12.34, the offline dependency gate verifies the exact
  lockfile version and runtime import, and the production audit reports zero vulnerabilities.
- **Verified:** A clean logged-out production visit now renders its complete public entry before
  importing the account provider and offers neutral Google/wallet choices without a role selector.
  The selected method opens automatically after its provider loads; rejected automatic and direct
  attempts remain on the public page with an actionable same-method retry. A non-sensitive device
  hint restores the provider for returning users without starting login. The required production
  Playwright budget now measures 10 initial JavaScript requests and about 245 KB, enforces ceilings
  of 12 requests and 300 KB, and rejects eager account-provider, workspace, jurisdiction, and
  blockchain-wallet-provider chunks. This is roughly a 79% request reduction and 89% byte
  reduction from the prior 48-request, 2.25 MB checkpoint. A structurally valid invitation still
  loads secure sign-in automatically, but its bearer is captured only in current-tab recovery and
  scrubbed before the account-provider module finishes loading; invalid roles remain neutral, and
  provider outages fail closed before workspace code. Provider-independent rendered regressions
  preserve exact invitation roles, mobile targets, and recovery after a failed first workspace
  download without persistent bearer storage.
- **Verified:** The shared landing/workspace footer now pairs plain-language testnet file-safety
  guidance with an accessible copy control for the optional `omslice.eth` donation address. A
  production-build browser regression verifies the exact copied value, visible success feedback,
  a manual-copy recovery message when clipboard access is blocked, a 44-pixel mobile target, and
  no horizontal overflow.
- **Verified:** Workspace notifications are no longer presented as an empty bell on a clean
  signed-out landing page. Production outage coverage proves the control is absent publicly, and
  the provider-independent invitation regression proves it remains present once a valid
  role-locked workspace loads.
- **Verified:** A landlord action on an older finalized record now re-verifies the stored
  finalization receipt, exact participants and approved terms, selected token, and creating
  landlord before accepting the new receipt. A mismatched or unavailable original receipt fails
  closed, while successful recovery records the exact landlord wallet once for later checks. The
  credential-free incident rehearsal covers both the recovery and a relabeled landlord denial.
- **Verified:** Failed private-record loads in the landlord claim flow now hide the unresolved
  compliance checklist, disable claim and amendment actions, announce the failure, focus an
  explicit retry, and recover without reloading the page. The tenant response flow keeps its
  time-sensitive onchain action available while separately retrying the unavailable private
  summary. Proposal-invitation and claim/response notice audit saves no longer leave unhandled
  promises: the primary copy, email, or onchain action remains intact and the user receives
  plain-language recovery guidance. A rendered 390-pixel browser regression holds both retries
  open long enough to verify `aria-busy` and disabled-button progress, proves a failed retry
  restores focus, then proves the next retry recovers without horizontal overflow. The same
  rendered flow proves a tenant-claim email accepted for delivery is never relabeled as failed
  when only the subsequent private-record refresh is unavailable. It now holds that delivery
  pending until the duplicate-send control is proven disabled, eliminating a timing race from the
  rehearsal itself; delivery remains bound to the initiating access scope, and the record-only
  retry cannot resend it.
- **Verified:** A successful finalization preflight no longer bypasses the exact official-source
  gate if a required source changes, goes stale, becomes pending, or falls out of the registry
  before receipt finalization. The preflight remains an audit event, but carries no temporary
  waiver. A focused regression changes a required source after preflight and proves the proposal
  stays unfinalized.
- **Verified:** A ready proposal now searches bounded public event ranges after its saved
  finalization preflight for one unambiguous exact existing finalization before any new agreement
  transaction can be submitted. The browser candidate must
  match the connected landlord, approved funding tenant, arbiter, deposit amount, possession-
  return date, and timing periods; the server still verifies the exact receipt, deployed contract,
  token, every tenant share, sender, and exclusive proposal assignment. Multiple exact public
  candidates, an RPC failure, or a receipt already assigned to another proposal all fail closed. A
  found receipt disables duplicate creation and is stored without a bearer under the exact
  proposal, role, and wallet until its private Record save succeeds. A rendered 390-pixel rehearsal
  proves failure focus, role isolation, reload recovery, local cleanup, and zero new contract
  writes.
- **Verified:** Versioned compliance snapshots now validate their stored collection, source,
  fact, deposit-cap, overlay, and claim-policy shapes before use. Malformed D1-decoded snapshots
  fail closed without throwing or falling back to current rules, while valid evaluations are
  recursively copied and frozen so later parsed-record or consumer mutations cannot alter them.
- **Verified:** A finalized, unfunded agreement can no longer be cancelled onchain while remaining
  active in the hosted workspace. The new Record action is landlord-only and requires a successful
  Base Sepolia receipt from the verified agreement creator with the exact deployed contract,
  `ProposalCancelled` event, and agreement ID. A D1 migration extends the atomic receipt guard
  without deleting historical duplicates. The readable report remains available after the status
  becomes cancelled, while the active proposal/deposit lists update immediately. A rendered mobile
  outage rehearsal proves reload recovery is bearer-free, wallet-scoped, keyboard-focused,
  44 pixels high, and incapable of submitting the cancellation twice. If the original tab is no
  longer available, matching landlord access now searches bounded public event ranges from the
  current block back to the saved finalization time, rejects unrelated or malformed logs, and sends
  only the discovered candidate through the same exact server receipt verifier. The rendered
  recovery path proves lookup retry, agreement isolation, a second Record-save retry after reload,
  no stored bearer or raw-hash prompt, and no new cancellation transaction.

## Remaining

- **Planned:** Review each newer exact saved candidate and explicitly approve a public deployment
  only when its testnet release envelope is acceptable; rerun readiness after every promotion.
- **Planned:** Review and broadcast the hardened, mutually bound Base Sepolia escrow/reserve pair
  and then its exact activity registry before changing the candidate contract configuration.
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

## Material unknowns

- Which cities/counties should receive the next local compliance overlays.
- Which authoritative service should attest the property's IANA timezone, and how qualified
  reviewers want local civil time and daylight-saving transitions applied in each pilot market.
  The current candidate stores explicit instants deterministically but cannot prove that the
  participant device timezone matches the property.
- Whether the pilot needs a separate ACH/bank-deposit path.
- Provider sandbox eligibility, cancellation semantics, fees, and support requirements until an
  actual provider sandbox is configured and exercised.
- The exact timing and scope of qualified counsel and independent security reviews.
- Which customer segment will pay first, which managed-service outcome they value, and the
  actual cost to deliver that outcome without weakening the open-source or consumer-protection
  commitments.
