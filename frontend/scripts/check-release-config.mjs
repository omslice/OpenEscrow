import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPOSIT_ASSET_IDS,
  depositAssetAvailability,
  getDepositAsset,
} from "../shared/deposit-assets.js";
import {
  createFundingPlan,
  validateFiatOnrampConfig,
} from "../shared/funding-routes.js";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(frontend, "..");
const releaseMode = process.env.OPENESCROW_RELEASE_MODE || "testnet";
const failures = [];
const passes = [];

function record(condition, label, failureDetail) {
  if (condition) {
    passes.push(label);
  } else {
    failures.push(`${label}: ${failureDetail}`);
  }
}

function parsePublicEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

record(
  releaseMode === "testnet",
  "Release mode is explicitly testnet",
  "this checker does not authorize a mainnet or real-money release",
);

const hosting = JSON.parse(
  await readFile(join(repository, ".openai", "hosting.json"), "utf8"),
);
record(
  typeof hosting.project_id === "string" && hosting.project_id.length > 0,
  "Existing Sites project is pinned",
  ".openai/hosting.json needs its existing project_id",
);
record(
  hosting.d1 === "DB",
  "D1 binding name is preserved",
  'expected the existing "DB" binding',
);
record(
  hosting.r2 === "EVIDENCE",
  "R2 binding name is preserved",
  'expected the existing "EVIDENCE" binding',
);

const productionEnv = parsePublicEnv(
  await readFile(join(frontend, ".env.production"), "utf8"),
);
record(
  typeof productionEnv.VITE_PRIVY_APP_ID === "string" &&
    productionEnv.VITE_PRIVY_APP_ID.length > 0,
  "Production build has its public Privy application ID",
  "VITE_PRIVY_APP_ID is missing",
);
record(
  productionEnv.VITE_FIAT_ONRAMP_ENABLED !== "true",
  "Real fiat onramp is disabled",
  "testnet releases cannot enable real fiat funding",
);
record(
  productionEnv.VITE_FIAT_ONRAMP_PRODUCTION_APPROVED !== "true",
  "Fiat production approval gate is closed",
  "testnet releases cannot carry the production-approval flag",
);

const disabledOnramp = validateFiatOnrampConfig({
  enabled: productionEnv.VITE_FIAT_ONRAMP_ENABLED === "true",
  environment: productionEnv.VITE_FIAT_ONRAMP_ENVIRONMENT,
  asset: productionEnv.VITE_FIAT_ONRAMP_ASSET,
  chain: productionEnv.VITE_FIAT_ONRAMP_CHAIN,
  productionApproved:
    productionEnv.VITE_FIAT_ONRAMP_PRODUCTION_APPROVED === "true",
});
record(
  disabledOnramp.enabled === false && disabledOnramp.config === null,
  "Compiled fiat configuration fails closed",
  "the production environment unexpectedly creates an onramp config",
);

const defaultAsset = getDepositAsset(DEPOSIT_ASSET_IDS.USDC);
record(
  defaultAsset?.enabled === true &&
    defaultAsset.yieldType === "none" &&
    defaultAsset.settlementAsset === "USDC",
  "USDC remains the enabled non-yield default",
  "the default deposit asset safety properties changed",
);
record(
  createFundingPlan(DEPOSIT_ASSET_IDS.USDC, {
    onrampEnabled: false,
  }).checkoutAvailable === false,
  "USDC checkout remains closed in the testnet build",
  "a disabled onramp unexpectedly produced a checkout",
);
record(
  depositAssetAvailability(DEPOSIT_ASSET_IDS.USDY, {
    countryCode: "US",
  }).available === false &&
    depositAssetAvailability(DEPOSIT_ASSET_IDS.USDY, {
      countryCode: "CA",
    }).available === false,
  "USDY remains blocked for U.S. and Canadian contexts",
  "restricted-asset eligibility no longer fails closed",
);
record(
  createFundingPlan(DEPOSIT_ASSET_IDS.FRNT, {
    onrampEnabled: true,
    environment: "sandbox",
  }).checkoutAvailable === false,
  "FRNT has no accidental sandbox or production route",
  "an unapproved FRNT route became available",
);

console.log(`OpenEscrow ${releaseMode} release configuration`);
for (const label of passes) {
  console.log(`PASS     ${label}`);
}
for (const failure of failures) {
  console.log(`BLOCK    ${failure}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log("READY    Local testnet release configuration is fail-closed.");
}
