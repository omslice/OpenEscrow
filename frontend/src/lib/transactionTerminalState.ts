export type TransactionTerminalState = "pending" | "failed" | "succeeded";

export function transactionTerminalState(
  writeError: unknown,
  receiptError: unknown,
  isSuccess: boolean,
): TransactionTerminalState {
  if (writeError || receiptError) return "failed";
  return isSuccess ? "succeeded" : "pending";
}
