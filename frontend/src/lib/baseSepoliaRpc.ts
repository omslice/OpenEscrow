import { fallback, http } from "wagmi";

export const BASE_SEPOLIA_RPC_URLS = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
] as const;

export function baseSepoliaTransport() {
  return fallback(
    BASE_SEPOLIA_RPC_URLS.map((url) =>
      http(url, {
        retryCount: 1,
        retryDelay: 250,
        timeout: 10_000,
      }),
    ),
    { rank: false },
  );
}
