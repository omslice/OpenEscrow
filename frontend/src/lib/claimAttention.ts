type ContractReadResult = {
  status: string;
  result?: unknown;
};

type AgreementAttentionState = {
  phase: number;
  claimedAmount: bigint;
  landlordWithdrawable: bigint;
};

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

function agreementState(value: unknown): AgreementAttentionState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const phase = asBigInt(candidate.phase);
  const claimedAmount = asBigInt(candidate.claimedAmount);
  const landlordWithdrawable = asBigInt(candidate.landlordWithdrawable);
  if (phase === null || claimedAmount === null || landlordWithdrawable === null) {
    return null;
  }
  return {
    phase: Number(phase),
    claimedAmount,
    landlordWithdrawable,
  };
}

export function tenantClaimAttentionIds(
  agreementIds: readonly bigint[],
  reads: readonly ContractReadResult[] | undefined,
  claimOpenPhase: number,
): bigint[] {
  if (!reads || reads.length !== agreementIds.length * 2) return [];
  return agreementIds.filter((_, index) => {
    const [agreementRead, respondedRead] = reads.slice(index * 2, index * 2 + 2);
    if (agreementRead?.status !== "success" || respondedRead?.status !== "success") {
      return false;
    }
    const agreement = agreementState(agreementRead.result);
    return agreement?.phase === claimOpenPhase && respondedRead.result === false;
  });
}

export function landlordClaimAttentionIds(
  agreementIds: readonly bigint[],
  reads: readonly ContractReadResult[] | undefined,
  phases: { claimOpen: number; disputed: number; closed: number },
): bigint[] {
  if (!reads || reads.length !== agreementIds.length * 2) return [];
  return agreementIds.filter((_, index) => {
    const [agreementRead, responseCountRead] = reads.slice(index * 2, index * 2 + 2);
    if (agreementRead?.status !== "success" || responseCountRead?.status !== "success") {
      return false;
    }
    const agreement = agreementState(agreementRead.result);
    const responseCount = asBigInt(responseCountRead.result);
    if (!agreement || responseCount === null || responseCount === 0n) return false;
    if (agreement.phase === phases.claimOpen || agreement.phase === phases.disputed) {
      return true;
    }
    return (
      agreement.phase === phases.closed &&
      agreement.claimedAmount > 0n &&
      agreement.landlordWithdrawable > 0n
    );
  });
}
