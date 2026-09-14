import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const honoPackages = Object.entries(lock.packages || {}).filter(([packagePath]) =>
  packagePath.endsWith("node_modules/hono"),
);

assert.ok(uuidPackages.length > 0, "The wallet dependency tree must contain a locked uuid package.");
for (const [packagePath, packageMetadata] of uuidPackages) {
  assert.equal(
    packageMetadata.version,
    "11.1.1",
    `${packagePath} must use the reviewed bounds-safe uuid release.`,
  );
}

assert.ok(honoPackages.length > 0, "The wallet dependency tree must contain a locked hono package.");
for (const [packagePath, packageMetadata] of honoPackages) {
  assert.equal(
    packageMetadata.version,
    "4.13.5",
    `${packagePath} must use the reviewed Hono security release.`,
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
const hono = await import("hono");
assert.equal(
  typeof hono.Hono,
  "function",
  "The transitive Hono runtime must remain importable.",
);

const queryString = (await import("query-string")).default;
const relayQuery = { "relay-protocol": "irn", symKey: "b".repeat(64), expiryTimestamp: "2000000000" };
const encoded = queryString.stringify(relayQuery);
assert.deepEqual({ ...queryString.parse(encoded) }, relayQuery, "Wallet pairing query parameters must round-trip.");
assert.equal(queryString.parse("name=Ren%C3%A9e&path=%2Frental%2F1").name, "Renée");
assert.equal(queryString.parse("name=Ren%C3%A9e&path=%2Frental%2F1").path, "/rental/1");
assert.doesNotThrow(() => queryString.parse(`invalid=${"%C2".repeat(1000)}`));

const require = createRequire(import.meta.url);
const walletUtils = Object.entries(lock.packages || {}).filter(([packagePath, metadata]) =>
  packagePath.endsWith("node_modules/@walletconnect/utils") && metadata.dependencies?.["query-string"],
);
assert.ok(walletUtils.length > 0, "The WalletConnect parser consumers must be covered.");
for (const [packagePath] of walletUtils) {
  const utilities = require(path.join(frontendRoot, packagePath));
  const parsed = utilities.parseUri(`wc:${"a".repeat(64)}@2?${encoded}`);
  assert.equal(parsed.topic, "a".repeat(64), `${packagePath} must preserve the pairing topic.`);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.symKey, relayQuery.symKey);
  assert.equal(parsed.relay.protocol, "irn");
  assert.equal(parsed.expiryTimestamp, 2000000000);
}

console.log(
  `Wallet dependency compatibility verified: ${uuidPackages.length} locked UUID path(s) use 11.1.1, ` +
    `${honoPackages.length} locked Hono path(s) use 4.13.5, ${walletUtils.length} WalletConnect parser consumers pass, connector imports pass, and undersized buffers fail closed.`,
);
