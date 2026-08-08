import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const frontend = dirname(fileURLToPath(import.meta.url));
const repository = resolve(frontend, "..");
const source = join(frontend, "dist");
const target = join(repository, "dist");
const execFileAsync = promisify(execFile);
const releaseProvenanceSchema = "openescrow-release/v1";

if (dirname(target) !== repository || target !== join(repository, "dist")) {
  throw new Error("Refusing to prepare a Sites build outside the repository dist directory.");
}

const { stdout: commitOutput } = await execFileAsync(
  "git",
  ["rev-parse", "HEAD"],
  { cwd: repository, encoding: "utf8" },
);
const commitSha = commitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  throw new Error("Could not determine the exact Git commit for the Sites package.");
}
const { stdout: sourceStatus } = await execFileAsync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "frontend",
    ".openai/hosting.json",
    "drizzle",
  ],
  { cwd: repository, encoding: "utf8" },
);
if (sourceStatus.trim()) {
  throw new Error(
    "Refusing to package Sites from uncommitted frontend, hosting, or migration source.",
  );
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
if (existsSync(join(frontend, "package.json"))) {
  await cp(join(frontend, "package.json"), join(target, "package.json"));
}
await cp(source, join(target, "client"), { recursive: true });
await cp(join(frontend, "server"), join(target, "server"), { recursive: true });
const serverTarget = join(target, "server");
await writeFile(
  join(serverTarget, "release-provenance.js"),
  `export const RELEASE_PROVENANCE_SCHEMA = ${JSON.stringify(releaseProvenanceSchema)};

export const RELEASE_PROVENANCE = Object.freeze({
  schemaVersion: RELEASE_PROVENANCE_SCHEMA,
  commitSha: ${JSON.stringify(commitSha)},
  sourceDirty: false,
});
`,
);
const serverEntries = await readdir(serverTarget, { recursive: true, withFileTypes: true });
for (const entry of serverEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const sourcePath = join(entry.parentPath || serverTarget, entry.name);
  let serverSource = await readFile(sourcePath, "utf8");
  const packagedServerSource = serverSource.replaceAll("../shared/", "./shared/");
  if (sourcePath.endsWith("index.js") && packagedServerSource === serverSource) {
    throw new Error("The Sites server entrypoint did not contain the expected shared imports.");
  }
  if (packagedServerSource !== serverSource) {
    await writeFile(sourcePath, packagedServerSource);
  }
}
await rm(join(serverTarget, "index.test.mjs"), { force: true });
await cp(join(frontend, "shared"), join(target, "server", "shared"), {
  recursive: true,
});
await mkdir(join(target, ".openai"), { recursive: true });
await cp(
  join(repository, ".openai", "hosting.json"),
  join(target, ".openai", "hosting.json"),
);
await cp(join(repository, "drizzle"), join(target, ".openai", "drizzle"), {
  recursive: true,
});
