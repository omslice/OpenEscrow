type ContractReadResult = {
  status: string;
  result?: unknown;
};

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

function agreementPhase(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("phase" in value)) return null;
  const phase = (value as { phase?: unknown }).phase;
  if (typeof phase === "number" && Number.isInteger(phase)) return phase;
  if (typeof phase === "bigint") return Number(phase);
  return null;
}

export function tenantFundingAttentionIds(
  agreementIds: readonly bigint[],
  reads: readonly ContractReadResult[] | undefined,
  readyToFundPhase: number,
): bigint[] {
  if (!reads || reads.length !== agreementIds.length * 3) return [];
  return agreementIds.filter((_, index) => {
    const [agreementRead, shareRead, contributionRead] = reads.slice(
      index * 3,
      index * 3 + 3,
    );
    if (
      agreementRead?.status !== "success" ||
      shareRead?.status !== "success" ||
      contributionRead?.status !== "success"
    ) {
      return false;
    }
    return (
      agreementPhase(agreementRead.result) === readyToFundPhase &&
      (asBigInt(shareRead.result) || 0n) > 0n &&
      asBigInt(contributionRead.result) === 0n
    );
  });
}
