# Overnight priorities (next in-progress focus)

## Overnight goal (set 2026-07-27, active, refreshed 2026-07-27 23:40 local)

Primary objective: continue the next highest-confidence roadmap items overnight with no
production-money behavior, keep the candidate work testnet-safe, and preserve an explicit
**In progress / Remaining** status after each session.

### Acceptance criteria for this checkpoint

- Keep local checks green: `npm run check`, `npm run pilot:check`, `npm run build:sites`.
- Preserve testnet-only boundaries (no real-money route changes without explicit release approval).
- Continue the next-high-leverage work in short cycles and refresh verified status after each cycle.
- Leave clear, explicit owner actions for anything blocked on external setup.
- Keep one-click readiness reporting available for scripts/automation.

### Overnight execution order (unhindered)

1. Ship one remaining UI/experience or observability item that does not depend on third-party credentials or contract changes.
2. Re-run `npm run check`, then `npm run pilot:check`.
3. Refresh `In progress / Remaining` and unknowns immediately after checks.
4. Prepare the deploy-candidate handoff package and readiness evidence.

### Current checkpoint (2026-07-27)

- **Verification run:** `npm run check` ✅ passed (lint, server tests, client logic tests, build).
- **Readiness run:** `npm run pilot:check` ❗ failed due expected external configuration blockers.
- **Packaging run:** `npm run build:sites` ✅ generated deployable `frontend/dist`.
- **Readiness scan:** `npm run pilot:check` currently reports:
  - ACTION: automatic email provider not configured
  - ACTION: hosted scheduler run not recorded
  - ACTION: evidence encryption key not configured
  - ACTION: version-matched onchain registry binding not verified
  - ACTION: address attestation secret not configured
  - ACTION: compliance source gate still blocking new profiles
  - ACTION: compliance monitor freshness not enabled
- **Plan for this checkpoint:** prioritize one in-repo readiness/pilot-ops automation item, then handoff-ready ops steps for external blockers.
- **Current checkpoint update:** `Readiness` now includes a freshness timestamp and refresh flow is wired through both overview auto-refresh and AccountCenter updates.
- **Current checkpoint update (overnight 23:40):** Added direct **Copy snapshot** action in the overview pilot-readiness card for quick operator exports.
- **Current checkpoint update (overnight 23:40):** Added `npm run deploy:pilot-live` orchestration to keep candidate packaging and optional publish handoff in one sequence.
- **Current checkpoint update (overnight 23:50):** Re-ran `npm run check` and `npm run build:sites` successfully; `npm run pilot:check` remains blocked by external config only.
- **Current checkpoint update (overnight 23:50):** Next selected next action: finalize an owner-operated readiness playbook for external dependencies, then continue low-risk UX/reliability tasks.
- **Current checkpoint update (overnight 23:40):** Simplified evidence trail display to keep technical pointers hidden from routine workflow while keeping document access available.
- **Current checkpoint update (overnight 23:50):** Completed the next accessibility sweep step in landlord/tenant high-friction flow: grouped tenant claim-decision controls into an explicit form fieldset with labeled radios so keyboard/screen-reader behavior is consistent across claim workflows.
- **Current checkpoint update (overnight 23:50):** Latest deploy-readiness evidence written to:
  - `frontend/.pilot-readiness/openescrow-demo.omrigross.chatgpt.site-2026-07-27T05-56-23-139Z.json`

## In progress

- **[Verified]** Host-safe testnet UX has major flows in place for overview/account/record.
- **[Verified]** Deposit routing and yield discoverability are now wired with explicit access (learn-more path).
- **[Verified]** Service readiness is now summarized in the app (overview + account/settings) with clear next actions and session-freshness metadata.
- **[Verified]** Brand tokens and logo pass added into dashboard and public components.
- **[Verified]** Account/settings disclosure and readiness summary flow is now syntax-clean and no longer duplicated.
- **[Verified]** Workspace tabs now use stronger visual prominence and clearer labelling for tenant/landlord role views.
- **[Verified]** Quick-access record cards now label role view context in clearer language.
- **[Verified]** Record tab now renders current agreements/proposals as a collapsible list and supports archive/restore as a view-filtering action.
- **[Verified]** Readiness JSON output is now a dedicated script alias: `npm run pilot:check:json`.
- **[Verified]** Added local repeatable pilot-candidate handoff command: `npm run deploy:pilot-candidate`.
- **[Verified]** Overview readiness card now includes quick copy for session readiness payload in UI.
- **[Verified]** Added in-repo deploy orchestration (`npm run deploy:pilot-live`) that safely runs checks/build/readiness artifact and optional publish execution path.
- **[Verified]** Added role-bound permission regression coverage for landlord/tenant action boundaries in `frontend/server/index.test.mjs`.
- **[Verified]** Enhanced `pilot:check` to include operator remediation guidance per required blocker (action + validate lines), reducing owner setup ambiguity.
- **[Reported]** `pilot:check` confirms blockers still requiring hosted/ops work:
  - email provider + scheduler
  - evidence encryption key
  - activity registry binding verification
  - address attestation secret
  - compliance source monitor enablement and freshness.
- **[Completed]** Next checkpoint target: run one in-repo, user-visible polish item first, then leave platform blockers untouched for this cycle.
- **[Reported]** Deployment-loop still depends on owner-side publish command/CLI availability for hands-off publication.

## Remaining

- **[Planned]** Resolve hosted production-boundary gates before supervised pilot:
  - email provider + scheduler
  - evidence encryption key
  - activity registry binding
  - address attestation
  - compliance-source monitor freshness
- **[Completed]** Finalize record/overview discoverability details (especially notification and quick-entry affordances): consolidated record list/quick actions and archive flow, plus evidence trail simplification.
- **[Completed]** Complete pilot runbook: separate-account role sanity checks and onboarding (verified by server test: role-scoped discovery and archive access are isolated by signed-in account and role).
- **[Completed]** Finish accessibility/usability checks on critical landlord/tenant flows and verify no remaining regressions in high-friction entry points (especially claim evidence and record management).
- **[Completed]** Add a publish-orchestrating bridge for OpenAI Sites (e.g., CLI-based or delegated runbook step) so deployment handoff can be one-click from this repository.

## Overnight follow-through now

- Prioritize the next roadmap slice: **pilot handoff prep + external readiness ownership** (no code risk, higher confidence on owner actionability).
- Next follow-through: convert remaining external readiness blockers into a single owner execution checklist with command-level verification.
- Keep `npm run check` and `npm run build:sites` green first; do not promote blocked external config into user-facing behavior.
- For pilot readiness, collect required ownership actions for:
  - email provider/scheduler secrets and run cadence
  - evidence encryption key/rotation
  - activity registry verification and binding audit
  - address attestation secret
  - compliance source monitor enablement and freshness

## Unknowns

- Whether owner-side publish command/CLI availability is required on your active environment for fully unattended one-click publication.
- Whether to prioritize UI polish versus hosted-readiness hardening for the next checkpoint if both are green.
- Which compliance/funding service decisions should become blockers for MVP versus post-MVP work.

This list should be refreshed each evening so we can continue from the current highest-impact item.

