# OpenEscrow Cloudflare deployment runbook

This runbook keeps the public project landing page and the authenticated Base Sepolia MVP as
independent Cloudflare Workers. The existing ChatGPT Sites deployment remains unchanged until the
owner-hosted MVP passes the complete pilot acceptance gate.

## Account boundary

- Authorized account: `Omrigross@gmail.com's Account`
- Cloudflare account ID: `ac83ad901f0f00358a9b59e81487d354`
- Do not deploy, create resources, or change DNS in the unrelated `Piper` account.
- Wrangler's OAuth credential is stored in the user's local Wrangler configuration, not this
  repository. Never commit or paste it.

## Independent Workers

| Deployable | Staging Worker | Production-testnet Worker | Stateful bindings |
| --- | --- | --- | --- |
| Landing page | `openescrow-landing-staging` | `openescrow-landing` | None |
| MVP | `openescrow-mvp-staging` | `openescrow-mvp-testnet` | `DB`, `EVIDENCE`, `ASSETS` |

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

The prepared Worker configuration expects private R2 bindings, but R2 has not been activated and
no account/billing action has been authorized. Before deploying the MVP, the owner must either
approve R2 activation, choose a compatible private object store and let the application adapter be
updated, or keep evidence on Sites during the first owner-hosted phase. Any new evidence store must
keep public access disabled and pass the encryption, recovery, and data-continuity gates.

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
npm run cloudflare:deploy:staging
```

The staging MVP deploy command packages an exact clean Git commit, applies pending migrations to
the staging D1 database, and deploys only after both steps succeed. A dirty-source package is
available solely for local dry runs and is stamped `sourceDirty: true`.

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
3. Attach the selected primary hostname to the landing Worker and `app.<domain>` to the MVP.
4. Keep the existing Sites URL available until the owner accepts the Cloudflare pilot and a
   rollback exercise succeeds.
5. If hosted D1/R2 export cannot be verified, start Cloudflare with a disclosed fresh synthetic
   dataset and retain Sites as the historical-data reference. Never imply that records migrated.
