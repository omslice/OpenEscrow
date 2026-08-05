import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildReleaseSoftwareInventory } from "./release-software-inventory.mjs";

const commitSha = "a".repeat(40);

function fixture(t) {
  const frontendRoot = mkdtempSync(path.join(tmpdir(), "oe-inventory-"));
  t.after(() => rmSync(frontendRoot, { recursive: true, force: true }));
  mkdirSync(frontendRoot, { recursive: true });
  writeFileSync(
    path.join(frontendRoot, "package.json"),
    `${JSON.stringify({
      name: "frontend",
      version: "1.0.0",
      dependencies: { alpha: "^1.0.0", "@scope/beta": "2.0.0" },
      devDependencies: { tests: "3.0.0" },
    })}\n`,
  );
  writeFileSync(
    path.join(frontendRoot, "package-lock.json"),
    `${JSON.stringify({
      name: "frontend",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "frontend", version: "1.0.0" },
        "node_modules/@scope/beta": {
          version: "2.0.0",
          integrity: "sha512-beta",
          license: "Apache-2.0",
        },
        "node_modules/alpha": {
          version: "1.2.3",
          integrity: "sha512-alpha",
          license: "MIT",
          dependencies: { nested: "1.0.0" },
        },
        "node_modules/alpha/node_modules/nested": {
          version: "1.0.0",
          integrity: "sha512-nested",
          optional: true,
        },
        "node_modules/tests": {
          version: "3.0.0",
          integrity: "sha512-tests",
          dev: true,
        },
      },
    })}\n`,
  );
  return frontendRoot;
}

test("release inventory binds exact production packages and excludes development tools", (t) => {
  const frontendRoot = fixture(t);
  const first = buildReleaseSoftwareInventory({
    frontendRoot,
    commitSha,
    nodeVersion: "v24.13.0",
  });
  const second = buildReleaseSoftwareInventory({
    frontendRoot,
    commitSha,
    nodeVersion: "v24.13.0",
  });

  assert.equal(first.schema, "openescrow.software-inventory/v1");
  assert.equal(first.componentCount, 3);
  assert.deepEqual(first.components.map((component) => component.name), [
    "@scope/beta",
    "alpha",
    "nested",
  ]);
  assert.deepEqual(first.directRuntimeDependencies, [
    {
      name: "@scope/beta",
      declared: "2.0.0",
      resolvedVersion: "2.0.0",
      packagePath: "node_modules/@scope/beta",
    },
    {
      name: "alpha",
      declared: "^1.0.0",
      resolvedVersion: "1.2.3",
      packagePath: "node_modules/alpha",
    },
  ]);
  assert.equal(first.licenseCounts.UNSPECIFIED, 1);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.application.lockfileSha256, /^sha256:[0-9a-f]{64}$/);
});

test("release inventory fails closed on lock drift or unresolved runtime dependencies", (t) => {
  const frontendRoot = fixture(t);
  const badManifest = {
    name: "frontend",
    version: "2.0.0",
    dependencies: { missing: "1.0.0" },
  };
  writeFileSync(
    path.join(frontendRoot, "package.json"),
    `${JSON.stringify(badManifest)}\n`,
  );
  assert.throws(
    () =>
      buildReleaseSoftwareInventory({
        frontendRoot,
        commitSha,
        nodeVersion: "v24.13.0",
      }),
    /not an exact v3 manifest/i,
  );
});
