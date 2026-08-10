export function agreementAmountUnit(
  tokenAddress: string,
  yieldTokenAddress: string,
) {
  return tokenAddress.toLowerCase() === yieldTokenAddress.toLowerCase()
    ? "taUSDC shares"
    : "testUSDC";
}
