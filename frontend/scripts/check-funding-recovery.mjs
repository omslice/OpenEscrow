import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  applyFundingCheckoutEvent,
  createFundingCheckoutAttempt,
} from "../shared/funding-routes.js";

const host = "127.0.0.1";
const port = 4177;
const baseUrl = `http://${host}:${port}/testing/funding-recovery.html`;
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);
const scopeKey = (proposalId, token) => `${proposalId}:${token}`;

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

async function waitFor(condition, message, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function hydrateIntent(serialized) {
  return {
    ...serialized,
    amountMicros: BigInt(serialized.amountMicros),
  };
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
    "funding-recovery-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      VITE_PRIVY_APP_ID: "openescrow-funding-recovery-test",
      VITE_FIAT_ONRAMP_ENABLED: "true",
      VITE_FIAT_ONRAMP_ASSET: "usdc",
      VITE_FIAT_ONRAMP_CHAIN: "eip155:8453",
      VITE_FIAT_ONRAMP_ENVIRONMENT: "sandbox",
      VITE_FIAT_ONRAMP_PRODUCTION_APPROVED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

const attempts = new Map();
const createdScopes = [];
const recoveredScopes = [];
const completedScopes = [];
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.route(/\/api\/negotiations\/[^/]+\/funding-checkouts(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const eventMatch = url.pathname.match(
      /^\/api\/negotiations\/([^/]+)\/funding-checkouts\/([^/]+)\/events$/,
    );
    const recoveryMatch = url.pathname.match(
      /^\/api\/negotiations\/([^/]+)\/funding-checkouts\/recover$/,
    );
    const createMatch = url.pathname.match(
      /^\/api\/negotiations\/([^/]+)\/funding-checkouts$/,
    );
    const body = request.postDataJSON();

    if (eventMatch) {
      const proposalId = decodeURIComponent(eventMatch[1]);
      const key = scopeKey(proposalId, body.token);
      const saved = attempts.get(key);
      assert.ok(saved, `An event must match a durable attempt for ${key}.`);
      assert.equal(
        saved.attemptId,
        decodeURIComponent(eventMatch[2]),
        "A provider result must update only its original attempt.",
      );
      const checkout = applyFundingCheckoutEvent(saved, {
        eventId: body.eventId,
        status: body.status,
        providerStatus: body.providerStatus,
        occurredAt: new Date(
          Math.max(Date.now(), Date.parse(saved.updatedAt)),
        ).toISOString(),
      });
      attempts.set(key, checkout);
      completedScopes.push(key);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkout,
          duplicate: false,
          durable: true,
          sandboxOnly: true,
        }),
      });
      return;
    }

    if (recoveryMatch) {
      const proposalId = decodeURIComponent(recoveryMatch[1]);
      const key = scopeKey(proposalId, body.token);
      recoveredScopes.push(key);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkout: attempts.get(key) || null,
          durable: true,
          sandboxOnly: true,
        }),
      });
      return;
    }

    assert.ok(createMatch, `Unexpected funding request: ${url.pathname}`);
    const proposalId = decodeURIComponent(createMatch[1]);
    const key = scopeKey(proposalId, body.token);
    assert.equal(
      attempts.has(key),
      false,
      `The test must create only one checkout for ${key}.`,
    );
    const checkout = createFundingCheckoutAttempt(hydrateIntent(body.intent), {
      attemptId: body.attemptId,
    });
    attempts.set(key, checkout);
    createdScopes.push(key);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        checkout,
        created: true,
        durable: true,
        sandboxOnly: true,
      }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const preview = () =>
    page.getByRole("button", { name: "Preview sandbox checkout" });

  await preview().waitFor({ state: "visible" });
  await preview().click();
  await page.waitForFunction(
    () => window.__openEscrowFundingRecoveryTest?.snapshot().callCount === 1,
  );

  await page
    .getByRole("button", { name: "Show Agreement B · tenant 1" })
    .click();
  await page.getByText("Current scope: Agreement B · tenant 1").waitFor();
  await preview().waitFor({ state: "visible" });
  assert.deepEqual(
    createdScopes,
    ["proposal-a:access-a-1"],
    "Agreement B must not import or recreate agreement A's browser attempt.",
  );
  await preview().click();
  await page.waitForFunction(
    () => window.__openEscrowFundingRecoveryTest?.snapshot().callCount === 2,
  );

  await page
    .getByRole("button", { name: "Show Agreement A · tenant 2" })
    .click();
  await page.getByText("Current scope: Agreement A · tenant 2").waitFor();
  await preview().waitFor({ state: "visible" });
  assert.deepEqual(
    createdScopes,
    ["proposal-a:access-a-1", "proposal-b:access-b-1"],
    "A co-tenant must not import or recreate the first tenant's browser attempt.",
  );
  await preview().click();
  await page.waitForFunction(
    () => window.__openEscrowFundingRecoveryTest?.snapshot().callCount === 3,
  );

  const recoveryKeys = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("openescrow:funding-checkout:"))
      .sort(),
  );
  assert.equal(
    recoveryKeys.length,
    3,
    "Each agreement/tenant scope must receive a separate browser recovery key.",
  );
  assert.equal(
    new Set(recoveryKeys).size,
    3,
    "Browser recovery keys must not collide when wallet, asset, and amount are identical.",
  );
  assert.equal(
    recoveryKeys.some((key) => /access-[ab]-[12]/.test(key)),
    false,
    "Browser recovery keys must not contain tenant bearer tokens.",
  );

  await page.evaluate(() => {
    window.__openEscrowFundingRecoveryTest?.resolveCall(0, "confirmed");
  });
  await waitFor(
    () => completedScopes.includes("proposal-a:access-a-1"),
    "Agreement A tenant 1's provider result did not reach its durable attempt.",
  );
  await page.waitForTimeout(25);
  assert.equal(
    await page.getByText(/Sandbox checkout completed/).count(),
    0,
    "Agreement A tenant 1's late completion must not update tenant 2's visible scope.",
  );

  await page.evaluate(() => {
    window.__openEscrowFundingRecoveryTest?.resolveCall(1, "confirmed");
  });
  await waitFor(
    () => completedScopes.includes("proposal-b:access-b-1"),
    "Agreement B tenant 1's provider result did not reach its durable attempt.",
  );
  await page.waitForTimeout(25);
  assert.equal(
    await page.getByText(/Sandbox checkout completed/).count(),
    0,
    "Agreement B's late completion must not update agreement A tenant 2's visible scope.",
  );

  await page.evaluate(() => {
    window.__openEscrowFundingRecoveryTest?.resolveCall(2, "confirmed");
  });
  await page.getByText(/Sandbox checkout completed/).waitFor({ state: "visible" });

  await page
    .getByRole("button", { name: "Show Agreement B · tenant 1" })
    .click();
  await page.getByText("Current scope: Agreement B · tenant 1").waitFor();
  await page.getByText(/Sandbox checkout completed/).waitFor({ state: "visible" });

  await page
    .getByRole("button", { name: "Show Agreement A · tenant 1" })
    .click();
  await page.getByText("Current scope: Agreement A · tenant 1").waitFor();
  await page.getByText(/Sandbox checkout completed/).waitFor({ state: "visible" });

  assert.deepEqual(createdScopes, [
    "proposal-a:access-a-1",
    "proposal-b:access-b-1",
    "proposal-a:access-a-2",
  ]);
  assert.deepEqual(
    new Set(completedScopes),
    new Set(createdScopes),
    "Every provider result must be saved against its original durable scope.",
  );
  assert.equal(
    recoveredScopes.includes("proposal-a:access-a-1") &&
      recoveredScopes.includes("proposal-b:access-b-1") &&
      recoveredScopes.includes("proposal-a:access-a-2"),
    true,
    "Every rendered scope must perform its own durable recovery lookup.",
  );

  process.stdout.write(
    "Funding recovery browser check passed: same-wallet agreements and co-tenants retain isolated browser and durable checkout state across out-of-order provider completions.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
