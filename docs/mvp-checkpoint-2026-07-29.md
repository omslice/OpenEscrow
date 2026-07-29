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
- **Verified:** A separate 10-scenario incident-response rehearsal passes for identity forgery,
  cross-account isolation, account-session containment, privacy inventory, evidence tamper and
  outages, notification recovery, receipt spoofing, and RPC fallback.
- **Verified:** The full repository release check passes with 70 server tests, 39 client-logic
  tests, lint, and the production build. The browser accessibility smoke check also passes.
- **Verified:** The authenticated wallet/workspace is loaded behind a lightweight bootstrap, and
  an automated browser bundle budget guards initial, total, and largest-chunk growth. Direct
  HTML-referenced JavaScript fell from 2,620,477 bytes to 212,630 bytes (about 92%) in the
  production build; the authenticated workspace then loads asynchronously.
- **Verified:** The public Sites project remains active and public on saved version 56. No newer
  version was saved or deployed during this checkpoint.
- **Blocked on owner action:** Sites did not return a source-repository credential, so the exact
  candidate commit cannot be pushed to the Sites source branch or saved as a new version yet.

## Remaining

- **Planned:** Reauthorize the Sites source repository, push the exact candidate commit, rebuild
  its archive from that commit, and save an undeployed Sites version for review.
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

## Material unknowns

- Which cities/counties should receive the next local compliance overlays.
- Whether the pilot needs a separate ACH/bank-deposit path.
- Provider sandbox eligibility, cancellation semantics, fees, and support requirements until an
  actual provider sandbox is configured and exercised.
- The exact timing and scope of qualified counsel and independent security reviews.
