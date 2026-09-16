import { buildClaimPolicy } from "./claim-policies.js";
import { US_JURISDICTION_PROFILES } from "./us-jurisdiction-profiles.js";
import { DEFAULT_COMPLIANCE_FACTS } from "./us-compliance-overlays.js";
import { DYNAMIC_COMPLIANCE_FACTS } from "./us-compliance-facts.js";

export const STATE_SOURCE_ADAPTER = "us-official-source-ai.v1";
export const STATE_SOURCE_MODEL = "@cf/openai/gpt-oss-120b";
export const STATE_REVIEW_MODEL = "@cf/openai/gpt-oss-120b";
export const SUPPORTED_DEADLINE_TRIGGERS = [...new Set(US_JURISDICTION_PROFILES.flatMap((profile) => profile.deadlines.map((rule) => rule.trigger)))];
export const SUPPORTED_CONDITION_FACTS = [...new Set([...Object.keys(DEFAULT_COMPLIANCE_FACTS), ...Object.keys(DYNAMIC_COMPLIANCE_FACTS)])];

const string = { type: "string" };
const quoteProperties = { citation: string, quote: string };
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const citedText = object({ text: string, ...quoteProperties });
const array = (items) => ({ type: "array", items });
export const STATE_EXTRACTION_SCHEMA = object({
  ready: { type: "boolean" }, reason: string, effectiveNow: { type: "boolean" },
  requirements: array(citedText),
  depositCap: object({ kind: { type: "string", enum: ["months-rent", "manual"] }, months: { type: ["number", "null"] }, summary: string, ...quoteProperties }),
  deadlines: array(object({
    id: string, label: string, days: { type: "integer" }, trigger: { type: "string", enum: SUPPORTED_DEADLINE_TRIGGERS },
    triggerDescription: string, dayType: { type: "string", enum: ["calendar", "business"] }, statutory: { type: "boolean" },
    condition: { anyOf: [{ type: "null" }, object({ fact: { type: "string", enum: SUPPORTED_CONDITION_FACTS }, equals: { type: ["string", "boolean", "number", "null"] } })] },
    comparison: { type: ["string", "null"], enum: ["earlier-of", "later-of", null] }, ...quoteProperties,
  })),
  claimDeadlineIds: array(string), defaultClaimDays: { type: "integer" }, statutoryDeadlineDays: { type: ["integer", "null"] }, deadlineSummary: string,
  exceptions: array(citedText),
  stateAttestations: array(object({ id: string, label: string, appliesToCategoryIds: array({ type: "string", enum: ["10", "11", "12", "13"] }), ...quoteProperties })),
});
export const STATE_REVIEW_SCHEMA = object({ approved: { type: "boolean" }, issues: array(string) });

export function normalizedSourceText(value) { return String(value).normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
export async function digestText(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function isAutomaticStateVersion(value) { return typeof value === "string" && /^(?:az-auto-v1|[a-z]{2}-auto-v2)-[a-f0-9]{24}$/.test(value); }
export async function automaticStateVersion(base, sourceDigest, patch) {
  return `${base.postalCode.toLowerCase()}-auto-v2-${(await digestText(JSON.stringify([STATE_SOURCE_ADAPTER, base.version, sourceDigest, patch]))).slice(0, 24)}`;
}

function text(value, maximum = 1800) { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function integer(value) { return Number.isInteger(value) && value >= 1 && value <= 365; }
function validQuote(item, sourceText) {
  return text(item?.citation, 300) && text(item?.quote, 4000) && (!sourceText || normalizedSourceText(sourceText).includes(normalizedSourceText(item.quote)));
}
function citedTexts(value, sourceText, minimum = 0) {
  return Array.isArray(value) && value.length >= minimum && value.length <= 80 && value.every((item) => text(item?.text) && validQuote(item, sourceText));
}

function preservesCriticalQualifiers(item) {
  const quote = normalizedSourceText(item.quote).toLowerCase();
  const summary = normalizedSourceText(item.text || item.label || item.summary).toLowerCase();
  // These qualifiers change the scope of an exception or the damages base.
  // Requiring the words themselves avoids accepting a broader paraphrase.
  return ["material and irreparable", "reasonable cause", "wrongfully withheld"].every((phrase) => !quote.includes(phrase) || summary.includes(phrase));
}

export function preserveSourceWording(patch) {
  // The checklist uses actual source wording so paraphrasing cannot broaden a
  // duty, interest calculation, or exception. Verification still checks whether
  // the selected passages are complete and support the structured rules.
  const preserve = (item) => item && typeof item.quote === "string"
    ? { ...item, text: item.quote } : item;
  return { ...patch,
    requirements: Array.isArray(patch?.requirements) ? patch.requirements.map(preserve) : patch?.requirements,
    exceptions: Array.isArray(patch?.exceptions) ? patch.exceptions.map(preserve) : patch?.exceptions,
  };
}

export function validateStateExtraction(base, patch, sourceText = null) {
  if (!base || !patch || patch.ready !== true || patch.effectiveNow !== true || !citedTexts(patch.requirements, sourceText, 1) ||
      !citedTexts(patch.exceptions, sourceText) || !integer(patch.defaultClaimDays) ||
      !(patch.statutoryDeadlineDays === null || integer(patch.statutoryDeadlineDays)) || !text(patch.deadlineSummary)) {
    throw new Error("The official source did not yield complete, currently effective requirements.");
  }
  const cap = patch.depositCap;
  if (![...patch.requirements, ...patch.exceptions, ...(patch.stateAttestations || [])].every(preservesCriticalQualifiers)) {
    throw new Error("A summary dropped a controlling qualifier from its source quote. Preserve 'material and irreparable', 'reasonable cause', and 'wrongfully withheld' wherever they apply.");
  }
  if (!validQuote(cap, sourceText) || !text(cap.summary) || !((cap.kind === "manual" && cap.months === null) ||
      (cap.kind === "months-rent" && Number.isFinite(cap.months) && cap.months > 0 && cap.months <= 12))) {
    throw new Error("The deposit cap could not be verified against the official source.");
  }
  if (!Array.isArray(patch.deadlines) || patch.deadlines.length < 1 || patch.deadlines.length > 32 ||
      new Set(patch.deadlines.map((item) => item.id)).size !== patch.deadlines.length ||
      !patch.deadlines.every((rule) => text(rule.id, 100) && /^[a-z0-9-]+$/.test(rule.id) && text(rule.label, 500) && integer(rule.days) &&
        SUPPORTED_DEADLINE_TRIGGERS.includes(rule.trigger) && text(rule.triggerDescription, 500) && ["calendar", "business"].includes(rule.dayType) &&
        typeof rule.statutory === "boolean" && [null, "earlier-of", "later-of"].includes(rule.comparison) &&
        (rule.condition === null || (SUPPORTED_CONDITION_FACTS.includes(rule.condition?.fact) && Object.hasOwn(rule.condition, "equals") &&
          ["string", "boolean", "number"].includes(typeof rule.condition.equals))) &&
        (rule.statutory ? validQuote(rule, sourceText) : base.deadlines.some((prior) => !prior.statutory && prior.days === rule.days && prior.trigger === rule.trigger)))) {
    throw new Error("The deadline paths could not be represented and verified without guessing.");
  }
  if (!Array.isArray(patch.claimDeadlineIds) || new Set(patch.claimDeadlineIds).size !== patch.claimDeadlineIds.length ||
      patch.claimDeadlineIds.some((id) => !patch.deadlines.some((rule) => rule.id === id && rule.statutory))) {
    throw new Error("The landlord return/accounting paths were not identified.");
  }
  const legalDeadlines = patch.deadlines.filter((rule) => patch.claimDeadlineIds.includes(rule.id));
  if (legalDeadlines.some((rule) => /after\s+(?:the\s+)?termination[^.]{0,160}\band\b[^.]{0,80}\bpossession/i.test(rule.quote) &&
      (rule.trigger !== "statutoryClockStartedAt" || !/terminat/i.test(rule.triggerDescription) || !/possession/i.test(rule.triggerDescription) ||
        (/demand/i.test(rule.quote) && !/demand/i.test(rule.triggerDescription))))) {
    throw new Error("The quoted return deadline requires both termination and possession. Use statutoryClockStartedAt with every prerequisite stated explicitly instead of starting the clock from possession alone.");
  }
  if (legalDeadlines.length ? patch.defaultClaimDays !== Math.min(...legalDeadlines.map((rule) => rule.days)) || patch.statutoryDeadlineDays !== patch.defaultClaimDays
    : patch.statutoryDeadlineDays !== null || patch.defaultClaimDays !== Number(base.defaultClaimDays)) {
    throw new Error("The proposal timing does not match the extracted deadline paths.");
  }
  if (!Array.isArray(patch.stateAttestations) || patch.stateAttestations.length > 32 ||
      new Set(patch.stateAttestations.map((item) => item.id)).size !== patch.stateAttestations.length ||
      !patch.stateAttestations.every((item) => text(item.id, 100) && /^[a-z0-9-]+$/.test(item.id) && text(item.label) && validQuote(item, sourceText) &&
        Array.isArray(item.appliesToCategoryIds) && item.appliesToCategoryIds.length > 0 && item.appliesToCategoryIds.every((id) => ["10", "11", "12", "13"].includes(id)))) {
    throw new Error("The deduction checklist could not be verified against the source.");
  }
  return patch;
}

export function operativeStateProfile(profile) {
  return JSON.stringify({
    defaultClaimDays: profile.defaultClaimDays, statutoryDeadlineDays: profile.statutoryDeadlineDays,
    depositCap: profile.depositCap, deadlines: profile.deadlines, deadlineSummary: profile.deadlineSummary,
    requirements: profile.requirements, exceptions: profile.exceptions,
    stateAttestations: profile.claimPolicy.stateAttestations,
  });
}

export function buildAutomaticStateProfile(base, update, sourceText = null) {
  if (update?.adapter !== STATE_SOURCE_ADAPTER || update.baseVersion !== base?.version ||
      !/^[a-f0-9]{64}$/.test(update.sourceDigest) || !isAutomaticStateVersion(update.profileVersion) ||
      !update.profileVersion.startsWith(`${base.postalCode.toLowerCase()}-auto-v2-`) ||
      update.sourceUrl !== base.statuteUrl || update.model !== STATE_SOURCE_MODEL || update.reviewer !== STATE_REVIEW_MODEL ||
      !/^\d{4}-\d\d-\d\dT/.test(update.generatedAt) || !Number.isFinite(Date.parse(update.generatedAt))) {
    throw new Error("Invalid automatically generated state profile.");
  }
  const patch = validateStateExtraction(base, update.patch, sourceText);
  const requirements = patch.requirements.map((item) => `${item.citation}: ${item.text}`);
  const claimPolicy = buildClaimPolicy(base.postalCode, requirements, { citation: base.statuteCitation, url: base.statuteUrl });
  return {
    ...base, version: update.profileVersion, researchedOn: update.generatedAt.slice(0, 10),
    reviewMethod: "Automatically rewritten from the official source with quoted evidence and a second AI verification pass; not attorney-reviewed",
    defaultClaimDays: String(patch.defaultClaimDays), statutoryDeadlineDays: patch.statutoryDeadlineDays,
    depositCapSummary: patch.depositCap.summary,
    depositCap: { kind: patch.depositCap.kind, months: patch.depositCap.months, summary: patch.depositCap.summary },
    deadlineSummary: patch.deadlineSummary,
    deadlines: patch.deadlines.map(({ citation: _citation, quote: _quote, ...rule }) => rule),
    requirements, exceptions: [...base.exceptions, ...patch.exceptions.map((item) => `${item.citation}: ${item.text}`)],
    claimPolicy: { ...claimPolicy, version: `${update.profileVersion}-claims`, stateAttestations: patch.stateAttestations.map(({ citation: _citation, quote: _quote, ...item }) => ({ ...item, basis: "state-source" })) },
    sourceUpdate: update,
  };
}

export function stateRequirementChanges(before, after) {
  const changes = [];
  if (JSON.stringify(before.depositCap) !== JSON.stringify(after.depositCap)) changes.push(`Deposit cap: ${before.depositCap.summary} → ${after.depositCap.summary}`);
  if (JSON.stringify(before.deadlines) !== JSON.stringify(after.deadlines)) changes.push(`Deadline paths: ${before.deadlineSummary} → ${after.deadlineSummary}`);
  const removed = before.requirements.filter((item) => !after.requirements.includes(item));
  const added = after.requirements.filter((item) => !before.requirements.includes(item));
  if (added.length || removed.length) changes.push(`Checklist rewritten with ${added.length} new or revised requirement${added.length === 1 ? "" : "s"}; ${removed.length} earlier wording item${removed.length === 1 ? "" : "s"} replaced. Compare the saved versions below. A rewrite does not by itself mean the law changed.`);
  if (JSON.stringify(before.exceptions) !== JSON.stringify(after.exceptions)) changes.push("Coverage and exception notes updated from the official source.");
  if (!changes.length) changes.push("No changes to the applied requirements. The current official source text has been retained.");
  return changes;
}
