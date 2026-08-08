import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "--source";
const root = mode === "--dist" ? resolve(landingRoot, "dist") : landingRoot;
const htmlPath = resolve(root, "index.html");
const cssPath =
  mode === "--dist"
    ? null
    : resolve(landingRoot, "src", "styles.css");
const jsPath =
  mode === "--dist" ? null : resolve(landingRoot, "src", "main.js");
const errors = [];

if (!existsSync(htmlPath)) {
  errors.push(`${mode === "--dist" ? "Built" : "Source"} index.html is missing.`);
} else {
  const html = readFileSync(htmlPath, "utf8");
  const requiredText = [
    "Rental deposits deserve a clearer path.",
    "Try the testnet MVP",
    "Three clear steps. One shared record.",
    "Private details, public verification",
    "Test tokens only",
    "0x0C33BC6449d134782a95167658303F9d87dd7D79",
  ];
  for (const text of requiredText) {
    if (!html.includes(text)) errors.push(`Landing page is missing required copy: ${text}`);
  }
  for (const element of ["<header", "<nav", "<main", "<footer", "<h1"]) {
    if (!html.includes(element)) errors.push(`Landing page is missing ${element}.`);
  }
  if (!html.includes('class="skip-link"') || !html.includes('href="#main-content"')) {
    errors.push("Landing page is missing its keyboard skip link.");
  }
  if (!html.includes("openescrow-wordmark.svg")) {
    errors.push("Landing page is not using the canonical OpenEscrow wordmark.");
  }
  if (!html.includes("https://github.com/omslice/OpenEscrow")) {
    errors.push("Landing page source-code link is missing or unconfirmed.");
  }
  if (!html.includes("https://openescrow-demo.omrigross.chatgpt.site/")) {
    errors.push("Landing page must retain the verified Sites MVP as its default fallback link.");
  }
  if (!html.includes('data-openescrow-meta="social-image"') || !html.includes("/og.png")) {
    errors.push("Landing page is missing its branded social-preview metadata.");
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(match[1])) errors.push(`Hash link #${match[1]} has no matching target.`);
  }
  if (/(?:api[_-]?key|private[_-]?key|secret|password)\s*[=:]\s*["'][^"']{12,}/i.test(html)) {
    errors.push("Landing HTML appears to contain secret material.");
  }
}

if (mode === "--source") {
  const css = readFileSync(cssPath, "utf8");
  const js = readFileSync(jsPath, "utf8");
  for (const token of ["#8522cc", "#08060d", "prefers-color-scheme", "prefers-reduced-motion"]) {
    if (!css.toLowerCase().includes(token)) errors.push(`Landing styles are missing ${token}.`);
  }
  if (!css.includes(":focus-visible") || !css.includes("min-height: 44px")) {
    errors.push("Landing styles are missing visible focus or minimum touch-target coverage.");
  }
  if (!js.includes("VITE_MVP_URL") || !js.includes("navigator.clipboard")) {
    errors.push("Landing runtime configuration or donation-copy recovery is missing.");
  }
  for (const asset of ["favicon.svg", "openescrow-logo.svg", "openescrow-wordmark.svg"]) {
    if (!existsSync(resolve(landingRoot, "public", asset))) {
      errors.push(`Synchronized brand asset ${asset} is missing.`);
    }
  }
  const socialImage = resolve(landingRoot, "public", "og.png");
  if (!existsSync(socialImage) || statSync(socialImage).size < 100_000) {
    errors.push("Landing social preview is missing or unexpectedly small.");
  }
  const packageJson = JSON.parse(readFileSync(resolve(landingRoot, "package.json"), "utf8"));
  if (Object.keys(packageJson.dependencies || {}).length > 0) {
    errors.push("Landing page must not have runtime package dependencies.");
  }
  const workerConfig = JSON.parse(
    readFileSync(resolve(landingRoot, "wrangler.jsonc"), "utf8"),
  );
  if (workerConfig.d1_databases || workerConfig.r2_buckets || workerConfig.vars) {
    errors.push("Landing Worker must not declare D1, R2, or runtime variables.");
  }
  const deployTargets = [workerConfig, ...Object.values(workerConfig.env || {})];
  if (
    deployTargets.some(
      (target) =>
        target?.workers_dev !== false ||
        target?.preview_urls !== false ||
        target?.routes ||
        target?.route,
    )
  ) {
    errors.push(
      "Retired landing deployments must disable workers.dev, preview URLs, and public routes.",
    );
  }
  if (workerConfig.assets?.binding !== "ASSETS") {
    errors.push("Landing Worker is missing its static ASSETS binding.");
  }
}

if (mode === "--dist") {
  const assetsRoot = resolve(root, "assets");
  if (!existsSync(assetsRoot)) errors.push("Built landing assets directory is missing.");
  for (const asset of ["favicon.svg", "openescrow-logo.svg", "openescrow-wordmark.svg", "og.png"]) {
    const assetPath = resolve(root, asset);
    if (!existsSync(assetPath) || statSync(assetPath).size === 0) {
      errors.push(`Built brand asset ${asset} is missing or empty.`);
    }
  }
  const releasePath = resolve(root, "release.json");
  if (!existsSync(releasePath)) {
    errors.push("Built landing release provenance is missing.");
  } else {
    const release = JSON.parse(readFileSync(releasePath, "utf8"));
    if (release.schemaVersion !== "openescrow-landing-release/v1") {
      errors.push("Built landing release provenance schema is invalid.");
    }
    if (!/^[0-9a-f]{40}$/.test(release.commitSha || "")) {
      errors.push("Built landing release commit is invalid.");
    }
    if (typeof release.sourceDirty !== "boolean") {
      errors.push("Built landing release dirty-source status is missing.");
    }
  }
}

if (errors.length) {
  console.error("OpenEscrow landing check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`OpenEscrow landing ${mode === "--dist" ? "build" : "source"} verified.`);
}
