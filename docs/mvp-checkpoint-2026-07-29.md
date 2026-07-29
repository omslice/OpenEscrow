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
- **Verified:** The full repository release check passes with 71 server tests, 39 client-logic
  tests, lint, browser accessibility/mobile and load-recovery smoke checks, and the production
  build. Accessibility is now part of the required `npm run check` path rather than a separate,
  potentially stale result.
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
