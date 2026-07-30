# Testnet MVP checkpoint — 2026-07-29

This checkpoint records repository and delivery evidence without claiming legal approval,
production readiness, or authorization to hold real rental deposits.

## In progress

- **Verified:** A locally packaged Sites candidate includes the latest pilot rehearsal, security,
  accessibility, compliance-regression, funding-failure, and hidden-tab performance work.
- **Verified:** Twelve credential-free rehearsals pass: five lifecycle scenarios covering
  archive/restore, record proof, disputed claim, accepted claim, and no-claim refund, plus three
  private-evidence and notification outage/recovery scenarios, one arbiter-link/session reset,
  one verified-arbiter identity recovery/isolation scenario, and one verified-account session
  containment scenario, plus one role-isolated account data-inventory scenario.
- **Verified:** A separate 12-scenario incident-response rehearsal passes for identity forgery,
  cross-account isolation, cross-site read isolation, account-session containment, privacy
  inventory, evidence tamper, retained-key rotation, outages, notification recovery, receipt
  spoofing, and RPC fallback.
- **Verified:** The full repository release check passes with 73 server tests, 60 client-logic
  tests, lint, browser accessibility/mobile and load-recovery smoke checks, and the production
  build. Accessibility is now part of the required `npm run check` path rather than a separate,
  potentially stale result.
- **Verified:** Address-routed compliance snapshots now recursively detach and freeze nested
  rules, sources, overlays, and claim checks. Snapshot-level regressions cover conditional Maine
  paths, Arizona business-day and holiday arithmetic, and fail-closed handling for unsupported
  day-count metadata without changing any legal rule.
- **Verified:** Provider checkout reconciliation now prevents an immediate second purchase after
  submitted, confirmed, or indeterminate results. The user can refresh the destination wallet
  balance without recording agreement funding; only explicit cancellation or failure permits an
  immediate retry. A provider-neutral lifecycle now survives page refresh, rejects internally
  inconsistent state and conflicting duplicate events, and models delayed confirmation,
  cancellation, failure, and refunds. Real-money funding remains disabled.
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
- **Verified:** Dynamic wallet setup, test-fund, negotiation, role-mismatch, onchain-activity,
  record-export, account-security, notification, and receipt-recovery outcomes expose explicit
  status or alert semantics. This improves screen-reader feedback without stealing keyboard focus;
  moderated assistive-technology testing remains a separate pilot task.
- **Verified:** The authenticated wallet/workspace is loaded behind a lightweight bootstrap, and
  an automated browser bundle budget guards initial, total, and largest-chunk growth. Direct
  HTML-referenced JavaScript fell from 2,620,477 bytes to 212,630 bytes (about 92%) in the
  production build; the authenticated workspace then loads asynchronously.
- **Verified:** The exact validated candidate source was pushed to the existing Sites source
  branch and saved as a newer undeployed version. Production remains on saved version 56.

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
- **Verified:** Infrequently used proposal, deposit, funding, invitation, and record tools load
  only when their tab or expanded section needs them. This reduced the main workspace chunk from
  about 345.9 KB to 74.2 KB (about 79%) while preserving keyboard focus behavior.
- **Verified:** Failed app-bootstrap and deferred workspace loads now show a focused, actionable
  recovery panel instead of a blank page. An automated browser check intentionally fails both
  load paths and verifies that workspace navigation remains available after a section failure.
- **Verified:** Private-evidence upload/download and notification-provider outages fail closed
  with retry guidance. Failed attempts create no phantom evidence or sent-delivery events, and
  automated recovery tests verify one successful retry remains idempotent.
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

## Material unknowns

- Which cities/counties should receive the next local compliance overlays.
- Whether the pilot needs a separate ACH/bank-deposit path.
- Provider sandbox eligibility, cancellation semantics, fees, and support requirements until an
  actual provider sandbox is configured and exercised.
- The exact timing and scope of qualified counsel and independent security reviews.
