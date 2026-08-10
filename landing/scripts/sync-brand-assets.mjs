import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(landingRoot, "..");
const sourceRoot = resolve(repositoryRoot, "frontend", "public");
const targetRoot = resolve(landingRoot, "public");
const brandAssets = [
  "favicon.svg",
  "openescrow-logo.svg",
  "openescrow-wordmark.svg",
];

await mkdir(targetRoot, { recursive: true });
await Promise.all(
  brandAssets.map((asset) =>
    cp(resolve(sourceRoot, asset), resolve(targetRoot, asset)),
  ),
);

console.log(`Synchronized ${brandAssets.length} canonical OpenEscrow brand assets.`);
