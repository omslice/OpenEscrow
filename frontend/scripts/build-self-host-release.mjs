import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import { buildCycloneDxSbom } from "./self-host-sbom-core.mjs";

const execFileAsync = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const repository = path.resolve(frontend, "..");
const allowDirty = process.argv.includes("--allow-dirty");
const skipBuild = process.argv.includes("--skip-build");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output-dir="));
const outputDirectory = path.resolve(
  outputArgument ? outputArgument.slice("--output-dir=".length) : path.join(repository, "self-host-dist"),
);

async function runNpm(arguments_, options = {}) {
  if (process.env.npm_execpath) {
    return execFileAsync(process.execPath, [process.env.npm_execpath, ...arguments_], options);
  }
  if (process.platform === "win32") {
    return execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...arguments_], options);
  }
  return execFileAsync("npm", arguments_, options);
}

if (outputDirectory === repository || outputDirectory === path.parse(outputDirectory).root) {
  throw new Error("Refusing to use a broad self-host release output directory.");
}
const { stdout: commitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
});
const sourceCommit = commitOutput.trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("Could not identify the source commit.");
const { stdout: commitDateOutput } = await execFileAsync(
  "git",
  ["show", "-s", "--format=%cI", sourceCommit],
  { cwd: repository, encoding: "utf8" },
);
const commitDate = new Date(commitDateOutput.trim()).toISOString();
const { stdout: statusOutput } = await execFileAsync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "frontend",
    "drizzle",
    "self-host",
    ".github/workflows/self-host-release.yml",
  ],
  { cwd: repository, encoding: "utf8" },
);
const sourceDirty = Boolean(statusOutput.trim());
if (sourceDirty && !allowDirty) {
  throw new Error("Refusing to create an official self-host package from uncommitted source.");
}

if (!skipBuild) {
  await runNpm(
    ["run", allowDirty ? "build:cloudflare:dev" : "build:cloudflare"],
    { cwd: frontend, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
}
if (!existsSync(path.join(frontend, "cloudflare-dist", "server", "index.js"))) {
  throw new Error("The prepared Cloudflare Worker is missing.");
}

const releaseName = `openescrow-cloudflare-self-host-${sourceCommit.slice(0, 12)}`;
const releaseDirectory = path.join(outputDirectory, releaseName);
const relativeReleasePath = path.relative(outputDirectory, releaseDirectory);
if (relativeReleasePath.startsWith("..") || path.isAbsolute(relativeReleasePath)) {
  throw new Error("Resolved self-host release directory escaped the selected output directory.");
}
await mkdir(outputDirectory, { recursive: true });
await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

async function copy(relativeSource, relativeDestination = relativeSource) {
  const source = path.join(repository, relativeSource);
  const destination = path.join(releaseDirectory, relativeDestination);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

for (const file of ["LICENSE", "CONTRIBUTING.md"]) await copy(file);
for (const file of [
  "docs/mvp-spec.md",
  "docs/privacy-threat-model.md",
  "docs/security-review.md",
  "docs/testnet-incident-response-runbook.md",
]) {
  await copy(file);
}
await copy("deployments/base-sepolia-latest.json");
await copy("deployments/base-sepolia-activity-registry.json");
await copy("drizzle");
for (const file of [
  "frontend/.env.example",
  "frontend/.gitignore",
  "frontend/.oxlintrc.json",
  "frontend/index.html",
  "frontend/package-lock.json",
  "frontend/tsconfig.app.json",
  "frontend/tsconfig.json",
  "frontend/tsconfig.node.json",
  "frontend/vite.config.ts",
]) {
  await copy(file);
}
for (const directory of [
  "frontend/cloudflare-dist",
  "frontend/public",
  "frontend/server",
  "frontend/shared",
  "frontend/src",
]) {
  await copy(directory);
}
for (const file of [
  "frontend/scripts/check-self-host-config.mjs",
  "frontend/scripts/configure-self-host.mjs",
  "frontend/scripts/generate-self-host-secrets.mjs",
  "frontend/scripts/self-host-config-core.mjs",
  "frontend/scripts/self-host-config-core.test.mjs",
  "frontend/scripts/self-host-sbom-core.mjs",
  "frontend/scripts/self-host-sbom-core.test.mjs",
]) {
  await copy(file);
}
await copy("self-host/cloudflare/README.md", "README.md");
await copy("self-host/cloudflare/BACKUP-AND-RESTORE.md", "BACKUP-AND-RESTORE.md");
await copy("self-host/cloudflare/UPGRADE.md", "UPGRADE.md");
await copy("self-host/cloudflare/SECURITY.md", "SECURITY.md");
await copy(
  "self-host/cloudflare/wrangler.template.jsonc",
  "frontend/wrangler.selfhost.template.jsonc",
);
await copy("self-host/cloudflare/prepare-self-host.mjs", "frontend/prepare-self-host.mjs");

const upstreamPackage = JSON.parse(await readFile(path.join(frontend, "package.json"), "utf8"));
const packagedPackage = {
  ...upstreamPackage,
  name: "openescrow-cloudflare-self-host",
  version: `0.0.0-${sourceCommit.slice(0, 12)}`,
  scripts: {
    dev: "vite",
    build: "tsc -b && vite build",
    "build:selfhost": "npm run build && node prepare-self-host.mjs",
    lint: "oxlint",
    "test:client-logic": "node --test --experimental-strip-types src/lib/*.test.ts scripts/*.test.mjs",
    "test:server": "node --test server/index.test.mjs",
    "test:selfhost-config": "node --test scripts/self-host-config-core.test.mjs",
    "selfhost:configure": "node scripts/configure-self-host.mjs",
    "selfhost:check": "node scripts/check-self-host-config.mjs",
    "selfhost:secrets": "node scripts/generate-self-host-secrets.mjs",
    "selfhost:dry-run":
      "npm run selfhost:check -- --require-build && wrangler deploy --dry-run --config wrangler.selfhost.jsonc",
    "selfhost:migrate":
      "wrangler d1 migrations apply DB --remote --config wrangler.selfhost.jsonc",
    "selfhost:deploy": "wrangler deploy --config wrangler.selfhost.jsonc",
  },
};
await writeFile(
  path.join(releaseDirectory, "frontend", "package.json"),
  `${JSON.stringify(packagedPackage, null, 2)}\n`,
);

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

const sourceInventoryRoots = [
  "drizzle",
  "frontend/public",
  "frontend/server",
  "frontend/shared",
  "frontend/src",
];
const sourceInventoryFiles = [
  "BACKUP-AND-RESTORE.md",
  "README.md",
  "SECURITY.md",
  "UPGRADE.md",
  "frontend/.env.example",
  "frontend/.oxlintrc.json",
  "frontend/index.html",
  "frontend/package-lock.json",
  "frontend/package.json",
  "frontend/prepare-self-host.mjs",
  "frontend/scripts/check-self-host-config.mjs",
  "frontend/scripts/configure-self-host.mjs",
  "frontend/scripts/generate-self-host-secrets.mjs",
  "frontend/scripts/self-host-config-core.mjs",
  "frontend/scripts/self-host-config-core.test.mjs",
  "frontend/scripts/self-host-sbom-core.mjs",
  "frontend/scripts/self-host-sbom-core.test.mjs",
  "frontend/tsconfig.app.json",
  "frontend/tsconfig.json",
  "frontend/tsconfig.node.json",
  "frontend/vite.config.ts",
  "frontend/wrangler.selfhost.template.jsonc",
];
for (const root of sourceInventoryRoots) {
  for (const file of await listFiles(path.join(releaseDirectory, root))) {
    sourceInventoryFiles.push(`${root}/${file}`);
  }
}
sourceInventoryFiles.sort();
const sourceFiles = {};
for (const file of sourceInventoryFiles) {
  sourceFiles[file] = await sha256(path.join(releaseDirectory, file));
}

const releaseManifest = {
  schemaVersion: "openescrow-self-host-release/v1",
  package: releaseName,
  sourceCommit,
  sourceDirty,
  generatedAt: commitDate,
  network: "base-sepolia",
  chainId: 84_532,
  contracts: {
    escrow: "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99",
    activityRegistry: "0x5ba6533811ee528f6802bb969ab01ff95d7f092e",
  },
  boundaries: {
    realMoneyEnabled: false,
    fiatOnrampEnabled: false,
    evidenceStorage: "private-r2",
  },
  sourceFiles,
};
await writeFile(
  path.join(releaseDirectory, "release-manifest.json"),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
);

const packagedLock = JSON.parse(
  await readFile(path.join(releaseDirectory, "frontend", "package-lock.json"), "utf8"),
);
const sbom = buildCycloneDxSbom(packagedLock, { commitDate, sourceCommit });
await writeFile(
  path.join(releaseDirectory, "SBOM.cdx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`,
);

const checksummedFiles = (await listFiles(releaseDirectory)).filter(
  (file) => file !== "SHA256SUMS",
);
const checksumLines = [];
for (const file of checksummedFiles) {
  checksumLines.push(`${await sha256(path.join(releaseDirectory, file))}  ${file}`);
}
await writeFile(path.join(releaseDirectory, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error(`Tar field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  writeString(buffer, offset, length, `${encoded}\0`);
}

function tarHeader(archivePath, size) {
  const header = Buffer.alloc(512);
  let name = archivePath;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf("/");
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`Path is too long for deterministic ustar output: ${archivePath}`);
    }
  }
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

const archiveParts = [];
for (const relativePath of await listFiles(releaseDirectory)) {
  const bytes = await readFile(path.join(releaseDirectory, relativePath));
  archiveParts.push(tarHeader(`${releaseName}/${relativePath}`, bytes.length), bytes);
  const padding = (512 - (bytes.length % 512)) % 512;
  if (padding) archiveParts.push(Buffer.alloc(padding));
}
archiveParts.push(Buffer.alloc(1024));
const archive = gzipSync(Buffer.concat(archiveParts), { level: 9, mtime: 0 });
const archivePath = path.join(outputDirectory, `${releaseName}.tar.gz`);
await writeFile(archivePath, archive);
const archiveHash = await sha256(archivePath);
await writeFile(`${archivePath}.sha256`, `${archiveHash}  ${path.basename(archivePath)}\n`);

const archiveStat = await stat(archivePath);
console.log(
  JSON.stringify(
    {
      releaseDirectory,
      archivePath,
      archiveSha256: archiveHash,
      archiveBytes: archiveStat.size,
      sourceCommit,
      sourceDirty,
      sbomPath: path.join(releaseDirectory, "SBOM.cdx.json"),
    },
    null,
    2,
  ),
);
