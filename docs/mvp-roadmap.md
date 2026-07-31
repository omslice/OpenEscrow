# OpenEscrow testnet MVP roadmap

Updated 2026-07-31. This is the canonical high-level project status. The
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
  only on a separate release check.
- **Verified:** Authorization, invitation, cross-account isolation, evidence encryption/keyring
  recovery, tamper detection, transaction receipt binding, and privacy failure modes have
  dedicated server, client, and operator-command regressions. Invitee bearer recovery is limited
  to the current tab, while verified account sessions and landlord-created access retain their
  distinct durability boundaries. Older finalized records must re-prove the exact original
  agreement creator before another landlord receipt can be recorded; the recovered wallet is
  retained for later checks.
- **Verified:** The release dependency audit blocks every high/critical finding and every unknown
  moderate advisory. The former transitive `uuid` advisory is removed from the locked
  wallet-provider tree; all UUID paths now resolve to the reviewed bounds-safe release, connector
  imports are exercised on every candidate, and the production dependency audit is clean with no
  active exceptions.
- **Verified:** Critical flows have rendered accessibility, keyboard/focus, mobile-width, loading,
  error, and retry checks. Remaining usability work requires moderated human sessions rather than
  another code-only claim.
- **Verified:** The Record workspace now leads with plain-language report, private-backup, public-
  proof, and independent-check guidance. Encryption algorithms and raw fingerprints remain
  available in keyboard-accessible collapsed disclosures; the rendered rehearsal still proves
  narrow-screen layout, separate-key export, wrong-key rejection, and local verification during
  a public-proof outage.
- **Verified:** A public-receipt query failure is no longer hidden inside collapsed history.
  The visible recovery panel explains that agreement activity was not removed, keeps raw
  connection text in an optional disclosure, offers an explicit retry, restores keyboard focus
  after a failed retry, and remains usable at mobile width without repeating an agreement action.
- **Verified:** Validated U.S. addresses route to immutable, versioned state snapshots with
  conditional/business-day deadline regression coverage and fail-closed official-source gates.
  This is a best-effort research aid, not an assertion that every legal rule is complete.
- **Verified:** Provider-neutral funding abstractions cover eligibility, one active attempt,
  cancellation, interruption, refund, failure, reconciliation, and unverified terminal outcomes.
  Real-money and production provider routes remain disabled.
- **Verified:** Deferred workspace loading, bounded onchain event reads, shared receipt polling,
  one-snapshot wallet discovery, and workspace-only blockchain wallet providers reduce initial and
  repeat network work without weakening account recognition, invitation roles, or receipt checks.
- **Verified:** A clean logged-out visit now shows neutral Google/wallet sign-in instead of loading
  the agreement workspace or asking for a role. Only a valid invitation can preselect a role, and
  its bearer token is scrubbed before the lazy workspace loads. The production browser budget
  holds the landing path to 48 or fewer JavaScript requests and 2.27 MB or less, keeps the 62 KB
  U.S. jurisdiction registry and blockchain wallet providers deferred, verifies mobile access and
  focus, and proves linked agreements and valid invitations retain their intended routing. A
  failed first workspace download can be reloaded in the same tab without restoring the bearer to
  the URL or losing the exact invitation role.
- **Verified:** The shared public/workspace footer explains testnet file safety in plain language
  and offers an accessible, mobile-size control to copy the optional `omslice.eth` donation
  address. Donations are explicitly separate from deposits and product access.
- **Verified:** The clean signed-out landing page omits the empty agreement-notification bell.
  Notification access remains available after authentication and on valid role-locked invitation
  workspaces.
- **Verified:** The public readiness endpoint returned HTTP 200 on 2026-07-30, but the deployed
  site is older than the saved candidate and exposes no exact release provenance. It reported
  eight required pilot actions: release provenance, email, scheduler, evidence keyring, activity
  registry binding, address attestation, official-source baseline, and monitor freshness.
- **Verified:** Exact candidate source is release-checked, pushed, and saved as an undeployed
  Sites version after each completed delivery slice. D1, R2, hosted data, runtime secrets,
  configuration, and the public deployment remain unchanged.

## Remaining

- **Planned:** Review and explicitly approve the newest saved candidate, deploy that exact testnet
  source, then rerun the hosted readiness check so release provenance is verifiable.
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
