# OpenEscrow unified Cloudflare application plan

## Authoritative product decision

OpenEscrow has one public-facing Cloudflare site. That site serves the complete Base Sepolia MVP,
its signed-out project introduction, and its authenticated **About** tab from one Worker and one
origin. There is no separate public Cloudflare landing page or second Cloudflare application.

During transition, the existing ChatGPT Sites URL serves the same clean application commit as a
synchronized second host and rollback/data reference. The two hosts have independent runtime
storage, secrets, and rollback histories; matching source does not imply that records migrated.

## Public structure

- Cloudflare: `https://openescrow.omslice.workers.dev/` — canonical owner-hosted testnet app.
- ChatGPT Sites: `https://openescrow-demo.omrigross.chatgpt.site/` — synchronized mirror and
  historical-data reference during the transition.
- A future custom domain may replace the workers.dev hostname. Any alias should redirect to the
  canonical application instead of serving another copy.
- The retired `openescrow-landing-staging` Worker must have its public route disabled. Its source
  may remain in the repository solely as rollback history.

Production fiat, mainnet contracts, FRNT, USDY, and unapproved yield-bearing funding routes remain
disabled.

## Unified application scope

The single application includes:

1. A consumer-friendly signed-out introduction and testnet safety notice.
2. Google and wallet sign-in, with roles selected after login unless an invitation is role-locked.
3. The complete proposal, deposit, claim/resolution, record, and settings workspaces.
4. An **About** tab explaining the project and linking to its public materials.
5. Open-source, Ethereum-record, optional-yield, and donation explanations without implying legal
   approval, insurance, guaranteed yield, or production readiness.
6. The current OpenEscrow wordmark, key mark, purple/near-black brand system, accessible navigation,
   responsive layouts, reduced-motion behavior, favicon, and social preview.

## Cloudflare boundary

- Worker: `openescrow`
- Staging D1 `DB`: `openescrow-mvp-staging`
- Staging private R2 `EVIDENCE`: `openescrow-mvp-evidence-staging`
- Static assets: `ASSETS`
- Scheduled handler: every 15 minutes
- Runtime secrets remain in Cloudflare and never in source, screenshots, build output, or chat.
- The unrelated `Piper` Cloudflare account is out of scope.

## Release sequence

1. Build and test one exact clean Git commit.
2. Prove the pinned D1/R2 targets exist and staging migrations are current.
3. Deploy that commit to the `openescrow` Cloudflare Worker without replacing secrets or data.
4. Verify the Cloudflare homepage, readiness endpoint, source provenance, private R2, encryption,
   address attestation, receipt/registry checks, and scheduled trigger.
5. Publish the same exact commit to the existing ChatGPT Sites project without replacing its D1,
   R2, secrets, configuration, or hosted data.
6. Run the fail-closed dual-host verifier. Do not report a normal public release delivered unless
   both hosts serve the expected clean commit and both readiness endpoints respond.
7. Keep the standalone landing Worker public route disabled.

## Data continuity

- Never infer that the Sites D1/R2 data was copied to Cloudflare.
- If a complete export becomes available, rehearse import into staging and compare sanitized row,
  object, and content fingerprints before accepting it.
- The repository includes a fail-closed, HMAC-keyed D1/R2 manifest and comparison procedure in
  [hosted-data continuity verification](./hosted-data-continuity.md). It omits private values and
  rejects partial R2 inventories; it does not perform an import or make an unavailable Sites
  export complete.
- Otherwise, disclose that Cloudflare starts with fresh synthetic data and retain Sites as the
  historical testnet record.
- No migration step may overwrite either source or destination without verified backup and an
  explicit continuity decision.

## Current evidence snapshot (2026-08-08)

- Cloudflare and ChatGPT Sites serve the same exact clean commit and the fail-closed dual-host
  verifier passes. The full current commit is read from each live readiness endpoint instead of
  being copied into this source document, which would become stale on the next documentation-only
  release.
- The Cloudflare core deployment verifier passed with the exact staging D1, private R2, static
  assets, application-layer evidence encryption/keyring, address attestation, receipt checks,
  compliance monitor, and `*/15` scheduled handler intact. All 21 staging migrations are current.
- Hosted pilot readiness reports 61/61 compliance-source gates current and a healthy scheduler.
  The only two failed runtime gates are automatic email delivery and the version-matched activity
  registry.
- The credential-free pilot rehearsal passed 23/23 lifecycle, outage, archive, proof, funding,
  and recovery scenarios. The credential-free incident rehearsal passed 19/19 isolation,
  privacy, tamper, key-rotation, outage, receipt, and RPC scenarios.
- Accessibility, visible load-failure recovery, private-record recovery, private-activity recovery,
  evidence recovery, and funding recovery browser checks passed. These checks do not replace the
  remaining separate-account, human-supervised pilot.
- Google account selection was previously verified from the Cloudflare origin after that exact
  origin was added to Privy. Future custom domains must be allowlisted before use.

## Acceptance criteria

- Exactly one Cloudflare public site serves the full MVP and About tab.
- The retired landing Worker has no public route.
- Cloudflare and ChatGPT Sites serve the same exact clean source commit after each normal release.
- Both homepages and `/api/system/readiness` return HTTP 200.
- Cloudflare binds `DB`, private `EVIDENCE`, and `ASSETS`; required secrets are configured without
  exposing their values; the 15-minute trigger is present.
- Authentication origins, scheduled-job health, notification delivery, accessibility/recovery
  checks, and the separate-account synthetic pilot pass before production-testnet promotion.
- Existing Sites data and rollback access remain intact unless a separate verified migration is
  approved and completed.

## Owner-only actions still required

- Configure the notification provider secret and sender identity.
- Review and broadcast the hardened Base Sepolia escrow/reserve/registry cohort, return only its
  public manifest and transaction hashes, and approve the verified configuration switch.
- Decide whether existing synthetic Sites records must migrate or may remain historical.
- Run the supervised separate-account pilot and incident/privacy drill, and approve any future
  custom-domain cutover.

## Material unknowns

- Whether Sites exposes a complete owner-accessible D1/R2 export path.
- Whether free-plan limits accommodate realistic pilot load.
- The final custom DNS domain and contact/legal links.
