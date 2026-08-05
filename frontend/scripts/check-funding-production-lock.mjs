import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4183;
const baseUrl = `http://${host}:${port}/testing/funding-recovery.html`;
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
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function assertMobileActionTarget(locator, label) {
  const box = await locator.boundingBox();
  assert.equal(
    Boolean(box && box.height >= 44),
    true,
    `${label} must retain a 44-pixel mobile touch target.`,
  );
}

const server = spawn(
  process.execPath,
  [
    viteEntrypoint,
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
    "--mode",
    "funding-production-lock-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      VITE_PRIVY_APP_ID: "openescrow-production-lock-test",
      VITE_FIAT_ONRAMP_ENABLED: "true",
      VITE_FIAT_ONRAMP_ASSET: "usdc",
      VITE_FIAT_ONRAMP_CHAIN: "eip155:8453",
      VITE_FIAT_ONRAMP_ENVIRONMENT: "production",
      VITE_FIAT_ONRAMP_PRODUCTION_APPROVED: "true",
    },
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const checkout = page.getByRole("button", {
    name: "Continue to card or bank",
  });
  await checkout.waitFor({ state: "visible" });
  await assertMobileActionTarget(checkout, "Production checkout");
  await checkout.click();
  await page.waitForFunction(
    () => window.__openEscrowFundingRecoveryTest?.snapshot().callCount === 1,
  );
  await page.evaluate(() => {
    window.__openEscrowFundingRecoveryTest?.resolveCall(0, "confirmed");
  });

  await page
    .getByText(/checkout did not return a verifiable result/i)
    .waitFor({ state: "visible" });
  const locked = page.getByRole("button", {
    name: "Check provider before retrying",
  });
  assert.equal(await locked.isDisabled(), true);
  assert.equal(
    await page.getByRole("button", { name: "Start a new checkout" }).count(),
    0,
    "An unverified production callback must not offer a duplicate purchase.",
  );
  assert.equal(
    await page.getByRole("button", { name: /sandbox preview/i }).count(),
    0,
    "Production outcomes must never expose the no-money sandbox reset escape hatch.",
  );
  const savedBeforeReload = await page.evaluate(() =>
    Object.values(localStorage)
      .map((value) => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })
      .find((value) => value?.schema === "openescrow.funding-checkout.v3"),
  );
  assert.equal(savedBeforeReload?.environment, "production");
  assert.equal(savedBeforeReload?.status, "unknown");
  assert.equal(savedBeforeReload?.events.at(-1)?.source, "browser_callback");
  assert.equal(savedBeforeReload?.events.at(-1)?.verification, "unverified");

  const refresh = page.getByRole("button", { name: "Refresh wallet balance" });
  await assertMobileActionTarget(refresh, "Production balance refresh");
  await refresh.click();
  assert.equal(await page.getByTestId("balance-refresh-count").textContent(), "1");
  assert.equal(
    await page.evaluate(
      () => window.__openEscrowFundingRecoveryTest?.snapshot().callCount,
    ),
    1,
    "A wallet refresh must not reopen the provider checkout.",
  );

  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText(/could not verify the checkout result/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("button", { name: "Check provider before retrying" })
      .isDisabled(),
    true,
    "An unverified production result must remain locked after reload.",
  );
  assert.equal(
    await page.getByRole("button", { name: "Start a new checkout" }).count(),
    0,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "The locked production recovery state must fit a mobile viewport.",
  );

  process.stdout.write(
    "Production funding lock browser check passed: an unverified browser success remains unknown and non-retryable across wallet refresh and page reload, exposes no sandbox reset, and opens no second provider checkout at mobile width.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
