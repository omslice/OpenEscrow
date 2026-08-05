# OpenEscrow testnet MVP roadmap

Updated 2026-08-04. This is the canonical high-level project status. The
[validation ledger](./mvp-checkpoint-2026-07-29.md) contains detailed evidence, and
[owner actions](./owner-actions.md) contains only work that needs credentials, signatures,
external professional review, or an owner decision.

Labels are evidence boundaries:

- **Verified** means the behavior is supported by current repository code, tests, build output,
  or a dated runtime check.
- **Reported** means it comes from an external handoff or prior record and has not been
  independently rechecked in this update.
- **Planned** means the outcome is not complete.

The product remains a Base Sepolia demonstration. Nothing here authorizes real deposits,
production custody, or reliance on the compliance research as legal advice.

## In progress

- **Verified:** Repeatable landlord/tenant rehearsals cover no-claim refund, accepted claim,
  disputed claim, archive/restore, record export and verification, privacy requests, service
  outages, and recovery paths with synthetic identities and testnet-only assets. The machine-
  readable pilot artifact includes the rendered encrypted-record workflow rather than relying
  only on a separate release check. A shared rendered mobile rehearsal now moves one agreement
  through a landlord claim, two isolated tenant decisions, an arbiter ruling, exact final
  allocation, three one-time withdrawals, and a complete header-authorized report without
  putting an access bearer in a URL or browser storage. The production account workspace is also
  rendered at mobile width while a proposal and its Record entry are archived, found in their
  separate archive disclosures, restored to the current list, and given predictable keyboard
  focus with 44-pixel actions without weakening live account isolation.
- **Verified:** Authorization, invitation, cross-account isolation, evidence encryption/keyring
  recovery, tamper detection, transaction receipt binding, and privacy failure modes have
  dedicated server, client, and operator-command regressions. Invitee bearer recovery is limited
  to the current tab, while verified account sessions and landlord-created access retain their
  distinct durability boundaries. Older finalized records must re-prove the exact original
  agreement creator before another landlord receipt can be recorded; the recovered wallet is
  retained for later checks. Routine agreement, report, and canonical-snapshot reads now keep the
  bearer out of current-client URLs by using a strict authorization header; authenticated report
  downloads remain usable, and missing, malformed, or wrong authorization headers fail closed
  without accepting an agreement bearer from a query string. Private supporting files likewise
  require a same-origin form POST: the former evidence `?token=` URL is rejected before D1 or R2
  access, so an agreement secret is not accepted from browser history, logs, or referrers.
  Newly generated participant invitations likewise keep their temporary credential in the
  client-only URL fragment while legacy query links remain one-time readable and immediately
  scrubbed. Conflicting or malformed credentials fail closed. Multi-tenant deduction notices are
  generated, validated, and delivered separately for each exact tenant; a missing, duplicated,
  query-based, or cross-tenant link blocks the entire notice request. Automatic claim and response
  email content is derived from the saved agreement events: the latest claim controls every
  tenant message, while a response notice must match the exact tenant and saved transaction. The
  server constructs the landlord dashboard link rather than accepting client-supplied copy.
- **Verified:** The release dependency audit blocks every high/critical finding and every unknown
  moderate advisory. The former transitive `uuid` advisory is removed from the locked
  wallet-provider tree; all UUID paths now resolve to the reviewed bounds-safe release, connector
  imports are exercised on every candidate, and the production dependency audit is clean with no
  active exceptions. A newly disclosed Hono CORS middleware advisory is also removed: the
  transitive wallet path is pinned to 4.12.34 and verified offline before each release.
- **Verified:** Critical flows have rendered accessibility, keyboard/focus, mobile-width, loading,
  error, and retry checks. Remaining usability work requires moderated human sessions rather than
  another code-only claim. The validated-address combobox keeps its controlled listbox present but
  hidden before and after lookup, exposes it as a listbox popup, and mounts interactive options
  only while suggestions are open; the rendered keyboard regression proves the complete contract.
  Proposal Continue actions and user-driven reset, replacement, and finalized-edit transitions
  move focus into the newly visible panel instead of leaving it on a removed review control.
- **Verified:** Claim requirements now fail closed when their private agreement record cannot be
  loaded, with a focused retry action before any claim or amendment can proceed. Tenant response
  remains available for time-sensitive onchain action while its private summary has a separate
  retry path. A rendered mobile-width browser regression proves retry progress remains visible,
  failed retries restore keyboard focus, and later recovery succeeds. Claim line-item additions
  and removals are announced, move keyboard focus to the relevant deduction, expose distinct
  removal names, and retain 44-pixel mobile targets without horizontal overflow. Invitation and
  notice audit-save failures are caught and explained without undoing a successfully opened email,
  copied link, submitted claim, or submitted response. Automatic tenant-claim email delivery is
  separately scoped from its follow-up record refresh: pending delivery cannot be double-sent,
  an account/access change discards stale completion, and a refresh-only outage retries without
  resending the email. Notification feedback now uses explicit progress, success, and error states
  rather than wording heuristics: even an error containing the word “sent” remains an assertive
  alert, failed claim delivery restores the retry button, and failed response delivery focuses a
  full-width 44-pixel manual fallback on mobile.
- **Verified:** After a testnet claim confirms, its private receipt retry is saved only in the
  current browser tab and is isolated by agreement, proposal, landlord wallet, and role without
  storing the bearer token. A rendered outage-and-reload rehearsal proves the retry regains focus,
  saves idempotently, clears only its matching recovery payload, and never submits a second
  onchain claim.
- **Verified:** Confirmed tenant responses and arbiter rulings now use the same bounded,
  bearer-free recovery model, scoped to the exact agreement, proposal, wallet, and participant
  role. Rendered mobile rehearsals prove an interrupted private-record save survives reload,
  restores focus to a 44-pixel record-only retry, clears only its matching payload, and never
  submits another blockchain decision. An append-only D1 guard makes transaction-receipt event
  creation atomic under simultaneous retries; the server authorizes the exact tenant or arbiter
  before returning an idempotent result, while preserving existing event history.
- **Verified:** Withdrawals and the no-claim, no-response, and arbiter-timeout outcomes now retain
  the same session-only recovery boundary after the testnet transaction confirms. Rendered mobile
  rehearsals interrupt each private-record save, change accounts, reload the original account,
  restore focus to the one safe receipt retry, and prove the wallet action count stays at one.
  Recovery payloads contain no bearer access, and concurrent withdrawal retries return an
  idempotent result only to the exact invited tenant that recorded the receipt.
- **Verified:** The server's receipt-replay shortcut now exact-binds multi-tenant operations-
  reserve, deposit-funding, withdrawal, response, and deadline actions. Concurrent retries from
  the initiating tenant resolve to one append-only event, while a co-tenant cannot reuse the same
  transaction hash to receive a false-success response. New deadline events carry the initiating
  tenant ID; historical single-tenant receipts retain their compatible retry behavior, while an
  unattributed historical receipt on a multi-tenant agreement fails closed.
- **Verified:** The Record workspace now leads with plain-language report, private-backup, public-
  proof, and independent-check guidance. Encryption algorithms and raw fingerprints remain
  available in keyboard-accessible collapsed disclosures; the rendered rehearsal still proves
  narrow-screen layout, authenticated readable-report download and outage retry with focus
  recovery, separate-key export, wrong-key rejection, and local verification during a public-
  proof outage. Record-check results now keep wallet addresses, network names, and the exact hash
  out of the primary status while retaining them in a 44-pixel optional disclosure. Claim
  supporting files likewise lead with category, date, and a direct file action; each wallet and
  fingerprint is independently collapsed, private access stays out of its URL, and a rendered
  mobile rehearsal proves scope isolation and safe same-file upload recovery.
- **Verified:** A public-receipt query failure is no longer hidden inside collapsed history.
  The visible recovery panel explains that agreement activity was not removed, keeps raw
  connection text in an optional disclosure, contains an unexpected retry rejection, and gives
  plain-language failure feedback. Focus returns to the exact retry control after every failed
  attempt in React's committed layout phase. Repeated keyboard failure and later recovery remain
  usable at mobile width without repeating an agreement action.
- **Verified:** Validated U.S. addresses route to immutable, versioned state snapshots with
  conditional/business-day deadline regression coverage and fail-closed official-source gates.
  Wallet preflight is an audited readiness check, not a waiver: finalization rechecks the exact
  source set and blocks any later changed, stale, pending, or incomplete source state. Stored
  snapshot collection shapes, exact canonical address/provider fields, HTTPS source records,
  facts, deposit caps, overlays, and v4 claim policies are validated before use; a malformed saved
  snapshot is shown as needing review rather than being evaluated or silently replaced with
  today's rules. Valid parsed evaluations are
  recursively copied and frozen. This is a best-effort research aid, not an assertion that every
  legal rule is complete.
- **Verified:** A manual official-source recheck accepts only the selected profile's exact version,
  citation, URL, status/review pairing, and chronological canonical timestamps. Unreachable
  sources are shown as needing attention, a failed retry cannot
  leave a stale green result beside its error, simultaneous requests share one bounded check, and
  an older late completion cannot overwrite a newer durable result. No rule content is rewritten.
- **Verified:** Compliance event inputs now reject impossible dates and timestamps without an
  explicit timezone before they can be stored. Business-day rules reject a malformed holiday
  calendar instead of silently dropping bad dates, inherited event fields are ignored, combined
  deadlines preserve calculation failures, and the participant timeline shows a plain-language
  needs-review state rather than hiding the affected deadline. No legal rule changed.
- **Verified:** Provider-neutral funding abstractions cover eligibility, one active attempt,
  cancellation, interruption, refund, failure, reconciliation, and unverified terminal outcomes.
  No-money submitted or interrupted previews can close through cancellation; confirmed and
  refund-pending previews can reset through the valid refunded transition. Rendered and durable
  regressions prove a new rehearsal can then start. Real-money and production provider routes
  remain disabled and require trusted provider or authorized-operator reconciliation. Rendered
  mobile coverage now proves failed sandbox checkouts can retry, unknown results stay locked until
  the no-money preview is explicitly closed, and an unverified production browser success remains
  non-retryable through wallet refresh and page reload without exposing the sandbox reset path.
- **Verified:** Funding selection and checkout now lead with a plain-language payment path and
  explain that OpenEscrow does not receive card or bank details. Provider and adapter IDs remain
  available in a collapsed technical disclosure and are covered by the rendered funding rehearsal.
- **Verified:** Deposit-asset cards now use readable, availability-aware labels such as Testnet
  option, Simulation, and Unavailable rather than exposing internal implementation statuses. The
  exact status remains in the immutable agreement snapshot for technical review.
- **Verified:** Content-hashed browser assets receive a one-year immutable cache policy while the
  HTML app shell, public files, and single-page fallbacks always revalidate. Repeat visits can
  reuse exact release bytes without risking a stale entry page after a deployment.
- **Verified:** Sponsored testnet writes now inspect the mined receipt status before continuing.
  A reverted or unknown receipt cannot mark a tenant share funded, claim test tokens, save a
  record proof, publish a private-activity receipt, or create a success-recovery record. The
  participant receives a plain-language failure instead, while production money remains disabled.
- **Verified:** Once a privacy-safe activity proof is confirmed, its publish control stays hidden
  while the private agreement receipt is saved. A failed save recovers only in the exact agreement,
  reopens and focuses the one safe retry after reload, stores no agreement-access bearer, and
  cannot issue a second onchain publication. The participant-facing publisher and verifier now
  explain the workflow as a private timestamped proof; raw fingerprints, wallet details, blocks,
  and receipt links remain available in collapsed technical disclosures. A rendered mobile
  rehearsal downloads the private file, survives the interrupted record save, verifies that same
  file against the public receipt, and keeps the primary success message free of technical IDs.
- **Verified:** Confirmed-action recovery now tells participants to finish adding the action to the
  Record instead of asking them to save a receipt. Finalization, funding, claim, response, ruling,
  deadline, withdrawal, arbiter-replacement, and public-proof controls explicitly say the safe
  recovery will not repeat the testnet action; technical receipts remain in secondary history and
  verification views.
- **Verified:** Interrupted arbiter acceptance and cancellation recovery no longer makes an
  ordinary participant find a transaction hash. The client searches only bounded Base Sepolia
  ranges near the saved proposal, rejects removed, malformed, wrong-agreement, and wrong-nominee
  events, and sends the latest candidate through the existing exact server receipt verifier. Raw
  hash entry remains available only in a collapsed technical recovery disclosure. A rendered
  mobile rehearsal proves lookup failure and retry, keyboard-focus restoration, 44-pixel summary
  and action targets, no overflow, and the successful server-authorized Record update.
- **Verified:** Cancelling a finalized but unfunded agreement now updates both the testnet contract
  and its private Record instead of leaving a cancelled agreement listed as an active deposit.
  The server fails closed unless the receipt proves the exact deployed contract, cancellation
  event, agreement ID, successful transaction, and verified landlord sender. The append-only D1
  receipt guard is upgraded in place, exact retries are idempotent, any pending replacement-
  arbiter access is revoked, and the timestamped report remains available. If the private save is
  interrupted, a wallet-, role-, agreement-, and proposal-scoped browser-tab recovery restores a
  focused 44-pixel Record-only retry without storing the bearer or submitting another transaction.
  If that tab is gone, matching landlord access can find the public confirmation through bounded
  backward event ranges and send it through the same server verifier. A rendered mobile rehearsal
  proves lookup failure and retry, agreement isolation, reload recovery after a save outage, no
  stored bearer, no raw-hash prompt, and no second contract write.
- **Verified:** A durable active sandbox attempt now reports whether it matches the currently
  requested wallet, asset, and amount, and the browser independently confirms that binding. A
  mismatch stays locked, is not copied into the new intent's local recovery key, and offers a
  plain-language close action before the updated no-money preview can open.
- **Verified:** Every saved checkout event now derives the same lifecycle state from its raw
  provider result. Contradictory pairs such as a confirmed event with a declined provider status
  fail closed in both the shared lifecycle validator and the tenant-authorized D1 endpoint.
- **Verified:** Deferred workspace loading, bounded onchain event reads, shared receipt polling,
  one-snapshot wallet discovery, and workspace-only blockchain wallet providers reduce initial and
  repeat network work without weakening account recognition, invitation roles, or receipt checks.
- **Verified:** Multi-agreement Deposit accounts now start as a compact list and mount only one
  live agreement view at a time, bounding contract polling and deferred tools as an account grows.
  A single deposit still opens automatically, while proposal links and activity notifications
  expand their exact target. Rendered keyboard and mobile-width coverage proves switching rows
  unmounts the prior live view and collapsing leaves focus on the same control.
- **Verified:** Every collapsed Record disclosure now retains the detail region referenced by its
  accessible control while expensive report, backup, verification, and onchain tools remain
  unmounted until the record is opened. A rendered multi-record regression proves valid collapsed
  targets, independent comparison of explicitly opened records, keyboard-focus retention,
  archive-action separation, 44-pixel touch targets, and no mobile overflow.
- **Verified:** A clean logged-out visit shows neutral Google/wallet choices without loading the
  account provider, agreement workspace, jurisdiction registry, or blockchain wallet code. The
  provider loads only after an explicit choice, opens the selected method without a second click,
  and recovers from both automatic and direct sign-in rejection without hiding the public page or
  loading a workspace. A non-sensitive device hint restores the provider for returning users but
  never starts sign-in by itself. The production regression now measures 10 initial JavaScript
  requests and about 245 KB, with enforced ceilings of 12 requests and 300 KB, roughly 79% fewer
  requests and 89% fewer bytes than the prior 48-request, 2.25 MB checkpoint. Valid invitations
  still preselect only their exact role, capture current-tab recovery and scrub the bearer before
  the provider module finishes loading, and fail closed before workspace or wallet code during an
  outage. Mobile sign-in, retry, focus, and same-tab workspace-download recovery remain covered.
- **Verified:** The shared public/workspace footer explains testnet file safety in plain language
  and offers an accessible, mobile-size control to copy the optional `omslice.eth` donation
  address. Donations are explicitly separate from deposits and product access.
- **Verified:** The clean signed-out landing page omits the empty agreement-notification bell.
  Provider-independent rendered coverage proves notification access remains available after
  authentication and on valid role-locked invitation workspaces.
- **Verified:** The public site and readiness endpoint returned HTTP 200 on 2026-08-03 and exposed
  exact release provenance for the approved source. Seven hosted pilot actions remain: email,
  scheduler health, evidence keyring, activity-registry binding, address attestation,
  official-source baseline, and monitor freshness.
- **Verified:** The latest approved public deployment matches its exact release-checked and pushed
  source. Each subsequent coherent slice is validated and saved separately for explicit review;
  D1, R2, hosted data, runtime secrets, and configuration remain unchanged.

## Remaining

- **Planned:** Review and explicitly approve each newer saved candidate before deployment. The live
  site currently matches the last approved exact source; every future deployment must rerun the
  public readiness and release-provenance checks.
- **Planned:** Complete the hosted pilot gates listed in
  [owner actions](./owner-actions.md): notification delivery and scheduler, evidence encryption
  and retained-key recovery, version-matched activity registry, address attestation, and a clean,
  fresh official-source baseline.
- **Planned:** Run the separate-account landlord/tenant pilot, moderated accessibility/usability
  sessions, and the owner-led incident/privacy drill. Record stop conditions and remediation.
- **Planned:** Evaluate one eligible provider sandbox using worthless testnet assets only.
  Production fiat, mainnet contracts, FRNT, USDY, and yield-bearing deposit routes stay disabled.
- **Planned:** Complete qualified legal, smart-contract, application-security, privacy, provider,
  accessibility, and operating-policy reviews before any real-money release.
- **Planned:** Add local U.S. overlays only for selected pilot markets and verified official
  sources. International compliance remains a later country/region/local expansion track.
- **Planned:** Validate managed hosting, professional workflows, integrations, and support as
  optional monetization paths while preserving the free, self-hostable core and free access to
  essential records.

## Material unknowns

- First pilot cities/counties and tenancy segment.
- The authoritative property-timezone source and qualified local civil-time/DST interpretation
  for each pilot market. The candidate stores explicit instants deterministically but does not
  yet attest that a participant device timezone matches the property.
- Provider sandbox eligibility, cancellation behavior, fees, support, and whether ACH is needed.
- Timing and exact scope of qualified counsel and independent security reviews.
- Results of separate-account and moderated human pilot sessions.
- First customer segment willing to pay for a managed outcome, and the cost to serve it without
  weakening consumer-protection or open-source commitments.

## Validation and delivery evidence

- `npm run check` is the required repository release check.
- `npm run pilot:rehearse` and `npm run incident:rehearse` exercise credential-free pilot and
  incident scenarios.
- `npm run deploy:pilot-candidate` runs the credential-free release, rehearsal, incident, and
  exact-source packaging gates in dependency order. Its machine-readable evidence binds both
  rehearsal summaries, their JUnit reports, and every packaged Sites byte to the candidate commit
  without querying or changing the live site.
- `npm run pilot:check` evaluates the currently deployed readiness endpoint and intentionally
  exits unsuccessfully while required hosted gates remain.
- `npm run build:sites` builds the candidate and verifies exact Git provenance before packaging.
- `npm run deploy:pilot-live` publishes only when an explicit publish command and verification URL
  are configured, then evaluates readiness against the newly published site.
- Saving a Sites version does not deploy it; public promotion is a separate owner-approved action.
