import {
  US_JURISDICTION_PROFILES as SHARED_US_JURISDICTION_PROFILES,
  US_JURISDICTION_PROFILE_BY_CODE as SHARED_PROFILE_BY_CODE,
  US_JURISDICTION_PROFILE_BY_POSTAL_CODE as SHARED_PROFILE_BY_POSTAL_CODE,
} from "../../shared/us-jurisdiction-profiles.js";
import {
  addressResolutionMatchesProfile as sharedAddressResolutionMatchesProfile,
  buildComplianceSnapshot as sharedBuildComplianceSnapshot,
  evaluateCompliance as sharedEvaluateCompliance,
  normalizeAddressResolution as sharedNormalizeAddressResolution,
} from "../../shared/us-compliance-engine.js";
import {
  COMPLIANCE_FACT_OPTIONS as SHARED_COMPLIANCE_FACT_OPTIONS,
  DEFAULT_COMPLIANCE_FACTS as SHARED_DEFAULT_COMPLIANCE_FACTS,
  normalizeComplianceFacts as sharedNormalizeComplianceFacts,
} from "../../shared/us-compliance-overlays.js";

export type ComplianceFactValue = string | number | boolean | null;

export type AddressResolution = {
  provider: "photon-openstreetmap";
  providerFeatureId: string;
  label: string;
  countryCode: "US";
  stateCode: string;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
};

export type ComplianceDeadlineRule = {
  id: string;
  label: string;
  days: number;
  trigger: string;
  triggerDescription: string;
  dayType: "calendar" | "business";
  statutory: boolean;
  condition: { fact: string; equals?: ComplianceFactValue; oneOf?: ComplianceFactValue[] } | null;
  comparison: "earlier-of" | "later-of" | null;
};

export type ComplianceFacts = {
  housingProgram:
    | "unknown"
    | "conventional"
    | "housing-choice-voucher"
    | "emergency-housing-voucher"
    | "public-housing"
    | "project-based-section-8"
    | "section-202"
    | "section-811"
    | "usda-rural"
    | "lihtc"
    | "home"
    | "housing-trust-fund"
    | "other-assisted";
  propertyType:
    | "unknown"
    | "standard-residential"
    | "owner-occupied"
    | "mobile-home"
    | "seasonal"
    | "transient"
    | "institutional";
  tenancyType: "unknown" | "fixed-term" | "month-to-month" | "at-will";
  unitCount: number | null;
  ownerOccupied: boolean | "unknown";
  furnished: boolean | "unknown";
  assistanceAnimalAccommodation: boolean | "unknown";
  scraQualifiedTermination: boolean | "unknown";
};

export type ComplianceOverlaySnapshot = {
  id: string;
  scope: "federal" | "federal-program" | "state" | "county" | "city";
  label: string;
  version: string;
  applicability: "applies" | "needs-fact";
  sources: readonly { citation: string; url: string }[];
  requirements: readonly string[];
  deadlines: readonly ComplianceDeadlineRule[];
  privacyNote: string | null;
};

export type ComplianceSnapshot = {
  schema: "openescrow.us-compliance-profile.v3";
  jurisdiction: string;
  profileVersion: string;
  researchedOn: string;
  reviewMethod: string;
  source: { citation: string; url: string };
  address: AddressResolution;
  facts: ComplianceFacts;
  localityKeys: readonly string[];
  localCoverage: "reviewed-overlay-applied" | "unreviewed-locality";
  depositCap: USJurisdictionProfile["depositCap"];
  deadlines: readonly ComplianceDeadlineRule[];
  requirements: readonly string[];
  exceptions: readonly string[];
  overlays: readonly ComplianceOverlaySnapshot[];
  missingFacts: readonly string[];
  unresolvedOverlays: readonly string[];
};

export type USJurisdictionProfile = {
  code: `us-${string}`;
  postalCode: string;
  name: string;
  label: string;
  version: string;
  defaultClaimDays: string;
  statutoryDeadlineDays: number | null;
  statuteCitation: string;
  statuteUrl: string;
  depositCapSummary: string;
  deadlineSummary: string;
  depositCap: {
    kind: "months-rent" | "manual";
    months: number | null;
    summary: string;
  };
  deadlines: readonly ComplianceDeadlineRule[];
  requirements: readonly string[];
  exceptions: readonly string[];
  researchStatus: "implemented-research";
  reviewMethod: string;
  researchedOn: string;
  localOverlayRequired: boolean;
  legalReviewRequired: boolean;
};

export const US_JURISDICTION_PROFILES =
  SHARED_US_JURISDICTION_PROFILES as readonly USJurisdictionProfile[];

export const COMPLIANCE_FACT_OPTIONS =
  SHARED_COMPLIANCE_FACT_OPTIONS as Readonly<{
    housingProgram: readonly ComplianceFacts["housingProgram"][];
    propertyType: readonly ComplianceFacts["propertyType"][];
    tenancyType: readonly ComplianceFacts["tenancyType"][];
  }>;

export const DEFAULT_COMPLIANCE_FACTS =
  SHARED_DEFAULT_COMPLIANCE_FACTS as ComplianceFacts;

const US_PROFILE_BY_CODE =
  SHARED_PROFILE_BY_CODE as Readonly<Record<string, USJurisdictionProfile>>;
const US_PROFILE_BY_POSTAL_CODE =
  SHARED_PROFILE_BY_POSTAL_CODE as Readonly<Record<string, USJurisdictionProfile>>;

export type USJurisdictionCode = `us-${string}`;
export type JurisdictionCode = USJurisdictionCode | "testnet-generic";

export const JURISDICTIONS: ReadonlyArray<{
  code: JurisdictionCode;
  label: string;
}> = [
  ...US_JURISDICTION_PROFILES.map((profile) => ({
    code: profile.code,
    label: profile.label,
  })),
  { code: "testnet-generic", label: "Non-specific jurisdiction (testing only)" },
];

export const CALIFORNIA_POLICY = {
  version: "ca-civ-1950.5-2026.1",
  jurisdiction: "us-ca" as const,
  claimDays: "21",
  responseDays: "7",
  arbiterDays: "7",
  operationsReserve: "5",
  statuteUrl:
    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5.",
  guideUrl: "https://www.dre.ca.gov/publications/ResourceGuidebook/gb10_movingout.html",
} as const;

export const GENERIC_TEST_POLICY = {
  version: "generic-test-v1",
  jurisdiction: "testnet-generic" as const,
  claimDays: "30",
  responseDays: "7",
  arbiterDays: "7",
  operationsReserve: "5",
} as const;

const STORAGE_PREFIX = "openescrow:jurisdiction:";

export function isJurisdictionCode(value: string): value is JurisdictionCode {
  return JURISDICTIONS.some((jurisdiction) => jurisdiction.code === value);
}

export function jurisdictionLabel(code: JurisdictionCode): string {
  return (
    JURISDICTIONS.find((jurisdiction) => jurisdiction.code === code)?.label ??
    "Non-specific jurisdiction (testing only)"
  );
}

export function jurisdictionProfile(
  code: string | null | undefined,
): USJurisdictionProfile | null {
  return code ? US_PROFILE_BY_CODE[code] ?? null : null;
}

export function jurisdictionProfileForPostalCode(
  postalCode: string | null | undefined,
): USJurisdictionProfile | null {
  const normalized = postalCode?.trim().toUpperCase();
  return normalized ? US_PROFILE_BY_POSTAL_CODE[normalized] ?? null : null;
}

export function isUSJurisdictionCode(value: string): value is USJurisdictionCode {
  return Boolean(US_PROFILE_BY_CODE[value]);
}

export function normalizeAddressResolution(value: unknown): AddressResolution | null {
  return sharedNormalizeAddressResolution(value) as AddressResolution | null;
}

export function addressResolutionMatchesProfile(
  resolution: unknown,
  profile: USJurisdictionProfile,
): boolean {
  return sharedAddressResolutionMatchesProfile(resolution, profile);
}

export function buildComplianceSnapshot(
  profile: USJurisdictionProfile,
  resolution: unknown,
  facts: unknown = DEFAULT_COMPLIANCE_FACTS,
): ComplianceSnapshot | null {
  return sharedBuildComplianceSnapshot(profile, resolution, {
    facts,
  }) as ComplianceSnapshot | null;
}

export function normalizeComplianceFacts(value: unknown): ComplianceFacts {
  return sharedNormalizeComplianceFacts(value) as ComplianceFacts;
}

export function evaluateJurisdictionCompliance(
  profile: USJurisdictionProfile,
  input: {
    address?: unknown;
    facts?: Record<string, ComplianceFactValue>;
    events?: Record<string, string | null | undefined>;
    holidayDates?: string[];
  },
) {
  return sharedEvaluateCompliance(profile, input);
}

export function rememberJurisdiction(id: bigint, code: JurisdictionCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${id.toString()}`, code);
}

export function readJurisdiction(id: bigint): JurisdictionCode {
  if (typeof window === "undefined") return GENERIC_TEST_POLICY.jurisdiction;
  const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id.toString()}`);
  return stored && isJurisdictionCode(stored)
    ? stored
    : GENERIC_TEST_POLICY.jurisdiction;
}
