import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDeploymentConfiguration,
  rehearseConfigurationSwitch,
  validateDeploymentManifest,
} from "./deployment-config-plan.mjs";

const current = {
  openEscrow: "0x1111111111111111111111111111111111111111",
  operationsReserve: "0x2222222222222222222222222222222222222222",
  activityRegistry: "0x3333333333333333333333333333333333333333",
  usdc: "0x4444444444444444444444444444444444444444",
  yieldUsdc: "0x5555555555555555555555555555555555555555",
  deploymentBlock: 10n,
  registryDeploymentBlock: 11n,
};

function files(values = current) {
  return {
    "frontend/src/contracts/config.ts": `
export const OPEN_ESCROW_ADDRESS = "${values.openEscrow}" as const;
export const USDC_ADDRESS = "${values.usdc}" as const;
export const YIELD_USDC_ADDRESS = "${values.yieldUsdc}" as const;
export const OPERATIONS_RESERVE_ADDRESS = "${values.operationsReserve}" as const;
export const DEPLOYMENT_BLOCK = ${values.deploymentBlock}n;
`,
    "frontend/src/contracts/activityRegistryConfig.ts": `
export const AGREEMENT_ACTIVITY_REGISTRY_ADDRESS =
  "${values.activityRegistry}" as const;
export const ACTIVITY_REGISTRY_DEPLOYMENT_BLOCK = ${values.registryDeploymentBlock}n;
`,
    "frontend/server/index.js": `
const DEFAULT_OPEN_ESCROW_ADDRESS = "${values.openEscrow}";
const DEFAULT_USDC_ADDRESS = "${values.usdc}";
const DEFAULT_YIELD_USDC_ADDRESS = "${values.yieldUsdc}";
const DEFAULT_OPERATIONS_RESERVE_ADDRESS =
  "${values.operationsReserve}";
const DEFAULT_ACTIVITY_REGISTRY_ADDRESS =
  "${values.activityRegistry}";
`,
  };
}

const candidateManifest = {
  schema: "openescrow.deployment-manifest/v2",
  chainId: 84_532,
  sourceCommit: "a".repeat(40),
  openEscrow: {
    address: "0x6666666666666666666666666666666666666666",
    deploymentBlock: 20,
    transactionHash: `0x${"1".repeat(64)}`,
  },
  operationsReserve: {
    address: "0x7777777777777777777777777777777777777777",
    deploymentBlock: 19,
    transactionHash: `0x${"2".repeat(64)}`,
  },
  agreementActivityRegistry: {
    address: "0x8888888888888888888888888888888888888888",
    deploymentBlock: 21,
    escrowAddress: "0x6666666666666666666666666666666666666666",
    transactionHash: `0x${"3".repeat(64)}`,
  },
  reciprocalConfiguration: {
    transactionHash: `0x${"4".repeat(64)}`,
    reserveAddress: "0x7777777777777777777777777777777777777777",
    escrowAddress: "0x6666666666666666666666666666666666666666",
  },
  tokens: {
    plain: "0x9999999999999999999999999999999999999999",
    yield: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
};
candidateManifest.network = "local-anvil-base-sepolia-rehearsal";
candidateManifest.cohortStatus = "candidate-rehearsal-only";

test("deployment manifest binds one exact candidate cohort", () => {
  const candidate = validateDeploymentManifest(candidateManifest, "a".repeat(40));
  assert.equal(candidate.openEscrow, candidateManifest.openEscrow.address);
  assert.equal(candidate.deploymentBlock, 20n);
  assert.throws(
    () =>
      validateDeploymentManifest({
        ...candidateManifest,
        agreementActivityRegistry: {
          ...candidateManifest.agreementActivityRegistry,
          escrowAddress: current.openEscrow,
        },
      }),
    /not bound/,
  );
  assert.throws(
    () =>
      validateDeploymentManifest({
        ...candidateManifest,
        reciprocalConfiguration: {
          ...candidateManifest.reciprocalConfiguration,
          reserveAddress: current.operationsReserve,
        },
      }),
    /cross-bound/,
  );
});

test("public deployment manifests require transaction evidence", () => {
  const publicManifest = {
    ...candidateManifest,
    network: "base-sepolia",
    cohortStatus: "candidate-unconfigured",
  };
  assert.doesNotThrow(() => validateDeploymentManifest(publicManifest));
  assert.throws(
    () =>
      validateDeploymentManifest({
        ...publicManifest,
        operationsReserve: {
          ...publicManifest.operationsReserve,
          transactionHash: undefined,
        },
      }),
    /transaction evidence/,
  );
});

test("configuration switch and rollback are byte-for-byte reversible", () => {
  const original = files();
  assert.deepEqual(parseDeploymentConfiguration(original), current);
  const candidate = validateDeploymentManifest(candidateManifest, "a".repeat(40));
  const result = rehearseConfigurationSwitch(original, candidate);
  assert.equal(result.switchVerified, true);
  assert.equal(result.rollbackVerified, true);
  assert.equal(result.replacementCount, 12);
});

test("configuration parsing fails closed on client/server cohort drift", () => {
  const mismatched = files();
  mismatched["frontend/server/index.js"] = mismatched[
    "frontend/server/index.js"
  ].replace(current.openEscrow, candidateManifest.openEscrow.address);
  assert.throws(
    () => parseDeploymentConfiguration(mismatched),
    /Client\/server deployment configuration mismatch/,
  );
});
