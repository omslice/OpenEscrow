import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../../deployments/base-sepolia-latest.json", import.meta.url), "utf8").replace(
    /^\uFEFF/,
    "",
  ),
);

if (manifest?.chainId !== 84_532 || manifest?.cohortStatus !== "active-testnet") {
  throw new Error("The active Base Sepolia deployment manifest is invalid.");
}

export const ACTIVE_DEPLOYMENT = Object.freeze({
  chainId: manifest.chainId,
  escrow: manifest.openEscrow.address,
  operationsReserve: manifest.operationsReserve.address,
  activityRegistry: manifest.agreementActivityRegistry.address,
  usdc: manifest.tokens.plain,
  yieldUsdc: manifest.tokens.yield,
  deploymentBlock: manifest.openEscrow.deploymentBlock,
  registryDeploymentBlock: manifest.agreementActivityRegistry.deploymentBlock,
});
