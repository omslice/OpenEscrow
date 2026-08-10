import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const landing = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(landing, "..");
const dist = join(landing, "dist");
const allowDirty = process.argv.includes("--allow-dirty");
const schemaVersion = "openescrow-landing-release/v1";

const { stdout: commitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
});
const commitSha = commitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  throw new Error("Could not determine the landing release commit.");
}

const { stdout: commitDateOutput } = await execFileAsync(
  "git",
  ["show", "-s", "--format=%cI", commitSha],
  { cwd: repository, encoding: "utf8" },
);
const commitDate = commitDateOutput.trim();
if (!Number.isFinite(Date.parse(commitDate))) {
  throw new Error("Could not determine the landing release commit timestamp.");
}

const { stdout: sourceStatus } = await execFileAsync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "landing",
    "frontend/public/favicon.svg",
    "frontend/public/openescrow-logo.svg",
    "frontend/public/openescrow-wordmark.svg",
  ],
  { cwd: repository, encoding: "utf8" },
);
const sourceDirty = Boolean(sourceStatus.trim());
if (sourceDirty && !allowDirty) {
  throw new Error("Refusing to package the landing page from uncommitted landing or brand source.");
}

await mkdir(dist, { recursive: true });
await writeFile(
  join(dist, "release.json"),
  `${JSON.stringify(
    {
      schemaVersion,
      commitSha,
      commitDate,
      sourceDirty,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Landing release provenance prepared for ${commitSha}${sourceDirty ? " (development only)" : ""}.`,
);
