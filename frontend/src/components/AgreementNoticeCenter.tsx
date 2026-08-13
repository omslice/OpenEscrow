import { useAccount, useReadContract } from "wagmi";
import {
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  Phase,
  YIELD_USDC_ADDRESS,
  ZERO_ADDRESS,
} from "../contracts/config";
import { agreementAmountUnit, payoutAmountUnit } from "../lib/agreementAmountDisplay";
import { countdown, formatTimestamp } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { useNow } from "../lib/useNow";

type Notice = { level: "info" | "warning" | "success"; title: string; body: string };

export function AgreementNoticeCenter({ id, agreement }: { id: bigint; agreement: Agreement }) {
  const { address } = useAccount();
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: tenantCredit } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantWithdrawableByAddress",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const now = useNow();
  const me = address?.toLowerCase();
  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const isLandlord = me === agreement.landlord.toLowerCase();
  const isYieldToken = agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const yieldSettlement = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "yieldSettled",
    args: [id],
    query: { enabled: isYieldToken, refetchInterval: 5000 },
  });
  const amountUnit = agreementAmountUnit(agreement.token, YIELD_USDC_ADDRESS);
  const payoutUnit = payoutAmountUnit({
    tokenAddress: agreement.token,
    yieldTokenAddress: YIELD_USDC_ADDRESS,
    yieldSettled: isYieldToken && yieldSettlement.data === true,
  });
  const notices: Notice[] = [];

  if (agreement.phase === Phase.Active) {
    notices.push({
      level: "success",
      title: "Deposit confirmed",
      body: `The agreement is funded with ${amountUnit}. The landlord's claim window starts ${formatTimestamp(agreement.claimWindowStart)}.`,
    });
  }
  if (agreement.phase === Phase.ClaimOpen) {
    const hasArbiter = agreement.arbiter !== ZERO_ADDRESS;
    notices.push({
      level: isTenant ? "warning" : "info",
      title: isTenant ? "Deduction claim needs your response" : "Deduction claim delivered",
      body: hasArbiter
        ? `Response deadline: ${formatTimestamp(agreement.responseDeadline)} (${countdown(agreement.responseDeadline, now)}). If a tenant does not respond, the unanswered amount moves to the agreed dispute process.`
        : isTenant
          ? `Respond by ${formatTimestamp(agreement.responseDeadline)} (${countdown(agreement.responseDeadline, now)}). Your response becomes part of the shared record. If you do not respond, the record will say “No response,” and the documented claim can still be finalized.`
          : `Response deadline: ${formatTimestamp(agreement.responseDeadline)} (${countdown(agreement.responseDeadline, now)}). Tenant responses become part of the shared record. After the deadline, the documented claim can be finalized; silence is recorded as “No response.”`,
    });
  }
  if (agreement.phase === Phase.Disputed) {
    notices.push({
      level: "warning",
      title: agreement.arbiter === ZERO_ADDRESS ? "Dispute has no arbiter" : "Deduction is disputed",
      body:
        agreement.arbiter === ZERO_ADDRESS
          ? `Landlord and tenant can mutually appoint one before ${formatTimestamp(agreement.arbiterRulingDeadline)}. If they do not, the disputed balance defaults to the tenant.`
          : `Only the disputed balance (${amountUnit}) remains locked. The ruling deadline is ${formatTimestamp(agreement.arbiterRulingDeadline)} (${countdown(agreement.arbiterRulingDeadline, now)}).`,
    });
  }
  if (agreement.phase === Phase.Closed) {
    const canWithdraw =
      (isTenant && typeof tenantCredit === "bigint" && tenantCredit > 0n) ||
      (isLandlord && agreement.landlordWithdrawable > 0n);
    notices.push({
      level: "success",
      title: canWithdraw ? "Resolution complete—funds available" : "Agreement resolved",
      body: canWithdraw
        ? `Your allocated balance (${payoutUnit}) is ready to withdraw.`
        : "The onchain allocation is final and no response is required from this wallet.",
    });
  }

  if (notices.length === 0) return null;
  return (
    <section className="notice-center" aria-live="polite">
      <span className="eyebrow">Agreement notifications</span>
      {notices.map((notice) => (
        <div className={`agreement-notice ${notice.level}`} key={notice.title}>
          <strong>{notice.title}</strong>
          <p>{notice.body}</p>
        </div>
      ))}
      <small>
        Live status comes from the contract. Invitation and claim emails use the server-side
        provider when configured, with Gmail and copy-email fallbacks available.
      </small>
    </section>
  );
}
