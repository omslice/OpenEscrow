import assert from "node:assert/strict";
import test from "node:test";

import { buildCycloneDxSbom, sbomDigest } from "./self-host-sbom-core.mjs";

const packageLock = {
  name: "sample",
  version: "1.0.0",
  packages: {
    "": { name: "sample", version: "1.0.0" },
    "node_modules/example": {
      version: "2.0.0",
      integrity: `sha512-${Buffer.from("digest").toString("base64")}`,
      license: "MIT",
      resolved: "https://registry.npmjs.org/example/-/example-2.0.0.tgz",
    },
    "node_modules/parent/node_modules/example": {
      version: "2.0.0",
      integrity: `sha512-${Buffer.from("digest").toString("base64")}`,
      license: "MIT",
    },
    "node_modules/@scope/widget": { version: "3.1.0", license: "Custom license" },
  },
};

test("builds a deterministic component inventory from every package-lock path", () => {
  const options = {
    commitDate: "2026-08-09T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
  };
  const first = buildCycloneDxSbom(packageLock, options);
  const second = buildCycloneDxSbom(packageLock, options);

  assert.deepEqual(first, second);
  assert.equal(first.bomFormat, "CycloneDX");
  assert.equal(first.components.length, 2);
  assert.equal(first.components[0].purl, "pkg:npm/%40scope/widget@3.1.0");
  assert.match(first.components[1].properties[0].value, /node_modules\/example/);
  assert.match(first.components[1].properties[0].value, /parent\/node_modules\/example/);
  assert.equal(first.components[1].hashes[0].alg, "SHA-512");
  assert.equal(sbomDigest(first), sbomDigest(second));
});
