import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { US_JURISDICTION_PROFILE_BY_CODE } from "../shared/us-jurisdiction-profiles.js";
import { ARIZONA_SOURCE_ADAPTER, extractArizonaSource, parseArizonaRequirements, arizonaSourceDigest, buildAutomaticArizonaProfile, arizonaRequirementChanges } from "../shared/arizona-compliance.js";

const html = readFileSync(new URL("../server/fixtures/arizona-33-1321.html", import.meta.url), "utf8");
const base = US_JURISDICTION_PROFILE_BY_CODE["us-az"];
async function compile(value) {
  const sourceText = extractArizonaSource(value);
  return buildAutomaticArizonaProfile(base, {
    adapter: ARIZONA_SOURCE_ADAPTER, baseVersion: base.version, sourceText,
    sourceDigest: await arizonaSourceDigest(sourceText, base.version), generatedAt: "2026-09-16T20:00:00.000Z",
  });
}

test("Arizona updater reads the complete official statute, ignoring page metadata", async () => {
  const current = await compile(html);
  assert.deepEqual(parseArizonaRequirements(current.sourceUpdate.sourceText), { capMonths: 1.5, returnDays: 14, disputeDays: 60 });
  const cosmetic = await compile(html.replace("09/09/26", "12/30/28").replaceAll("<p>", '<p class="new-design">').replaceAll(" ", "&nbsp;"));
  assert.equal(cosmetic.version, current.version);
  assert.equal(current.requirements.length, 8);
  assert.ok(current.requirements.every((line) => line.startsWith("§ 33-1321")));
});

test("supported numeric amendments change enforced limits, deadlines, checklist, and version", async () => {
  const before = await compile(html);
  const after = await compile(html.replaceAll("one and one-half", "two").replace("Within fourteen", "Within twenty-one").replace("tenant within sixty", "tenant within ninety"));
  assert.notEqual(after.version, before.version);
  assert.equal(after.depositCap.months, 2);
  assert.equal(after.defaultClaimDays, "21");
  assert.equal(after.deadlines[0].days, 21);
  assert.equal(after.deadlines[0].dayType, "business");
  assert.match(after.requirements[5], /90 days/);
  assert.equal(arizonaRequirementChanges(before, after).length, 3);
  assert.equal(before.defaultClaimDays, "14");
  assert.equal(before.depositCap.months, 1.5);
});

test("unknown clauses, negations, truncated pages, mismatched limits, and out-of-range numbers are not auto-published", async () => {
  for (const changed of [
    html.replace("shall not demand", "shall demand"),
    html.replace("</BODY>", "<p>I. New legal condition.</p></BODY>"),
    html.replace("delivery of possession and demand", "delivery of possession or demand"),
    html.replace("Within fourteen", "Within zero"),
    html.replace("Within fourteen", "Within ninety-nine"),
    html.replace("one and one-half", "two"),
    html.replace("</BODY>", ""),
  ]) await assert.rejects(compile(changed));
});
