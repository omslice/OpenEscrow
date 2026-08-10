# OpenEscrow governance

OpenEscrow is an early-stage, founder-maintained open-source public-interest project. This document
describes the governance that exists today; it does not pretend that a larger community, advisory
circle, nonprofit, fiscal sponsor, or independent board already exists.

## Mission

OpenEscrow develops free and publicly verifiable infrastructure for a fairer, more transparent
rental security-deposit process. Essential records, open code, participant safety, and neutral
rules take priority over private control, funder preferences, feature volume, or financial-product
revenue.

## Current stewardship

Omri Gross (`@omslice`) is the founding maintainer and current project steward. The steward controls
repository administration and decides what merges and what source is proposed for release. Those
rights do not authorize a production deployment, legal representation, handling real deposits,
spending restricted funds, or making commitments on behalf of a future entity or fiscal sponsor.

The project does not yet claim community governance. The immediate governance goal is to add
independent reviewers and at least one additional trusted maintainer after sustained, reviewed
contributions.

## Roles

### Contributor

Anyone making a useful issue, review, test, design, research, documentation, or code contribution
under the project policies.

### Reviewer

A contributor with relevant expertise who provides substantive review. Reviewers do not receive
merge, release, wallet, deployment, or spending authority merely by reviewing.

### Maintainer

A contributor trusted to triage issues, review changes, protect the project's invariants, and merge
within a documented scope. Maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

### Project steward

The person accountable for repository administration, maintainer appointments, final merge
decisions, release-candidate proposals, policy maintenance, and conflict handling while the project
has no incorporated or fiscally sponsored governance body.

## How decisions are made

1. **Routine changes** are decided through public issues and pull-request review. The responsible
   maintainer records the reasoning when the choice is not obvious.
2. **Material design changes**—including contract state, authorization, funds, fees, evidence,
   identity, custody, yield, arbitration, compliance behavior, privacy, migration, or production
   operations—require a public design issue and an architecture decision record or equivalent
   specification update before merge.
3. **Security-sensitive changes** may be developed privately during a coordinated disclosure.
   Publish the reasoning and remediation after disclosure when doing so no longer increases risk.
4. **Release candidates** must satisfy the exact-source gates in the roadmap and release tooling.
   A merge or passing CI run does not itself authorize deployment.
5. **Production, financial, legal, and external commitments** remain owner-controlled and require
   the qualified review and approval described in the repository and funding roadmap.

The steward currently has final repository decisions. When consensus is not reached, the steward
should document the competing positions, affected users, evidence, safety implications, and reason
for the decision. A contributor may preserve a respectful dissent in the issue or decision record.

## Maintainer selection and removal

A new maintainer should demonstrate, over multiple reviewed contributions:

- sound judgment about the mission and project invariants;
- competence in the scope they will maintain;
- reliable testing, review, documentation, and follow-through;
- responsible handling of security and personal data;
- constructive participation under the Code of Conduct; and
- disclosed conflicts and independence from pay-to-influence arrangements.

The steward appoints maintainers publicly with their scope. A future nonprofit, fiscal sponsor, or
adopted community process may replace that mechanism.

A maintainer may step down at any time. The steward may suspend or remove access for credential
loss, unavailability, undisclosed conflict, conduct violation, security risk, repeated unsafe
merges, or failure to follow project policy. Except during an urgent containment event, the reason
should be documented and the person given a chance to respond.

## Funding and conflicts

- Funding does not buy merge rights, private participant data, preferential dispute outcomes, or
  control of the open core.
- Restricted funds must be used and reported for their approved public-benefit purpose.
- Maintainers and advisers disclose relevant employment, investments, clients, grants, vendors,
  and related-party interests before participating in an affected decision.
- A conflicted person should not be the sole approver of a contract, grant-funded payment, vendor
  selection, protocol integration, or public evaluation involving that interest.
- Paid work is reviewed by the same technical and safety standards as volunteer work.
- Any future nonprofit/company relationship requires independent conflict, private-benefit, IP,
  and fund-flow review.

## Security and privacy

The private reporting process in [SECURITY.md](SECURITY.md) overrides the normal public process for
suspected vulnerabilities. Maintainers receive only the minimum access required. No governance
role grants routine access to private evidence, credentials, participant data, wallets, or hosted
production systems.

## Releases and assets

Repository maintainership is separate from control of domains, deployment accounts, contracts,
treasuries, fiscal-sponsor accounts, and legal entities. Release authority must be least-privileged,
reviewable, recoverable, and documented. No maintainer should share private keys or recovery
phrases through the repository, issues, chat, or pull requests.

Immutable deployed contract cohorts remain identified by exact code and addresses. A newer source
release cannot silently rewrite, migrate, or claim to replace them.

## Succession direction

The current single-maintainer structure is a disclosed continuity risk. Before a real-money pilot,
OpenEscrow should:

1. add at least one independent technical maintainer with protected access;
2. document recovery for repository, domain, build, deployment, monitoring, and communication
   accounts without publishing secrets;
3. establish an independent advisory circle spanning renter/community, housing/dispute-resolution,
   and security/open-source experience;
4. adopt the governance required by the selected nonprofit or fiscal sponsor; and
5. define how charitable funds, project assets, trademarks, and essential records continue if the
   founding steward is unavailable.

Until those steps occur, applications should describe OpenEscrow as founder-maintained, not
community-governed.

## Policy changes

Governance amendments use a public pull request with at least seven calendar days for comment when
practical. Urgent security or legal corrections may merge sooner, with the reason and follow-up
review documented. Material changes to asset ownership, charitable control, maintainer authority,
or conflicts require qualified legal/fiscal-sponsor review when such a relationship exists.
