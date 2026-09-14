type ContractReadResult = {
  status: string;
  result?: unknown;
};

type LifecycleAgreement = {
  phase: number;
  tenantWithdrawable: bigint;
  landlordWithdrawable: bigint;
};

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

function lifecycleAgreement(value: unknown): LifecycleAgreement | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const phase = asBigInt(candidate.phase);
  const tenantWithdrawable = asBigInt(candidate.tenantWithdrawable);
  const landlordWithdrawable = asBigInt(candidate.landlordWithdrawable);
  if (phase === null || tenantWithdrawable === null || landlordWithdrawable === null) {
    return null;
  }
  return { phase: Number(phase), tenantWithdrawable, landlordWithdrawable };
}

export function agreementLifecycleCounts(
  reads: readonly ContractReadResult[] | undefined,
  phases: { active: number; claimOpen: number; disputed: number; closed: number },
) {
  const agreements = (reads || []).flatMap((read) => {
    if (read.status !== "success") return [];
    const agreement = lifecycleAgreement(read.result);
    return agreement ? [agreement] : [];
  });
  return {
    activeDeposits: agreements.filter(
      (agreement) => agreement.phase === phases.active,
    ).length,
    activeClaims: agreements.filter(
      (agreement) =>
        agreement.phase === phases.claimOpen || agreement.phase === phases.disputed,
    ).length,
    completedRefunds: agreements.filter(
      (agreement) =>
        agreement.phase === phases.closed &&
        agreement.tenantWithdrawable === 0n &&
        agreement.landlordWithdrawable === 0n,
    ).length,
  };
}
