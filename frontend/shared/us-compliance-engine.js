import {
  normalizeComplianceFacts,
  resolveComplianceOverlays,
} from "./us-compliance-overlays.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const VERSIONED_COMPLIANCE_SNAPSHOT_SCHEMAS = new Set([
  "openescrow.us-compliance-profile.v3",
  "openescrow.us-compliance-profile.v4",
]);
const DEADLINE_DAY_TYPES = new Set(["calendar", "business"]);
const DEADLINE_COMPARISONS = new Set(["earlier-of", "later-of"]);

function cloneAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item)));
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item)]),
      ),
    );
  }
  return value;
}

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

export function isVersionedComplianceSnapshot(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      VERSIONED_COMPLIANCE_SNAPSHOT_SCHEMAS.has(value.schema),
  );
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
      [
        ...profile.deadlines
          .filter(
            (deadline) =>
              conditionStatus(deadline.condition, overlayResolution.facts) ===
              "needs-fact",
          )
          .map((deadline) => deadline.condition?.fact),
        ...[...overlayResolution.federal, ...overlayResolution.local]
          .filter((overlay) => overlay.applicability === "needs-fact")
          .map((overlay) => overlay.condition?.fact),
      ].filter(Boolean),
    ),
  ];
  return cloneAndFreeze({
    schema: "openescrow.us-compliance-profile.v4",
    jurisdiction: profile.code,
    profileVersion: profile.version,
    researchedOn: profile.researchedOn,
    reviewMethod: profile.reviewMethod,
    source: {
      citation: profile.statuteCitation,
      url: profile.statuteUrl,
    },
    address,
    facts: overlayResolution.facts,
    localityKeys: overlayResolution.localityKeys,
    localCoverage: overlayResolution.localCoverage,
    depositCap: profile.depositCap,
    deadlines: profile.deadlines,
    requirements: profile.requirements,
    exceptions: profile.exceptions,
    claimPolicy: profile.claimPolicy,
    overlays,
    missingFacts,
    unresolvedOverlays: [
      ...(overlayResolution.localCoverage === "unreviewed-locality"
        ? ["Confirm city and county rules for the resolved property location."]
        : []),
      ...(missingFacts.length
        ? [`Resolve compliance facts: ${missingFacts.join(", ")}.`]
        : []),
      "Confirm rent-regulation, property-specific program documents, and facts that cannot be inferred from an address.",
    ],
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

function isComplianceScalar(value) {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function validDeadlineCondition(condition) {
  if (condition === null || condition === undefined) return true;
  if (
    !condition ||
    typeof condition !== "object" ||
    Array.isArray(condition) ||
    !cleanString(condition.fact, 80)
  ) {
    return false;
  }
  const hasEquals = Object.prototype.hasOwnProperty.call(condition, "equals");
  const hasOneOf = Object.prototype.hasOwnProperty.call(condition, "oneOf");
  if (hasEquals === hasOneOf) return false;
  if (hasEquals) return isComplianceScalar(condition.equals);
  return (
    Array.isArray(condition.oneOf) &&
    condition.oneOf.length > 0 &&
    condition.oneOf.every(isComplianceScalar)
  );
}

function validDeadlineRule(rule) {
  return Boolean(
    rule &&
      typeof rule === "object" &&
      !Array.isArray(rule) &&
      cleanString(rule.id, 120) &&
      cleanString(rule.label, 200) &&
      cleanString(rule.trigger, 80) &&
      Number.isInteger(rule.days) &&
      rule.days >= 0 &&
      rule.days <= 730 &&
      DEADLINE_DAY_TYPES.has(rule.dayType) &&
      (rule.comparison === null ||
        rule.comparison === undefined ||
        DEADLINE_COMPARISONS.has(rule.comparison)) &&
      validDeadlineCondition(rule.condition),
  );
}

function evaluateDeadlineRules(rules, facts, events, holidayDates) {
  return rules.map((rule) => {
    if (!validDeadlineRule(rule)) {
      return Object.freeze({
        ...(rule && typeof rule === "object" && !Array.isArray(rule) ? rule : {}),
        applicability: "invalid-rule",
        status: "invalid-rule",
        dueAt: null,
      });
    }
    const applicability = conditionStatus(rule.condition, facts);
    const start = dateFrom(events[rule.trigger]);
    const dueAt =
      applicability === "applies" && start
        ? calculateDeadline(start, rule.days, rule.dayType, holidayDates)
        : null;
    return Object.freeze({
      ...rule,
      applicability,
      status:
        applicability !== "applies"
          ? applicability
          : start
            ? dueAt
              ? "scheduled"
              : "invalid-rule"
            : "waiting-for-event",
      dueAt,
    });
  });
}

function combinedDeadlineEvaluations(deadlines) {
  return ["earlier-of", "later-of"]
    .map((comparison) => {
      const members = deadlines.filter(
        (deadline) => deadline.comparison === comparison,
      );
      if (members.length < 2) return null;
      const hasInvalidRule = members.some(
        (deadline) => deadline.status === "invalid-rule",
      );
      const scheduled = members.filter(
        (deadline) => deadline.status === "scheduled" && deadline.dueAt,
      );
      const dueTimes = scheduled.map((deadline) =>
        new Date(deadline.dueAt).getTime(),
      );
      const fullyScheduled = !hasInvalidRule && scheduled.length === members.length;
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
        status: hasInvalidRule
          ? "invalid-rule"
          : fullyScheduled
            ? "scheduled"
            : "waiting-for-event",
        dueAt: dueTime === null ? null : new Date(dueTime).toISOString(),
      });
    })
    .filter(Boolean);
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
  if (
    !start ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 730 ||
    !DEADLINE_DAY_TYPES.has(dayType)
  ) {
    return null;
  }
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
  const deadlines = evaluateDeadlineRules(
    profile.deadlines,
    facts,
    events,
    holidayDates,
  );
  const missingFacts = [
    ...new Set(
      deadlines
        .filter((deadline) => deadline.applicability === "needs-fact")
        .map((deadline) => deadline.condition.fact),
    ),
  ];
  const combinedDeadlines = combinedDeadlineEvaluations(deadlines);
  const overlayResolution = resolveComplianceOverlays(address, facts);
  const overlayEvaluations = [
    ...overlayResolution.federal,
    ...overlayResolution.local,
  ].map((overlay) => {
    const deadlines =
      overlay.applicability === "applies"
        ? evaluateDeadlineRules(
            overlay.deadlines,
            facts,
            events,
            holidayDates,
          )
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

export function evaluateComplianceSnapshot(snapshot, input = {}) {
  if (
    !snapshot ||
    !isVersionedComplianceSnapshot(snapshot) ||
    !Array.isArray(snapshot.deadlines) ||
    !Array.isArray(snapshot.overlays)
  ) {
    return null;
  }
  const address = normalizeAddressResolution(snapshot.address);
  if (
    !address ||
    cleanString(snapshot.jurisdiction, 100).toLowerCase() !==
      `us-${address.stateCode.toLowerCase()}`
  ) {
    return null;
  }
  const inputFacts =
    input.facts && typeof input.facts === "object" ? input.facts : {};
  const rawFacts = {
    ...(snapshot.facts && typeof snapshot.facts === "object"
      ? snapshot.facts
      : {}),
    ...inputFacts,
  };
  const facts = Object.freeze({
    ...rawFacts,
    ...normalizeComplianceFacts(rawFacts),
  });
  const events =
    input.events && typeof input.events === "object" ? input.events : {};
  const holidayDates = Array.isArray(input.holidayDates)
    ? input.holidayDates
    : [];
  const deadlines = evaluateDeadlineRules(
    snapshot.deadlines,
    facts,
    events,
    holidayDates,
  );
  const combinedDeadlines = combinedDeadlineEvaluations(deadlines);
  const overlayEvaluations = snapshot.overlays.map((overlay) => {
    const deadlines =
      overlay.applicability === "applies" && Array.isArray(overlay.deadlines)
        ? evaluateDeadlineRules(
            overlay.deadlines,
            facts,
            events,
            holidayDates,
          )
        : [];
    return Object.freeze({
      ...overlay,
      deadlines: Object.freeze(deadlines),
    });
  });
  const missingFacts = [
    ...new Set(
      deadlines
        .filter((deadline) => deadline.applicability === "needs-fact")
        .map((deadline) => deadline.condition?.fact)
        .filter(Boolean),
    ),
  ];
  return Object.freeze({
    jurisdiction: snapshot.jurisdiction,
    profileVersion: snapshot.profileVersion,
    status: "versioned-snapshot",
    address,
    depositCap: evaluateDepositCap(
      {
        depositCap: snapshot.depositCap,
        depositCapSummary:
          snapshot.depositCap?.summary ||
          "Review the recorded deposit-cap requirements.",
      },
      facts,
    ),
    deadlines: Object.freeze(deadlines),
    combinedDeadlines: Object.freeze(combinedDeadlines),
    requirements: Object.freeze([...(snapshot.requirements || [])]),
    exceptions: Object.freeze([...(snapshot.exceptions || [])]),
    facts,
    overlays: Object.freeze(overlayEvaluations),
    localityKeys: Object.freeze([...(snapshot.localityKeys || [])]),
    localCoverage: snapshot.localCoverage,
    missingFacts: Object.freeze(missingFacts),
    unresolvedOverlays: Object.freeze([
      ...(snapshot.unresolvedOverlays || []),
    ]),
    generatedAt: new Date().toISOString(),
  });
}
