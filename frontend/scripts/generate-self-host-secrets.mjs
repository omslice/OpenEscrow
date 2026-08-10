import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.find((argument) => argument.startsWith("--output="));
if (!outputFlag) {
  throw new Error(
    "Provide --output=<absolute path outside the app directory> for the private recovery file.",
  );
}
const output = path.resolve(outputFlag.slice("--output=".length));
const relative = path.relative(frontend, output);
if (!path.isAbsolute(outputFlag.slice("--output=".length)) || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
  throw new Error("The recovery file must be an absolute path outside the frontend directory.");
}
if (existsSync(output)) throw new Error(`Refusing to overwrite existing recovery file: ${output}`);

const keyId = `selfhost-${new Date().toISOString().slice(0, 10)}`;
const secrets = {
  EVIDENCE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  EVIDENCE_ENCRYPTION_KEY_ID: keyId,
  ADDRESS_ATTESTATION_SECRET: randomBytes(32).toString("base64url"),
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(secrets, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
console.log(`Private recovery file created: ${output}`);
console.log("Keep it out of source control and store an encrypted offline copy before uploading it.");
console.log(
  `Upload only when ready: npx wrangler secret bulk ${JSON.stringify(output)} --config wrangler.selfhost.jsonc`,
);
