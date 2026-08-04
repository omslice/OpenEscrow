import {
  normalizeComplianceFacts,
  resolveComplianceOverlays,
} from "./us-compliance-overlays.js";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2})))?$/;
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const VERSIONED_COMPLIANCE_SNAPSHOT_SCHEMAS = new Set([
  "openescrow.us-compliance-profile.v3",
  "openescrow.us-compliance-profile.v4",
]);
const DEADLINE_DAY_TYPES = new Set(["calendar", "business"]);
const DEADLINE_COMPARISONS = new Set(["earlier-of", "later-of"]);
const SNAPSHOT_LOCAL_COVERAGE = new Set([
  "reviewed-overlay-applied",
  "unreviewed-locality",
]);
const SNAPSHOT_OVERLAY_APPLICABILITY = new Set(["applies", "needs-fact"]);
const SNAPSHOT_OVERLAY_SCOPES = new Set([
  "federal",
  "federal-program",
  "state",
  "county",
  "city",
]);

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

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validStoredText(value, maxLength = 2_000) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function validStoredTextList(value, maxItems = 500) {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => validStoredText(item))
  );
}

function validSnapshotSource(value) {
  if (
    !isRecord(value) ||
    !validStoredText(value.citation) ||
    !validStoredText(value.url)
  ) {
    return false;
  }
  try {
    return new URL(value.url).protocol === "https:";
  } catch {
    return false;
  }
}

function validSnapshotDepositCap(value) {
  if (
    !isRecord(value) ||
    !validStoredText(value.summary) ||
    (value.kind !== "months-rent" && value.kind !== "manual")
  ) {
    return false;
  }
  return value.kind === "months-rent"
    ? Number.isFinite(value.months) && value.months > 0
    : value.months === null;
}

function validSnapshotAttestation(value) {
  return Boolean(
    isRecord(value) &&
      validStoredText(value.id, 120) &&
      validStoredText(value.label) &&
      (value.basis === "openescrow-safeguard" ||
        value.basis === "state-source") &&
      validStoredTextList(value.appliesToCategoryIds, 100),
  );
}

function validSnapshotClaimPolicy(value) {
  return Boolean(
    isRecord(value) &&
      value.schema === "openescrow.claim-policy.v1" &&
      validStoredText(value.version, 200) &&
      validStoredTextList(value.allowedCategoryIds, 100) &&
      Array.isArray(value.commonAttestations) &&
      value.commonAttestations.length <= 100 &&
      value.commonAttestations.every(validSnapshotAttestation) &&
      Array.isArray(value.stateAttestations) &&
      value.stateAttestations.length <= 100 &&
      value.stateAttestations.every(validSnapshotAttestation) &&
      validStoredTextList(value.stateInstructions) &&
      validSnapshotSource(value.source) &&
      value.legalReviewRequired === true,
  );
}

function validSnapshotOverlay(value) {
  return Boolean(
    isRecord(value) &&
      validStoredText(value.id, 120) &&
      SNAPSHOT_OVERLAY_SCOPES.has(value.scope) &&
      validStoredText(value.label) &&
      validStoredText(value.version, 200) &&
      SNAPSHOT_OVERLAY_APPLICABILITY.has(value.applicability) &&
      Array.isArray(value.sources) &&
      value.sources.length > 0 &&
      value.sources.length <= 100 &&
      value.sources.every(validSnapshotSource) &&
      validStoredTextList(value.requirements) &&
      Array.isArray(value.deadlines) &&
      value.deadlines.length <= 500 &&
      (value.privacyNote === null ||
        (typeof value.privacyNote === "string" &&
          value.privacyNote.length <= 2_000)),
  );
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
  const address = isRecord(value)
    ? normalizeAddressResolution(value.address)
    : null;
  if (
    !isRecord(value) ||
    !VERSIONED_COMPLIANCE_SNAPSHOT_SCHEMAS.has(value.schema) ||
    !/^us-[a-z]{2}$/.test(value.jurisdiction) ||
    !address ||
    value.jurisdiction !== `us-${address.stateCode.toLowerCase()}` ||
    !validStoredText(value.profileVersion, 200) ||
    !validStoredText(value.researchedOn, 40) ||
    !validStoredText(value.reviewMethod) ||
    !validSnapshotSource(value.source) ||
    !isRecord(value.facts) ||
    !Object.values(value.facts).every(isComplianceScalar) ||
    !validStoredTextList(value.localityKeys, 100) ||
    !SNAPSHOT_LOCAL_COVERAGE.has(value.localCoverage) ||
    !validSnapshotDepositCap(value.depositCap) ||
    !Array.isArray(value.deadlines) ||
    value.deadlines.length > 500 ||
    !validStoredTextList(value.requirements) ||
    !validStoredTextList(value.exceptions) ||
    !Array.isArray(value.overlays) ||
    value.overlays.length > 500 ||
    !value.overlays.every(validSnapshotOverlay) ||
    !validStoredTextList(value.missingFacts, 500) ||
    !validStoredTextList(value.unresolvedOverlays, 500)
  ) {
    return false;
  }
  return value.schema === "openescrow.us-compliance-profile.v3"
    ? value.claimPolicy === undefined ||
        validSnapshotClaimPolicy(value.claimPolicy)
    : validSnapshotClaimPolicy(value.claimPolicy);
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
  const holidayCalendarValid = normalizeHolidayDates(holidayDates) !== null;
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
    const hasEvent = Object.prototype.hasOwnProperty.call(events, rule.trigger);
    const eventValue = hasEvent ? events[rule.trigger] : null;
    const eventProvided =
      hasEvent &&
      eventValue !== null &&
      eventValue !== undefined &&
      (typeof eventValue !== "string" || eventValue.trim().length > 0);
    const start = eventProvided ? dateFrom(eventValue) : null;
    const invalidEvent = eventProvided && !start;
    const invalidHolidayCalendar =
      rule.dayType === "business" && !holidayCalendarValid;
    const dueAt =
      applicability === "applies" &&
      start &&
      !invalidEvent &&
      !invalidHolidayCalendar
        ? calculateDeadline(start, rule.days, rule.dayType, holidayDates)
        : null;
    return Object.freeze({
      ...rule,
      applicability,
      status:
        applicability !== "applies"
          ? applicability
          : invalidEvent
            ? "invalid-event"
            : !start
              ? "waiting-for-event"
              : invalidHolidayCalendar
                ? "invalid-holiday-calendar"
                : dueAt
                  ? "scheduled"
                  : "invalid-rule",
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
      const invalidMember = members.find(
        (deadline) => deadline.status.startsWith("invalid-"),
      );
      const scheduled = members.filter(
        (deadline) => deadline.status === "scheduled" && deadline.dueAt,
      );
      const dueTimes = scheduled.map((deadline) =>
        new Date(deadline.dueAt).getTime(),
      );
      const fullyScheduled = !invalidMember && scheduled.length === members.length;
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
        status: invalidMember
          ? invalidMember.status
          : fullyScheduled
            ? "scheduled"
            : "waiting-for-event",
        dueAt: dueTime === null ? null : new Date(dueTime).toISOString(),
      });
    })
    .filter(Boolean);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validCalendarDate(year, month, day) {
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function dateFrom(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  const text = cleanString(value, 40);
  const match = text ? ISO_DATE.exec(text) : null;
  if (!match) return null;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    zone,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!validCalendarDate(year, month, day)) return null;
  if (hourText === undefined) {
    return new Date(`${yearText}-${monthText}-${dayText}T00:00:00.000Z`);
  }
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (
    zone !== "Z" &&
    (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)
  ) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeComplianceEventInstant(value) {
  const text = cleanString(value, 40);
  if (!text || ISO_DATE_ONLY.test(text)) return null;
  return dateFrom(text)?.toISOString() || null;
}

function holidayDateFrom(value) {
  if (value instanceof Date) return dateFrom(value);
  const text = cleanString(value, 40);
  return ISO_DATE_ONLY.test(text) ? dateFrom(text) : null;
}

function normalizeHolidayDates(holidayDates) {
  if (!Array.isArray(holidayDates)) return null;
  const dates = holidayDates.map(holidayDateFrom);
  return dates.some((date) => !date)
    ? null
    : new Set(dates.map(utcDateKey));
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
  const holidays =
    dayType === "business" ? normalizeHolidayDates(holidayDates) : new Set();
  if (!holidays) return null;
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
  const holidayDates = Object.prototype.hasOwnProperty.call(
    input,
    "holidayDates",
  )
    ? input.holidayDates
    : [];
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
    isRecord(input.facts) ? input.facts : {};
  const rawFacts = {
    ...snapshot.facts,
    ...inputFacts,
  };
  const facts = Object.freeze({
    ...rawFacts,
    ...normalizeComplianceFacts(rawFacts),
  });
  const events =
    isRecord(input.events) ? input.events : {};
  const holidayDates = Object.prototype.hasOwnProperty.call(
    input,
    "holidayDates",
  )
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
  return cloneAndFreeze({
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
    requirements: snapshot.requirements,
    exceptions: snapshot.exceptions,
    facts,
    overlays: overlayEvaluations,
    localityKeys: snapshot.localityKeys,
    localCoverage: snapshot.localCoverage,
    missingFacts: Object.freeze(missingFacts),
    unresolvedOverlays: snapshot.unresolvedOverlays,
    generatedAt: new Date().toISOString(),
  });
}
