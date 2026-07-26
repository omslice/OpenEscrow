# California residential policy profile

OpenEscrow retains this legacy compliance-configured profile for California
residential tenancies governed by California Civil Code section 1950.5. New
proposals now use the implemented nationwide registry documented in
[`us-jurisdiction-profiles.md`](./us-jurisdiction-profiles.md). This legacy
profile remains readable for existing records but is not accepted for new
proposals. Neither profile is legal advice, a legal opinion, or a guarantee that
a particular agreement, deduction, notice, or return complies with law.

Policy version: `ca-civ-1950.5-2026.1`

Primary sources:

- California Civil Code section 1950.5:
  https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5.
- California Department of Real Estate, 2026 Landlord/Tenant Guide:
  https://www.dre.ca.gov/publications/ResourceGuidebook/gb10_movingout.html

## Locked agreement rules

- Jurisdiction: California residential tenancy.
- Accounting and refund period: 21 calendar days after the tenant vacates.
- Tenant response period: 7 days. This is an OpenEscrow pilot rule, not a
  California statutory deadline.
- Arbiter ruling period: 7 days. This is an OpenEscrow pilot rule, not a
  California statutory deadline.
- Tenant-paid OpenEscrow platform or operations fee: $0.
- Deposit cap: one month of rent by default.
- Small-landlord exception: up to two months of rent only when the landlord
  asserts the statutory ownership/unit facts and the tenant is not a service
  member.
- Electronic delivery and virtual-return consent is included in the proposal
  terms and must be approved by every required party.

The server rejects proposals or revisions that alter these locked values.

## Required deduction record

The app limits deduction categories to:

1. Unpaid rent.
2. Repair of tenant-caused damage beyond ordinary wear and tear.
3. Cleaning reasonably necessary to return the unit to its move-in level of
   cleanliness.
4. Lease-authorized restoration or replacement of landlord personal property
   or appurtenances, excluding ordinary wear and tear.

Every claim requires an itemized statement, supporting documentation, a
privacy-safe evidence pointer, and a verification hash. Condition-based claims
also require the landlord to attest that the record contains applicable
move-in, pre-repair, and post-repair photographs.

## Required human procedures that software cannot prove

- Give written notice of the tenant's option to request an initial inspection
  and right to be present.
- If requested, schedule the inspection no earlier than two weeks before
  termination and give at least 48 hours' written notice unless properly
  waived.
- Give the tenant the inspection itemization and the required statutory text.
- Determine the actual date the tenant vacated and returned possession.
- Determine whether each amount is reasonably necessary and whether an asserted
  condition is ordinary wear and tear.
- Provide invoices, receipts, labor details, photographs, estimates, corrected
  statements, and refunds within the applicable statutory periods.
- Follow local city or county rules that are more protective than statewide
  law.

## Known contract limitation

The current testnet contract fixes the expected possession-return timestamp when
the agreement is finalized. If the tenant actually vacates earlier or later,
the onchain 21-day window does not automatically move. The current UI warns the
parties that they must correct the date through a newly approved proposal before
finalization. A future contract version should activate the statutory clock
from a recorded possession-return event rather than a forecast date.
