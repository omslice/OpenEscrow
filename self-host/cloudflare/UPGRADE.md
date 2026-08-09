# Upgrade and rollback

Every self-host upgrade is a data migration and supply-chain decision, even when the user interface
change looks small.

## Supported upgrade procedure

1. Download the new release from the official `omslice/OpenEscrow` repository.
2. Verify its SHA-256 checksum, source commit, SBOM, and GitHub artifact attestation.
3. Read the release notes and every new D1 migration.
4. Export D1, sync/check private R2, and verify retained encryption keys before changing anything.
5. Extract the new package into a new directory. Do not copy its template over your live config.
6. Copy only your reviewed `wrangler.selfhost.jsonc` and `.env.production.local`, then rerun
   `npm run selfhost:check`.
7. Run the full local tests and `wrangler deploy --dry-run`.
8. Apply D1 migrations. Never edit a migration that has already run.
9. Deploy the new Worker, verify `/api/system/readiness`, and complete a synthetic two-account
   smoke test before reopening the pilot.
10. Record the Worker version, release commit, database migration state, and backup identifiers.

## Rollback boundary

Cloudflare Worker code can be rolled back to a prior version, but a D1 migration or new encrypted
evidence format may make an older Worker incompatible. Read each upgrade note before relying on
code rollback. If schema compatibility is uncertain, restore the verified backup into isolated
resources and switch bindings only after validation.

OpenEscrow's contracts are non-upgradeable. A contract defect is handled by retiring the affected
address for new agreements and deploying a reviewed replacement; active agreements do not migrate
automatically. Never point the activity registry at an escrow release it was not deployed for.

## Local modifications

The package contains source and may be modified under the MIT license. A rebuilt modified package
records `sourceDirty: true` relative to its upstream release manifest. That is an honest provenance
signal, not an error. Modified operators must review, test, document, and support their own fork;
OpenEscrow's signed release attestation no longer covers those bytes.
