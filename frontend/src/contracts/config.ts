import type { Abi } from "viem";
import { baseSepolia } from "wagmi/chains";
import OpenEscrowABIJson from "./OpenEscrowABI.json";
import MockUSDCABIJson from "./MockUSDCABI.json";

// Base Sepolia deployment (see broadcast/*/84532/run-latest.json for tx receipts).
export const OPEN_ESCROW_ADDRESS = "0xFe0270679261cFC546822Cc453C5aD73f29a721C" as const;
export const USDC_ADDRESS = "0xE129b23BD89904D363ba226eE52deC74185D7789" as const;
export const USDC_DECIMALS = 6;

// Block OpenEscrow was deployed at (broadcast/DeployOpenEscrow.s.sol/84532/run-latest.json) -
// bounds event-log scans so "discover my agreements" doesn't have to search from genesis.
export const DEPLOYMENT_BLOCK = 44550183n;

export const chain = baseSepolia;

// Mirrors OpenEscrow's MIN_PERIOD/MAX_PERIOD/MAX_CLAIM_WINDOW_OFFSET constants exactly -
// used only for client-side validation so users see a clear message instead of a raw
// revert; the contract remains the actual source of truth for these bounds.
export const MIN_PERIOD_SECONDS = 5 * 60;
export const MAX_PERIOD_SECONDS = 365 * 24 * 60 * 60;
export const MAX_CLAIM_WINDOW_OFFSET_SECONDS = 3650 * 24 * 60 * 60;

// JSON imports lose literal string types (e.g. `type: string` instead of `type: "function"`),
// so viem's `Abi` type needs an explicit assertion here - the underlying data is a real ABI
// straight from `forge inspect`, this isn't loosening any actual runtime behavior.
export const OpenEscrowABI = OpenEscrowABIJson as unknown as Abi;
export const MockUSDCABI = MockUSDCABIJson as unknown as Abi;

// Mirrors contracts/OpenEscrow.sol Phase enum ordering exactly.
export const Phase = {
  None: 0,
  Proposed: 1,
  ReadyToFund: 2,
  Active: 3,
  ClaimOpen: 4,
  Disputed: 5,
  Closed: 6,
  Cancelled: 7,
} as const;

export const phaseLabel: Record<number, string> = {
  0: "Does not exist",
  1: "Proposed (awaiting arbiter)",
  2: "Ready to fund",
  3: "Active",
  4: "Claim open",
  5: "Disputed",
  6: "Closed",
  7: "Cancelled",
};

// Mirrors contracts/OpenEscrow.sol CloseReason enum ordering exactly.
export const closeReasonLabel: Record<number, string> = {
  0: "",
  1: "No claim - full refund",
  2: "Claim retracted",
  3: "Settled",
  4: "Resolved by arbiter",
  5: "Resolved by arbiter timeout",
};
