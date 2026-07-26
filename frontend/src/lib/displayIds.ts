function compactReference(value: string) {
  const compact = value.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return compact.slice(-8).padStart(8, "0");
}

export function proposalReference(id: string) {
  return `OE-P-${compactReference(id)}`;
}

export function agreementReference(id: bigint | number | string) {
  try {
    const sequence = BigInt(id) + 1n;
    return `OE-A-${sequence.toString().padStart(6, "0")}`;
  } catch {
    return `OE-A-${compactReference(String(id))}`;
  }
}
