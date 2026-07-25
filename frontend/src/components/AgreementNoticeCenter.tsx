import { useAccount } from "wagmi";
import { Phase, ZERO_ADDRESS } from "../contracts/config";
import { countdown, formatTimestamp } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { useNow } from "../lib/useNow";

type Notice = { level: "info" | "warning" | "success"; title: string; body: string };

export function AgreementNoticeCenter({ agreement }: { agreement: Agreement }) {
  const { address } = useAccount();
  const now = useNow();
  const me = address?.toLowerCase();
  const isTenant = me === agreement.tenant.toLowerCase();
  const isLandlord = me === agreement.landlord.toLowerCase();
  const notices: Notice[] = [];

  if (agreement.phase === Phase.Active) {
    notices.push({
      level: "success",
      title: "Deposit confirmed",
      body: `The escrow holds the tenant's fixed shares. The landlord's claim window starts ${formatTimestamp(agreement.claimWindowStart)}.`,
    });
  }
  if (agreement.phase === Phase.ClaimOpen) {
    notices.push({
      level: isTenant ? "warning" : "info",
      title: isTenant ? "Deduction claim needs your response" : "Deduction claim delivered",
      body: `Response deadline: ${formatTimestamp(agreement.responseDeadline)} (${countdown(agreement.responseDeadline, now)}). Silence creates a dispute; it never auto-pays the landlord.`,
    });
  }
  if (agreement.phase === Phase.Disputed) {
    notices.push({
      level: "warning",
      title: agreement.arbiter === ZERO_ADDRESS ? "Dispute has no arbiter" : "Deduction is disputed",
      body:
        agreement.arbiter === ZERO_ADDRESS
          ? `Landlord and tenant can mutually appoint one before ${formatTimestamp(agreement.arbiterRulingDeadline)}. If they do not, the disputed balance defaults to the tenant.`
          : `Only the disputed shares remain locked. The ruling deadline is ${formatTimestamp(agreement.arbiterRulingDeadline)} (${countdown(agreement.arbiterRulingDeadline, now)}).`,
    });
  }
  if (agreement.phase === Phase.Closed) {
    const canWithdraw =
      (isTenant && agreement.tenantWithdrawable > 0n) ||
      (isLandlord && agreement.landlordWithdrawable > 0n);
    notices.push({
      level: "success",
      title: canWithdraw ? "Resolution complete—funds available" : "Agreement resolved",
      body: canWithdraw
        ? "Your allocated ytUSDC shares are ready to withdraw."
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
