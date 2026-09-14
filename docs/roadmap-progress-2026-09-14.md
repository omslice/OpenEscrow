# Selected roadmap execution board

Updated September 14, 2026 after publication. The owner selected roadmap items **1, 4, 5, 9,
and 10**, with **unsubsidized Ohio residential rentals in Ottawa Hills, Brady Lake, or both**
as the first pilot scope. These numbers refer to the selected execution plan; the broader
[roadmap](../ROADMAP.md) retains its own workstream organization.

## Published baseline

- [PR #11](https://github.com/omslice/OpenEscrow/pull/11) merged into the default branch as
  `c97bb438ae2b4e3699787758dc33d257043f416b`; both main-branch CI runs passed.
- [OpenEscrow](https://openescrow.io/) and retained Sites version 233 both report clean
  application source `f988fff4a2068367f48e72c4bd583bfcebbc5333`. Core and dual-host checks pass.
- [Self-host v0.2.0-testnet](https://github.com/omslice/OpenEscrow/releases/tag/selfhost-v0.2.0-testnet)
  is public. Its downloaded archive matches the verified checksum and exact application source.
- Active Base Sepolia contract source remains `5073f2a98de0741f577ca443f249541f08e4d67e`;
  escrow `0x8a46cfed7153c53fd080e16624f9702887c78b54`, registry
  `0xcf032b7da95d2710baa599979b8b9f350ce88a62`. No contract broadcast or hosted data migration occurred.
- The [publication record](release-publication-2026-09-14.md) binds these claims to deployment
  identities, dated readiness, source checks and rollback references.

## Execution and remaining evidence

| Selected item | Completed in this tranche | Remaining evidence or decision |
|---|---|---|
| 1. Testnet acceptance | Full exact-source envelope, 23 synthetic pilot scenarios, 19 incident scenarios, current-cohort inventory and participant handoff | Separate landlord/two-tenant login, wallet, inbox and lifecycle outcomes; synthetic fixtures cannot establish these |
| 4. Compliance | Deployed 15-minute bounded source scheduling, 48-hour external-observation expiry, official Ohio statute v6, live unchanged Ohio check, source triage, local-scope and DST analysis | Qualified review of changed text and unresolved sources; actual parcel and lease subtype; approved local rules and civil-time counting |
| 5. Production design | Exact application/active-contract review package; OH-01 through OH-12 issue matrix; local and timezone supplements | Qualified conclusions, production custody/provider choice, any resulting contract/product change and independent review |
| 9. Release/self-host | Default-branch merge, public v0.2.0-testnet, both hosts activated, checksum/provenance/SBOM, fresh-install/additive-upgrade/backup verification | Independent operator deployment/recovery result; maintain evidence for future releases |
| 10. Organization/funding | Existing decision packets reused, private evidence delta refreshed, public transparency controls retained, continuity checklist prepared | Owner-confirmed funding/recipient/attribution facts, organization direction, accepted role holders and any signed partner evidence |

## Verified engineering and release evidence

The full `f988fff` envelope passed: 251 Foundry tests, zero failures and one opt-in live-fork
skip; five ABI/runtime/storage checks and pinned dependencies; 137 server tests; 373 client/script
checks; required rendered browser, recovery, accessibility, load, bundle and build gates; clean
production dependency audit and wallet compatibility. Deployment/rollback, pilot and incident
rehearsals and both hosting builds passed. See the [release index](release-evidence-index.md)
for exact-source CI and packaging links.

The published archive's 697 file checksums, build provenance and separate CycloneDX attestation
verified against its source and packaging workflow. Isolated installation/build/configuration,
137 packaged server tests, all 26 local D1 migrations and Worker dry-run passed on `2c5db06`.
A synthetic upgrade from the old public `53f65b5` migration set preserved a record, restored a
backup, matched a fresh schema and passed integrity checks. All 24 old migrations remain
unchanged; 0024 and 0025 are additive. Later package-source changes through `f988fff` concern
CI/toolchain metadata, attestations, documents and rehearsal measurement/selection, with no
application or migration delta. No hosted private data was used for these simulations.

The scheduler formerly visited four sources daily, taking roughly 16 days to rotate through
61 sources. It now processes four due sources every 15 minutes and skips fresh observations;
all 61 overdue sources fit into 16 batches, under four hours after the first batch. Cached
proposal/readiness gates now honor external observations' shorter 48-hour lifetime instead of
always applying the general 21-day limit. Regressions cover expiry and complete source rotation.

Ohio's v6 profile replaces the mismatched court-opinion URL with the official R.C. 5321.16 text.
The main-branch observation and live check are current and unchanged. The global compliance
gate remains false: changed, unreachable and stale observations still require attention.
New Hampshire's official page includes current and future-effective amendments; its changed
alert was preserved. A passing fetch does not authorize replacing a reviewed baseline.
The [61-source triage](compliance-source-triage-2026-09-14.md) is the earlier diagnostic snapshot;
use the dated post-deployment observation in the publication record for current release evidence.

## Ohio and participant handoffs

The [Ohio matrix](ohio-pilot-review.md), [local review](ohio-local-pilot-scope.md) and
[timezone decision](ohio-timezone-decision.md) are prepared. The former Brady Lake village is
now Franklin Township, Portage County; Ottawa Hills is in Lucas County. Actual parcel
jurisdiction and applicable local requirements must be verified. Both fixed-term and
month-to-month review cases remain open. Subsidized housing is excluded by the owner's decision.

The timezone diagnostic reproduces UTC-calendar arithmetic crossing a different Ohio civil
date around DST. `America/New_York` is the proposed property zone; legal counting and a
versioned attested-zone design still require decisions. No unapproved deadline policy was deployed.

A read-only aggregate hosted inventory did not establish a finalized record bound to the active
escrow cohort. Older finalized records include other cohorts and an unbound legacy record;
they must not be relabeled as current acceptance. Use the [pilot runbook](testnet-pilot-runbook.md)
for separate-account synthetic sessions and record exact app/contract versions, role outcomes,
transaction receipts, private-document isolation and inbox placement. No participant outcome,
external message or live transaction was fabricated to close the evidence gap.

## Remaining owner and external inputs

- Actual pilot parcels and fixed-term/month-to-month lease scope.
- Qualified Ohio conclusions and production custody/provider decisions.
- Separate participant sessions and moderated usability/incident exercises.
- Organization posture, confirmed funding facts, attribution permissions and signed partner evidence.
- Named continuity roles and acceptance of their responsibilities.

The [organization checklist](organization-readiness.md) and existing private preparation records
identify the evidence needed. Keep private identities, financial records, credentials and legal
correspondence outside the public repository. Publication and completed preparation advance the
selected goal; they do not establish a completed external pilot, legal approval or production readiness.
