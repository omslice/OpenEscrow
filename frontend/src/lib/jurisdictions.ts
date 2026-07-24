export const JURISDICTIONS = [
  { code: "testnet-generic", label: "Generic testnet - no jurisdiction selected" },
  { code: "us-ca", label: "United States - California" },
  { code: "us-ny", label: "United States - New York" },
  { code: "us-tx", label: "United States - Texas" },
  { code: "us-fl", label: "United States - Florida" },
  { code: "us-other", label: "United States - another state or district" },
  { code: "ca-other", label: "Canada - province or territory" },
  { code: "gb-ew", label: "United Kingdom - England and Wales" },
  { code: "gb-sct", label: "United Kingdom - Scotland" },
  { code: "gb-nir", label: "United Kingdom - Northern Ireland" },
  { code: "other", label: "Another jurisdiction" },
] as const;

export type JurisdictionCode = (typeof JURISDICTIONS)[number]["code"];

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
  if (typeof window === "undefined") return "testnet-generic";
  const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id.toString()}`);
  return stored && isJurisdictionCode(stored) ? stored : "testnet-generic";
}
