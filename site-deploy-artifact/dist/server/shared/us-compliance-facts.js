const definition = (key, label, question, guidance) =>
  Object.freeze({
    key,
    label,
    question,
    guidance,
    valueType: "boolean",
    trueLabel: "Yes",
    falseLabel: "No",
  });

export const DYNAMIC_COMPLIANCE_FACTS = Object.freeze({
  landlordCompliedWithTerminationNotice: definition(
    "landlordCompliedWithTerminationNotice",
    "Required termination notice",
    "Did the landlord give the notice required for the shorter Alaska return path?",
    "Confirm the governing notice requirement and preserve proof of delivery outside this non-sensitive timeline note.",
  ),
  landlordClaimsDeposit: definition(
    "landlordClaimsDeposit",
    "Deposit deduction claim",
    "Is the landlord making any deduction claim against the deposit?",
    "Use Yes when any amount of the refundable deposit is being withheld or claimed; use No only when the full deposit will be returned.",
  ),
  tenantDisputesDamageList: definition(
    "tenantDisputesDamageList",
    "Tenant disputes damage list",
    "Did the tenant dispute the landlord's damage list?",
    "Record only the yes/no procedural fact here. Keep the detailed response and evidence in the claim record.",
  ),
  qualifyingCondemnation: definition(
    "qualifyingCondemnation",
    "Qualifying condemnation",
    "Did a qualifying condemnation end the tenancy?",
    "This determines whether Minnesota's accelerated path may apply. Confirm the legal classification outside OpenEscrow before answering.",
  ),
  qualifyingDisplacement: definition(
    "qualifyingDisplacement",
    "Qualifying displacement",
    "Did a fire, flood, condemnation, or other qualifying displacement end the tenancy?",
    "This determines whether New Jersey's accelerated path may apply. Do not include protected personal details in the note.",
  ),
  finalDamageAmountUnavailableAtDay30: definition(
    "finalDamageAmountUnavailableAtDay30",
    "Final damages unavailable at day 30",
    "Were final damages still not reasonably determinable by day 30?",
    "Use Yes only when the jurisdiction permits an interim accounting and the required interim statement was handled separately.",
  ),
  tenantRequestsDetailedItemization: definition(
    "tenantRequestsDetailedItemization",
    "Detailed itemization requested",
    "Did the tenant request the detailed itemization?",
    "Preserve the request and its delivery date in the private record; this field records only whether the request occurred.",
  ),
  verifiedDamageNeedsExtension: definition(
    "verifiedDamageNeedsExtension",
    "Verified-damage extension",
    "Does verified damage require the additional Wyoming damage period?",
    "Use Yes only after confirming the statute's requirements and preserving the supporting damage record.",
  ),
});

export const STATIC_COMPLIANCE_FACT_KEYS = Object.freeze([
  "housingProgram",
  "propertyType",
  "tenancyType",
  "unitCount",
  "ownerOccupied",
  "furnished",
  "assistanceAnimalAccommodation",
  "scraQualifiedTermination",
  "writtenRentalAgreement",
  "leaseExtendsDepositDeadline",
  "seasonalNonPrimaryOccupancy",
]);

export function dynamicComplianceFactsForProfile(profile) {
  if (!profile || !Array.isArray(profile.deadlines)) return [];
  const deadlines = [
    ...profile.deadlines,
    ...(Array.isArray(profile.overlays)
      ? profile.overlays.flatMap((overlay) =>
          Array.isArray(overlay?.deadlines) ? overlay.deadlines : [],
        )
      : []),
  ];
  const keys = [
    ...new Set(
      deadlines
        .map((deadline) => deadline.condition?.fact)
        .filter((key) => DYNAMIC_COMPLIANCE_FACTS[key]),
    ),
  ];
  return Object.freeze(keys.map((key) => DYNAMIC_COMPLIANCE_FACTS[key]));
}

export function dynamicComplianceFactForProfile(profile, key) {
  return (
    dynamicComplianceFactsForProfile(profile).find(
      (candidate) => candidate.key === key,
    ) || null
  );
}
