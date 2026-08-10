import type { Abi } from "viem";
import { baseSepolia } from "wagmi/chains";
import OpenEscrowABIJson from "./OpenEscrowABI.json";
import TestUSDCABIJson from "./TestUSDCABI.json";
import TestAaveUSDCABIJson from "./TestAaveUSDCABI.json";
import OperationsReserveABIJson from "./OperationsReserveABI.json";
import AgreementActivityRegistryABIJson from "./AgreementActivityRegistryABI.json";
export {
  ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK,
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "./activityRegistryConfig";

// Base Sepolia deployment (see deployments/base-sepolia-latest.json for receipts).
// Deployed 2026-08-09 as one independently verified escrow, reserve, registry,
// and bounded test-token cohort. Earlier addresses remain historical rollback data.
export const OPEN_ESCROW_ADDRESS = "0x9F8C9555f28C10347C58fc71F430F4cbc3724b10" as const;
export const USDC_ADDRESS = "0x3d147C9c4a9191cAbA99be3174C674C04B33E152" as const;
export const YIELD_USDC_ADDRESS = "0x596bF42F18d2a82C346b7007402Fe9f22C1ad32f" as const;
export const OPERATIONS_RESERVE_ADDRESS = "0xDB6637e5A858A8FD3a3CD85c1625d9A0b022A626" as const;
export const OPERATIONS_RESERVE_AMOUNT = 5_000_000n;
export const USDC_DECIMALS = 6;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Block OpenEscrow was deployed at (broadcast/DeployOpenEscrow.s.sol/84532/run-latest.json) -
// bounds event-log scans so "discover my agreements" doesn't have to search from genesis.
export const DEPLOYMENT_BLOCK = 45283514n;
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
export const TestUSDCABI = TestUSDCABIJson as unknown as Abi;
export const TestAaveUSDCABI = TestAaveUSDCABIJson as unknown as Abi;
export const OperationsReserveABI = OperationsReserveABIJson as unknown as Abi;
export const AgreementActivityRegistryABI =
  AgreementActivityRegistryABIJson as unknown as Abi;

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
