import { isTransactionHash } from "./browserRecovery.ts";
import type { NegotiationAction } from "./negotiations";

export type ClaimResponseReceiptAction = Extract<
  NegotiationAction,
  { type: "claim_response" }
>;
export type ArbiterRulingReceiptAction = Extract<
  NegotiationAction,
  { type: "arbiter_ruling" }
>;
export type DecisionReceiptAction =
  | ClaimResponseReceiptAction
  | ArbiterRulingReceiptAction;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTokenAmount(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d{1,6})?$/.test(value);
}

export function isClaimResponseReceiptAction(
  value: unknown,
): value is ClaimResponseReceiptAction {
  if (!isPlainRecord(value) || value.type !== "claim_response") return false;
  return (
    hasOnlyKeys(
      value,
      new Set([
        "type",
        "decision",
        "acceptedAmount",
        "note",
        "transactionHash",
      ]),
    ) &&
    (value.decision === "approve" ||
      value.decision === "partial" ||
      value.decision === "dispute") &&
    isTokenAmount(value.acceptedAmount) &&
    typeof value.note === "string" &&
    value.note.length <= 1_000 &&
    isTransactionHash(value.transactionHash)
  );
}

export function isArbiterRulingReceiptAction(
  value: unknown,
): value is ArbiterRulingReceiptAction {
  if (!isPlainRecord(value) || value.type !== "arbiter_ruling") return false;
  return (
    hasOnlyKeys(
      value,
      new Set([
        "type",
        "awardToLandlord",
        "note",
        "transactionHash",
      ]),
    ) &&
    isTokenAmount(value.awardToLandlord) &&
    typeof value.note === "string" &&
    value.note.length <= 1_000 &&
    isTransactionHash(value.transactionHash)
  );
}

export function sameDecisionReceipt(
  left: DecisionReceiptAction | null,
  right: DecisionReceiptAction,
) {
  return Boolean(
    left &&
      left.type === right.type &&
      left.transactionHash === right.transactionHash,
  );
}

export function decisionReceiptRecoveryKey(input: {
  receipt: "claim-response" | "arbiter-ruling";
  agreementId: string;
  proposalId: string;
  role: "tenant" | "arbiter";
  address: string;
}) {
  const parts = [
    input.receipt,
    input.agreementId,
    input.proposalId,
    input.role,
    input.address.toLowerCase(),
  ].map(encodeURIComponent);
  return `openescrow:pending-decision-receipt:${parts.join(":")}`;
}
