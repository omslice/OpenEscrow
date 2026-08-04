import { isTransactionHash } from "./browserRecovery.ts";
import type { NegotiationAction } from "./negotiations";

export type ClaimReceiptAction = Extract<
  NegotiationAction,
  { type: "claim_submitted" | "claim_amended" }
>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isClaimConfirmations(value: unknown) {
  if (!isPlainRecord(value)) return false;
  if (Object.keys(value).length === 0) return false;
  const allowedKeys = new Set([
    "itemizedStatement",
    "supportingDocuments",
    "moveInPhotos",
    "preRepairPhotos",
    "postRepairPhotos",
    "attestations",
  ]);
  for (const [key, confirmation] of Object.entries(value)) {
    if (!allowedKeys.has(key)) return false;
    if (key === "attestations") {
      if (
        !isPlainRecord(confirmation) ||
        Object.values(confirmation).some((attested) => attested !== true)
      ) {
        return false;
      }
    } else if (confirmation !== true) {
      return false;
    }
  }
  return true;
}

export function isClaimReceiptAction(value: unknown): value is ClaimReceiptAction {
  if (!isPlainRecord(value)) return false;
  if (value.type !== "claim_submitted" && value.type !== "claim_amended") {
    return false;
  }
  if (
    !isBoundedString(value.amount, 80) ||
    !/^\d+(?:\.\d{1,6})?$/.test(value.amount) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20 ||
    !isBoundedString(value.note, 1_000) ||
    !isBoundedString(value.evidenceUri, 500) ||
    !isBoundedString(value.evidenceHash, 100) ||
    !isTransactionHash(value.evidenceHash) ||
    !isTransactionHash(value.transactionHash) ||
    !isClaimConfirmations(value.claimConfirmations)
  ) {
    return false;
  }
  if (
    value.items.some(
      (item) =>
        !isPlainRecord(item) ||
        !isBoundedString(item.category, 120) ||
        item.category.length === 0 ||
        !isBoundedString(item.description, 500) ||
        item.description.trim().length === 0 ||
        !isBoundedString(item.amount, 80) ||
        !/^\d+(?:\.\d{1,6})?$/.test(item.amount),
    )
  ) {
    return false;
  }
  return (
    value.type === "claim_amended" ||
    (isBoundedString(value.category, 120) && value.category.trim().length > 0)
  );
}

export function sameClaimReceipt(
  left: ClaimReceiptAction | null,
  right: ClaimReceiptAction,
) {
  return Boolean(
    left &&
      left.type === right.type &&
      left.transactionHash === right.transactionHash,
  );
}

export function claimReceiptRecoveryKey(input: {
  agreementId: string;
  proposalId: string;
  role: "landlord";
  address: string;
}) {
  const parts = [
    input.agreementId,
    input.proposalId,
    input.role,
    input.address.toLowerCase(),
  ].map(encodeURIComponent);
  return `openescrow:pending-claim-receipt:${parts.join(":")}`;
}
