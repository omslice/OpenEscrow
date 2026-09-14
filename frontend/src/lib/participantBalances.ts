import type { Agreement } from "./useAgreement";

const CLOSED_PHASE = 6;

export function participantDepositTokenBalance({
  agreement,
  role,
  tenantContribution = 0n,
  tenantCredit = 0n,
}: {
  agreement: Agreement;
  role: "landlord" | "tenant" | "arbiter" | null;
  tenantContribution?: bigint;
  tenantCredit?: bigint;
}) {
  if (role === "tenant") {
    return agreement.phase === CLOSED_PHASE ? tenantCredit : tenantContribution;
  }
  if (role === "landlord") {
    return (
      agreement.locked +
      agreement.tenantWithdrawable +
      agreement.landlordWithdrawable
    );
  }
  return 0n;
}
