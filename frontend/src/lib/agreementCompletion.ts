import type { Agreement } from "./useAgreement";

const CLOSED_PHASE = 6;

export function isAgreementComplete(agreement: Agreement | null | undefined) {
  return Boolean(
    agreement &&
      agreement.phase === CLOSED_PHASE &&
      agreement.locked === 0n &&
      agreement.tenantWithdrawable === 0n &&
      agreement.landlordWithdrawable === 0n,
  );
}
