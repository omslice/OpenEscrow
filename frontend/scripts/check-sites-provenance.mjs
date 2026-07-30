import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const frontend = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(frontend, "..", "..");
const provenancePath = path.join(
  repository,
  "dist",
  "server",
  "release-provenance.js",
);
const expectedSchema = "openescrow-release/v1";

await access(provenancePath);
const { stdout: commitOutput } = await execFileAsync(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repository, encoding: "utf8" },
);
const expectedCommitSha = commitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(expectedCommitSha)) {
  throw new Error("Could not determine the exact Git commit for provenance validation.");
}

const packagedModule = await import(pathToFileURL(provenancePath).href);
const packaged = packagedModule.RELEASE_PROVENANCE;
if (packaged?.schemaVersion !== expectedSchema) {
  throw new Error(
    `Packaged release provenance schema is invalid: ${packaged?.schemaVersion || "missing"}.`,
  );
}
if (packaged.commitSha !== expectedCommitSha) {
  throw new Error(
    `Packaged release commit ${packaged.commitSha || "missing"} does not match source ${expectedCommitSha}.`,
  );
}

console.log(`Sites release provenance verified: ${expectedCommitSha}`);
