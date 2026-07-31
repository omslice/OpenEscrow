import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const lock = JSON.parse(
  readFileSync(path.join(frontendRoot, "package-lock.json"), "utf8"),
);
const uuidPackages = Object.entries(lock.packages || {}).filter(([packagePath]) =>
  packagePath.endsWith("node_modules/uuid"),
);

assert.ok(uuidPackages.length > 0, "The wallet dependency tree must contain a locked uuid package.");
for (const [packagePath, packageMetadata] of uuidPackages) {
  assert.equal(
    packageMetadata.version,
    "11.1.1",
    `${packagePath} must use the reviewed bounds-safe uuid release.`,
  );
}

const uuid = await import("uuid");
const generated = uuid.v4();
assert.equal(uuid.validate(generated), true, "UUID generation must remain valid.");
assert.equal(uuid.version(generated), 4, "The generated wallet UUID must remain version 4.");
assert.throws(
  () => uuid.v5("openescrow", uuid.v5.URL, new Uint8Array(4), 0),
  /out of buffer bounds/i,
  "The installed UUID implementation must reject an undersized output buffer.",
);

const metamaskSdk = await import("@metamask/sdk");
assert.equal(
  typeof metamaskSdk.MetaMaskSDK,
  "function",
  "The transitive MetaMask connector must remain importable.",
);
const communicationLayer = await import("@metamask/sdk-communication-layer");
assert.ok(
  Object.keys(communicationLayer).length > 0,
  "The MetaMask communication layer must remain importable.",
);

console.log(
  `Wallet dependency compatibility verified: ${uuidPackages.length} locked UUID path(s) use 11.1.1, connector imports pass, and undersized buffers fail closed.`,
);
