import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "../contracts/config";

export function formatUSDC(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

export function parseUSDC(human: string): bigint {
  return parseUnits(human as `${number}`, USDC_DECIMALS);
}

export function formatTimestamp(ts: bigint | number): string {
  const n = typeof ts === "bigint" ? Number(ts) : ts;
  if (n === 0) return "-";
  return new Date(n * 1000).toLocaleString();
}

/** Half-open [now, deadline) countdown, matching the contract's deadline convention. */
export function countdown(deadline: bigint | number, nowSec: number): string {
  const d = typeof deadline === "bigint" ? Number(deadline) : deadline;
  if (d === 0) return "-";
  const diff = d - nowSec;
  if (diff <= 0) return "passed - action available";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
  return `${seconds}s remaining`;
}

export function shortAddr(addr: string | undefined): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
