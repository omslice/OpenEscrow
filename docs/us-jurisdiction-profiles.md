# United States jurisdiction compliance profiles

OpenEscrow contains implemented security-deposit rule profiles for the 50 states
and the District of Columbia. Each profile is selected from a validated U.S.
property-address result, versioned with the agreement, enforced by the server,
and accompanied by its statewide requirements and conditional deadline paths.
The profiles are an OpenAI-reviewed official-source snapshot, not an
attorney opinion, legal advice, or a guarantee that an agreement complies with
state, local, federal, or program-specific law.

Research snapshot: 2026-07-26

Canonical data and evaluator:

- `frontend/shared/us-jurisdiction-profiles.js`
- `frontend/shared/us-compliance-engine.js`
- `frontend/shared/us-compliance-overlays.js`
- `frontend/shared/us-compliance-facts.js`
- `frontend/shared/compliance-sources.js`

## What is automated

When a user selects a complete U.S. street-address suggestion, including a
building number, the server returns the normalized address, two-letter state
code, municipality, county, postal code, coordinates, provider feature
identifier, and a server-only HMAC attestation over those exact fields. Broad
street or city results, foreign addresses, unknown states, and duplicate
provider features are filtered out before attestation. The proposal builder then:

1. selects the matching `us-xx` profile;
2. records the normalized address resolution and exact profile version in the
   private proposal;
3. asks for the property type, tenancy type, unit count, housing program,
   assistance-animal deposit treatment, asserted SCRA termination status, and
   profile-specific facts such as written-agreement or seasonal-occupancy
   status rather than inferring those facts from the address;
4. applies and locks the profile's onchain safeguard window;
5. records every statewide requirement, federal/program overlay, reviewed local
   overlay, conditional/multi-stage deadline, and claim-packet policy in a
   versioned v4 snapshot;
6. shows the resolved locality, deadline paths, deposit baseline, official
   sources, unresolved questions, and requirement checklists; and
7. rejects new or revised state-profile proposals when the address state,
   property label, jurisdiction, profile version, locked deadline, or server
   attestation disagree.

Manual addresses, unresolved state data, non-U.S. addresses, and failed
geocoding continue to use the unrestricted generic test profile. Editing a
verified address clears the selected state profile until a new suggestion is
selected.

The attestation closes the client-tampering boundary: a modified browser cannot
invent a geocoder result or change its state, city, county, label, coordinates,
or provider identifier while retaining a state compliance profile. It does not
prove ownership, occupancy, deliverability, unit identity, or the legal
boundaries of a city or county.

The pure evaluator accepts profile facts and recorded lifecycle events. It
classifies conditional deadlines as applicable, not applicable, or awaiting a
fact, and computes calendar- or business-day dates deterministically. Exact
location, profile version, requirements, and source remain part of the signed
agreement record and exported report.

After finalization, either side can propose an actual compliance event such as
return of possession. The other side must confirm it before the offchain
compliance timeline schedules deadlines. The proposal and confirmation remain
separate immutable events. This avoids silently replacing the forecast with one
party's unverified date. Confirmed deadlines feed the existing opt-in,
privacy-minimal three-day, one-day, and due-date reminder system.

The same two-party process now resolves later facts used by conditional state
deadlines, including whether a deposit is being claimed, whether a tenant
disputes a damage list, or whether a qualifying displacement or condemnation
occurred. The active profile defines which facts may be proposed. One party
records a yes/no value and an optional neutral note; the other party must
confirm that exact value before the evaluator uses it. A confirmed value is a
procedural input to the software timeline, not an adjudication, admission, or
legal determination. The other party can reject an incorrect pending proposal,
after which either side can submit a corrected value. Confirmed facts are
immutable in this version; an incorrectly confirmed fact requires a later
corrective workflow rather than silent editing.

## Versioned claim packets

Every v4 state snapshot includes a claim-packet policy selected from the
validated property state. All 51 policies require an itemized claim, a private
supporting file, and an ordinary-wear/unsupported-charge safeguard when the
claim concerns condition, cleaning, or restoration. The server accepts only
the four modeled residential-deposit categories and verifies every applicable
attestation before saving the onchain claim receipt.

The state policy also carries the relevant delivery and process instructions
from that profile and adds structured packet checks where the reviewed source
identifies them. The initial special checks cover California photographs and
cost records, Georgia and Kentucky damage lists, Idaho signed itemization,
Illinois damage records, Massachusetts sworn itemization and written cost
evidence, and Washington condition/cost documentation. These state checks are
stored with the agreement so later registry updates do not rewrite an existing
claim packet. OpenEscrow safeguards are labeled separately from state-source
requirements, and an attestation records what the landlord asserted; it is not
proof that a deduction, notice, or delivery is legally sufficient.

## Federal and program overlays

The snapshot evaluator includes:

- Fair Housing Act assistance-animal deposit treatment;
- Servicemembers Civil Relief Act termination, advance-rent refund, and
  post-termination rent protections;
- VAWA operational and confidentiality requirements for covered housing,
  without recording survivor status or protected-event details;
- Housing Choice and Emergency Housing Voucher rules;
- HUD public housing and assisted multifamily requirements; and
- USDA Rural Development multifamily deposit limits, accounts, installment
  plans, wear-and-tear rules, and state/local coordination.

The facts stored in the ordinary agreement are deliberately minimal. Medical
records, diagnoses, military orders, VAWA certifications, survivor status,
emergency-transfer locations, and similar protected documents must not be
entered into OpenEscrow.

## Reviewed local overlays

Local rules use normalized city and county routing keys derived from the
selected address. The initial reviewed registry includes Chicago, Seattle, and
Portland. A locality absent from the registry remains visibly marked
`unreviewed-locality`; the engine does not treat a missing entry as proof that
no local rule exists.

The local registry is validated when the module loads. Overlay IDs, declared
city/county scope, routing keys, version identifiers, HTTPS citations,
requirements, deadline shapes, and privacy notes must match the reusable
catalog contract. Duplicate identities, unknown fields, and unsupported
overlay-level conditions fail closed instead of being silently ignored. This
validator checks data integrity only; it does not determine that a cited rule
is complete or legally applicable.

## What is not automated

An address by itself cannot determine or prove:

- whether a state statute covers a particular owner, building, lease, deposit,
  public-housing program, occupancy type, or termination;
- any city or county ordinance not present in the reviewed local registry;
- the actual date possession was legally surrendered;
- forwarding-address, demand, notice, inspection, service, mailing, banking,
  interest, surety-bond, receipt, translation, or disclosure compliance;
- exceptions for displacement, domestic violence, military service,
  abandonment, casualty, condemnation, subsidized housing, pets, furnished
  units, older tenants, or small landlords;
- whether a charge is a refundable deposit, advance rent, fee, or prohibited
  charge;
- penalty, fee-shifting, waiver, limitation-period, or litigation rules; or
- whether an OpenEscrow response or arbiter period is enforceable.

Every state profile therefore preserves `legalReviewRequired: true` and
`localOverlayRequired: true` as risk flags even though the rules are implemented
and were reviewed against the cited official source. These flags prevent the
product from presenting software research as professional advice. The
seven-day tenant response and optional seven-day arbiter period remain
OpenEscrow test rules rather than statutory deadlines.

## Review and implementation method

Each profile links to a state legislature, official code publisher, or official
state consumer/legal resource. The July 26, 2026 snapshot was reviewed for the
statewide deposit baseline, custody and interest requirements, inspection and
notice steps, itemization and return rules, fact-dependent paths, and common
coverage exceptions. Multi-stage states retain every identified stage rather
than collapsing the law into one timer. Tennessee deliberately records its
30-day value as a nonstatutory OpenEscrow safeguard.

The implementation is regression-checked to ensure all 51 profiles have unique
versions, official-source metadata, requirements, exceptions, and at least one
deadline path. Representative tests also cover business-day arithmetic,
multi-stage rules, address/profile mismatch rejection, and incomplete/non-U.S.
address records. Geocoder regressions also prove that only a complete numbered
U.S. street address in a recognized state can receive a validated profile.

The review corrected several stale assumptions in the earlier draft:

- [Maine's statute](https://legislature.maine.gov/legis/statutes/14/title14sec6033.html)
  now routes a 21-day tenancy-at-will path separately from a written
  rental-agreement path, which may set a return period of up to 30 days.
- Colorado now records the statewide two-month cap and the 2026
  walk-through/documentation rules.
- Illinois records the current statewide 30-day damage-accounting and 45-day
  full-return paths without the former five-unit coverage assumption.
- Minnesota no longer asserts a statewide one-month cap and records its 21-day,
  five-day condemnation, interest, and inspection paths.
- South Dakota uses the 21-day period effective July 1, 2026 while preserving
  the separate 45-day detailed-itemization-on-request path.
- Vermont preserves its 14-day standard path and 60-day qualifying seasonal
  occupancy path.

This snapshot must be updated when a cited law changes. A safe production
release must continue expanding the approved city/county registry for each
supported market.

## Official-source monitoring

Migration `drizzle/0006_compliance_source_monitor.sql` adds a
`compliance_source_checks` table. When
`COMPLIANCE_SOURCE_MONITOR_ENABLED=true`, the existing scheduler checks a
rotating batch of four official sources every 15 minutes while any registered
source still needs its first baseline, then returns to one batch per day. It
samples response metadata and up to 256 KiB, stores a SHA-256 signature, and
marks a source `changed`, `unchanged`, or `unreachable`. Known challenge and
error-page redirects are rejected instead of being accepted as legal-source
content. Registry changes are seeded before the cadence check so a replacement
source enters the 15-minute bootstrap path immediately rather than waiting for
the next daily pass. The monitor never automatically edits a rule.
The public readiness response reports the configured state, source count,
changed count, unreachable count, pending count, stale count, blocking count,
current time-limited manual-review count, and last run time.

The first successful check establishes a baseline. A later signature change is
an alert for a new official-source review and profile version, not proof that
the law changed.

### Reviewed source maintenance (2026-08-08)

Four unreachable source destinations were replaced with current official
government publications. Their overlay versions advanced to `v2` so the new
URLs must establish fresh monitor baselines; no requirement or deadline text
changed in this maintenance release:

- HUD assistance-animal accommodation: the
  [HUD/DOJ Joint Statement](https://www.hud.gov/sites/documents/huddojstatement.pdf).
- SCRA lease termination: [50 U.S.C. section
  3955](https://www.govinfo.gov/link/uscode/50/3955?link-type=html&year=mostrecent)
  through GovInfo.
- USDA Rural Development multifamily housing: [7 C.F.R. part
  3560](https://www.govinfo.gov/link/cfr/7/3560?link-type=pdf&year=mostrecent)
  through GovInfo.
- Chicago RLTO: the [City of Chicago Department of Housing RLTO source
  hub](https://www.chicago.gov/city/en/depts/doh/provdrs/landlords/svcs/residential-landlord-and-tenant-ordinance.html).

When monitoring is enabled, new, revised, and finalizing address-routed
agreements fail closed unless every statewide and applicable overlay source in
their exact snapshot has a successful verification no more than 21 days old or
the narrow, current manual-review exception described below.
A detected change blocks that profile until its rule review produces a new
profile or overlay version. Replacing an official source URL is an auditable
overlay or profile release and therefore requires a new version even when the
reviewed rule text does not change. Updating a source URL or version clears the
old baseline so the replacement must be checked from scratch. A temporary source
outage may use the last successful signature during the 21-day window; once
that window expires, the profile is blocked until the source can be verified
again. Generic test agreements are not subject to this release gate.

New Hampshire's official General Court origin returns HTTP 520 to Cloudflare
Workers even though the same pages remain available to ordinary clients. Profile
`nh-rules-2026-08-09.v12` therefore cites the complete consolidated
[RSA chapter 540-A](https://gc.nh.gov/rsa/html/lv/540-a/540-a-mrg.htm) and uses a
separate scheduled GitHub runner for its source observation. The runner checks
the exact official URL, HTTP status, final URL, required chapter and section
markers, and raw document SHA-256. It publishes only the observation metadata
to the public `compliance-attestations` branch; it does not republish the law or
change any compliance rule.

The Cloudflare monitor reads that public observation and accepts it only when
the source key, profile version, official URL, final URL, expected reviewed
SHA-256, required markers, and a check time no more than 48 hours old all match.
A changed document is published as `changed` and blocks the profile. A missing,
stale, future-dated, malformed, redirected, structurally incomplete, or
unreachable observation also fails closed. The monitoring workflow itself then
fails after publishing any alert so maintainers receive a visible review gate.
This removes the former time-limited manual exception without treating a proxy
or secondary legal website as the official authority. Repository write access
to the attestation branch is part of the monitoring trust boundary.

Before the wallet is asked to create an onchain agreement, the landlord client
runs a server preflight for the exact approved revision. A successful preflight
is recorded for the audit trail, but it is not a waiver: receipt finalization
rechecks the exact sources and fails closed if any source has since changed,
gone stale, become pending, or fallen out of the versioned registry. If a source
gate closes after a transaction is broadcast but before its receipt is saved,
the private record remains unfinalized and the incident must be reconciled
explicitly rather than silently accepting an outdated compliance state.

After finalization, deadline calculations, reminders, and the agreement
timeline use the immutable rules and overlays stored in that agreement's
versioned compliance snapshot. A later registry release can govern new
agreements without silently changing an existing agreement's recorded
deadline paths. Snapshot creation recursively copies and freezes nested
requirements, conditions, sources, overlays, and claim checks instead of
retaining live registry references. Unsupported day-count metadata fails closed
as an invalid rule rather than silently falling back to calendar-day
arithmetic. The lifecycle-event API likewise accepts only triggers present in
that exact snapshot.

The pilot-readiness check requires monitoring to be enabled, every registered
source to be baselined and current or covered by the narrow current exception
above, no blocking source state, and a successful monitor run within the
previous 48 hours. This gate detects source-page drift; it does not determine
what changed or update legal rules without a new review.

## Contract limitation

The testnet contract still starts its onchain deadline from a forecast
possession-return timestamp fixed at finalization. The newly confirmed
lifecycle events activate the offchain compliance timeline, but they cannot
rewrite the deployed contract's timer. A later contract version should consume
a challengeable, mutually confirmed possession-return event and support
multi-stage deadlines directly rather than treating every state as one timer.
