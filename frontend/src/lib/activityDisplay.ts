import type { NegotiationEvent } from "./negotiations";

const FRIENDLY_ACTIVITY: Record<string, string> = {
  evidence_uploaded:
    "Added a private supporting file. OpenEscrow checked that it was saved correctly.",
  record_snapshot_anchored:
    "Saved a tamper-evident receipt for this record on Base Sepolia.",
  activity_hash_published:
    "Saved a privacy-protecting proof for this activity on Base Sepolia.",
  transaction_receipt_verified:
    "Confirmed the matching Base Sepolia transaction for this agreement.",
  operator_verified:
    "Confirmed the matching Base Sepolia record for this agreement.",
  agreement_funded: "Funded the approved refundable security deposit.",
  tenant_share_funded: "Funded this tenant's approved share of the refundable deposit.",
  operations_reserve_paid: "Added this tenant's approved testnet network and storage reserve.",
};

export function friendlyActivitySummary(event: NegotiationEvent): string {
  if (event.action === "onchain_activity_indexed") {
    const eventType = String(event.metadata?.eventType || "");
    const indexedMessages: Record<string, string> = {
      onchain_proposal_cancelled: "The unfunded agreement was cancelled on Base Sepolia.",
      tenant_share_funded: "A tenant funded their approved share of the deposit.",
      agreement_funded: "The full approved deposit was funded.",
      claim_submitted: "A deduction claim was submitted on Base Sepolia.",
      claim_amended: "The deduction claim was updated on Base Sepolia.",
      claim_retracted: "The deduction claim was withdrawn.",
      claim_response: "A tenant response to the deduction claim was recorded.",
      arbiter_ruling: "The dispute ruling was recorded on Base Sepolia.",
      withdrawal_completed: "An available agreement balance was withdrawn.",
      no_claim_refund_available: "The no-claim tenant refund was recorded.",
      response_timeout_recorded:
        "A missed response deadline was recorded and the documented claim was finalized.",
      response_timeout_escalated: "An unanswered claim was escalated for resolution.",
      arbiter_timeout_allocation: "The missed ruling deadline triggered the tenant allocation.",
      arbiter_replacement_proposed: "An arbiter change was proposed.",
      arbiter_replacement_confirmed: "Both agreement sides confirmed the arbiter change.",
      arbiter_replacement_cancelled: "The pending arbiter change was cancelled.",
      arbiter_replacement_accepted: "The replacement arbiter accepted the role.",
      arbiter_resigned: "The optional arbiter resigned from this agreement.",
    };
    if (indexedMessages[eventType]) return indexedMessages[eventType];
  }
  if (
    event.action === "scheduled_notification_due" ||
    event.action === "scheduled_notification_sent"
  ) {
    const notificationType = String(event.metadata?.notificationType || "");
    const scheduledMessages: Record<string, string> = {
      claim_period_started: "The deduction claim period has started.",
      claim_period_ended: "The deduction claim period has ended.",
      claim_deadline_3_days: "The deduction-claim deadline is in three days.",
      claim_deadline_1_day: "The deduction-claim deadline is tomorrow.",
      response_deadline_3_days: "Your response to the deduction claim is due in three days.",
      response_deadline_1_day: "Your response to the deduction claim is due tomorrow.",
      arbiter_deadline_3_days: "The dispute ruling is due in three days.",
      arbiter_deadline_1_day: "The dispute ruling is due tomorrow.",
      allocation_ready: "A recorded allocation is ready to review.",
    };
    if (scheduledMessages[notificationType]) return scheduledMessages[notificationType];
    if (notificationType.startsWith("compliance_")) {
      return "A recorded agreement deadline needs attention.";
    }
  }
  return FRIENDLY_ACTIVITY[event.action] || event.summary;
}

export function activityHasVerificationDetails(event: NegotiationEvent): boolean {
  return friendlyActivitySummary(event) !== event.summary;
}
