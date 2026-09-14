# Ohio property-timezone and deadline decision

Prepared September 14, 2026 against application `f988fff4a2068367f48e72c4bd583bfcebbc5333`.
This supplements OH-09 in the Ohio review matrix. It is a proposed engineering design, not an
approved Ohio deadline-counting rule. No app behavior, accepted snapshot or contract was changed.

## Proposed technical basis

Use `America/New_York` as the candidate IANA zone for contemporary Ohio property dates. The
[federal eastern/central boundary](https://www.ecfr.gov/current/title-49/subtitle-A/part-71/section-71.5)
and [IANA zone table](https://data.iana.org/time-zones/tzdb/zone1970.tab) support this engineering
mapping; IANA labels this zone Eastern time for most U.S. areas. The mapping still needs to be
bound to the actual validated property, with the reviewer recording the authority and version.
Do not use the owner's or participant's device zone as evidence of property location.

[NIST's DST rules](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst)
explain the missing spring hour and repeated autumn hour. An IANA zone is necessary to represent
these transitions; a fixed `EST` label or `-05:00` offset is insufficient for a whole Ohio tenancy.

## Reproduced current behavior

The retained diagnostic imported the actual candidate's `calculateDeadline` function, checked its
commit and hashed its source. [Diagnostic output](evidence/ohio-timezone-diagnostic-2026-09-14.json)
records the inputs and results. Runtime: Node 24.18.0, ICU 78.3, timezone database 2026b.

| Synthetic event in Ohio | Current +30 calendar days, displayed in Ohio | Comparison retaining the same local clock time after 30 dates |
|---|---|---|
| February 15, 2026 at 23:30 EST | March 18 at 00:30 EDT | March 17 at 23:30 EDT |
| October 15, 2026 at 00:30 EDT | November 13 at 23:30 EST | November 14 at 00:30 EST |
| September 14, 2026 at 12:00 EDT | October 14 at 12:00 EDT | Same result |

The comparison demonstrates a distinction; it does not establish the legally correct due time.
The current engine's `addCalendarDays` and business-day iteration use UTC dates. The address
attestation v1 signs location fields but has no timezone or mapping version. Proposal date input
uses the browser's local zone. Therefore a signed address plus an explicit UTC instant does not
prove the deadline was entered or calculated in the property's civil time.

The diagnostic also records two different instants for November 1, 2026 at 01:30 in Ohio, and
shows that March 8, 2026 at 02:30 with a fixed winter offset round-trips to 03:30 in the property
zone. A future input flow must reject nonexistent local times and require an explicit choice for
repeated times, rather than silently normalizing either case.

## Concrete decisions for counsel and product owner

1. Specify the statutory clock event, including disagreement about termination and delivery of
   possession, and whether the period begins on the event date or the next date.
2. Specify whether a due date ends at local midnight, close of business, the event's clock time,
   or another legally defined instant. Specify weekend/holiday treatment and delivery versus
   dispatch requirements. A generic same-clock-time calculation is not presumed correct.
3. Select the property-timezone authority and update policy. Proposed implementation: derive
   the zone server-side from attested Ohio location; include the zone and mapping version in a
   new signed address payload and immutable compliance snapshot.
4. Display property time as the primary legal/process time, with a clearly labelled optional
   device-time equivalent. Store the local civil value, zone, resolved offset, UTC instant,
   disambiguation choice, policy version and calculation version together.
5. Keep accepted historical snapshots and immutable testnet contract deadlines unchanged. Any
   new interpretation requires a versioned policy and a separate contract-compatibility review.

## Implementation acceptance cases after those decisions

- Ohio property with Phoenix, London and Tokyo device zones produces the same authoritative
  property deadline; changing device zone does not change saved terms.
- Both DST transitions, nonexistent/repeated local times, year/month rollover, leap day,
  unknown timezone, unsupported mapping version and tampered signed zone are covered.
- Calendar and business-day counting use the approved property's civil dates and holiday scope.
- Contract claim, response and withdrawal windows cannot postpone a required notice or refund.
- A future timezone-rule update cannot silently reinterpret an already accepted record.

The owner confirmed unsubsidized residential rentals in Ottawa Hills, Brady Lake, or both.
See `ohio-local-pilot-scope.md` for the Lucas County and Franklin Township/Portage County split.
Both use the proposed `America/New_York` mapping. Fixed-term versus month-to-month, the actual
parcel and the legal counting choices above remain open. These cases prepare a concrete review;
they do not certify pilot readiness.
