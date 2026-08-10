import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const configuredPort = Number.parseInt(
  process.env.OPENESCROW_PRIVATE_ACTIVITY_TEST_PORT || "",
  10,
);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1_024 && configuredPort <= 65_535
    ? configuredPort
    : 22_000 + (process.pid % 30_000);
const baseUrl = `http://${host}:${port}`;
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

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

async function routeActivityReceiptRecovery(page) {
  let attempts = 0;
  await page.route(
    /\/api\/negotiations\/OE-P-RECOVERY\/actions$/,
    async (route) => {
      attempts += 1;
      const body = JSON.parse(route.request().postData() || "{}");
      assert.equal(
        body.token,
        "synthetic-private-record-recovery-token",
        "Activity receipt retries must use current agreement access without persisting it.",
      );
      assert.equal(body.type, "activity_hash_published");
      assert.equal(body.activityType, 1);
      assert.match(body.contentHash, /^0x[a-f0-9]{64}$/i);
      assert.equal(body.transactionHash, `0x${"7".repeat(64)}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated activity receipt outage" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "OE-P-RECOVERY", events: [] }),
      });
    },
  );
  return () => attempts;
}

async function pendingActivityRecoveryEntries(page) {
  return page.evaluate(() => {
    const entries = [];
    for (const [kind, storage] of [
      ["local", window.localStorage],
      ["session", window.sessionStorage],
    ]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith("openescrow:pending-activity-receipt:")) {
          entries.push([kind, key, storage.getItem(key)]);
        }
      }
    }
    return entries;
  });
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
    "private-record-recovery-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, VITE_PRIVY_APP_ID: "" },
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const attempts = await routeActivityReceiptRecovery(page);
  const pageUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=activity-receipt&tx=activity-success&agreement=43`;
  const otherAgreementUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=activity-receipt&tx=activity-success&agreement=44`;

  await page.goto(pageUrl, { waitUntil: "networkidle" });
  await page
    .getByText("Add a private timestamped proof", { exact: true })
    .click();
  await page
    .getByLabel("Private note or document description")
    .fill("Synthetic move-out notice prepared for the rendered recovery check.");
  const fingerprintPreview = page.locator(
    "details.activity-fingerprint-preview",
  );
  assert.equal(await fingerprintPreview.getAttribute("open"), null);
  assert.equal(
    await fingerprintPreview.locator("code.snapshot-hash").isVisible(),
    false,
    "The raw fingerprint should remain hidden unless technical details are requested.",
  );
  await page
    .getByRole("button", { name: "Save timestamped proof" })
    .click();

  const retry = page.getByRole("button", {
    name: "Retry record save",
  });
  await retry.waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("button", { name: "Save timestamped proof" })
      .count(),
    0,
    "A confirmed proof with a pending private receipt must hide the publish control.",
  );
  assert.equal(
    await retry.evaluate((element) => element === document.activeElement),
    true,
    "A failed activity receipt save should focus its record-only retry.",
  );
  const retryBox = await retry.boundingBox();
  assert.equal(Boolean(retryBox && retryBox.height >= 44), true);
  const entries = await pendingActivityRecoveryEntries(page);
  assert.equal(entries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(entries),
    /synthetic-private-record-recovery-token/,
  );
  assert.equal(
    await page.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:activity-transaction-writes",
      ),
    ),
    "1",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download private verification file" })
    .click();
  const verificationDownload = await downloadPromise;
  const verificationFilePath = await verificationDownload.path();
  assert.ok(verificationFilePath, "The private verification file should download.");
  assert.match(
    verificationDownload.suggestedFilename(),
    /^openescrow-activity-43-[a-f0-9]{8}\.json$/i,
  );

  await page.goto(otherAgreementUrl, { waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("button", { name: "Retry record save" })
      .count(),
    0,
    "A different agreement must not inherit another agreement's pending receipt.",
  );

  await page.goto(pageUrl, { waitUntil: "networkidle" });
  const recoveredRetry = page.getByRole("button", {
    name: "Retry record save",
  });
  await recoveredRetry.waitFor({ state: "visible" });
  await page
    .getByText(/recovered a confirmed timestamped proof/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await recoveredRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should open the section and focus its safe retry.",
  );
  await recoveredRetry.press("Enter");
  await page
    .getByRole("button", {
      name: /(?:Saving agreement record|Retry record save)/,
    })
    .waitFor({ state: "detached" });
  assert.equal(attempts(), 2);
  assert.equal((await pendingActivityRecoveryEntries(page)).length, 0);
  assert.equal(
    await page.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:activity-transaction-writes",
      ),
    ),
    "1",
    "The record-only retry must not publish another proof.",
  );

  await page
    .getByText("Check a private timestamped proof", { exact: true })
    .click();
  await page
    .getByLabel("Private verification file")
    .setInputFiles(verificationFilePath);
  const verifiedSummary = page
    .locator(".proof-verification-success .tx-success")
    .filter({ hasText: "Proof verified" });
  await verifiedSummary.waitFor({ state: "visible" });
  const friendlySummary = await verifiedSummary.innerText();
  assert.match(friendlySummary, /matches OE-A-000044/i);
  assert.doesNotMatch(
    friendlySummary,
    /0x|keccak256|activity type|publisher/i,
    "The primary success message should not expose technical receipt language.",
  );
  const verificationDetails = page.locator(
    "details.activity-verification-details",
  );
  assert.equal(await verificationDetails.getAttribute("open"), null);
  assert.equal(
    await verificationDetails.getByText(/Digital fingerprint:/).isVisible(),
    false,
    "Technical verification evidence should start collapsed.",
  );
  await verificationDetails.getByText("Verification details", { exact: true }).click();
  await verificationDetails.getByText("Record type: Private note").waitFor();
  await verificationDetails.getByText(/Saved by wallet: 0x1111.*1111/).waitFor();
  await verificationDetails.getByText(/Digital fingerprint: 0x[a-f0-9]{64}/i).waitFor();
  await verificationDetails
    .getByText("Confirmed in test-network block 12345.")
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );

  process.stdout.write(
    "Private activity recovery check passed: a confirmed proof survives one private-record outage only in its exact agreement, restores an accessible mobile retry after reload, stores no bearer, cannot publish twice, and completes a plain-language download-and-verify workflow with technical evidence collapsed by default.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
}
