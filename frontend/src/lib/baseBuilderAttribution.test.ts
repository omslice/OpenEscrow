import assert from "node:assert/strict";
import test from "node:test";
import { Attribution } from "ox/erc8021";
import { createBaseBuilderDataSuffix } from "./baseBuilderAttribution.ts";

test("builder attribution stays disabled without an owner-issued code", () => {
  assert.equal(createBaseBuilderDataSuffix(), undefined);
  assert.equal(createBaseBuilderDataSuffix("   "), undefined);
});

test("builder attribution trims and encodes the supplied Base.dev code", () => {
  const expected = Attribution.toDataSuffix({ codes: ["bc_openescrow"] });
  assert.equal(createBaseBuilderDataSuffix("  bc_openescrow  "), expected);
});

test("builder attribution fails closed when the code cannot fit the schema", () => {
  assert.throws(
    () => createBaseBuilderDataSuffix("x".repeat(256)),
    /could not be encoded as an ERC-8021 Builder Code/,
  );
});
