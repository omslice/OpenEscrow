const CLAIM_POLICY_VERSION = "claim-packet-2026-07-26.v1";

const CLAIM_CATEGORY_IDS = Object.freeze(["10", "11", "12", "13"]);

const COMMON_ATTESTATIONS = Object.freeze([
  Object.freeze({
    id: "itemized-statement",
    label:
      "Every deduction is separately itemized with a specific reason and amount.",
    basis: "openescrow-safeguard",
    appliesToCategoryIds: CLAIM_CATEGORY_IDS,
  }),
  Object.freeze({
    id: "supporting-documents",
    label:
      "The private supporting file contains the available invoices, receipts, estimates, labor details, or photographs for this claim.",
    basis: "openescrow-safeguard",
    appliesToCategoryIds: CLAIM_CATEGORY_IDS,
  }),
  Object.freeze({
    id: "ordinary-wear-excluded",
    label:
      "The claim excludes ordinary wear, preexisting conditions, and unsupported amounts.",
    basis: "openescrow-safeguard",
    appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
  }),
]);

const STATE_ATTESTATIONS = Object.freeze({
  CA: Object.freeze([
    Object.freeze({
      id: "ca-move-in-photos",
      label:
        "The record includes the move-in condition photographs required for this tenancy, or the tenancy is outside that move-in-photo requirement.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
    Object.freeze({
      id: "ca-pre-repair-photos",
      label:
        "The record includes photographs taken after possession returned and before the claimed repair or cleaning.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
    Object.freeze({
      id: "ca-post-repair-photos",
      label:
        "The record includes photographs taken after the claimed repair or cleaning was completed.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
    Object.freeze({
      id: "ca-cost-records",
      label:
        "The packet includes the applicable bill, invoice, receipt, labor detail, material record, or permitted good-faith estimate.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
  GA: Object.freeze([
    Object.freeze({
      id: "ga-damage-lists",
      label:
        "The claim is supported by the applicable signed move-in and move-out damage lists from the statutory inspection process.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
  ID: Object.freeze([
    Object.freeze({
      id: "id-signed-itemization",
      label: "The deduction itemization is signed.",
      basis: "state-source",
      appliesToCategoryIds: CLAIM_CATEGORY_IDS,
    }),
  ]),
  IL: Object.freeze([
    Object.freeze({
      id: "il-damage-records",
      label:
        "The packet includes the paid receipts, estimates, or other substitute documentation applicable to the damage claim.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
  KY: Object.freeze([
    Object.freeze({
      id: "ky-damage-lists",
      label:
        "The claim is supported by the applicable signed move-in and move-out damage lists and inspection record.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
  MA: Object.freeze([
    Object.freeze({
      id: "ma-sworn-itemization",
      label:
        "The damage itemization is sworn by the landlord or agent under pains and penalties of perjury and describes the damage and necessary repairs in precise detail.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
    Object.freeze({
      id: "ma-written-cost-evidence",
      label:
        "The packet includes written cost evidence such as estimates, bills, invoices, or receipts.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
  WA: Object.freeze([
    Object.freeze({
      id: "wa-condition-checklist",
      label:
        "The damage claim is supported by the signed move-in condition checklist when that checklist is required.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
    Object.freeze({
      id: "wa-cost-documentation",
      label:
        "The packet includes the applicable estimates, paid invoices, receipts, material records, or landlord labor time and reasonable hourly rate.",
      basis: "state-source",
      appliesToCategoryIds: Object.freeze(["11", "12", "13"]),
    }),
  ]),
});

const CLAIM_INSTRUCTION_PATTERN =
  /\b(account|balance|claim|damage|deduct|deliver|document|estimate|inspection|invoice|itemiz|mail|notice|ordinary wear|photo|receipt|repair|return|statement|withhold)\b/i;

export function buildClaimPolicy(postalCode, requirements, source) {
  const stateCode =
    typeof postalCode === "string" ? postalCode.trim().toUpperCase() : "";
  const stateInstructions = Array.isArray(requirements)
    ? requirements.filter(
        (requirement) =>
          typeof requirement === "string" &&
          CLAIM_INSTRUCTION_PATTERN.test(requirement),
      )
    : [];
  return Object.freeze({
    schema: "openescrow.claim-policy.v1",
    version: `${stateCode.toLowerCase()}-${CLAIM_POLICY_VERSION}`,
    allowedCategoryIds: CLAIM_CATEGORY_IDS,
    commonAttestations: COMMON_ATTESTATIONS,
    stateAttestations: STATE_ATTESTATIONS[stateCode] || Object.freeze([]),
    stateInstructions: Object.freeze(stateInstructions),
    source: Object.freeze({
      citation: source?.citation || "",
      url: source?.url || "",
    }),
    legalReviewRequired: true,
  });
}

export function claimAttestationApplies(attestation, categoryIds) {
  if (!attestation || !Array.isArray(attestation.appliesToCategoryIds)) {
    return false;
  }
  const selected = new Set(Array.isArray(categoryIds) ? categoryIds : []);
  return attestation.appliesToCategoryIds.some((categoryId) =>
    selected.has(categoryId),
  );
}

export function requiredClaimAttestations(policy, categoryIds) {
  if (
    policy?.schema !== "openescrow.claim-policy.v1" ||
    !Array.isArray(policy.commonAttestations) ||
    !Array.isArray(policy.stateAttestations)
  ) {
    return [];
  }
  return [...policy.commonAttestations, ...policy.stateAttestations].filter(
    (attestation) => claimAttestationApplies(attestation, categoryIds),
  );
}
