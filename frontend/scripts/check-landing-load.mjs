import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4179;
const baseUrl = `http://${host}:${port}`;
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const assetsRoot = path.join(frontendRoot, "dist", "assets");
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The production preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

function observeLocalScripts(page) {
  const assetNames = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === baseUrl &&
      url.pathname.startsWith("/assets/") &&
      url.pathname.endsWith(".js")
    ) {
      assetNames.add(path.basename(url.pathname));
    }
  });
  return assetNames;
}

async function totalAssetBytes(assetNames) {
  const sizes = await Promise.all(
    [...assetNames].map(async (assetName) => (await stat(path.join(assetsRoot, assetName))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

const server = spawn(
  process.execPath,
  [
    viteEntrypoint,
    "preview",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: frontendRoot,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const landingContext = await browser.newContext();
  const landingPage = await landingContext.newPage();
  const landingAssets = observeLocalScripts(landingPage);
  await landingPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await landingPage
    .getByRole("heading", { name: "A better way to handle rental deposits." })
    .waitFor({ state: "visible" });
  await landingPage.waitForTimeout(1_500);

  const jurisdictionAsset = [...landingAssets].find((assetName) =>
    assetName.startsWith("jurisdictions-"),
  );
  assert.equal(
    jurisdictionAsset,
    undefined,
    "The public landing page must not preload the U.S. jurisdiction registry.",
  );
  assert.ok(
    landingAssets.size <= 62,
    `The public landing page loaded ${landingAssets.size} JavaScript files; expected at most 62.`,
  );
  const landingBytes = await totalAssetBytes(landingAssets);
  assert.ok(
    landingBytes <= 2_450_000,
    `The public landing page loaded ${landingBytes} JavaScript bytes; expected at most 2450000.`,
  );
  await landingContext.close();

  const linkedContext = await browser.newContext();
  const linkedPage = await linkedContext.newPage();
  const linkedAssets = observeLocalScripts(linkedPage);
  await linkedPage.goto(`${baseUrl}/?id=43&jurisdiction=us-ca`, {
    waitUntil: "domcontentloaded",
  });
  await linkedPage.waitForFunction(
    () => window.localStorage.getItem("openescrow:jurisdiction:43") === "us-ca",
  );
  assert.equal(
    [...linkedAssets].some((assetName) => assetName.startsWith("jurisdictions-")),
    true,
    "An agreement link with a jurisdiction hint must load and apply the registry on demand.",
  );
  await linkedContext.close();

  console.log(
    `Landing-load check passed: ${landingAssets.size} JavaScript file(s), ${landingBytes} bytes, no eager jurisdiction registry; agreement links load it on demand.`,
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
