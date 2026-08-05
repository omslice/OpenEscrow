import { assertValidLocalComplianceOverlayCatalog } from "./compliance-overlay-validation.js";

export const COMPLIANCE_FACT_OPTIONS = Object.freeze({
  housingProgram: Object.freeze([
    "unknown",
    "conventional",
    "housing-choice-voucher",
    "emergency-housing-voucher",
    "public-housing",
    "project-based-section-8",
    "section-202",
    "section-811",
    "usda-rural",
    "lihtc",
    "home",
    "housing-trust-fund",
    "other-assisted",
  ]),
  propertyType: Object.freeze([
    "unknown",
    "standard-residential",
    "owner-occupied",
    "mobile-home",
    "seasonal",
    "transient",
    "institutional",
  ]),
  tenancyType: Object.freeze([
    "unknown",
    "fixed-term",
    "month-to-month",
    "at-will",
  ]),
});

export const DEFAULT_COMPLIANCE_FACTS = Object.freeze({
  housingProgram: "unknown",
  propertyType: "unknown",
  tenancyType: "unknown",
  unitCount: null,
  ownerOccupied: "unknown",
  furnished: "unknown",
  assistanceAnimalAccommodation: "unknown",
  scraQualifiedTermination: "unknown",
  writtenRentalAgreement: "unknown",
  leaseExtendsDepositDeadline: "unknown",
  seasonalNonPrimaryOccupancy: "unknown",
});

const source = (citation, url) => Object.freeze({ citation, url });

export const FEDERAL_COMPLIANCE_OVERLAYS = Object.freeze([
  Object.freeze({
    id: "federal-fha-assistance-animal",
    scope: "federal",
    label: "Fair Housing Act assistance-animal accommodation",
    version: "fha-assistance-animal-2026-07-26.v1",
    condition: Object.freeze({
      fact: "assistanceAnimalAccommodation",
      equals: true,
    }),
    sources: Object.freeze([
      source(
        "Fair Housing Act reasonable-accommodation requirements; HUD FHEO-2020-01",
        "https://www.hud.gov/helping-americans/assistance-animals",
      ),
    ]),
    requirements: Object.freeze([
      "Treat a qualifying assistance animal as an accommodation rather than a pet.",
      "Do not charge a pet fee or pet deposit for a qualifying assistance animal.",
      "Use only the disability-related inquiry and documentation process permitted for a non-obvious request.",
      "A tenant can still be responsible for actual damage caused by an assistance animal under otherwise lawful rules.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote:
      "Record only whether the accommodation changes deposit treatment; do not store diagnoses or medical records in the agreement.",
  }),
  Object.freeze({
    id: "federal-scra-lease-termination",
    scope: "federal",
    label: "Servicemembers Civil Relief Act lease termination",
    version: "scra-50-usc-3955-2026-07-26.v1",
    condition: Object.freeze({ fact: "scraQualifiedTermination", equals: true }),
    sources: Object.freeze([
      source(
        "50 U.S.C. § 3955",
        "https://uscode.house.gov/view.xhtml?req=%28title%3A50+section%3A3955+edition%3Aprelim%29",
      ),
    ]),
    requirements: Object.freeze([
      "Preserve the written termination notice, qualifying orders or permitted verification, delivery method, and effective termination date.",
      "Do not impose an early-termination charge or retain a deposit to collect rent accruing after a lawful SCRA termination.",
      "Prorate rent and other lawful obligations through the effective termination date and distinguish actual excess-wear charges.",
      "Apply the state and local deposit accounting deadline from the legally effective termination or surrender event, as applicable.",
    ]),
    deadlines: Object.freeze([
      Object.freeze({
        id: "federal-scra-advance-rent-refund",
        label: "Refund rent paid in advance for the period after SCRA termination",
        days: 30,
        trigger: "scraTerminationEffectiveAt",
        triggerDescription: "the effective date of the qualifying SCRA termination",
        dayType: "calendar",
        statutory: true,
        condition: null,
        comparison: null,
      }),
    ]),
    privacyNote:
      "Store the asserted protection and operative dates, not military orders or service details, in the general agreement record.",
  }),
  Object.freeze({
    id: "federal-vawa-covered-housing",
    scope: "federal",
    label: "VAWA covered-housing operations",
    version: "vawa-hud-2026-07-26.v1",
    condition: Object.freeze({
      fact: "housingProgram",
      oneOf: Object.freeze([
        "housing-choice-voucher",
        "emergency-housing-voucher",
        "public-housing",
        "project-based-section-8",
        "section-202",
        "section-811",
        "usda-rural",
        "lihtc",
        "home",
        "housing-trust-fund",
      ]),
    }),
    sources: Object.freeze([
      source(
        "34 U.S.C. § 12491; 24 C.F.R. part 5, subpart L",
        "https://www.hud.gov/program_offices/fair_housing_equal_opp/vawa",
      ),
    ]),
    requirements: Object.freeze([
      "Provide the HUD notice of occupancy rights and certification form at the program-required times.",
      "Use the covered provider's emergency-transfer plan and lease-bifurcation process when invoked.",
      "Do not treat protected violence or abuse as a basis for a penalty, fee, adverse tenancy action, or prohibited deduction.",
      "Keep all VAWA-related information confidential and outside the ordinary agreement timeline and evidence store.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote:
      "Never record survivor status, allegations, certifications, locations, or emergency-transfer details in OpenEscrow.",
  }),
  Object.freeze({
    id: "federal-hcv-security-deposit",
    scope: "federal-program",
    label: "Housing Choice or Emergency Housing Voucher",
    version: "24-cfr-982.313-2026-07-26.v1",
    condition: Object.freeze({
      fact: "housingProgram",
      oneOf: Object.freeze([
        "housing-choice-voucher",
        "emergency-housing-voucher",
      ]),
    }),
    sources: Object.freeze([
      source(
        "24 C.F.R. § 982.313",
        "https://www.govinfo.gov/app/details/CFR-2025-title24-vol4/CFR-2025-title24-vol4-sec982-313",
      ),
    ]),
    requirements: Object.freeze([
      "Apply the voucher lease, tenancy addendum, housing-agency policy, and state/local security-deposit rules together.",
      "Do not seek payment from the housing agency for tenant-caused amounts unless the program expressly authorizes it.",
      "After tenancy, give the tenant any remaining deposit after lawful amounts owed are deducted under state and local law.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
  Object.freeze({
    id: "federal-public-housing",
    scope: "federal-program",
    label: "HUD public housing",
    version: "24-cfr-966.4-2026-07-26.v1",
    condition: Object.freeze({ fact: "housingProgram", equals: "public-housing" }),
    sources: Object.freeze([
      source(
        "24 C.F.R. § 966.4 and applicable PHA admissions and continued-occupancy policy",
        "https://www.govinfo.gov/app/details/CFR-2025-title24-vol4/CFR-2025-title24-vol4-sec966-4",
      ),
    ]),
    requirements: Object.freeze([
      "Apply the PHA lease and admissions and continued-occupancy policy in addition to state and local law.",
      "Separate authorized tenant charges from prohibited or unsupported non-rent fees.",
      "Do not charge an assistance-animal fee or deposit.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
  Object.freeze({
    id: "federal-hud-multifamily",
    scope: "federal-program",
    label: "HUD-assisted multifamily housing",
    version: "hud-4350.3-2026-07-26.v1",
    condition: Object.freeze({
      fact: "housingProgram",
      oneOf: Object.freeze([
        "project-based-section-8",
        "section-202",
        "section-811",
      ]),
    }),
    sources: Object.freeze([
      source(
        "HUD Handbook 4350.3 REV-1, chapter 6",
        "https://www.hud.gov/hudclips/handbooks/housing-4350-3",
      ),
    ]),
    requirements: Object.freeze([
      "Apply the HUD model lease, program handbook, subsidy contract, and state/local deposit rules together.",
      "Distinguish the ordinary security deposit from any separately regulated pet deposit.",
      "Do not impose a pet deposit for an assistance animal.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
  Object.freeze({
    id: "federal-usda-rural",
    scope: "federal-program",
    label: "USDA Rural Development multifamily housing",
    version: "7-cfr-3560.204-2026-07-26.v1",
    condition: Object.freeze({ fact: "housingProgram", equals: "usda-rural" }),
    sources: Object.freeze([
      source(
        "7 C.F.R. § 3560.204",
        "https://www.rd.usda.gov/media/file/download/3560-2chapter07.pdf",
      ),
    ]),
    requirements: Object.freeze([
      "Use a separate bank or bookkeeping account for security deposits.",
      "Do not exceed the greater of the tenant's net contribution for one month's rent or basic rent.",
      "Offer an installment plan to a household eligible for rental assistance or Section 8 assistance.",
      "Do not charge normal wear and tear or an additional security deposit for a necessary assistance animal.",
      "Continue to follow all state and local handling, disposition, dispute, and interest requirements.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
]);

// Local rules are intentionally data-driven. A locality is added here only
// after its official source and geographic coverage have been reviewed.
export const LOCAL_COMPLIANCE_OVERLAYS = Object.freeze([
  Object.freeze({
    id: "local-il-chicago-rlto",
    scope: "city",
    label: "Chicago Residential Landlord and Tenant Ordinance",
    version: "chicago-rlto-5-12-080-2026-07-26.v1",
    localityKeys: Object.freeze(["us:il:city:chicago"]),
    condition: null,
    sources: Object.freeze([
      source(
        "Chicago Municipal Code § 5-12-080",
        "https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2639124",
      ),
    ]),
    requirements: Object.freeze([
      "Confirm that the dwelling is covered by the Chicago RLTO before applying this overlay.",
      "Hold the deposit in a federally insured interest-bearing Illinois account, do not commingle it, and disclose the institution as required.",
      "Give the required signed or electronic receipt when receiving the deposit.",
      "For a deposit held more than six months, calculate and pay the city-set interest within 30 days after each 12-month rental period.",
      "Send the damage itemization and required paid receipts or permitted substitute records within 30 days after vacancy.",
      "Return the balance and required interest within 45 days after vacancy, subject to the ordinance's separate protected-termination path.",
    ]),
    deadlines: Object.freeze([
      Object.freeze({
        id: "chicago-damage-itemization",
        label: "Chicago damage itemization and supporting records",
        days: 30,
        trigger: "possessionReturnedAt",
        triggerDescription: "the tenant vacates the dwelling",
        dayType: "calendar",
        statutory: true,
        condition: null,
        comparison: null,
      }),
      Object.freeze({
        id: "chicago-deposit-return",
        label: "Chicago return of balance and required interest",
        days: 45,
        trigger: "possessionReturnedAt",
        triggerDescription: "the tenant vacates the dwelling",
        dayType: "calendar",
        statutory: true,
        condition: null,
        comparison: null,
      }),
    ]),
    privacyNote: null,
  }),
  Object.freeze({
    id: "local-wa-seattle-move-in-charges",
    scope: "city",
    label: "Seattle move-in charges and deposit rules",
    version: "seattle-smc-7.24-2026-07-26.v1",
    localityKeys: Object.freeze(["us:wa:city:seattle"]),
    condition: null,
    sources: Object.freeze([
      source(
        "Seattle Municipal Code chapter 7.24; Seattle SDCI move-in-charge guidance",
        "https://www.seattle.gov/sdci/codes/common-code-questions/move-in-charges",
      ),
    ]),
    requirements: Object.freeze([
      "Keep the combined security deposit and nonrefundable move-in fees within one month's rent.",
      "Do not charge a fee, interest, or higher price because a tenant chooses an authorized installment plan.",
      "Offer the installment schedule required for the lease length and the amounts collected.",
      "Use a signed move-in condition checklist before collecting a deposit, in addition to Washington's statewide requirements.",
      "Classify pet deposits and fees separately and apply assistance-animal protections.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
  Object.freeze({
    id: "local-or-portland-security-deposit",
    scope: "city",
    label: "Portland security-deposit and prepaid-rent protections",
    version: "portland-pcc-30.01.087-2026-07-26.v1",
    localityKeys: Object.freeze(["us:or:city:portland"]),
    condition: null,
    sources: Object.freeze([
      source(
        "Portland City Code § 30.01.087",
        "https://www.portland.gov/code/30/01",
      ),
    ]),
    requirements: Object.freeze([
      "If last month's rent is required, limit the additional security deposit to one-half month's rent.",
      "If last month's rent is not required, limit the security deposit to one month's rent.",
      "Use the ordinance's written condition-report, tenant-response, depreciation, documentation, and accounting procedures.",
      "Treat any additional one-half-month conditional-approval deposit as available only when the screening and written-notice requirements are satisfied.",
      "Apply Oregon's statewide 31-day return deadline together with the Portland calculation and documentation rules.",
    ]),
    deadlines: Object.freeze([]),
    privacyNote: null,
  }),
]);

assertValidLocalComplianceOverlayCatalog(LOCAL_COMPLIANCE_OVERLAYS);

export function normalizeComplianceFacts(value) {
  const input = value && typeof value === "object" ? value : {};
  const enumValue = (key) =>
    COMPLIANCE_FACT_OPTIONS[key].includes(input[key])
      ? input[key]
      : DEFAULT_COMPLIANCE_FACTS[key];
  const triState = (key) =>
    input[key] === true || input[key] === false ? input[key] : "unknown";
  const unitCount = Number(input.unitCount);
  return Object.freeze({
    housingProgram: enumValue("housingProgram"),
    propertyType: enumValue("propertyType"),
    tenancyType: enumValue("tenancyType"),
    unitCount:
      Number.isInteger(unitCount) && unitCount > 0 && unitCount <= 100000
        ? unitCount
        : null,
    ownerOccupied: triState("ownerOccupied"),
    furnished: triState("furnished"),
    assistanceAnimalAccommodation: triState("assistanceAnimalAccommodation"),
    scraQualifiedTermination: triState("scraQualifiedTermination"),
    writtenRentalAgreement: triState("writtenRentalAgreement"),
    leaseExtendsDepositDeadline: triState("leaseExtendsDepositDeadline"),
    seasonalNonPrimaryOccupancy: triState("seasonalNonPrimaryOccupancy"),
  });
}

function localitySlug(value) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "";
}

export function addressLocalityKeys(address) {
  if (!address || address.countryCode !== "US" || !address.stateCode) return [];
  const state = address.stateCode.toLowerCase();
  const keys = [];
  const city = localitySlug(address.city);
  const county = localitySlug(address.county);
  if (city) keys.push(`us:${state}:city:${city}`);
  if (county) keys.push(`us:${state}:county:${county}`);
  return Object.freeze(keys);
}

function conditionStatus(condition, facts) {
  if (!condition) return "applies";
  const actual = facts[condition.fact];
  if (actual === undefined || actual === null || actual === "unknown") {
    return "needs-fact";
  }
  if (Array.isArray(condition.oneOf)) {
    return condition.oneOf.includes(actual) ? "applies" : "not-applicable";
  }
  return actual === condition.equals ? "applies" : "not-applicable";
}

export function resolveComplianceOverlays(address, factsValue) {
  const facts = normalizeComplianceFacts(factsValue);
  const localityKeys = addressLocalityKeys(address);
  const federal = FEDERAL_COMPLIANCE_OVERLAYS.map((overlay) =>
    Object.freeze({
      ...overlay,
      applicability: conditionStatus(overlay.condition, facts),
    }),
  );
  const local = LOCAL_COMPLIANCE_OVERLAYS.filter((overlay) =>
    overlay.localityKeys.some((key) => localityKeys.includes(key)),
  ).map((overlay) => Object.freeze({ ...overlay, applicability: "applies" }));
  return Object.freeze({
    facts,
    localityKeys,
    federal: Object.freeze(federal),
    local: Object.freeze(local),
    localCoverage:
      localityKeys.length && local.length
        ? "reviewed-overlay-applied"
        : "unreviewed-locality",
  });
}
