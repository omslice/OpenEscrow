import { useReadContract } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  AgreementActivityRegistryABI,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";

export function useActivityRegistryReadiness() {
  const registryEscrow = useReadContract({
    address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
    abi: AgreementActivityRegistryABI,
    functionName: "ESCROW",
  });
  const configuredEscrow =
    typeof registryEscrow.data === "string"
      ? registryEscrow.data.toLowerCase()
      : null;
  const isReady =
    configuredEscrow === OPEN_ESCROW_ADDRESS.toLowerCase();

  return {
    isReady,
    isChecking: registryEscrow.isPending,
    error: registryEscrow.error,
    configuredEscrow,
  };
}
