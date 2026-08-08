import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const repository = path.resolve(frontend, "..");
const provenancePath = path.join(
  frontend,
  "cloudflare-dist",
  "server",
  "release-provenance.js",
);
const allowDirty = process.argv.includes("--allow-dirty");
const expectedSchema = "openescrow-release/v1";

await access(provenancePath);
const { stdout: commitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
});
const expectedCommitSha = commitOutput.trim();
const packagedModule = await import(`${pathToFileURL(provenancePath).href}?t=${Date.now()}`);
const packaged = packagedModule.RELEASE_PROVENANCE;

if (packaged?.schemaVersion !== expectedSchema) {
  throw new Error(`Cloudflare provenance schema is invalid: ${packaged?.schemaVersion || "missing"}.`);
}
if (packaged.commitSha !== expectedCommitSha) {
  throw new Error(
    `Cloudflare package commit ${packaged.commitSha || "missing"} does not match ${expectedCommitSha}.`,
  );
}
if (packaged.sourceDirty && !allowDirty) {
  throw new Error("Cloudflare release provenance identifies uncommitted source.");
}

console.log(
  `Cloudflare release provenance verified: ${expectedCommitSha}${packaged.sourceDirty ? " (development only)" : ""}`,
);
