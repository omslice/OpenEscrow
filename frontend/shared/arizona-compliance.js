import { buildClaimPolicy } from "./claim-policies.js";

export const ARIZONA_SOURCE_ADAPTER = "arizona-33-1321.v1";
export const ARIZONA_SOURCE_URL = "https://www.azleg.gov/ars/33/01321.htm";

// Complete text reviewed against the official source on 2026-09-16. Numeric
// substitutions are supported below; any other substantive edit needs a new
// adapter. Never infer the meaning of an unknown clause or accept a partial page.
const REVIEWED_TEXT = `33-1321. Security deposits
A. A landlord shall not demand or receive security, however denominated, including prepaid rent in an amount or value of more than one and one-half month's rent. This subsection does not prohibit a tenant from voluntarily paying more than one and one-half month's rent in advance.
B. The purpose of all nonrefundable fees or deposits shall be stated in writing by the landlord. Any fee or deposit not designated as nonrefundable is refundable.
C. On move in, a landlord shall furnish the tenant with a signed copy of the lease, a move-in form for specifying any existing damages to the dwelling unit and written notification to the tenant that the tenant may be present at the move-out inspection. On request by the tenant, the landlord shall notify the tenant when the landlord's move-out inspection will occur. If the tenant is being evicted for a material and irreparable breach and the landlord has reasonable cause to fear violence or intimidation on the part of the tenant, the landlord has no obligation to conduct a joint move-out inspection with the tenant.
D. On termination of the tenancy, property or money held by the landlord as prepaid rent and security may be applied to the payment of all rent, and subject to a landlord's duty to mitigate, all charges as specified in the signed lease agreement, or as provided in this chapter, including the amount of damages which the landlord has suffered by reason of the tenant's noncompliance with section 33-1341. Within fourteen days, excluding Saturdays, Sundays or other legal holidays, after termination of the tenancy and delivery of possession and demand by the tenant the landlord shall provide the tenant an itemized list of all deductions together with the amount due and payable to the tenant, if any. Unless other arrangements are made in writing by the tenant, the landlord shall mail the itemized list and any amount due, by first class mail, to the tenant's last known place of residence. If the tenant does not dispute the deductions or the amount due and payable to the tenant within sixty days after the itemized list and amount due are mailed as prescribed by this subsection, the amount due to the tenant as set forth in the itemized list with any amount due is deemed valid and final and any further claims of the tenant are waived.
E. If the landlord fails to comply with subsection D of this section, the tenant may recover the property and money due the tenant together with damages in an amount equal to twice the amount wrongfully withheld.
F. This section does not preclude the landlord or tenant from recovering other damages to which the landlord or tenant may be entitled under this chapter.
G. During the term of tenancy the landlord may use refundable security deposits or other refundable deposits in accordance with any applicable provisions of the property management agreement. At the end of tenancy, all refundable deposits shall be refunded to the tenant pursuant to this section.
H. The holder of the landlord's interest in the premises at the time of the termination of the tenancy is bound by this section.`;

export function normalizeArizonaText(value) {
  return String(value).normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

export function extractArizonaSource(html) {
  if (typeof html !== "string" || html.length > 131072) throw new Error("Arizona source is incomplete or too large.");
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1];
  if (!body) throw new Error("Arizona source did not contain a complete statute page.");
  const text = body.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
      const named = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const numeric = entity.slice(2, -1);
      const code = numeric[0].toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : Number(numeric);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    });
  // Inline tags around the section number must not affect the fingerprint.
  return normalizeArizonaText(text).replace(/^33-1321\s+\./, "33-1321.");
}

function numberValue(text) {
  const value = text.toLowerCase().trim();
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  if (/^\d+(?:\.5)?$/.test(value)) return Number(value);
  if (value.endsWith(" and one-half")) return (words[value.slice(0, -13)] || NaN) + 0.5;
  if (words[value]) return words[value];
  const parts = value.split(/[- ]/);
  if (parts.length === 2 && words[parts[0]] >= 20 && words[parts[1]] < 10) return words[parts[0]] + words[parts[1]];
  return NaN;
}

function parameters(text) {
  const normalized = normalizeArizonaText(text);
  const caps = [...normalized.matchAll(/more than ([a-z\d. -]+?) month's rent/g)].map((match) => numberValue(match[1]));
  const returnDays = numberValue(normalized.match(/Within ([a-z\d -]+?) days, excluding/)?.[1] || "");
  const disputeDays = numberValue(normalized.match(/tenant within ([a-z\d -]+?) days after the itemized/)?.[1] || "");
  const template = normalized
    .replace(/more than ([a-z\d. -]+?) month's rent/g, "more than {cap} month's rent")
    .replace(/Within ([a-z\d -]+?) days, excluding/, "Within {return} days, excluding")
    .replace(/tenant within ([a-z\d -]+?) days after the itemized/, "tenant within {dispute} days after the itemized");
  return { caps, returnDays, disputeDays, template };
}

export function parseArizonaRequirements(sourceText) {
  const parsed = parameters(sourceText);
  if (parsed.template !== parameters(REVIEWED_TEXT).template || parsed.caps.length !== 2 ||
      parsed.caps[0] !== parsed.caps[1] || !(parsed.caps[0] > 0 && parsed.caps[0] <= 12) ||
      !Number.isInteger(parsed.returnDays) || parsed.returnDays < 1 || parsed.returnDays > 90 ||
      !Number.isInteger(parsed.disputeDays) || parsed.disputeDays < 1 || parsed.disputeDays > 90) {
    throw new Error("Arizona's source text includes wording this updater cannot interpret. The source was saved for comparison; the prior requirements were not replaced.");
  }
  return { capMonths: parsed.caps[0], returnDays: parsed.returnDays, disputeDays: parsed.disputeDays };
}

export async function arizonaSourceDigest(sourceText, baseVersion) {
  const bytes = new TextEncoder().encode(`${ARIZONA_SOURCE_ADAPTER}\n${baseVersion}\n${normalizeArizonaText(sourceText)}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildAutomaticArizonaProfile(base, update) {
  if (base?.code !== "us-az" || base.statuteUrl !== ARIZONA_SOURCE_URL ||
      update?.adapter !== ARIZONA_SOURCE_ADAPTER || update.baseVersion !== base.version ||
      !/^[a-f0-9]{64}$/.test(update.sourceDigest) || typeof update.sourceText !== "string" ||
      update.sourceText.length > 131072 || !/^\d{4}-\d\d-\d\dT/.test(update.generatedAt) ||
      !Number.isFinite(Date.parse(update.generatedAt))) throw new Error("Invalid automatic Arizona profile.");
  const { capMonths, returnDays, disputeDays } = parseArizonaRequirements(update.sourceText);
  const requirements = [
    `§ 33-1321(A): Do not demand or receive security, including prepaid rent, above ${capMonths} months' rent. A tenant may voluntarily pay more in advance.`,
    "§ 33-1321(B): State the purpose of every nonrefundable fee or deposit in writing. A fee or deposit not designated nonrefundable is refundable.",
    "§ 33-1321(C): At move-in, provide a signed lease, a form to record existing damage, and written notice of the tenant's right to attend the move-out inspection. Tell the tenant the inspection time when requested. The joint-inspection exception requires eviction for a material and irreparable breach plus reasonable fear of violence or intimidation.",
    `§ 33-1321(D): Within ${returnDays} days excluding Saturdays, Sundays, and legal holidays, after tenancy termination, delivery of possession, and tenant demand, provide itemized deductions and the balance due.`,
    "§ 33-1321(D): Apply security or prepaid rent only to permitted rent, lease or statutory charges, and damage from tenant noncompliance, subject to the landlord's duty to mitigate. Mail the itemization and balance by first-class mail to the last known residence unless the tenant arranges otherwise in writing.",
    `§ 33-1321(D): The tenant has ${disputeDays} days after mailing to dispute the deductions or balance; otherwise the stated balance becomes final and further claims are waived under this subsection.`,
    "§ 33-1321(E)–(F): Failure to comply with subsection D can entitle the tenant to the money due plus twice the amount wrongfully withheld. Other recoverable damages are not excluded.",
    "§ 33-1321(G)–(H): Any use of refundable deposits during the tenancy must follow the applicable property management agreement. Refund them as required at the end of tenancy. The holder of the landlord's interest at termination is bound by this section.",
  ];
  const capSummary = `${capMonths} months' rent, excluding voluntary advance rent.`;
  const version = `az-auto-v1-${update.sourceDigest.slice(0, 24)}`;
  return {
    ...base, version, researchedOn: update.generatedAt.slice(0, 10),
    reviewMethod: "Automatic extraction from the complete official Arizona statute using a versioned rule parser; not attorney-reviewed",
    defaultClaimDays: String(returnDays), statutoryDeadlineDays: returnDays,
    depositCapSummary: capSummary,
    depositCap: { kind: "months-rent", months: capMonths, summary: capSummary },
    deadlineSummary: `${returnDays} days excluding Saturdays, Sundays, and legal holidays, after termination, possession, and tenant demand.`,
    deadlines: base.deadlines.map((rule) => ({ ...rule, days: returnDays })),
    requirements,
    claimPolicy: { ...buildClaimPolicy("AZ", requirements, { citation: base.statuteCitation, url: base.statuteUrl }), version: `${version}-claims` },
    sourceUpdate: { adapter: update.adapter, baseVersion: update.baseVersion, sourceDigest: update.sourceDigest, sourceText: normalizeArizonaText(update.sourceText), generatedAt: update.generatedAt },
  };
}

export function arizonaRequirementChanges(previous, next) {
  const changes = [];
  if (previous.depositCap.months !== next.depositCap.months) changes.push(`Deposit cap: ${previous.depositCap.months} → ${next.depositCap.months} months' rent.`);
  if (previous.statutoryDeadlineDays !== next.statutoryDeadlineDays) changes.push(`Return and itemization period: ${previous.statutoryDeadlineDays} → ${next.statutoryDeadlineDays} days, excluding weekends and legal holidays.`);
  if (!previous.sourceUpdate) changes.push("Checklist regenerated from the complete statute, adding subsection citations, fee disclosures, mailing instructions, the tenant dispute period, remedies, and successor obligations. This is expanded coverage, not evidence of a new law.");
  else {
    const before = parseArizonaRequirements(previous.sourceUpdate.sourceText);
    const after = parseArizonaRequirements(next.sourceUpdate.sourceText);
    if (before.disputeDays !== after.disputeDays) changes.push(`Tenant dispute period after mailing: ${before.disputeDays} → ${after.disputeDays} days.`);
  }
  if (!changes.length) changes.push("No change to the extracted requirements. Formatting and HTTP metadata do not change this version.");
  return changes;
}
