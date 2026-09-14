# September 14 publication record

The owner authorized the source merge, self-host release publication, and deployment to the
existing hosts. All three completed on September 14, 2026. The public application remains a
Base Sepolia testnet prototype using synthetic information and test tokens.

## Published source and package

- [PR #11](https://github.com/omslice/OpenEscrow/pull/11) merged at `2026-09-14T21:22:08Z` as
  `c97bb438ae2b4e3699787758dc33d257043f416b`. The merged documentation head was `be34aba`;
  changes after the tested application commit affect documentation only.
- Both main-branch CI runs passed:
  [contracts and frontend](https://github.com/omslice/OpenEscrow/actions/runs/34898413807)
  and [Foundry](https://github.com/omslice/OpenEscrow/actions/runs/34898413816).
- [Self-host v0.2.0-testnet](https://github.com/omslice/OpenEscrow/releases/tag/selfhost-v0.2.0-testnet)
  is public and marked prerelease. Its archive, adjacent checksum, manifest and CycloneDX SBOM
  remain bound to `f988fff4a2068367f48e72c4bd583bfcebbc5333`.
- An unauthenticated download of `openescrow-cloudflare-self-host-f988fff4a206.tar.gz`
  matched SHA-256 `e0c6e1d743818cc3b3b04dd86554f797db80f0de533c4859af27db64aaabee27`.
  The [release evidence index](release-evidence-index.md) records installation, upgrade,
  recovery, all 697 file checksums and the separate provenance/SBOM verification.

## Hosted activation

The canonical [OpenEscrow application](https://openescrow.io/) and retained Sites deployment
both report clean application source `f988fff4a2068367f48e72c4bd583bfcebbc5333`.
The core Cloudflare verifier and exact-source dual-host verifier passed after publication.

| Target | Published identity | Operating boundary |
|---|---|---|
| Cloudflare `openescrow`, existing staging environment | Worker version `cf1bd048-f056-4caa-968e-3fef022e74a4` | Canonical writable application |
| Existing public Sites project | Saved version 233; deployment `appgdep_6aa8676ceaec8191b7ed70d96d418446`, succeeded at `2026-09-14T21:30:35.816605Z` | Redirects to the canonical origin; writes fail closed |

The retired landing route remains disabled. The existing D1/R2 bindings, secrets, historical
records and active Base Sepolia cohort were retained. All 26 database migrations were already
applied, so this release required no migration or contract transaction. The active contract
source remains `5073f2a98de0741f577ca443f249541f08e4d67e`; use the
[deployment manifest](../deployments/base-sepolia-latest.json) for addresses and transactions.

Prior Cloudflare version `282e55a2-cccd-461c-9b3a-30abdf2fa3b8` and Sites version 232 are
historical rollback references. Rolling back requires a separate operating decision and
reverification; this record does not execute a rollback or attest an older build as current.

## Source readiness and next acceptance work

The live compliance monitor now reports a 15-minute cadence, replacing its former daily
four-source batch. The configured scheduled trigger remains `*/15 * * * *`. New observations
can report changed content; faster checks do not approve that content or reset reviewed hashes.
The live audit timestamp advanced from `2026-09-14T21:29:57.33Z` to
`2026-09-14T21:45:44Z` during post-deployment verification, confirming the next cycle started.
A read-only metadata query confirmed all four selected checks completed at that cycle: South
Carolina and Texas unchanged, South Dakota changed, and Rhode Island unreachable. Ohio retained
its current verified observation. The query wrote zero rows and did not modify any baseline.

The [main-branch source workflow](https://github.com/omslice/OpenEscrow/actions/runs/34898515268)
published Ohio profile `oh-rules-2026-09-14.v6` unchanged at `2026-09-14T21:23:29.91Z`.
The live Ohio endpoint subsequently verified that observation. Its official source hash is
`e81d3dfe1e00552f7b8ea81f79237d4d7da646a25e597f5d5b4fecc62e246017` and its maximum age is
48 hours. The workflow's overall failure is the expected New Hampshire changed-source alert.

At the `21:35 UTC` readiness observation, all 61 sources were tracked, with 27 changed,
11 unreachable, 37 stale and 38 blocked. These categories overlap. Strict global readiness
remained false. Hosted email/scheduler, private encrypted evidence/keyring, address attestation,
active registry binding and caught-up activity indexing passed. This dated observation is not
a promise that later source or service checks will remain unchanged.

The [selected execution board](roadmap-progress-2026-09-14.md) retains the remaining inputs:
actual pilot parcels, fixed-term/month-to-month scope, qualified Ohio review and custody design,
separate participant and inbox outcomes, and verified funding/organization/continuity facts.
The [Ohio local review](ohio-local-pilot-scope.md) and
[timezone decision memo](ohio-timezone-decision.md) cover the selected unsubsidized Ottawa
Hills and/or former Brady Lake scope. Publication does not complete those external decisions.
