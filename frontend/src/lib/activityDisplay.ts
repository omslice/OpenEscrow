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
  return FRIENDLY_ACTIVITY[event.action] || event.summary;
}

export function activityHasVerificationDetails(event: NegotiationEvent): boolean {
  return friendlyActivitySummary(event) !== event.summary;
}
