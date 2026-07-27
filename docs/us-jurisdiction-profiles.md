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

When a user selects a U.S. property suggestion from the address lookup, the
server returns the normalized address, two-letter state code, municipality,
county, postal code, coordinates, provider feature identifier, and a
server-only HMAC attestation over those exact fields. The proposal builder then:

1. selects the matching `us-xx` profile;
2. records the normalized address resolution and exact profile version in the
   private proposal;
3. asks for the property type, tenancy type, unit count, housing program,
   assistance-animal deposit treatment, asserted SCRA termination status, and
   profile-specific facts such as written-agreement or seasonal-occupancy
   status rather than inferring those facts from the address;
4. applies and locks the profile's onchain safeguard window;
5. records every statewide requirement, federal/program overlay, reviewed local
   overlay, and conditional/multi-stage deadline in a versioned v3 snapshot;
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
address records.

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
rotating batch of four official sources once per day. It samples response
metadata and up to 256 KiB, stores a SHA-256 signature, and marks a source
`changed`, `unchanged`, or `unreachable`. It never automatically edits a rule.
The public readiness response reports the configured state, source count,
changed count, unreachable count, pending count, stale count, blocking count,
and last run time.

The first successful check establishes a baseline. A later signature change is
an alert for a new official-source review and profile version, not proof that
the law changed.

When monitoring is enabled, new, revised, and finalizing address-routed
agreements fail closed unless every statewide and applicable overlay source in
their exact snapshot has a successful verification no more than 21 days old.
A detected change blocks that profile until its rule review produces a new
profile or overlay version. Updating a source URL or version clears the old
baseline so the replacement must be checked from scratch. A temporary source
outage may use the last successful signature during the 21-day window; once
that window expires, the profile is blocked until the source can be verified
again. Generic test agreements are not subject to this release gate.

Before the wallet is asked to create an onchain agreement, the landlord client
runs a server preflight for the exact approved revision. A successful preflight
is recorded with a ten-minute expiry so a transaction authorized immediately
before a monitor update can still have its receipt saved without leaving the
onchain and private records inconsistent. Without that exact, unexpired
preflight, finalization rechecks the source gate and refuses the action.

The pilot-readiness check requires monitoring to be enabled, every registered
source to be baselined and current, no blocking source state, and a successful
monitor run within the previous 48 hours. This gate detects source-page drift;
it does not determine what changed or update legal rules without a new review.

## Contract limitation

The testnet contract still starts its onchain deadline from a forecast
possession-return timestamp fixed at finalization. The newly confirmed
lifecycle events activate the offchain compliance timeline, but they cannot
rewrite the deployed contract's timer. A later contract version should consume
a challengeable, mutually confirmed possession-return event and support
multi-stage deadlines directly rather than treating every state as one timer.
