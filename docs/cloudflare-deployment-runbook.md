# OpenEscrow Cloudflare deployment runbook

This runbook keeps the standalone landing fallback and the unified Base Sepolia MVP as independent
Cloudflare Workers during staging. The MVP's signed-out introduction and authenticated About tab
are the intended public project experience. The existing ChatGPT Sites deployment remains
unchanged until the owner-hosted MVP passes the complete pilot acceptance gate.

## Account boundary

- Authorized account: `Omrigross@gmail.com's Account`
- Cloudflare account ID: `ac83ad901f0f00358a9b59e81487d354`
- Workers account subdomain: `omslice.workers.dev`
- Do not deploy, create resources, or change DNS in the unrelated `Piper` account.
- Wrangler's OAuth credential is stored in the user's local Wrangler configuration, not this
  repository. Never commit or paste it.

## Independent Workers

| Deployable | Staging Worker | Production-testnet Worker | Stateful bindings |
| --- | --- | --- | --- |
| Landing fallback | `openescrow-landing-staging` | Not planned while the unified app is canonical | None |
| Unified MVP | `openescrow` | `openescrow-mvp-testnet` | `DB`, `EVIDENCE`, `ASSETS` |

The landing page can be deployed without changing the MVP database, evidence bucket, secrets, or
scheduled jobs.

## Provisioned resources

- Staging D1: `openescrow-mvp-staging` (`60dae94f-334d-4d71-89e2-6ce9e386fd9d`)
- Production-testnet D1: `openescrow-mvp-testnet`
  (`523a7141-5688-4779-a9e2-d40e28c5bd78`)
- Staging R2 name: `openescrow-mvp-evidence-staging`
- Production-testnet R2 name: `openescrow-mvp-evidence-testnet`

All 21 repository D1 migrations have been applied to the staging D1 database. Production-testnet
migrations remain intentionally unapplied until the data-continuity decision and release gate.

On 2026-08-08 the owner activated R2 in the pinned account. The two named buckets above were then
created through Wrangler and verified empty and private: their `r2.dev` URLs are disabled and they
have no custom domains. The remote staging preflight now proves both exact binding targets exist
and that all staging migrations are current before any deployment command can run. Evidence still
must be encrypted at the application layer and pass the retained-key recovery gate; bucket privacy
does not replace that control.

## Local validation and deployment

From `landing`:

```powershell
npm run check
npm run cloudflare:dry-run
npm run cloudflare:deploy:staging
npm run test:deployed
```

From `frontend`:

```powershell
npm run release:check
npm run cloudflare:dry-run
npm run check:cloudflare-remote:staging
npm run build:cloudflare
# First deployment only; generates security keys, stores a Windows-DPAPI recovery copy,
# and uploads the keys with the first Worker version without printing their values:
npm run cloudflare:bootstrap:staging
npm run cloudflare:deploy:staging
npm run cloudflare:readiness:staging
# Run only after the identical clean commit is published to ChatGPT Sites:
npm run check:dual-host
```

The staging MVP deploy command packages an exact clean Git commit, proves the pinned D1 and R2
resources exist before migration, verifies migrations afterward, deploys, and then verifies the
public shell, security headers, exact commit, private evidence binding, encryption, notification,
address-attestation, receipt, and registry state. A dirty-source package is available solely for
local dry runs and is stamped `sourceDirty: true`. The readiness command remains a separate gate
because scheduler and source-monitor health require a real hosted run after deployment.

The one-time staging bootstrap refuses to run if the `openescrow` Worker already exists. It creates
fresh staging-only evidence-encryption and address-attestation secrets, verifies a Windows
DPAPI-protected recovery copy under the current user's `.openescrow/recovery` directory, uploads
the secrets with the first Worker version, and removes the plaintext temporary file. The core
deployment verifier requires private R2, encryption/keyring readiness, address attestation,
receipt verification, and registry binding. Email delivery and scheduler/source-monitor freshness
remain separate pilot gates and must pass before promotion.

## Exact-source dual-host rule

Until Cloudflare completes the supervised pilot and rollback exercise, every normal public release
must be published to both the Cloudflare MVP and the existing ChatGPT Sites project from the same
clean Git commit. Do not describe a release as delivered until `npm run check:dual-host` proves that
both homepages and readiness endpoints are reachable, both report `sourceDirty: false`, and both
report the expected full commit SHA. If either host cannot be updated, hold the normal release or
record an explicit emergency exception; never silently let the two public applications drift.

The two hosts retain independent deployments, databases, object stores, secrets, and rollback
histories. Matching application source does not imply that their hosted records have been copied.

## Secrets and provider configuration

Enter secrets with Wrangler or the Cloudflare dashboard. Do not add their values to
`wrangler.jsonc`, `.env.production`, chat, screenshots, or build artifacts.

Required before staging readiness can pass:

- `EVIDENCE_ENCRYPTION_KEY`
- `EVIDENCE_ENCRYPTION_KEY_ID`
- `ADDRESS_ATTESTATION_SECRET`
- notification provider values (`RESEND_API_KEY`, or the documented webhook alternative)

Provider-side actions are also required: add the staging and final MVP origins to Privy and any
OAuth allowlists. Keep Base Sepolia and synthetic-data restrictions in place.

## Promotion and rollback

1. Verify staging landing and MVP URLs, `/api/system/readiness`, the exact release commit, D1/R2
   bindings, evidence encryption, and the 15-minute scheduled job.
2. Complete the separate-account synthetic landlord/tenant pilot and incident/privacy drill.
3. Attach the selected primary hostname to the unified MVP Worker; optionally redirect an
   `app.<domain>` alias to that canonical origin.
4. Keep the existing Sites URL available until the owner accepts the Cloudflare pilot and a
   rollback exercise succeeds.
5. If hosted D1/R2 export cannot be verified, start Cloudflare with a disclosed fresh synthetic
   dataset and retain Sites as the historical-data reference. Never imply that records migrated.
6. For each interim release, publish one clean commit to both hosts and run
   `npm run check:dual-host` before reporting delivery.
