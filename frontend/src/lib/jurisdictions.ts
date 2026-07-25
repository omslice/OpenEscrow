export const JURISDICTIONS = [
  { code: "us-ca", label: "California residential tenancy" },
  { code: "testnet-generic", label: "Non-specific jurisdiction (testing only)" },
] as const;

export type JurisdictionCode = (typeof JURISDICTIONS)[number]["code"];

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
  return JURISDICTIONS.find((jurisdiction) => jurisdiction.code === code)?.label ?? JURISDICTIONS[0].label;
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
