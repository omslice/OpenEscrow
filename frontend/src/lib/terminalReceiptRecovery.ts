import { isTransactionHash } from "./browserRecovery.ts";
import type { NegotiationAction } from "./negotiations";

export type WithdrawalReceiptAction = Extract<
  NegotiationAction,
  { type: "withdrawal_completed" }
>;
export type TimeoutReceiptAction = Extract<
  NegotiationAction,
  { type: "timeout_executed" }
>;
export type TerminalReceiptAction =
  | WithdrawalReceiptAction
  | TimeoutReceiptAction;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isPositiveTokenAmount(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^\d+(?:\.\d{1,6})?$/.test(value) &&
    /[1-9]/.test(value)
  );
}

export function isWithdrawalReceiptAction(
  value: unknown,
): value is WithdrawalReceiptAction {
  if (!isPlainRecord(value) || value.type !== "withdrawal_completed") {
    return false;
  }
  return (
    hasOnlyKeys(
      value,
      new Set(["type", "amount", "transactionHash"]),
    ) &&
    isPositiveTokenAmount(value.amount) &&
    isTransactionHash(value.transactionHash)
  );
}

export function isTimeoutReceiptAction(
  value: unknown,
): value is TimeoutReceiptAction {
  if (!isPlainRecord(value) || value.type !== "timeout_executed") {
    return false;
  }
  return (
    hasOnlyKeys(
      value,
      new Set(["type", "timeout", "transactionHash"]),
    ) &&
    (value.timeout === "no_claim_refund" ||
      value.timeout === "no_response_dispute" ||
      value.timeout === "arbiter_timeout_refund") &&
    isTransactionHash(value.transactionHash)
  );
}

export function sameTerminalReceipt(
  left: TerminalReceiptAction | null,
  right: TerminalReceiptAction,
) {
  return Boolean(
    left &&
      left.type === right.type &&
      left.transactionHash === right.transactionHash,
  );
}

export function terminalReceiptRecoveryKey(input: {
  receipt: "withdrawal" | "timeout";
  agreementId: string;
  proposalId: string;
  role: "landlord" | "tenant" | "arbiter";
  address: string;
}) {
  const parts = [
    input.receipt,
    input.agreementId,
    input.proposalId,
    input.role,
    input.address.toLowerCase(),
  ].map(encodeURIComponent);
  return `openescrow:pending-terminal-receipt:${parts.join(":")}`;
}
