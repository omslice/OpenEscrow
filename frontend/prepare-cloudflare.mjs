import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const frontend = dirname(fileURLToPath(import.meta.url));
const repository = resolve(frontend, "..");
const clientSource = join(frontend, "dist");
const target = join(frontend, "cloudflare-dist");
const allowDirty = process.argv.includes("--allow-dirty");
const execFileAsync = promisify(execFile);
const releaseProvenanceSchema = "openescrow-release/v1";

if (dirname(target) !== frontend || target !== join(frontend, "cloudflare-dist")) {
  throw new Error("Refusing to prepare a Cloudflare build outside frontend/cloudflare-dist.");
}
if (!existsSync(clientSource)) {
  throw new Error("Build the frontend before preparing the Cloudflare package.");
}

const { stdout: commitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
});
const commitSha = commitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  throw new Error("Could not determine the exact Git commit for the Cloudflare package.");
}

const { stdout: sourceStatus } = await execFileAsync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all", "--", "frontend", "drizzle"],
  { cwd: repository, encoding: "utf8" },
);
const sourceDirty = Boolean(sourceStatus.trim());
if (sourceDirty && !allowDirty) {
  throw new Error(
    "Refusing to package Cloudflare from uncommitted frontend or migration source.",
  );
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(clientSource, join(target, "client"), { recursive: true });
await cp(join(frontend, "server"), join(target, "server"), {
  recursive: true,
  filter: (source) => !source.endsWith("index.test.mjs"),
});
await cp(join(frontend, "shared"), join(target, "shared"), { recursive: true });
await writeFile(
  join(target, "server", "release-provenance.js"),
  `export const RELEASE_PROVENANCE_SCHEMA = ${JSON.stringify(releaseProvenanceSchema)};

export const RELEASE_PROVENANCE = Object.freeze({
  schemaVersion: RELEASE_PROVENANCE_SCHEMA,
  commitSha: ${JSON.stringify(commitSha)},
  sourceDirty: ${JSON.stringify(sourceDirty)},
});
`,
);
await writeFile(
  join(target, "release-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: releaseProvenanceSchema,
      commitSha,
      sourceDirty,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Cloudflare package prepared for ${commitSha}${sourceDirty ? " (dirty development source)" : ""}.`,
);
