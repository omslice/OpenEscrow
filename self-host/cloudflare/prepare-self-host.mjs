import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(frontend, "..");
const clientSource = path.join(frontend, "dist");
const target = path.join(frontend, "cloudflare-dist");
const manifestPath = path.join(packageRoot, "release-manifest.json");
const releaseProvenanceSchema = "openescrow-release/v1";

if (!existsSync(clientSource)) throw new Error("Build the frontend before preparing the Worker.");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit || "")) {
  throw new Error("The self-host release manifest has no valid upstream source commit.");
}
if (!manifest.sourceFiles || typeof manifest.sourceFiles !== "object") {
  throw new Error("The self-host release manifest has no source-file inventory.");
}

let sourceDirty = manifest.sourceDirty === true;
for (const [relativePath, expectedHash] of Object.entries(manifest.sourceFiles)) {
  const absolutePath = path.resolve(packageRoot, relativePath);
  const packageRelative = path.relative(packageRoot, absolutePath);
  if (packageRelative.startsWith("..") || path.isAbsolute(packageRelative)) {
    throw new Error(`Unsafe source inventory path: ${relativePath}`);
  }
  try {
    const bytes = await readFile(absolutePath);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) sourceDirty = true;
  } catch {
    sourceDirty = true;
  }
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(clientSource, path.join(target, "client"), { recursive: true });
await cp(path.join(frontend, "server"), path.join(target, "server"), {
  recursive: true,
  filter: (source) => !source.endsWith("index.test.mjs"),
});
await cp(path.join(frontend, "shared"), path.join(target, "shared"), { recursive: true });
await writeFile(
  path.join(target, "server", "release-provenance.js"),
  `export const RELEASE_PROVENANCE_SCHEMA = ${JSON.stringify(releaseProvenanceSchema)};

export const RELEASE_PROVENANCE = Object.freeze({
  schemaVersion: RELEASE_PROVENANCE_SCHEMA,
  commitSha: ${JSON.stringify(manifest.sourceCommit)},
  sourceDirty: ${JSON.stringify(sourceDirty)},
  selfHosted: true,
});
`,
);
await writeFile(
  path.join(target, "release-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: releaseProvenanceSchema,
      commitSha: manifest.sourceCommit,
      sourceDirty,
      selfHosted: true,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Self-host Worker prepared from upstream ${manifest.sourceCommit}${sourceDirty ? " with local modifications" : ""}.`,
);
