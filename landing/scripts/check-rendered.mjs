import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const landingRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = 4187;
const baseUrl = `http://${host}:${port}`;
const viteEntrypoint = resolve(landingRoot, "node_modules", "vite", "bin", "vite.js");
const assetsRoot = resolve(landingRoot, "dist", "assets");

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local production preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function isolateFromExternalServices(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) {
      await route.continue();
    } else {
      await route.abort("failed");
    }
  });
}

function observeLocalAssets(page) {
  const assets = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === baseUrl && url.pathname.startsWith("/assets/")) {
      assets.add(url.pathname.slice("/assets/".length));
    }
  });
  return assets;
}

const server = spawn(
  process.execPath,
  [viteEntrypoint, "preview", "--host", host, "--port", String(port), "--strictPort"],
  { cwd: landingRoot, stdio: ["ignore", "pipe", "pipe"] },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 980 },
    colorScheme: "dark",
  });
  await isolateFromExternalServices(desktopContext);
  await desktopContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseUrl,
  });
  const desktopPage = await desktopContext.newPage();
  const loadedAssets = observeLocalAssets(desktopPage);
  await desktopPage.goto(baseUrl, { waitUntil: "networkidle" });

  await desktopPage
    .getByRole("heading", { name: "Rental deposits deserve a clearer path." })
    .waitFor({ state: "visible" });
  assert.equal(
    await desktopPage.getByRole("link", { name: /Try the testnet MVP/ }).first().getAttribute("href"),
    "https://openescrow-demo.omrigross.chatgpt.site/",
    "The landing page must default to the verified rollback MVP until the app domain is ready.",
  );
  assert.equal(
    await desktopPage.getByRole("link", { name: /View the open-source project/ }).getAttribute("href"),
    "https://github.com/omslice/OpenEscrow",
    "The landing page must link to the confirmed public source repository.",
  );
  assert.equal(
    await desktopPage.locator("input, textarea, form").count(),
    0,
    "The public project page must not collect data or expose an account form.",
  );

  await desktopPage.getByRole("button", { name: "Copy address" }).click();
  await desktopPage.getByText("Donation address copied.").waitFor({ state: "visible" });
  assert.equal(await desktopPage.evaluate(() => navigator.clipboard.readText()), "omslice.eth");

  await desktopPage.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
  });
  await desktopPage.getByRole("button", { name: "Copy address" }).click();
  await desktopPage
    .getByText("Select omslice.eth and copy it manually.")
    .waitFor({ state: "visible" });

  const assetBytes = (
    await Promise.all([...loadedAssets].map(async (asset) => (await stat(join(assetsRoot, asset))).size))
  ).reduce((total, size) => total + size, 0);
  assert.ok(loadedAssets.size <= 3, `Landing loaded ${loadedAssets.size} bundled assets; expected at most 3.`);
  assert.ok(assetBytes <= 50_000, `Landing loaded ${assetBytes} bundled bytes; expected at most 50000.`);

  const keyboardPage = await desktopContext.newPage();
  await keyboardPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await keyboardPage.keyboard.press("Tab");
  assert.equal(
    await keyboardPage.evaluate(() => document.activeElement?.textContent?.trim()),
    "Skip to main content",
    "The first keyboard target must be the skip link.",
  );
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  await isolateFromExternalServices(mobileContext);
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "The landing page must not overflow horizontally at mobile width.",
  );
  for (const control of [
    mobilePage.getByRole("link", { name: "Open the MVP" }),
    mobilePage.getByRole("link", { name: /Try the testnet MVP/ }).first(),
    mobilePage.getByRole("button", { name: "Copy address" }),
  ]) {
    const box = await control.boundingBox();
    assert.ok(box && box.height >= 44, "Primary mobile controls must be at least 44 pixels tall.");
  }
  const transitionDuration = await mobilePage.locator(".feature-card").first().evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  assert.match(
    transitionDuration,
    /(?:0\.01ms|0s|1e-05s)/,
    "Reduced-motion visitors must not receive decorative card motion.",
  );
  await mobileContext.close();

  console.log("OpenEscrow rendered landing checks passed.");
} catch (error) {
  if (serverError.trim()) console.error(serverError.trim());
  throw error;
} finally {
  await browser?.close();
  if (!server.killed) server.kill();
}
