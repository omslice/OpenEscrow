export function agreementAmountUnit(
  tokenAddress: string,
  yieldTokenAddress: string,
) {
  return tokenAddress.toLowerCase() === yieldTokenAddress.toLowerCase()
    ? "taUSDC shares"
    : "testUSDC";
}

export function claimAmountUnit(
  tokenAddress: string,
  yieldTokenAddress: string,
) {
  return tokenAddress.toLowerCase() === yieldTokenAddress.toLowerCase()
    ? "testUSDC value"
    : "testUSDC";
}

export function payoutAmountUnit({
  tokenAddress,
  yieldTokenAddress,
  yieldSettled,
}: {
  tokenAddress: string;
  yieldTokenAddress: string;
  yieldSettled: boolean;
}) {
  return yieldSettled
    ? "testUSDC"
    : agreementAmountUnit(tokenAddress, yieldTokenAddress);
}
