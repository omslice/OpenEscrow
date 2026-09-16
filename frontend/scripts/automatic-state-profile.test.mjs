import assert from "node:assert/strict";
import test from "node:test";
import { US_JURISDICTION_PROFILES } from "../shared/us-jurisdiction-profiles.js";
import { generateVerifiedStateProfile, fetchRegisteredDocument } from "../server/state-source-updater.js";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";
import { validateStateExtraction, preserveSourceWording, buildAutomaticStateProfile, automaticStateVersion, digestText } from "../shared/automatic-state-profile.js";

// Synthetic evidence tests the transport/validation path for every jurisdiction;
// it is deliberately not a claim that these are any state's actual laws.
const sourceText = "Synthetic test source: a deposit may not exceed one month's rent. The landlord must return and itemize the deposit within thirty days after tenancy termination. The tenant may object within seven days after receiving the accounting.";
function extraction() {
  return {
    ready: true, effectiveNow: true, reason: "Synthetic test only",
    requirements: [{ text: "Return the balance and itemize deductions within 30 days after termination.", citation: "Synthetic test § 1", quote: "The landlord must return and itemize the deposit within thirty days after tenancy termination." }],
    depositCap: { kind: "months-rent", months: 1, summary: "One month's rent.", citation: "Synthetic test § 1", quote: "a deposit may not exceed one month's rent." },
    deadlines: [{ id: "return-accounting", label: "Return and itemize", days: 30, trigger: "tenancyTerminatedAt", triggerDescription: "tenancy termination", dayType: "calendar", statutory: true, condition: null, comparison: null, citation: "Synthetic test § 1", quote: "The landlord must return and itemize the deposit within thirty days after tenancy termination." }],
    claimDeadlineIds: ["return-accounting"], defaultClaimDays: 30, statutoryDeadlineDays: 30, deadlineSummary: "Return and itemize within 30 days after termination.",
    exceptions: [], stateAttestations: [],
  };
}

test("externally archived sources use Workers-supported fetch options and reject redirects", async () => {
  const item = COMPLIANCE_SOURCE_REGISTRY.find((source) => source.key === "state:oh");
  const now = new Date("2026-09-16T20:00:00Z");
  const body = item.externalMonitor.requiredMarkers.join("\n");
  const bodySha256 = await digestText(body);
  const payload = { schemaVersion: 1, sourceKey: item.key, profileVersion: item.version,
    sourceUrl: item.url, finalUrl: item.url, checkedAt: now.toISOString(), httpStatus: 200,
    contentType: "text/html", bodySha256, status: "changed",
    markerChecks: item.externalMonitor.requiredMarkers.map((marker) => ({ marker, present: true })) };
  const originalFetch = globalThis.fetch;
  const urls = [];
  let redirect = false;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "manual");
    urls.push(url);
    if (redirect) return new Response(null, { status: 302, headers: { location: "https://unregistered.example/source" } });
    return String(url).endsWith(".json") ? Response.json(payload) : new Response(body);
  };
  try {
    const document = await fetchRegisteredDocument(item, now);
    assert.equal(new TextDecoder().decode(document.bytes), body);
    assert.deepEqual(urls, [item.externalMonitor.url, item.externalMonitor.url.replace(/\.json$/, `-${bodySha256}.source`)]);
    redirect = true;
    await assert.rejects(fetchRegisteredDocument(item, now), /unavailable/);
    assert.equal(urls.length, 3, "An unexpected redirect must not be followed.");
  } finally { globalThis.fetch = originalFetch; }
});

test("all 50 states and D.C. use source extraction, separate verification, and bound versions", async () => {
  assert.equal(US_JURISDICTION_PROFILES.length, 51);
  for (const base of US_JURISDICTION_PROFILES) {
    const calls = [];
    const env = { AI: { run: async (_model, input) => {
      const data = JSON.parse(input.messages.at(-1).content);
      assert.equal(data.jurisdiction, base.code);
      assert.equal(data.sourceUrl, base.statuteUrl);
      assert.equal(data.officialSourceText, sourceText);
      assert.deepEqual(Object.keys(data).sort(), [...["jurisdiction", "state", "citation", "sourceUrl", "asOfDate", "officialSourceText"], ...(data.candidate ? ["candidate"] : ["previousProfile"])].sort());
      calls.push(input);
      return { choices: [{ message: { content: JSON.stringify(data.candidate ? { approved: true, issues: [] } : extraction()) } }] };
    } } };
    const { profile } = await generateVerifiedStateProfile(env, base, sourceText, base, new Date("2026-09-16T20:00:00Z"));
    assert.equal(calls.length, 2, `${base.code} must receive two analysis passes`);
    assert.equal(profile.code, base.code);
    assert.equal(profile.statuteUrl, base.statuteUrl);
    assert.match(profile.version, new RegExp(`^${base.postalCode.toLowerCase()}-auto-v2-`));
    assert.equal(profile.version, await automaticStateVersion(base, profile.sourceUpdate.sourceDigest, profile.sourceUpdate.patch));
    assert.deepEqual(buildAutomaticStateProfile(base, profile.sourceUpdate, sourceText), profile);
  }
});

test("a short tenant objection period does not become the landlord claim period", () => {
  const patch = extraction();
  patch.deadlines.push({ ...patch.deadlines[0], id: "tenant-objection", days: 7, label: "Tenant objection", trigger: "damageListReceivedAt", triggerDescription: "receipt of accounting", quote: "The tenant may object within seven days after receiving the accounting." });
  assert.equal(validateStateExtraction(US_JURISDICTION_PROFILES[0], patch, sourceText).defaultClaimDays, 30);
  patch.defaultClaimDays = 7;
  assert.throws(() => validateStateExtraction(US_JURISDICTION_PROFILES[0], patch, sourceText), /timing does not match/);
});

test("unsupported quotes, invented event clocks, and failed verification cannot publish a version", async () => {
  const base = US_JURISDICTION_PROFILES[0];
  const badQuote = extraction();
  badQuote.requirements[0].quote = "This sentence does not appear in the source.";
  assert.throws(() => validateStateExtraction(base, badQuote, sourceText));
  const badClock = extraction();
  badClock.deadlines[0].trigger = "inventedDate";
  assert.throws(() => validateStateExtraction(base, badClock, sourceText));
  const env = { AI: { run: async (_model, input) => ({ response: JSON.stringify(JSON.parse(input.messages.at(-1).content).candidate ? { approved: false, issues: ["A material exception was omitted."] } : extraction()) }) } };
  await assert.rejects(generateVerifiedStateProfile(env, base, sourceText, base, new Date()), /material exception was omitted/);
});

test("damages qualifiers and composite return clocks cannot be lost in a paraphrase", () => {
  const base = US_JURISDICTION_PROFILES[0];
  const patch = extraction();
  patch.requirements[0] = { text: "The landlord owes double damages.", citation: "Synthetic § 2", quote: "Twice the amount wrongfully withheld." };
  assert.throws(() => validateStateExtraction(base, patch), /controlling qualifier/);
  const preserved = preserveSourceWording(patch);
  assert.equal(preserved.requirements[0].text, patch.requirements[0].quote);
  assert.ok(validateStateExtraction(base, preserved));
  assert.throws(() => validateStateExtraction(base, preserved, sourceText), /complete/);
  const composite = extraction();
  composite.deadlines[0].quote = "within thirty days after termination of the rental agreement and delivery of possession";
  composite.deadlines[0].trigger = "possessionReturnedAt";
  assert.throws(() => validateStateExtraction(base, composite), /both termination and possession/);
  composite.deadlines[0].trigger = "statutoryClockStartedAt";
  composite.deadlines[0].triggerDescription = "termination of the rental agreement and delivery of possession";
  assert.ok(validateStateExtraction(base, composite));
});
