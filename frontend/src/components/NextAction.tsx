import type { ReactNode } from "react";
import { useAccount, useReadContract } from "wagmi";
import { OpenEscrowABI, OPEN_ESCROW_ADDRESS, Phase, ZERO_ADDRESS } from "../contracts/config";
import { formatTimestamp } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";

export function NextAction({
  id,
  agreement,
  onOpenClaims,
}: {
  id: bigint;
  agreement: Agreement;
  onOpenClaims?: () => void;
}) {
  const { address } = useAccount();
  const { data: tenantShare } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  if (!address) return null;

  const me = address.toLowerCase();
  const isLandlord = me === agreement.landlord.toLowerCase();
  const isTenant =
    (typeof tenantShare === "bigint" && tenantShare > 0n) ||
    (typeof tenantShare === "number" && tenantShare > 0);
  const isArbiter = me === agreement.arbiter.toLowerCase();

  let title: ReactNode = "No action required";
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
      message =
        agreement.arbiter === ZERO_ADDRESS
          ? "No arbiter is preselected. Confirm every term before depositing. Any later claim and tenant response will be preserved in the shared record."
          : "The arbiter accepted. Confirm every term before approving and depositing yield-test shares.";
    } else {
      title = "Waiting for tenant funding";
      message = "The tenant must explicitly accept and fund the agreement.";
    }
  } else if (agreement.phase === Phase.Active) {
    if (isLandlord) {
      title = (
        <>
          Submit a{" "}
          <a
            className="next-action-link"
            href={`#agreement-${id.toString()}-panel-claims`}
            onClick={(event) => {
              if (!onOpenClaims) return;
              event.preventDefault();
              onOpenClaims();
            }}
          >
            claim
          </a>{" "}
          only if needed
        </>
      );
      message = `The claim window opens ${formatTimestamp(agreement.claimWindowStart)}. Missing the deadline means a full tenant refund.`;
    } else if (isTenant) {
      title = "Deposit protected";
      message =
        "If no timely claim is submitted, your deposit automatically becomes fully refundable after the claim deadline.";
    }
  } else if (agreement.phase === Phase.ClaimOpen) {
    if (isTenant) {
      title = "Respond before the deadline";
      message =
        agreement.arbiter === ZERO_ADDRESS
          ? "Approve, partially approve, or dispute the documented claim. Your response is recorded; if you do nothing, the record will show “No response,” and the documented claim can still be finalized."
          : "Approve, partially approve, or dispute. If you do nothing, the unanswered amount moves to the agreed dispute process.";
    } else if (isLandlord) {
      title = agreement.arbiter === ZERO_ADDRESS ? "Tenant response period" : "Waiting for the tenant";
      message =
        agreement.arbiter === ZERO_ADDRESS
          ? "Tenant responses are preserved in the shared record. After the deadline, finalize the documented claim and record any non-response."
          : "The tenant may approve, partially approve, or dispute before the response deadline.";
    } else if (isArbiter) {
      title = "Stand by";
      message = "You act only if the tenant disputes some or all of the claim.";
    }
  } else if (agreement.phase === Phase.Disputed) {
    if (agreement.arbiter === ZERO_ADDRESS) {
      title = "Legacy dispute awaiting resolution";
      message =
        "This older agreement entered the dispute workflow without a preselected arbiter. Follow its recorded timeout terms; newer no-arbiter agreements keep responses in the shared record instead.";
    } else if (isArbiter && !agreement.arbiterResigned) {
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
