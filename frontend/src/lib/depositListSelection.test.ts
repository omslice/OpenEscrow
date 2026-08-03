import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveExpandedDepositId,
  toggleExpandedDepositId,
} from "./depositListSelection.ts";

test("a single deposit opens by default while multi-deposit accounts start collapsed", () => {
  assert.equal(resolveExpandedDepositId(undefined, ["1"]), "1");
  assert.equal(resolveExpandedDepositId(undefined, ["1", "2"]), null);
  assert.equal(resolveExpandedDepositId(undefined, []), null);
});

test("deposit selection permits at most one current agreement", () => {
  let current = resolveExpandedDepositId(null, ["1", "2"]);
  current = toggleExpandedDepositId(current, "1");
  assert.equal(current, "1");
  current = toggleExpandedDepositId(current, "2");
  assert.equal(current, "2");
  current = toggleExpandedDepositId(current, "2");
  assert.equal(current, null);
});

test("a removed or cross-account deposit cannot remain expanded", () => {
  assert.equal(resolveExpandedDepositId("2", ["1"]), null);
  assert.equal(resolveExpandedDepositId("2", []), null);
  assert.equal(resolveExpandedDepositId("2", ["2", "2"]), "2");
});
