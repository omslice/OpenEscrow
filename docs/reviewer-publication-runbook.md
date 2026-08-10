# Reviewer-safe repository publication

Last reviewed: 2026-08-09.

This runbook turns the current local OpenEscrow evidence into a precise public source snapshot for
funders, auditors, contributors, and pilot partners. It does not authorize a commit, push, pull
request, merge, contract deployment, external contact, or claim of independent review.

## Why this is a funding dependency

The public default branch currently predates important product, test, security, governance, and
canonical-domain work. Application prose must not send a reviewer to an older repository and then
ask them to infer the newer evidence. A reviewer-safe snapshot must make the exact source commit,
current limitations, deployed-contract boundary, and reproducible checks visible together.

## Candidate contents

The candidate should include:

- the current `openescrow.io` product and walkthrough links;
- the dated 238-pass, 23-suite Foundry snapshot and one opt-in live-fork skip;
- the security, conduct, governance, maintainership, and contribution policies;
- the release evidence index, threat models, audit handoff, and deployment manifests;
- the current contract sources, pinned dependencies, Foundry profile, and checked-in frontend ABIs;
- the local fail-closed `/funding` route, typed disclosure source, footer link and regressions, while
  stating that its opening facts are unconfirmed and the route is not deployed;
- the reviewer-evidence generator and its tests; and
- no generated deployment bundle unless its provenance and ownership are intentionally reconciled.

The generated `frontend-site-dist.tar` is independently modified in the current working tree. A
read-only 2026-08-09 inspection proved that it exactly matches the ignored 320-file July
`site-deploy-artifact/` tree. Both the modified and `HEAD` tar contain the legacy Sites hostname,
lack `openescrow.io`, and predate the current funding route and release checks. Do not overwrite,
restore, deploy or silently include either version as current evidence. Keep the file excluded;
the recommended separate owner decision is removal of the obsolete tracked bundle after confirming
no supported workflow consumes it.

## Local evidence commands

From `frontend/`:

```bash
npm run check:community
npm run check:reviewer-evidence
npm run reviewer:evidence
```

The last command writes `.reviewer-evidence/latest.json`. The generated artifact is ignored because
it describes the current working tree. It records exact SHA-256 hashes for the reviewer-facing
contracts, ABIs, dependency/build configuration, deployment manifest, policies, evidence docs and
funding-transparency source. It also classifies every worktree change into the exact reviewed
publication tranche, the separately owned generated archive, or an unexpected path.

`npm run reviewer:evidence:release` is intentionally stricter. It must fail while the tree is dirty,
when required files are untracked at `HEAD`, when canonical copy is stale, or when the branch lacks
an upstream. Run it only after the owner approves the exact commit and publication path.

## Owner-approved publication sequence

1. Review the release commits already pushed to the public feature branch and the complete diff
   against the older default `main` branch.
2. Review every uncommitted community-health, funding-transparency and reviewer-evidence file.
3. Review the archive-provenance evidence and choose removal or explicitly labeled historical
   retention for `frontend-site-dist.tar`; neither option is part of the current selected-path commit.
4. Review `.reviewer-evidence/latest.json`. Its `source.publicationTranche.candidatePaths` is the
   exact current path allowlist; do not replace this with `git add -A` or include an unexpected path.
5. Approve the exact branch, included paths, commit message, and push.
6. From a clean checkout of the approved commit, run the complete contract and application release
   envelope. A selected-path commit may leave the separately owned archive dirty in the original
   working directory, so do not call that original directory a clean candidate.
7. Run `npm run reviewer:evidence:release` in the clean checkout and retain its JSON with the release
   evidence.
8. Push the approved branch and verify the exact commit through an unauthenticated GitHub view.
9. Confirm the README, `openescrow.io` links, license, policies, test evidence, and source/deployment
   distinction render correctly.
10. Approve a pull request and default-branch merge separately.
11. Only then use the naked repository URL in funding or audit outreach for the current claims.

Publishing source and deploying the website are separate decisions. The source snapshot may include
the fail-closed `/funding` implementation, but `openescrow.io/funding` must not be called live until
an owner-approved deployment is verified. A confirmed balance, recipient or contact must not be
entered until the owner verifies the underlying facts.

## Reviewer link discipline

Before the default branch is updated, use an exact public commit URL and describe only evidence
contained in that commit. After publication, record the immutable URL in the funding evidence
ledger and every application packet that cites the 238-test snapshot.

Never imply that:

- internal review is an independent audit;
- current local source is the code at an older Base Sepolia contract address;
- testnet deployment establishes production, mainnet, legal, privacy, or pilot readiness; or
- planned arbiter, optional-yield, partner, or beneficiary work is already operating.
- an empty local funding ledger proves zero funding received.

## Owner gate

The next external action is an owner-approved public push of a reviewed exact snapshot. Until that
happens, the generated manifest is local preparation and the Runtime Verification readiness email
must retain its `[PUBLISHED COMMIT]` placeholder.
