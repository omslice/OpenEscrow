import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CONTINUITY_MANIFEST_SCHEMA =
  "openescrow-hosted-data-continuity/v1";
export const CONTINUITY_COMPARISON_SCHEMA =
  "openescrow-hosted-data-comparison/v1";
export const R2_INVENTORY_SCHEMA = "openescrow-r2-private-export/v1";

const MINIMUM_HMAC_KEY_BYTES = 32;
const MAXIMUM_DIFFERENCES = 100;

function checkedHmacKey(value) {
  const key = Buffer.from(value || []);
  if (key.byteLength < MINIMUM_HMAC_KEY_BYTES) {
    throw new Error(
      `The continuity HMAC key must contain at least ${MINIMUM_HMAC_KEY_BYTES} bytes.`,
    );
  }
  return key;
}

function addFramedValue(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

function keyedDigest(key, domain, values) {
  const hash = createHmac("sha256", key);
  addFramedValue(hash, domain);
  for (const value of values) addFramedValue(hash, value);
  return `hmac-sha256:${hash.digest("hex")}`;
}

function canonicalScalar(value) {
  if (value === null) return "null";
  if (typeof value === "bigint") return `integer:${value}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("The D1 export contains a non-finite numeric value.");
    }
    return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
  }
  if (typeof value === "string") {
    return `text:${Buffer.byteLength(value, "utf8")}:${value}`;
  }
  if (value instanceof Uint8Array) {
    return `blob:${Buffer.from(value).toString("base64")}`;
  }
  throw new Error(`Unsupported SQLite value type: ${typeof value}.`);
}

function canonicalRow(row, columns) {
  return JSON.stringify(
    columns.map((column) => [column, canonicalScalar(row[column])]),
  );
}

function normalizeSchemaSql(value) {
  const sql = String(value || "");
  let normalized = "";
  let quote = null;
  let pendingSpace = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      normalized += character;
      if (quote === "[" && character === "]") {
        quote = null;
      } else if (character === quote) {
        if (sql[index + 1] === quote) {
          normalized += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      if (pendingSpace && normalized.length > 0) normalized += " ";
      pendingSpace = false;
      quote = character;
      normalized += character;
      continue;
    }
    if (character === "[") {
      if (pendingSpace && normalized.length > 0) normalized += " ";
      pendingSpace = false;
      quote = "[";
      normalized += character;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) normalized += " ";
    pendingSpace = false;
    normalized += character;
  }
  return normalized.trim();
}

function sqlControlText(value) {
  const sql = String(value || "");
  let output = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        output += " ";
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
        output += " ";
      }
      continue;
    }
    if (quote) {
      if (quote === "[" && character === "]") {
        quote = null;
      } else if (character === quote) {
        if (sql[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      output += " ";
      continue;
    }
    if (character === "[") {
      quote = "[";
      output += " ";
      continue;
    }
    output += character;
  }
  return output.replaceAll(/\s+/g, " ").toUpperCase();
}

function assertSafeD1Export(sql) {
  const controlText = sqlControlText(sql);
  const blocked = [
    [/\bATTACH\b/, "ATTACH"],
    [/\bDETACH\b/, "DETACH"],
    [/\bVACUUM\b[^;]*\bINTO\b/, "VACUUM INTO"],
    [/\bLOAD_EXTENSION\b/, "load_extension"],
    [/\bWRITABLE_SCHEMA\b/, "writable_schema"],
    [/\bCREATE\s+VIRTUAL\s+TABLE\b/, "CREATE VIRTUAL TABLE"],
  ];
  const match = blocked.find(([pattern]) => pattern.test(controlText));
  if (match) {
    throw new Error(`The D1 export contains disallowed ${match[1]} SQL.`);
  }
}

function quotedIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function statementRows(statement) {
  statement.setReadBigInts?.(true);
  return statement.all();
}

function tableExists(database, tableName) {
  return Boolean(
    database
      .prepare(
        "SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName),
  );
}

function referencedR2Keys(database) {
  if (!tableExists(database, "evidence_files")) return [];
  const rows = statementRows(
    database.prepare(
      `SELECT object_key
         FROM evidence_files
        WHERE storage_kind IN ('private-r2', 'encrypted-r2')
          AND object_key IS NOT NULL`,
    ),
  );
  return [
    ...new Set(
      rows
        .map((row) => String(row.object_key || ""))
        .filter((objectKey) => objectKey.length > 0),
    ),
  ].sort();
}

function buildD1Manifest(database, hmacKey) {
  const schemaObjects = database
    .prepare(
      `SELECT type, name, tbl_name, sql
         FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%'
          AND sql IS NOT NULL
        ORDER BY type, name`,
    )
    .all();
  const schemaDigest = keyedDigest(
    hmacKey,
    "openescrow-continuity/d1-schema/v1",
    schemaObjects.map((item) =>
      JSON.stringify([
        item.type,
        item.name,
        item.tbl_name,
        normalizeSchemaSql(item.sql),
      ]),
    ),
  );
  const tableNames = schemaObjects
    .filter((item) => item.type === "table")
    .map((item) => String(item.name))
    .sort();
  const tables = [];
  let totalRows = 0;

  for (const tableName of tableNames) {
    const statement = database.prepare(
      `SELECT * FROM ${quotedIdentifier(tableName)}`,
    );
    const columns = statement.columns().map((column) => column.name);
    const rows = statementRows(statement)
      .map((row) => canonicalRow(row, columns))
      .sort();
    totalRows += rows.length;
    tables.push({
      name: tableName,
      rowCount: rows.length,
      contentDigest: keyedDigest(
        hmacKey,
        `openescrow-continuity/d1-table/v1/${tableName}`,
        [JSON.stringify(columns), ...rows],
      ),
    });
  }

  return {
    complete: true,
    schemaDigest,
    tableCount: tables.length,
    totalRows,
    tables,
  };
}

function resolvePrivateObjectPath(inventoryPath, relativeFile) {
  if (!relativeFile || typeof relativeFile !== "string") {
    throw new Error("Every R2 inventory object must declare a relative file path.");
  }
  if (path.isAbsolute(relativeFile)) {
    throw new Error("R2 inventory object file paths must be relative.");
  }
  const inventoryRoot = path.dirname(path.resolve(inventoryPath));
  const objectPath = path.resolve(inventoryRoot, relativeFile);
  const relative = path.relative(inventoryRoot, objectPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("An R2 inventory object path escapes its private export directory.");
  }
  return objectPath;
}

function buildR2Manifest({ inventory, inventoryPath, hmacKey, referencedKeys }) {
  if (inventory?.schemaVersion !== R2_INVENTORY_SCHEMA) {
    throw new Error(`R2 inventory must use ${R2_INVENTORY_SCHEMA}.`);
  }
  if (typeof inventory.complete !== "boolean") {
    throw new Error("R2 inventory must explicitly declare whether it is complete.");
  }
  if (!Array.isArray(inventory.objects)) {
    throw new Error("R2 inventory objects must be an array.");
  }

  const rawKeys = new Set();
  const objects = [];
  let totalBytes = 0;
  for (const item of inventory.objects) {
    const objectKey = typeof item?.key === "string" ? item.key : "";
    if (!objectKey) throw new Error("Every R2 inventory object must have a key.");
    if (rawKeys.has(objectKey)) {
      throw new Error("R2 inventory contains a duplicate object key.");
    }
    rawKeys.add(objectKey);
    const bytes = readFileSync(resolvePrivateObjectPath(inventoryPath, item.file));
    if (item.size !== undefined && item.size !== bytes.byteLength) {
      throw new Error("An R2 inventory object size does not match its exported file.");
    }
    totalBytes += bytes.byteLength;
    objects.push({
      identifierDigest: keyedDigest(
        hmacKey,
        "openescrow-continuity/r2-object-key/v1",
        [objectKey],
      ),
      size: bytes.byteLength,
      contentDigest: keyedDigest(
        hmacKey,
        "openescrow-continuity/r2-object-content/v1",
        [bytes],
      ),
    });
  }
  objects.sort((left, right) =>
    left.identifierDigest.localeCompare(right.identifierDigest),
  );

  const missingReferenceDigests = referencedKeys
    .filter((objectKey) => !rawKeys.has(objectKey))
    .map((objectKey) =>
      keyedDigest(
        hmacKey,
        "openescrow-continuity/r2-object-key/v1",
        [objectKey],
      ),
    )
    .sort();

  return {
    complete: inventory.complete,
    objectCount: objects.length,
    totalBytes,
    referencedObjectCount: referencedKeys.length,
    missingReferenceCount: missingReferenceDigests.length,
    missingReferenceDigests,
    objects,
  };
}

export function buildContinuityManifest({
  d1Sql,
  r2Inventory,
  r2InventoryPath,
  hmacKey: rawHmacKey,
  sourceLabel,
  generatedAt = new Date().toISOString(),
}) {
  if (!d1Sql || typeof d1Sql !== "string") {
    throw new Error("A complete D1 SQL export is required.");
  }
  if (!sourceLabel || typeof sourceLabel !== "string") {
    throw new Error("A private source label is required.");
  }
  assertSafeD1Export(d1Sql);
  const hmacKey = checkedHmacKey(rawHmacKey);
  const database = new DatabaseSync(":memory:", { allowExtension: false });
  try {
    database.enableLoadExtension?.(false);
    database.exec(d1Sql);
    const referencedKeys = referencedR2Keys(database);
    return {
      schemaVersion: CONTINUITY_MANIFEST_SCHEMA,
      generatedAt,
      sourceLabel: sourceLabel.trim().slice(0, 120),
      digestKeyId: keyedDigest(
        hmacKey,
        "openescrow-continuity/key-id/v1",
        ["hosted-data"],
      ),
      d1: buildD1Manifest(database, hmacKey),
      r2: buildR2Manifest({
        inventory: r2Inventory,
        inventoryPath: r2InventoryPath,
        hmacKey,
        referencedKeys,
      }),
    };
  } finally {
    database.close();
  }
}

function addDifference(differences, value) {
  if (differences.length < MAXIMUM_DIFFERENCES) differences.push(value);
}

function mapBy(items, key) {
  return new Map(items.map((item) => [item[key], item]));
}

export function compareContinuityManifests(source, destination) {
  for (const [label, manifest] of [
    ["Source", source],
    ["Destination", destination],
  ]) {
    if (manifest?.schemaVersion !== CONTINUITY_MANIFEST_SCHEMA) {
      throw new Error(`${label} manifest must use ${CONTINUITY_MANIFEST_SCHEMA}.`);
    }
  }

  const differences = [];
  if (source.digestKeyId !== destination.digestKeyId) {
    addDifference(
      differences,
      "The manifests were generated with different continuity HMAC keys.",
    );
  }
  if (source.d1?.complete !== true || destination.d1?.complete !== true) {
    addDifference(differences, "One or both D1 exports are incomplete.");
  }
  if (source.d1?.schemaDigest !== destination.d1?.schemaDigest) {
    addDifference(differences, "D1 schema fingerprints differ.");
  }

  const sourceTables = mapBy(source.d1?.tables || [], "name");
  const destinationTables = mapBy(destination.d1?.tables || [], "name");
  for (const tableName of [
    ...new Set([...sourceTables.keys(), ...destinationTables.keys()]),
  ].sort()) {
    const sourceTable = sourceTables.get(tableName);
    const destinationTable = destinationTables.get(tableName);
    if (!sourceTable || !destinationTable) {
      addDifference(differences, `D1 table ${tableName} exists on only one side.`);
      continue;
    }
    if (sourceTable.rowCount !== destinationTable.rowCount) {
      addDifference(differences, `D1 table ${tableName} has a different row count.`);
    }
    if (sourceTable.contentDigest !== destinationTable.contentDigest) {
      addDifference(differences, `D1 table ${tableName} has different content.`);
    }
  }

  const r2Complete =
    source.r2?.complete === true && destination.r2?.complete === true;
  if (!r2Complete) {
    addDifference(differences, "One or both R2 inventories are incomplete.");
  }
  if (
    Number(source.r2?.missingReferenceCount || 0) > 0 ||
    Number(destination.r2?.missingReferenceCount || 0) > 0
  ) {
    addDifference(
      differences,
      "One or both R2 inventories omit objects referenced by D1 evidence metadata.",
    );
  }
  const sourceObjects = mapBy(source.r2?.objects || [], "identifierDigest");
  const destinationObjects = mapBy(
    destination.r2?.objects || [],
    "identifierDigest",
  );
  for (const identifier of [
    ...new Set([...sourceObjects.keys(), ...destinationObjects.keys()]),
  ].sort()) {
    const sourceObject = sourceObjects.get(identifier);
    const destinationObject = destinationObjects.get(identifier);
    if (!sourceObject || !destinationObject) {
      addDifference(
        differences,
        `R2 object ${identifier.slice(0, 28)}… exists on only one side.`,
      );
      continue;
    }
    if (sourceObject.size !== destinationObject.size) {
      addDifference(
        differences,
        `R2 object ${identifier.slice(0, 28)}… has a different size.`,
      );
    }
    if (sourceObject.contentDigest !== destinationObject.contentDigest) {
      addDifference(
        differences,
        `R2 object ${identifier.slice(0, 28)}… has different encrypted bytes.`,
      );
    }
  }

  const incomplete =
    !r2Complete ||
    source.d1?.complete !== true ||
    destination.d1?.complete !== true ||
    Number(source.r2?.missingReferenceCount || 0) > 0 ||
    Number(destination.r2?.missingReferenceCount || 0) > 0;
  return {
    schemaVersion: CONTINUITY_COMPARISON_SCHEMA,
    comparedAt: new Date().toISOString(),
    status: incomplete
      ? "incomplete"
      : differences.length === 0
        ? "match"
        : "mismatch",
    source: {
      label: source.sourceLabel,
      generatedAt: source.generatedAt,
    },
    destination: {
      label: destination.sourceLabel,
      generatedAt: destination.generatedAt,
    },
    differences,
  };
}
