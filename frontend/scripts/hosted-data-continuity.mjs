import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContinuityManifest,
  compareContinuityManifests,
} from "./hosted-data-continuity-core.mjs";

function usage() {
  return `Usage:
  node scripts/hosted-data-continuity.mjs manifest --d1-export <private.sql> --r2-inventory <private.json> --key-file <private.bin> --label <name> --output <manifest.json>
  node scripts/hosted-data-continuity.mjs compare --source <source.json> --destination <destination.json> [--output <comparison.json>]`;
}

function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(usage());
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function required(options, name) {
  if (!options[name]) throw new Error(`Missing --${name}.\n${usage()}`);
  return options[name];
}

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function assertPrivatePath(value, label) {
  const resolved = path.resolve(value);
  const relative = path.relative(repositoryRoot(), resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(
      `${label} must be stored outside the Git repository because it is private continuity evidence.`,
    );
  }
  return resolved;
}

function writeNewJson(outputPath, value) {
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function readPrivateJson(inputPath, label) {
  const source = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} must contain valid UTF-8 JSON.`);
  }
}

function createManifest(options) {
  const d1Path = assertPrivatePath(required(options, "d1-export"), "D1 export");
  const r2Path = assertPrivatePath(
    required(options, "r2-inventory"),
    "R2 inventory",
  );
  const keyPath = assertPrivatePath(required(options, "key-file"), "HMAC key");
  const outputPath = assertPrivatePath(required(options, "output"), "Manifest");
  const manifest = buildContinuityManifest({
    d1Sql: readFileSync(d1Path, "utf8"),
    r2Inventory: readPrivateJson(r2Path, "R2 inventory"),
    r2InventoryPath: r2Path,
    hmacKey: readFileSync(keyPath),
    sourceLabel: required(options, "label"),
  });
  writeNewJson(outputPath, manifest);
  console.log(
    `Private hosted-data manifest created: ${manifest.d1.totalRows} D1 row(s), ${manifest.r2.objectCount} R2 object(s), R2 inventory ${manifest.r2.complete ? "complete" : "incomplete"}.`,
  );
  if (!manifest.r2.complete || manifest.r2.missingReferenceCount > 0) {
    process.exitCode = 2;
  }
}

function compareManifests(options) {
  const sourcePath = assertPrivatePath(required(options, "source"), "Source manifest");
  const destinationPath = assertPrivatePath(
    required(options, "destination"),
    "Destination manifest",
  );
  const comparison = compareContinuityManifests(
    readPrivateJson(sourcePath, "Source manifest"),
    readPrivateJson(destinationPath, "Destination manifest"),
  );
  if (options.output) {
    writeNewJson(
      assertPrivatePath(options.output, "Comparison report"),
      comparison,
    );
  }
  console.log(`Hosted-data continuity comparison: ${comparison.status}.`);
  for (const difference of comparison.differences) {
    console.log(`- ${difference}`);
  }
  if (comparison.status !== "match") {
    process.exitCode = comparison.status === "incomplete" ? 2 : 1;
  }
}

function main() {
  const [command, ...values] = process.argv.slice(2);
  const options = parseOptions(values);
  if (command === "manifest") return createManifest(options);
  if (command === "compare") return compareManifests(options);
  throw new Error(usage());
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
