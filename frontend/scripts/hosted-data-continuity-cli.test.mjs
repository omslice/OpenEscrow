import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(
  new URL("./hosted-data-continuity.mjs", import.meta.url),
);

test("the private continuity CLI accepts Windows UTF-8 BOM JSON", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "oe-continuity-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const d1Path = path.join(root, "d1.sql");
  const r2Path = path.join(root, "r2.json");
  const keyPath = path.join(root, "key.bin");
  const outputPath = path.join(root, "manifest.json");

  await writeFile(
    d1Path,
    "CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT);\n" +
      "INSERT INTO sample VALUES ('one', 'private value');\n",
  );
  await writeFile(
    r2Path,
    `\uFEFF${JSON.stringify({
      schemaVersion: "openescrow-r2-private-export/v1",
      complete: true,
      objects: [],
    })}`,
  );
  await writeFile(keyPath, Buffer.alloc(32, 7));

  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "manifest",
    "--d1-export",
    d1Path,
    "--r2-inventory",
    r2Path,
    "--key-file",
    keyPath,
    "--label",
    "Windows export",
    "--output",
    outputPath,
  ]);
  assert.match(stdout, /1 D1 row\(s\), 0 R2 object\(s\)/);
  const manifest = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(manifest.d1.totalRows, 1);
  assert.equal(manifest.r2.complete, true);
});
