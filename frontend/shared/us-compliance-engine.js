import {
  normalizeComplianceFacts,
  resolveComplianceOverlays,
} from "./us-compliance-overlays.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function cleanString(value, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function finiteCoordinate(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

export function normalizeAddressResolution(value) {
  if (!value || typeof value !== "object") return null;
  const countryCode = cleanString(value.countryCode, 2).toUpperCase();
  const stateCode = cleanString(value.stateCode, 2).toUpperCase();
  const label = cleanString(value.label);
  const providerFeatureId = cleanString(value.providerFeatureId || value.id, 100);
  const latitude = finiteCoordinate(value.latitude, -90, 90);
  const longitude = finiteCoordinate(value.longitude, -180, 180);
  if (
    countryCode !== "US" ||
    !/^[A-Z]{2}$/.test(stateCode) ||
    label.length < 5 ||
    !providerFeatureId ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }
  return Object.freeze({
    provider: "photon-openstreetmap",
    providerFeatureId,
    label,
    countryCode,
    stateCode,
    city: cleanString(value.city, 120) || null,
    county: cleanString(value.county, 120) || null,
    postalCode: cleanString(value.postalCode, 20) || null,
    latitude,
    longitude,
    attestation: cleanString(value.attestation, 200) || null,
  });
}

export function addressResolutionMatchesProfile(resolution, profile) {
  const normalized = normalizeAddressResolution(resolution);
  return Boolean(
    normalized &&
      profile &&
      normalized.stateCode === profile.postalCode &&
      normalized.label === cleanString(resolution?.label),
  );
}

export function buildComplianceSnapshot(profile, resolution, context = {}) {
  const address = normalizeAddressResolution(resolution);
  if (!profile || !addressResolutionMatchesProfile(address, profile)) return null;
  const overlayResolution = resolveComplianceOverlays(
    address,
    context.facts || context,
  );
  const overlays = [
    ...overlayResolution.federal,
    ...overlayResolution.local,
  ]
    .filter((overlay) => overlay.applicability !== "not-applicable")
    .map((overlay) =>
      Object.freeze({
        id: overlay.id,
        scope: overlay.scope,
        label: overlay.label,
        version: overlay.version,
        applicability: overlay.applicability,
        sources: overlay.sources,
        requirements: overlay.requirements,
        deadlines: overlay.deadlines,
        privacyNote: overlay.privacyNote,
      }),
    );
  const missingFacts = [
    ...new Set(
      [...overlayResolution.federal, ...overlayResolution.local]
        .filter((overlay) => overlay.applicability === "needs-fact")
        .map((overlay) => overlay.condition?.fact)
        .filter(Boolean),
    ),
  ];
  return Object.freeze({
    schema: "openescrow.us-compliance-profile.v3",
    jurisdiction: profile.code,
    profileVersion: profile.version,
    researchedOn: profile.researchedOn,
    reviewMethod: profile.reviewMethod,
    source: Object.freeze({
      citation: profile.statuteCitation,
      url: profile.statuteUrl,
    }),
    address,
    facts: overlayResolution.facts,
    localityKeys: overlayResolution.localityKeys,
    localCoverage: overlayResolution.localCoverage,
    depositCap: profile.depositCap,
    deadlines: profile.deadlines,
    requirements: profile.requirements,
    exceptions: profile.exceptions,
    overlays: Object.freeze(overlays),
    missingFacts: Object.freeze(missingFacts),
    unresolvedOverlays: Object.freeze([
      ...(overlayResolution.localCoverage === "unreviewed-locality"
        ? ["Confirm city and county rules for the resolved property location."]
        : []),
      ...(missingFacts.length
        ? [`Resolve compliance facts: ${missingFacts.join(", ")}.`]
        : []),
      "Confirm rent-regulation, property-specific program documents, and facts that cannot be inferred from an address.",
    ]),
  });
}

export function complianceSnapshotMatchesProfile(
  snapshot,
  profile,
  resolution,
  context = {},
) {
  const expected = buildComplianceSnapshot(profile, resolution, context);
  return Boolean(
    expected &&
      snapshot &&
      typeof snapshot === "object" &&
      JSON.stringify(snapshot) === JSON.stringify(expected),
  );
}

function conditionStatus(condition, facts) {
  if (!condition) return "applies";
  if (!Object.prototype.hasOwnProperty.call(facts, condition.fact)) {
    return "needs-fact";
  }
  const actual = facts[condition.fact];
  if (actual === null || actual === undefined || actual === "unknown") {
    return "needs-fact";
  }
  if (Array.isArray(condition.oneOf)) {
    return condition.oneOf.includes(actual) ? "applies" : "not-applicable";
  }
  return actual === condition.equals ? "applies" : "not-applicable";
}

function dateFrom(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  const text = cleanString(value, 40);
  if (!text || !ISO_DATE.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(start, days) {
  const result = new Date(start.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addBusinessDays(start, days, holidays) {
  const result = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(utcDateKey(result))) {
      remaining -= 1;
    }
  }
  return result;
}

export function calculateDeadline(startValue, days, dayType = "calendar", holidayDates = []) {
  const start = dateFrom(startValue);
  const count = Number(days);
  if (!start || !Number.isInteger(count) || count < 0 || count > 730) return null;
  const holidays = new Set(
    holidayDates
      .map((value) => dateFrom(value))
      .filter(Boolean)
      .map(utcDateKey),
  );
  const due =
    dayType === "business"
      ? addBusinessDays(start, count, holidays)
      : addCalendarDays(start, count);
  return due.toISOString();
}

function evaluateDepositCap(profile, facts) {
  const cap = profile.depositCap;
  if (!cap || cap.kind !== "months-rent" || !Number.isFinite(cap.months)) {
    return {
      status: "manual-review",
      maximum: null,
      message: profile.depositCapSummary,
    };
  }
  const monthlyRent = Number(facts.monthlyRent);
  const deposit = Number(facts.deposit);
  if (!(monthlyRent > 0) || !(deposit >= 0)) {
    return {
      status: "needs-fact",
      maximum: null,
      message: `Enter monthly rent and the refundable deposit to test the ${cap.months}-month statewide baseline.`,
    };
  }
  const maximum = Math.round(monthlyRent * cap.months * 100) / 100;
  return {
    status: deposit <= maximum ? "within-baseline" : "possible-exception-or-violation",
    maximum,
    message:
      deposit <= maximum
        ? `The refundable deposit is within the ${cap.months}-month statewide baseline.`
        : `The refundable deposit exceeds the ${cap.months}-month statewide baseline; an exception or correction is required.`,
  };
}

export function evaluateCompliance(profile, input = {}) {
  if (!profile) return null;
  const address = normalizeAddressResolution(input.address);
  if (!addressResolutionMatchesProfile(address, profile)) return null;
  const rawFacts =
    input.facts && typeof input.facts === "object" ? input.facts : {};
  const facts = Object.freeze({
    ...rawFacts,
    ...normalizeComplianceFacts(rawFacts),
  });
  const events = input.events && typeof input.events === "object" ? input.events : {};
  const holidayDates = Array.isArray(input.holidayDates) ? input.holidayDates : [];
  const deadlines = profile.deadlines.map((rule) => {
    const applicability = conditionStatus(rule.condition, facts);
    const start = dateFrom(events[rule.trigger]);
    return Object.freeze({
      ...rule,
      applicability,
      status:
        applicability !== "applies"
          ? applicability
          : start
            ? "scheduled"
            : "waiting-for-event",
      dueAt:
        applicability === "applies" && start
          ? calculateDeadline(start, rule.days, rule.dayType, holidayDates)
          : null,
    });
  });
  const missingFacts = [
    ...new Set(
      deadlines
        .filter((deadline) => deadline.applicability === "needs-fact")
        .map((deadline) => deadline.condition.fact),
    ),
  ];
  const combinedDeadlines = ["earlier-of", "later-of"]
    .map((comparison) => {
      const members = deadlines.filter(
        (deadline) => deadline.comparison === comparison,
      );
      if (members.length < 2) return null;
      const scheduled = members.filter(
        (deadline) => deadline.status === "scheduled" && deadline.dueAt,
      );
      const dueTimes = scheduled.map((deadline) =>
        new Date(deadline.dueAt).getTime(),
      );
      const fullyScheduled = scheduled.length === members.length;
      const dueTime =
        fullyScheduled && comparison === "earlier-of"
          ? Math.min(...dueTimes)
          : fullyScheduled
            ? Math.max(...dueTimes)
            : null;
      return Object.freeze({
        id: `${comparison}-controlling-deadline`,
        label: `Controlling ${comparison.replace("-", " ")} deadline`,
        comparison,
        memberIds: Object.freeze(members.map((deadline) => deadline.id)),
        status: fullyScheduled ? "scheduled" : "waiting-for-event",
        dueAt: dueTime === null ? null : new Date(dueTime).toISOString(),
      });
    })
    .filter(Boolean);
  const overlayResolution = resolveComplianceOverlays(address, facts);
  const overlayEvaluations = [
    ...overlayResolution.federal,
    ...overlayResolution.local,
  ].map((overlay) => {
    const deadlines =
      overlay.applicability === "applies"
        ? overlay.deadlines.map((rule) => {
            const start = dateFrom(events[rule.trigger]);
            return Object.freeze({
              ...rule,
              status: start ? "scheduled" : "waiting-for-event",
              dueAt: start
                ? calculateDeadline(
                    start,
                    rule.days,
                    rule.dayType,
                    holidayDates,
                  )
                : null,
            });
          })
        : [];
    return Object.freeze({ ...overlay, deadlines: Object.freeze(deadlines) });
  });
  const overlayMissingFacts = overlayEvaluations
    .filter((overlay) => overlay.applicability === "needs-fact")
    .map((overlay) => overlay.condition?.fact)
    .filter(Boolean);
  return Object.freeze({
    jurisdiction: profile.code,
    profileVersion: profile.version,
    status: profile.researchStatus,
    address,
    depositCap: evaluateDepositCap(profile, facts),
    deadlines: Object.freeze(deadlines),
    combinedDeadlines: Object.freeze(combinedDeadlines),
    requirements: profile.requirements,
    exceptions: profile.exceptions,
    facts,
    overlays: Object.freeze(overlayEvaluations),
    localityKeys: overlayResolution.localityKeys,
    localCoverage: overlayResolution.localCoverage,
    missingFacts: Object.freeze([
      ...new Set([...missingFacts, ...overlayMissingFacts]),
    ]),
    unresolvedOverlays: Object.freeze([
      ...(overlayResolution.localCoverage === "unreviewed-locality"
        ? ["Confirm city and county rules for the resolved property location."]
        : []),
      "Confirm rent-regulation and property-specific program documents.",
    ]),
    generatedAt: new Date().toISOString(),
  });
}
