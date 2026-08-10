# OpenEscrow Cloudflare deployment runbook

This runbook operates one public-facing Cloudflare application: the complete Base Sepolia MVP,
including its signed-out project introduction and authenticated **About** tab. The old standalone
landing Worker is retained only as a disabled rollback artifact and must not expose a public route.
The existing ChatGPT Sites deployment is a synchronized rollback build during transition. Its
user-facing routes redirect to `https://openescrow.io/`, its writes fail closed, and only its local
readiness endpoint remains available for exact-build verification. Its historical D1/R2 bindings
remain preserved and untouched.

## Account boundary

- Authorized account: `Omrigross@gmail.com's Account`
- Cloudflare account ID: `ac83ad901f0f00358a9b59e81487d354`
- Workers account subdomain: `omslice.workers.dev`
- Do not deploy, create resources, or change DNS in the unrelated `Piper` account.
- Wrangler's OAuth credential is stored in the user's local Wrangler configuration, not this
  repository. Never commit or paste it.

## Cloudflare deployables

| Deployable | Staging Worker | Production-testnet Worker | Stateful bindings |
| --- | --- | --- | --- |
| Retired landing artifact (public route disabled) | `openescrow-landing-staging` | None | None |
| Unified MVP | `openescrow` | `openescrow-mvp-testnet` | `DB`, `EVIDENCE`, `ASSETS` |

Do not deploy or publicly route the retired landing artifact during a normal release. Its source is
kept only for rollback history and does not replace the signed-out introduction or About tab.

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
public shell, security headers, exact commit, private evidence binding, encryption,
address-attestation, receipt verification, the activity-registry verification boundary, and the
compliance monitor. A dirty-source package is available solely for local dry runs and is stamped
`sourceDirty: true`. The stricter pilot verifier and readiness command remain separate gates
because notification delivery and a version-matched registry still require owner-controlled
configuration. Scheduler health and all 61 compliance-source gates are currently passing but stay
in the strict check so later regressions fail closed.

The one-time staging bootstrap refuses to run if the `openescrow` Worker already exists. It creates
fresh staging-only evidence-encryption and address-attestation secrets, verifies a Windows
DPAPI-protected recovery copy under the current user's `.openescrow/recovery` directory, uploads
the secrets with the first Worker version, and removes the plaintext temporary file. The core
deployment verifier requires private R2, encryption/keyring readiness, address attestation,
receipt verification, an enabled registry verification boundary, and the compliance monitor.
`npm run check:cloudflare-deployed:staging:pilot` additionally requires notification delivery,
scheduler health, a registry bound to the active escrow release, and a clean compliance-source
baseline before promotion.

## Exact-source dual-host rule

Until Cloudflare completes the supervised pilot and rollback exercise, every normal public release
must be published to both the Cloudflare MVP and the existing ChatGPT Sites project from the same
clean Git commit. Do not describe a release as delivered until `npm run check:dual-host` proves the
canonical homepage is reachable, Sites exposes its verified redirect to that exact canonical
origin, both local readiness endpoints report `sourceDirty: false`, and both report the expected
full commit SHA. If
either host cannot be updated, hold the normal release or record an explicit emergency exception;
never silently let the retained rollback build drift.

The two hosts retain independent deployments, databases, object stores, secrets, and rollback
histories. Cloudflare is the sole writable hosted record. Matching application source does not
imply that historical Sites records have been copied.
Use the private, fail-closed [hosted-data continuity procedure](./hosted-data-continuity.md) if a
complete Sites export becomes available. The comparison command fingerprints D1 rows and encrypted
R2 bytes without publishing their values; it never imports, overwrites, or deletes provider data.

## Secrets and provider configuration

Enter secrets with Wrangler or the Cloudflare dashboard. Do not add their values to
`wrangler.jsonc`, `.env.production`, chat, screenshots, or build artifacts.

Already configured and required for Cloudflare core readiness:

- `EVIDENCE_ENCRYPTION_KEY`
- `EVIDENCE_ENCRYPTION_KEY_ID`
- `ADDRESS_ATTESTATION_SECRET`

Still required for strict pilot readiness:

- notification provider values (`RESEND_API_KEY`, or the documented webhook alternative);
- a verified `ACTIVITY_REGISTRY_ADDRESS` bound to the active escrow while
  `VERIFY_ACTIVITY_REGISTRY_BINDING=true` remains enabled.

The canonical staging origin is already accepted by Privy and its Google chooser has been
verified. Add any future custom-domain origin to Privy and applicable OAuth allowlists before it is
used. Keep Base Sepolia and synthetic-data restrictions in place.

## Promotion and rollback

1. Verify the unified MVP URL, `/api/system/readiness`, the exact release commit, D1/R2
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
