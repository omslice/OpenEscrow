import { useAccount } from "wagmi";
import { Phase } from "../contracts/config";
import { formatTimestamp } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";

export function NextAction({ agreement }: { agreement: Agreement }) {
  const { address } = useAccount();
  if (!address) return null;

  const me = address.toLowerCase();
  const isLandlord = me === agreement.landlord.toLowerCase();
  const isTenant = me === agreement.tenant.toLowerCase();
  const isArbiter = me === agreement.arbiter.toLowerCase();

  let title = "No action required";
  let message = "This agreement is waiting for another participant.";

  if (agreement.phase === Phase.Proposed) {
    if (isArbiter && !agreement.arbiterDeclined) {
      title = "Review the arbiter invitation";
      message = "Accept only if you understand the deadlines and are prepared to resolve a dispute.";
    } else if (isLandlord && agreement.arbiterDeclined) {
      title = "Nominate an arbiter";
      message = "The current nominee declined. Choose another neutral person, or cancel this proposal.";
    } else if (isLandlord) {
      title = "Waiting for the arbiter";
      message = "Share this agreement with the nominated arbiter. No tenant funds can move yet.";
    } else if (isTenant) {
      title = "Review only";
      message = "Do not fund yet. The nominated arbiter must accept first.";
    }
  } else if (agreement.phase === Phase.ReadyToFund) {
    if (isTenant) {
      title = "Review and fund";
      message = "The arbiter accepted. Confirm every term before approving and depositing test USDC.";
    } else {
      title = "Waiting for tenant funding";
      message = "The tenant must explicitly accept and fund the agreement.";
    }
  } else if (agreement.phase === Phase.Active) {
    if (isLandlord) {
      title = "Submit a claim only if needed";
      message = `The claim window opens ${formatTimestamp(agreement.claimWindowStart)}. Missing the deadline means a full tenant refund.`;
    } else if (isTenant) {
      title = "Deposit protected";
      message = "If no timely claim is submitted, you can finalize a full refund after the claim deadline.";
    }
  } else if (agreement.phase === Phase.ClaimOpen) {
    if (isTenant) {
      title = "Respond before the deadline";
      message =
        "Accept all, accept part, or dispute. If you do nothing, the claim becomes a dispute—it is never auto-paid.";
    } else if (isLandlord) {
      title = "Waiting for the tenant";
      message = "You may reduce the claim once. You cannot increase it or extend the response deadline.";
    } else if (isArbiter) {
      title = "Stand by";
      message = "You act only if the tenant disputes some or all of the claim.";
    }
  } else if (agreement.phase === Phase.Disputed) {
    if (isArbiter && !agreement.arbiterResigned) {
      title = "Ruling required";
      message = "Review the evidence and allocate no more than the disputed balance before the deadline.";
    } else {
      title = "Dispute awaiting decision";
      message = "Only the disputed balance remains locked. The tenant receives it if no ruling arrives.";
    }
  } else if (agreement.phase === Phase.Closed) {
    const hasFunds =
      (isTenant && agreement.tenantWithdrawable > 0n) ||
      (isLandlord && agreement.landlordWithdrawable > 0n);
    title = hasFunds ? "Withdraw your available balance" : "Agreement complete";
    message = hasFunds
      ? "The outcome is final, but funds remain in escrow until you withdraw them."
      : "No further agreement action is required.";
  } else if (agreement.phase === Phase.Cancelled) {
    title = "Proposal cancelled";
    message = "No funds entered escrow.";
  }

  return (
    <section className="next-action" aria-live="polite">
      <span className="eyebrow">What happens next</span>
      <strong>{title}</strong>
      <p>{message}</p>
    </section>
  );
}
