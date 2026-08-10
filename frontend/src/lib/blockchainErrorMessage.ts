function errorDetails(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (depth > 3 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);

  const candidate = value as Record<string, unknown>;
  return [
    candidate.name,
    candidate.shortMessage,
    candidate.message,
    candidate.details,
    candidate.code,
    candidate.cause,
  ]
    .map((part) => errorDetails(part, depth + 1, seen))
    .filter(Boolean)
    .join(" ");
}

/** Turns wallet and RPC diagnostics into short, actionable consumer guidance. */
export function blockchainErrorMessage(
  cause: unknown,
  fallback = "The testnet action could not be completed. Check your wallet and try again.",
) {
  const details = errorDetails(cause).toLowerCase();

  if (/user rejected|user denied|rejected the request|request rejected|denied transaction/.test(details)) {
    return "The wallet request was canceled. No transaction was submitted.";
  }
  if (/over rate limit|rate limit|too many requests|\b429\b/.test(details)) {
    return "Base Sepolia is busy right now. Wait a moment, then try again.";
  }
  if (/insufficient funds|insufficient balance|funds for gas|exceeds the balance/.test(details)) {
    return "This wallet needs more Base Sepolia ETH for the testnet network fee. Add test ETH, then try again.";
  }
  if (/chain mismatch|wrong chain|unsupported chain|switch chain|chain is not supported/.test(details)) {
    return "Switch your wallet to Base Sepolia, then try again.";
  }
  if (/execution reverted|contract function reverted|reverted with|transaction reverted/.test(details)) {
    return "The contract did not accept this action. Refresh the latest agreement status before trying again.";
  }
  if (
    /rpc request failed|failed to fetch|fetch failed|network error|network request|timed out|timeout|connection|socket/.test(
      details,
    )
  ) {
    return "OpenEscrow could not reach Base Sepolia. Check your connection and try again.";
  }
  return fallback;
}
