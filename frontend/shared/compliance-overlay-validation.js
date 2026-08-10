const OVERLAY_FIELDS = new Set([
  "id",
  "scope",
  "label",
  "version",
  "localityKeys",
  "condition",
  "sources",
  "requirements",
  "deadlines",
  "privacyNote",
]);

const SOURCE_FIELDS = new Set(["citation", "url"]);
const DEADLINE_FIELDS = new Set([
  "id",
  "label",
  "days",
  "trigger",
  "triggerDescription",
  "dayType",
  "statutory",
  "condition",
  "comparison",
]);
const DEADLINE_CONDITION_FIELDS = new Set(["fact", "equals", "oneOf"]);
const DEADLINE_DAY_TYPES = new Set(["calendar", "business"]);
const DEADLINE_COMPARISONS = new Set([null, "earlier-of", "later-of"]);

function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value, maximum = 1000) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function exactFields(value, expected, path, errors) {
  if (!record(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  const fields = Object.keys(value);
  const unknown = fields.filter((field) => !expected.has(field));
  const missing = [...expected].filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (unknown.length) {
    errors.push(`${path} has unsupported field(s): ${unknown.join(", ")}.`);
  }
  if (missing.length) {
    errors.push(`${path} is missing field(s): ${missing.join(", ")}.`);
  }
  return true;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function complianceScalar(value) {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function validateDeadlineCondition(condition, path, errors) {
  if (condition === null) return;
  if (!record(condition)) {
    errors.push(`${path} must be null or a condition object.`);
    return;
  }
  const fields = Object.keys(condition);
  if (
    fields.some((field) => !DEADLINE_CONDITION_FIELDS.has(field)) ||
    !cleanString(condition.fact, 80)
  ) {
    errors.push(`${path} has an invalid shape.`);
    return;
  }
  const hasEquals = Object.prototype.hasOwnProperty.call(condition, "equals");
  const hasOneOf = Object.prototype.hasOwnProperty.call(condition, "oneOf");
  if (hasEquals === hasOneOf) {
    errors.push(`${path} must use exactly one of equals or oneOf.`);
    return;
  }
  if (hasEquals && !complianceScalar(condition.equals)) {
    errors.push(`${path}.equals must be a scalar value.`);
  }
  if (
    hasOneOf &&
    (!Array.isArray(condition.oneOf) ||
      condition.oneOf.length === 0 ||
      condition.oneOf.length > 100 ||
      !condition.oneOf.every(complianceScalar))
  ) {
    errors.push(`${path}.oneOf must be a nonempty scalar list.`);
  }
}

function validateDeadline(deadline, path, errors) {
  if (!exactFields(deadline, DEADLINE_FIELDS, path, errors)) return;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deadline.id || "")) {
    errors.push(`${path}.id must be a stable lowercase identifier.`);
  }
  if (!cleanString(deadline.label, 200)) {
    errors.push(`${path}.label is required.`);
  }
  if (!Number.isInteger(deadline.days) || deadline.days < 0 || deadline.days > 730) {
    errors.push(`${path}.days must be an integer from 0 through 730.`);
  }
  if (!/^[a-z][a-zA-Z0-9]{1,79}At$/.test(deadline.trigger || "")) {
    errors.push(`${path}.trigger must name a bounded event timestamp field.`);
  }
  if (!cleanString(deadline.triggerDescription, 300)) {
    errors.push(`${path}.triggerDescription is required.`);
  }
  if (!DEADLINE_DAY_TYPES.has(deadline.dayType)) {
    errors.push(`${path}.dayType must be calendar or business.`);
  }
  if (typeof deadline.statutory !== "boolean") {
    errors.push(`${path}.statutory must be boolean.`);
  }
  if (!DEADLINE_COMPARISONS.has(deadline.comparison)) {
    errors.push(`${path}.comparison is unsupported.`);
  }
  validateDeadlineCondition(deadline.condition, `${path}.condition`, errors);
}

function validateSource(source, path, errors) {
  if (!exactFields(source, SOURCE_FIELDS, path, errors)) return;
  if (!cleanString(source.citation, 500)) {
    errors.push(`${path}.citation is required.`);
  }
  if (!cleanString(source.url, 2000) || !validHttpsUrl(source.url)) {
    errors.push(`${path}.url must be an HTTPS official-source URL.`);
  }
}

function validateUniqueStrings(values, path, maximum, errors) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > maximum ||
    !values.every((value) => cleanString(value, 4000))
  ) {
    errors.push(`${path} must be a bounded nonempty string list.`);
    return false;
  }
  if (new Set(values).size !== values.length) {
    errors.push(`${path} must not contain duplicates.`);
    return false;
  }
  return true;
}

function validateOverlay(overlay, index, errors) {
  const path = `local overlay[${index}]`;
  if (!exactFields(overlay, OVERLAY_FIELDS, path, errors)) return;
  if (!/^local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(overlay.id || "")) {
    errors.push(`${path}.id must begin with local- and be a stable identifier.`);
  }
  if (!new Set(["city", "county"]).has(overlay.scope)) {
    errors.push(`${path}.scope must be city or county.`);
  }
  if (!cleanString(overlay.label, 300)) {
    errors.push(`${path}.label is required.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,199}$/.test(overlay.version || "")) {
    errors.push(`${path}.version must be a stable version identifier.`);
  }
  if (validateUniqueStrings(overlay.localityKeys, `${path}.localityKeys`, 100, errors)) {
    const keyPattern = new RegExp(
      `^us:[a-z]{2}:${overlay.scope}:[a-z0-9]+(?:-[a-z0-9]+)*$`,
    );
    if (!overlay.localityKeys.every((key) => keyPattern.test(key))) {
      errors.push(`${path}.localityKeys must match the declared scope.`);
    }
  }
  if (overlay.condition !== null) {
    errors.push(
      `${path}.condition must remain null until local-condition resolution is implemented.`,
    );
  }
  if (!Array.isArray(overlay.sources) || overlay.sources.length === 0 || overlay.sources.length > 20) {
    errors.push(`${path}.sources must contain 1 through 20 official sources.`);
  } else {
    overlay.sources.forEach((source, sourceIndex) =>
      validateSource(source, `${path}.sources[${sourceIndex}]`, errors),
    );
    const sourceKeys = overlay.sources.map(
      (source) => `${source?.citation || ""}\n${source?.url || ""}`,
    );
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      errors.push(`${path}.sources must not contain duplicates.`);
    }
  }
  validateUniqueStrings(overlay.requirements, `${path}.requirements`, 200, errors);
  if (!Array.isArray(overlay.deadlines) || overlay.deadlines.length > 100) {
    errors.push(`${path}.deadlines must be a bounded list.`);
  } else {
    overlay.deadlines.forEach((deadline, deadlineIndex) =>
      validateDeadline(deadline, `${path}.deadlines[${deadlineIndex}]`, errors),
    );
    const deadlineIds = overlay.deadlines.map((deadline) => deadline?.id);
    if (new Set(deadlineIds).size !== deadlineIds.length) {
      errors.push(`${path}.deadlines must use unique IDs.`);
    }
  }
  if (overlay.privacyNote !== null && !cleanString(overlay.privacyNote, 2000)) {
    errors.push(`${path}.privacyNote must be null or a bounded string.`);
  }
}

export function validateLocalComplianceOverlayCatalog(value) {
  const errors = [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    return Object.freeze([
      "The local compliance overlay catalog must be a bounded nonempty list.",
    ]);
  }
  value.forEach((overlay, index) => validateOverlay(overlay, index, errors));
  const overlayIds = value.map((overlay) => overlay?.id);
  if (new Set(overlayIds).size !== overlayIds.length) {
    errors.push("Local compliance overlay IDs must be unique.");
  }
  return Object.freeze(errors);
}

export function assertValidLocalComplianceOverlayCatalog(value) {
  const errors = validateLocalComplianceOverlayCatalog(value);
  if (errors.length) {
    throw new Error(`Invalid local compliance overlay catalog: ${errors.join(" ")}`);
  }
  return value;
}
