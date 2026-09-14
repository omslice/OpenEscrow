# Selected roadmap execution board

Started September 14, 2026. The owner selected roadmap items **1, 4, 5, 9, and 10** and
confirmed **Ohio residential rentals** as the first pilot scope. This board tracks execution;
the broader [roadmap](../ROADMAP.md) retains the other workstreams.

## Verified starting point

- Live application: clean commit `592c6d04f0fb3c1de1faf9b956be4e8c4067952e` at
  <https://openescrow.io/>; mock workspace at `/explore`.
- Active Base Sepolia contract source: `5073f2a98de0741f577ca443f249541f08e4d67e`;
  escrow `0x8a46cfed7153c53fd080e16624f9702887c78b54`, registry
  `0xcf032b7da95d2710baa599979b8b9f350ce88a62`. Application changes do not redeploy contracts.
- September 14 live operator check: email, scheduler, encrypted evidence/keyring, registry,
  address attestation, and caught-up indexing passed. The strict source gate failed with
  36 blocked sources out of 61. This is not a completed supervised pilot.
- The downloadable `selfhost-v0.1.0-testnet` release was published August 10 from `53f65b574be9`.
  It predates the current application and dependency fixes.
- A September 14 read-only aggregate inventory found no finalized private record bound to the
  active escrow address. Historical finalized records include other cohorts and an unbound
  legacy record. This is a gap in current-cohort acceptance evidence, not permission to relabel,
  migrate, delete or infer the state of those records. A fresh participant rehearsal is needed.

## Execution and acceptance criteria

| Item | Work now | Completion evidence | Current boundary |
|---|---|---|---|
| 1. Testnet acceptance | Run current-source synthetic lifecycle/recovery checks; prepare Ohio-specific participant handoff | Local artifacts plus separate-account hosted outcome records | Automated fixtures cannot prove participant login, wallet signing, inbox placement, or live funds flow |
| 4. Compliance | Correct bounded source scheduling and cached-attestation expiry; monitor the actual Ohio statute; inventory remaining source failures | Regressions, exact Ohio observation, deployed freshness/readiness checks | Changed legal documents remain review-required; no baseline reset is authorized by a passing fetch |
| 5. Production design | Map Ohio requirements to the current contract, privacy, payments, and notice design | [Ohio reviewer matrix](ohio-pilot-review.md) completed by qualified reviewers against exact source | Residential scope is selected; municipality, lease subtype, provider/custody model, and counsel remain open |
| 9. Release/self-host | Refresh release evidence and package; test a clean installation and additive upgrades; prepare updated publication | Checksums, SBOM, clean-source manifest, install/build/migration/recovery evidence | Candidate validation is distinct from a published release and from an independent operator deployment |
| 10. Organization/funding | Reuse existing decision packets; collect opening facts; document role and continuity gaps | [Organization checklist](organization-readiness.md), owner-confirmed funding records, accepted roles | No funding amount, legal entity, signed partner, or new maintainer is inferred |

## Engineering findings under remediation

1. The prior monitor processed four sources once per day after bootstrap. A full 61-source
   rotation therefore took about 16 days. The candidate runs bounded batches every 15 minutes,
   selects sources due for their daily refresh, and avoids re-fetching today's fresh sources.
   All 61 overdue sources fit into 16 batches (under four hours after the first batch).
2. The prior cached proposal/readiness gates applied a 21-day lifetime even to external
   observations configured for 48 hours. A regression reproduced an expired observation
   permitting proposal creation. The candidate enforces each source's shorter lifetime.
3. Ohio's v5 source link pointed to a court opinion while citing R.C. 5321.16. Candidate v6
   restores the official statutory text with an exact-content external observation and a
   48-hour lifetime. Existing agreement snapshots remain unchanged.
4. New Hampshire's workflow is active. Its September 14 observation reports changed official
   content. The older instruction to activate the workflow is superseded; content review is
   still required. The candidate does not replace New Hampshire's reviewed hash.

The complete [61-source triage snapshot](compliance-source-triage-2026-09-14.md) distinguishes
stored status from freshness and gives the remaining source-review queue.

## Validation checkpoint

The full application check passed for the first candidate tranche: 137 server tests, 372
client/script checks, every required browser recovery/lifecycle/accessibility check, and the
production build/load/bundle gates. The production dependency audit is clean and wallet
dependency compatibility passes. The source-expiry regression failed before the fix and passed
afterward; a separate test verifies all 61 overdue sources are revisited without repeat fetching.

Self-host review then found missing explicit escrow/reserve/block/indexer configuration. The
generator and validator now require the active manifest's values and enabled indexing; all five
focused configuration/SBOM tests pass. Fresh-package installation and publication remain separate
checks. None of these results is a new hosted deployment or a completed participant session.

## Remaining owner and external inputs

- Municipality/county and residential lease subtype; identify any subsidized/special housing.
- Qualified Ohio counsel and the intended production custody/provider model.
- Separate participant sessions for hosted acceptance and inbox checks.
- Organization posture, funding facts, attribution permissions, and any signed partner evidence.
- Named continuity roles and acceptance of those responsibilities.

Keep private funding records, participant identities, provider credentials, and legal correspondence
outside the public repository. Record actual outcomes without converting a draft or invitation
into an accepted commitment. This goal remains active until its achievable work and explicit
handoffs have been verified; this document is not a declaration that all five workstreams are done.
