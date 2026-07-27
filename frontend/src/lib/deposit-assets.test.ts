import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPOSIT_ASSET_CATALOG_VERSION,
  DEPOSIT_ASSET_IDS,
  DEPOSIT_ASSETS,
  createDepositAssetSnapshot,
  depositAssetAvailability,
  depositAssetIdFromTerms,
  depositAssetSnapshotMatchesCatalog,
  getDepositAsset,
  validateDepositAssetTerms,
} from "../../shared/deposit-assets.js";

const usdc = getDepositAsset(DEPOSIT_ASSET_IDS.USDC)!;
const aave = getDepositAsset(DEPOSIT_ASSET_IDS.AAVE_USDC)!;
const frnt = getDepositAsset(DEPOSIT_ASSET_IDS.FRNT)!;
const usdy = getDepositAsset(DEPOSIT_ASSET_IDS.USDY)!;

test("deposit assets ship as a 4-option versioned catalog", () => {
  assert.equal(DEPOSIT_ASSETS.length >= 4, true);
  assert.equal(DEPOSIT_ASSETS[0]?.id, DEPOSIT_ASSET_IDS.USDC);
  assert.equal(DEPOSIT_ASSETS[1]?.id, DEPOSIT_ASSET_IDS.AAVE_USDC);
  assert.equal(DEPOSIT_ASSETS[2]?.id, DEPOSIT_ASSET_IDS.FRNT);
  assert.equal(DEPOSIT_ASSETS[3]?.id, DEPOSIT_ASSET_IDS.USDY);
  assert.equal(DEPOSIT_ASSET_CATALOG_VERSION, "2026-07-26.1");
});

test("USDC remains default, non-yield, enabled settlement asset", () => {
  assert.equal(usdc.id, DEPOSIT_ASSET_IDS.USDC);
  assert.ok(usdc.badge.includes("Standard"));
  assert.equal(usdc.yieldType, "none");
  assert.equal(usdc.yieldVariability, "none");
  assert.equal(usdc.contractTokenChoice, "plain");
  assert.equal(usdc.enabled, true);
  assert.equal(usdc.settlementAsset, "USDC");
  assert.equal(depositAssetIdFromTerms({}), DEPOSIT_ASSET_IDS.USDC);
  assert.equal(depositAssetIdFromTerms({ tokenChoice: "yield" }), DEPOSIT_ASSET_IDS.AAVE_USDC);
  assert.equal(
    depositAssetAvailability(DEPOSIT_ASSET_IDS.USDC, { countryCode: "US" }).available,
    true,
  );
});

test("Aave asset is the only active yield option and stays distinctly modeled", () => {
  assert.equal(aave.yieldType, "variable_lending");
  assert.equal(aave.contractTokenChoice, "yield");
  assert.equal(aave.yieldVariability, "variable");
  assert.equal(aave.enabled, true);
  assert.equal(aave.consentRequired, true);
  assert.equal(aave.settlementAsset, "USDC");
  const snapshot = createDepositAssetSnapshot(aave.id);
  assert.equal(snapshot?.id, DEPOSIT_ASSET_IDS.AAVE_USDC);
  assert.equal(typeof snapshot, "object");
});

test("FRNT is a non-yield restricted alternative with no holder yield", () => {
  assert.equal(frnt.yieldType, "none");
  assert.equal(frnt.yieldSource, "None to the token holder.");
  assert.equal(frnt.contractTokenChoice, null);
  assert.equal(frnt.consentRequired, false);
  assert.equal(frnt.enabled, false);
  assert.equal(
    depositAssetAvailability(DEPOSIT_ASSET_IDS.FRNT, { countryCode: "US" }).available,
    false,
  );
});

test("USDY is country-blocked where required and remains blocked in testnet", () => {
  assert.equal(usdy.yieldType, "accumulating_treasury");
  assert.equal(usdy.consentRequired, true);
  assert.equal(usdy.contractTokenChoice, null);
  assert.equal(usdy.enabled, false);
  assert.equal(
    depositAssetAvailability(DEPOSIT_ASSET_IDS.USDY, { countryCode: "US" }).available,
    false,
  );
  assert.equal(
    depositAssetAvailability(DEPOSIT_ASSET_IDS.USDY, { countryCode: "CA" }).available,
    false,
  );
  assert.match(
    depositAssetAvailability(DEPOSIT_ASSET_IDS.USDY, { countryCode: "US" }).reason,
    /U.S. and Canadian/i,
  );
});

test("asset snapshots and consent checks remain deterministic", () => {
  const usdcSnapshot = createDepositAssetSnapshot(DEPOSIT_ASSET_IDS.USDC);
  const aaveSnapshot = createDepositAssetSnapshot(DEPOSIT_ASSET_IDS.AAVE_USDC);
  const usdySnapshot = createDepositAssetSnapshot(DEPOSIT_ASSET_IDS.USDY);
  assert.ok(usdcSnapshot);
  assert.ok(aaveSnapshot);
  assert.ok(usdySnapshot);
  assert.deepEqual(usdcSnapshot!.id, DEPOSIT_ASSET_IDS.USDC);
  assert.ok(depositAssetSnapshotMatchesCatalog(usdcSnapshot, DEPOSIT_ASSET_IDS.USDC));

  assert.equal(
    validateDepositAssetTerms({
      tokenChoice: "yield",
      depositAssetId: DEPOSIT_ASSET_IDS.AAVE_USDC,
      depositAssetSnapshot: createDepositAssetSnapshot(DEPOSIT_ASSET_IDS.AAVE_USDC),
      yieldConsent: false,
      addressResolution: { countryCode: "US" },
    }),
    false,
  );
  assert.equal(
    validateDepositAssetTerms({
      tokenChoice: "yield",
      depositAssetId: DEPOSIT_ASSET_IDS.AAVE_USDC,
      depositAssetSnapshot: createDepositAssetSnapshot(DEPOSIT_ASSET_IDS.AAVE_USDC),
      yieldConsent: true,
      addressResolution: { countryCode: "US" },
    }),
    true,
  );
  assert.equal(
    validateDepositAssetTerms({
      tokenChoice: "plain",
      depositAssetId: DEPOSIT_ASSET_IDS.USDY,
      depositAssetSnapshot: usdySnapshot,
      yieldConsent: true,
      addressResolution: { countryCode: "US" },
    }),
    false,
  );
});
