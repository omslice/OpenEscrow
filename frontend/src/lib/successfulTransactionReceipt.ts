type TransactionReceiptLike = {
  status: string;
};

const DEFAULT_REVERTED_TRANSACTION_MESSAGE =
  "The transaction reached the test network but did not complete. No change was recorded. Refresh the page, review the details, and try again.";

export async function waitForSuccessfulTransactionReceipt<
  Receipt extends TransactionReceiptLike,
>(
  waitForReceipt: () => Promise<Receipt>,
  revertedMessage = DEFAULT_REVERTED_TRANSACTION_MESSAGE,
) {
  const receipt = await waitForReceipt();
  if (receipt.status !== "success") {
    throw new Error(revertedMessage);
  }
  return receipt;
}
