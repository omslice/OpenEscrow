import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4182;
const baseUrl = `http://${host}:${port}/testing/deposit-list.html`;
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
    "deposit-list-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
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
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const first = page.getByRole("button", { name: "Show details for OE-A-000002" });
  const second = page.getByRole("button", { name: "Show details for OE-A-000003" });
  assert.equal(await page.getByTestId("live-deposit-detail").count(), 0);
  assert.equal(await first.getAttribute("aria-expanded"), "false");
  assert.equal(await second.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByText("Active deposit").count(), 2);
  assert.equal(await page.getByText("Finalized", { exact: true }).count(), 2);
  assert.match(await first.textContent(), /101 Test Street, Austin, TX/);
  assert.match(await first.textContent(), /OE-A-000002 · Finalized security deposit/);

  await first.click();
  await page.getByText("Deposit 1 live details are mounted.").waitFor();
  assert.equal(await page.getByTestId("expanded-deposit").textContent(), "1");
  assert.equal(await page.getByTestId("live-deposit-detail").count(), 1);
  assert.equal(
    await page.getByRole("button", { name: "Hide details for OE-A-000002" }).getAttribute("aria-expanded"),
    "true",
  );

  await second.click();
  await page.getByText("Deposit 2 live details are mounted.").waitFor();
  assert.equal(await page.getByText("Deposit 1 live details are mounted.").count(), 0);
  assert.equal(await page.getByTestId("expanded-deposit").textContent(), "2");
  assert.equal(
    await page.getByTestId("live-deposit-detail").count(),
    1,
    "Opening another deposit should unmount the prior live detail view.",
  );

  const openSecond = page.getByRole("button", { name: "Hide details for OE-A-000003" });
  await openSecond.focus();
  await openSecond.press("Space");
  assert.equal(await page.getByTestId("live-deposit-detail").count(), 0);
  assert.equal(await page.getByTestId("expanded-deposit").textContent(), "none");
  assert.equal(
    await page
      .getByRole("button", { name: "Show details for OE-A-000003" })
      .evaluate((element) => element === document.activeElement),
    true,
    "Collapsing deposit details should leave keyboard focus on the same control.",
  );

  const firstButtonBox = await first.boundingBox();
  assert.equal(
    Boolean(firstButtonBox && firstButtonBox.height >= 44),
    true,
    "Deposit rows should remain full-size mobile touch targets.",
  );
  const mobileWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(
    mobileWidth.document <= mobileWidth.viewport,
    true,
    `Deposit list should not overflow a mobile viewport: ${JSON.stringify(mobileWidth)}`,
  );

  process.stdout.write(
    "Deposit-list browser check passed: multi-agreement accounts start compact, mount one live deposit at a time, preserve keyboard focus, and fit mobile width.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
