# Overnight priorities (next in-progress focus)

## Overnight goal

Objective: advance the highest-impact roadmap items needed for a safe, testnet-ready MVP release without enabling any production-money behavior.

Acceptance criteria (for this goal):

- We finish one high-risk/high-value item end-to-end or, if blocked, document a clear blocker and next action.
- We keep the active app demo and existing bindings/production boundaries unchanged.
- We run `npm run lint`, `npm run test:client-logic`, `npm run test:server`, and `npm run build` before handing over.
- We report what changed, what is still blocked, and what still requires your manual action.

This is the operational list for continuing work tonight while we keep the current testnet
boundaries.

## In progress

- **[Verified]** Host-safe testnet UI and record workflow hardening
  - Collapsed agreement list with archive actions in the Record workspace.
  - Localized readiness checks surfaced in account/settings (email, scheduler, encryption key,
    registry binding, address attestation, compliance-source freshness).
- **[Verified]** Branding and visual system already aligned with requested palette
  - Primary brand color `#8522CC` and near-black `#08060D` are set as theme tokens.
  - Logo and favicon reflect the current requested asset and include automatic dark-mode variants.
- **[Verified]** Stability baseline
  - `npm run lint`, `npm run test:client-logic`, `npm run test:server`, and `npm run build`
    currently pass on this branch.

## Remaining

- **[Planned]** Close remaining hosted production-boundary gates before any controlled pilot:
  - Configure automatic email provider + 15-minute hosted Cron.
  - Generate/set `EVIDENCE_ENCRYPTION_KEY`.
  - Validate and pin the activity registry binding.
  - Set `ADDRESS_ATTESTATION_SECRET`.
  - Resolve official compliance source alert states (pending/changed/stale/blocked).
- **[Planned]** Complete pilot-run playbooks end-to-end
  - Separate-account supervised pilot runbook
  - Independent accessibility/usability pass (five moderation sessions)
- **[Planned]** Decide the long-lived onboarding/fiat path
  - Confirm whether a separate ACH/bank-deposit funding path is required for your target pilot
    market and add provider-specific safeguards.

## Unknowns (need partner/owner decisions)

- Provider/routing strategy for future on-chain-compatible deposit funding beyond current USDC-first pilot.
- Scope and acceptance criteria for “local” overlays in the first city/county rollout (beyond what is
  already wired in code).
- Whether a decentralized evidence mode should remain optional versus becoming default for any future
  pilot cohort.

This list should be refreshed each evening so you can continue from the current highest-impact item
without losing momentum.
