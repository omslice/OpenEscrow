# Overnight handoff: next external readiness actions

Last refreshed: 2026-07-27 23:55:00-07:00 (Pacific)

## Owner-run items to unblock pilot

Please run these in production boundary before MVP pilot promotion:

1. **Email delivery**
   - Configure one of:
     - `RESEND_API_KEY` for production mail
     - `EMAIL_WEBHOOK_URL` + `EMAIL_WEBHOOK_TOKEN`
   - Validate: `/api/system/readiness` reports `email.configured = true`.

2. **Hosted scheduler**
   - Create cron trigger (`*/15 * * * *`) for the deployed environment.
   - Validate:
     - `readiness.email.schedulerConfigured === true`
     - `readiness.email.schedulerHealthy === true`
     - `readiness.email.schedulerLastRunAt` is recent.

3. **Evidence encryption**
   - Set `EVIDENCE_ENCRYPTION_KEY` (32+ random bytes).
   - Validate `readiness.evidence.encryptedAtRest === true`.

4. **Activity registry binding**
   - Set `VERIFY_ACTIVITY_REGISTRY_BINDING=true` and confirm it is live.
   - Validate:
     - `readiness.recordIntegrity.activityRegistry.configured === true`
     - `readiness.recordIntegrity.activityRegistry.ready === true`
     - `boundEscrowAddress` matches `expectedEscrowAddress`.

5. **Address attestation**
   - Set `ADDRESS_ATTESTATION_SECRET` (32+ secret bytes).
   - Validate `readiness.addressValidation.configured === true`.

6. **Compliance monitor**
   - Set `COMPLIANCE_SOURCE_MONITOR_ENABLED=true` in runtime.
   - Validate `readiness.complianceSources.monitorHealthy === true` and stale counters are low.

## Deployment runbook (nightly cycle)

1. `cd frontend && npm run check` (must pass before shipping)
2. `npm run build:sites`
3. Publish `frontend/dist` via the configured OpenAI Sites target (`.openai/hosting.json`).
4. Run:
   - `npm run pilot:check`
   - `npm run pilot:check:artifact` (recommended for deploy evidence) to emit `--json` payload to `.pilot-readiness`.
   - Optionally run `npm run pilot:check:json` for terminal-readable output.
   - For local repeatable candidate packaging, run: `npm run deploy:pilot-candidate`.
5. Confirm:
   - `/api/system/readiness` responds 200
   - `readinessSummary.ready === true` before supervised pilot sign-off.

### Updated one-command path

- `npm run deploy:pilot-live` now runs the stable candidate pipeline from the repo:
  1. local check + build + packaged readiness artifact (`deploy:pilot-candidate`)
  2. optional read-through readiness artifact refresh on explicit `--base-url=...`
  3. optional publish execution when `OPENESCROW_SITE_PUBLISH_COMMAND` is configured

- If no publish command is configured, the script now:
  - preserves existing `.openai/hosting.json`
  - confirms build/artifact readiness succeeded
  - exits safely with exact handoff instructions so we keep the environment safe until ownership handoff is ready.

- Next required owner action for one-click publish:
  - Set `OPENESCROW_SITE_PUBLISH_COMMAND` in your deployment environment and rerun:
    - `npm run deploy:pilot-live -- --base-url=https://openescrow-demo.omrigross.chatgpt.site`
  - Example:
    - `OPENESCROW_SITE_PUBLISH_COMMAND="npx sites-cli publish --project {project_id} --dist {dist}" npm run deploy:pilot-live`
  - After that, keep this command and the generated entry in `frontend/.pilot-readiness/` for evidence.

## Current status

- In-repo readiness summary and actionable blockers are now shown in:
  - Overview "Pilot readiness" panel
  - Account settings disclosure
- New in-repo readiness usability improvement this cycle: quick overview snapshot copy action.
- External blockers are unchanged from prior cycle:
  - email + scheduler
  - evidence encryption
  - activity-registry binding verification
  - address attestation
  - compliance source monitor freshness
- Latest in-repo blocker check is stored at:
  - `frontend/.pilot-readiness/openescrow-demo.omrigross.chatgpt.site-2026-07-27T05-56-23-139Z.json`
- This cycle also completed the accessibility usability step for claim-response controls in tenant workflows:
  - grouped/labelled radio controls for “Approve in full / Approve part / Dispute in full”
- Latest readiness command execution this cycle:
  - `npm run pilot:check` (exit code 1: expected external dependency blockers unchanged)
- Script upgrade in this cycle:
  - `frontend/scripts/check-pilot-readiness.mjs` now appends concise owner remediation guidance for each required failure so operators can execute the same command and apply fixes faster.

## Ownership matrix

- **Required before MVP pilot:** email provider, scheduler, evidence encryption, registry binding, address attestation, compliance monitor freshness.
- **Nice-to-have after first pilot:** encrypted decentralized evidence.
- **Owner-decisions needed:**
  - Whether to delay onchain-sensitive flows until all required checks are green.
  - Whether decentralized encrypted evidence becomes required for phase-2.
