import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildContinuityManifest,
  compareContinuityManifests,
  R2_INVENTORY_SCHEMA,
} from "./hosted-data-continuity-core.mjs";

const key = Buffer.alloc(32, 23);
const baseSql = `
  CREATE TABLE agreement_negotiations (id TEXT PRIMARY KEY, landlord_email TEXT);
  CREATE TABLE evidence_files (
    id TEXT PRIMARY KEY,
    storage_kind TEXT NOT NULL,
    object_key TEXT
  );
  INSERT INTO agreement_negotiations VALUES ('agreement-private-1', 'tenant@example.test');
  INSERT INTO evidence_files VALUES ('evidence-private-1', 'encrypted-r2', 'evidence/private-object.pdf');
`;

async function fixture(t, { sql = baseSql, complete = true, bytes = "ciphertext" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "oe-continuity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "objects"));
  writeFileSync(path.join(root, "objects", "evidence.bin"), bytes);
  const inventoryPath = path.join(root, "r2.json");
  const inventory = {
    schemaVersion: R2_INVENTORY_SCHEMA,
    complete,
    objects: [
      {
        key: "evidence/private-object.pdf",
        file: "objects/evidence.bin",
        size: Buffer.byteLength(bytes),
      },
    ],
  };
  writeFileSync(inventoryPath, JSON.stringify(inventory));
  return {
    root,
    inventoryPath,
    manifest: buildContinuityManifest({
      d1Sql: sql,
      r2Inventory: inventory,
      r2InventoryPath: inventoryPath,
      hmacKey: key,
      sourceLabel: "private fixture",
      generatedAt: "2026-08-08T00:00:00.000Z",
    }),
  };
}

test("creates a private, order-independent D1/R2 manifest without raw data", async (t) => {
  const first = await fixture(t);
  const secondSql = `
    CREATE TABLE agreement_negotiations (id TEXT PRIMARY KEY, landlord_email TEXT);
    CREATE TABLE evidence_files (
      id TEXT PRIMARY KEY,
      storage_kind TEXT NOT NULL,
      object_key TEXT
    );
    INSERT INTO evidence_files VALUES ('evidence-private-1', 'encrypted-r2', 'evidence/private-object.pdf');
    INSERT INTO agreement_negotiations VALUES ('agreement-private-1', 'tenant@example.test');
  `;
  const second = await fixture(t, { sql: secondSql });
  const serialized = JSON.stringify(first.manifest);
  for (const privateValue of [
    "tenant@example.test",
    "agreement-private-1",
    "evidence-private-1",
    "evidence/private-object.pdf",
    "ciphertext",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(first.manifest.d1.totalRows, 2);
  assert.equal(first.manifest.r2.objectCount, 1);
  assert.equal(first.manifest.r2.missingReferenceCount, 0);
  const comparison = compareContinuityManifests(
    first.manifest,
    second.manifest,
  );
  assert.equal(comparison.status, "match", JSON.stringify(comparison));
});

test("detects D1 and encrypted R2 byte drift", async (t) => {
  const source = await fixture(t);
  const changedSql = baseSql.replace(
    "tenant@example.test",
    "different@example.test",
  );
  const destination = await fixture(t, {
    sql: changedSql,
    bytes: "changed-ciphertext",
  });
  const comparison = compareContinuityManifests(
    source.manifest,
    destination.manifest,
  );
  assert.equal(comparison.status, "mismatch");
  assert.ok(comparison.differences.some((item) => /different content/.test(item)));
  assert.ok(
    comparison.differences.some((item) => /different encrypted bytes/.test(item)),
  );
});

test("fails closed for an incomplete R2 inventory or a missing D1 reference", async (t) => {
  const source = await fixture(t, { complete: false });
  const destination = await fixture(t);
  assert.equal(
    compareContinuityManifests(source.manifest, destination.manifest).status,
    "incomplete",
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "oe-continuity-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inventoryPath = path.join(root, "r2.json");
  const inventory = {
    schemaVersion: R2_INVENTORY_SCHEMA,
    complete: true,
    objects: [],
  };
  writeFileSync(inventoryPath, JSON.stringify(inventory));
  const missing = buildContinuityManifest({
    d1Sql: baseSql,
    r2Inventory: inventory,
    r2InventoryPath: inventoryPath,
    hmacKey: key,
    sourceLabel: "missing reference",
  });
  assert.equal(missing.r2.missingReferenceCount, 1);
  assert.equal(
    compareContinuityManifests(missing, destination.manifest).status,
    "incomplete",
  );
});

test("rejects weak keys, duplicate keys, size drift, and path traversal", async (t) => {
  const { inventoryPath } = await fixture(t);
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  assert.throws(
    () =>
      buildContinuityManifest({
        d1Sql: baseSql,
        r2Inventory: inventory,
        r2InventoryPath: inventoryPath,
        hmacKey: Buffer.alloc(8),
        sourceLabel: "weak key",
      }),
    /at least 32 bytes/,
  );

  inventory.objects.push({ ...inventory.objects[0] });
  assert.throws(
    () =>
      buildContinuityManifest({
        d1Sql: baseSql,
        r2Inventory: inventory,
        r2InventoryPath: inventoryPath,
        hmacKey: key,
        sourceLabel: "duplicate",
      }),
    /duplicate object key/,
  );

  inventory.objects.pop();
  inventory.objects[0].size += 1;
  assert.throws(
    () =>
      buildContinuityManifest({
        d1Sql: baseSql,
        r2Inventory: inventory,
        r2InventoryPath: inventoryPath,
        hmacKey: key,
        sourceLabel: "size drift",
      }),
    /size does not match/,
  );

  inventory.objects[0].size -= 1;
  inventory.objects[0].file = "../outside.bin";
  assert.throws(
    () =>
      buildContinuityManifest({
        d1Sql: baseSql,
        r2Inventory: inventory,
        r2InventoryPath: inventoryPath,
        hmacKey: key,
        sourceLabel: "traversal",
      }),
    /escapes its private export directory/,
  );
});

test("rejects comparisons produced with a different HMAC key", async (t) => {
  const source = await fixture(t);
  const destinationFixture = await fixture(t);
  const inventory = JSON.parse(
    await readFile(destinationFixture.inventoryPath, "utf8"),
  );
  const destination = buildContinuityManifest({
    d1Sql: baseSql,
    r2Inventory: inventory,
    r2InventoryPath: destinationFixture.inventoryPath,
    hmacKey: Buffer.alloc(32, 24),
    sourceLabel: "different key",
  });
  const comparison = compareContinuityManifests(source.manifest, destination);
  assert.equal(comparison.status, "mismatch");
  assert.match(comparison.differences[0], /different continuity HMAC keys/);
});

test("rejects export SQL that can reach outside the isolated database", async (t) => {
  const { inventoryPath } = await fixture(t);
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  for (const unsafeSql of [
    "ATTACH DATABASE 'private.sqlite' AS private;",
    "VACUUM INTO 'private.sqlite';",
    "SELECT load_extension('untrusted');",
    "PRAGMA writable_schema = ON;",
    "CREATE VIRTUAL TABLE files USING fts5(content);",
  ]) {
    assert.throws(
      () =>
        buildContinuityManifest({
          d1Sql: unsafeSql,
          r2Inventory: inventory,
          r2InventoryPath: inventoryPath,
          hmacKey: key,
          sourceLabel: "unsafe",
        }),
      /disallowed/,
    );
  }
  assert.doesNotThrow(() =>
    buildContinuityManifest({
      d1Sql: `${baseSql}\nINSERT INTO agreement_negotiations VALUES ('safe-attach-word', 'ATTACH is only text');`,
      r2Inventory: inventory,
      r2InventoryPath: inventoryPath,
      hmacKey: key,
      sourceLabel: "quoted words are safe",
    }),
  );
});
