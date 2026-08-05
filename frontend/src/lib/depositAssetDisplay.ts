import type { DepositAssetConfig } from "../../shared/deposit-assets.js";

type AssetAvailability = {
  available: boolean;
  reason: string | null;
};

export function depositAssetStatusLabel(
  asset: Pick<DepositAssetConfig, "implementationStatus">,
  availability: AssetAvailability,
) {
  if (!availability.available) return "Unavailable";
  if (asset.implementationStatus === "simulated") return "Simulation";
  if (asset.implementationStatus === "testnet") return "Testnet option";
  return "Available option";
}
