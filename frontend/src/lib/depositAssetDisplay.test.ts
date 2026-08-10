import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPOSIT_ASSETS,
  depositAssetAvailability,
  getDepositAsset,
} from "../../shared/deposit-assets.js";
import { depositAssetStatusLabel } from "./depositAssetDisplay.ts";

test("deposit asset badges describe user availability instead of internal implementation state", () => {
  const usdc = getDepositAsset("usdc");
  const aave = getDepositAsset("aave-usdc");
  const frnt = getDepositAsset("frnt");
  const usdy = getDepositAsset("usdy");
  assert.ok(usdc && aave && frnt && usdy);

  assert.equal(
    depositAssetStatusLabel(usdc, depositAssetAvailability(usdc.id, { countryCode: "US" })),
    "Testnet option",
  );
  assert.equal(
    depositAssetStatusLabel(aave, depositAssetAvailability(aave.id, { countryCode: "US" })),
    "Simulation",
  );
  assert.equal(
    depositAssetStatusLabel(frnt, depositAssetAvailability(frnt.id, { countryCode: "US" })),
    "Unavailable",
  );
  assert.equal(
    depositAssetStatusLabel(usdy, depositAssetAvailability(usdy.id, { countryCode: "US" })),
    "Unavailable",
  );
});

test("no current asset card exposes a production-readiness claim", () => {
  for (const asset of DEPOSIT_ASSETS) {
    const label = depositAssetStatusLabel(
      asset,
      depositAssetAvailability(asset.id, { countryCode: "US" }),
    );
    assert.doesNotMatch(label, /production/i);
  }
});
