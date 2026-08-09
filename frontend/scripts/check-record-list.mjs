import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4183;
const baseUrl = `http://${host}:${port}/testing/record-list.html`;
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
    "record-list-test",
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

  const first = page.getByRole("button", {
    name: "Show details for Finalized agreement record OE-A-000002",
  });
  const second = page.getByRole("button", {
    name: "Show details for Finalized agreement record OE-A-000003",
  });
  const firstDetailsId = await first.getAttribute("aria-controls");
  const secondDetailsId = await second.getAttribute("aria-controls");
  assert.ok(firstDetailsId);
  assert.ok(secondDetailsId);
  assert.equal(await page.locator(`#${firstDetailsId}`).count(), 1);
  assert.equal(await page.locator(`#${secondDetailsId}`).count(), 1);
  assert.equal(await page.locator(`#${firstDetailsId}`).isHidden(), true);
  assert.equal(await page.locator(`#${secondDetailsId}`).isHidden(), true);
  assert.equal(await page.getByTestId("mounted-record-tools").count(), 0);

  await first.click();
  await page.getByText("OE-A-000002 record tools are mounted.").waitFor();
  assert.equal(await page.locator(`#${firstDetailsId}`).isVisible(), true);
  assert.equal(await page.getByTestId("mounted-record-tools").count(), 1);

  await second.click();
  await page.getByText("OE-A-000003 record tools are mounted.").waitFor();
  assert.equal(
    await page.getByTestId("mounted-record-tools").count(),
    2,
    "Record entries may be compared when the user explicitly opens more than one.",
  );

  const openFirst = page.getByRole("button", {
    name: "Hide details for Finalized agreement record OE-A-000002",
  });
  await openFirst.focus();
  await openFirst.press("Space");
  assert.equal(await page.locator(`#${firstDetailsId}`).isHidden(), true);
  assert.equal(await page.getByText("OE-A-000002 record tools are mounted.").count(), 0);
  assert.equal(
    await page
      .getByRole("button", {
        name: "Show details for Finalized agreement record OE-A-000002",
      })
      .evaluate((element) => element === document.activeElement),
    true,
    "Collapsing a record should preserve keyboard focus on its disclosure control.",
  );

  const archive = page.getByRole("button", { name: "Archive" }).first();
  const firstExpandedBeforeArchive = await first.getAttribute("aria-expanded");
  await archive.click();
  assert.equal(await page.getByTestId("archive-count").textContent(), "1");
  assert.equal(
    await first.getAttribute("aria-expanded"),
    firstExpandedBeforeArchive,
    "The separate archive action must not toggle record details.",
  );

  const firstButtonBox = await first.boundingBox();
  assert.equal(
    Boolean(firstButtonBox && firstButtonBox.height >= 44),
    true,
    "Record rows should remain full-size mobile touch targets.",
  );
  const headingBox = await page.getByRole("heading", { name: "Current records" }).boundingBox();
  const workspaceBox = await page.locator(".record-workspace").boundingBox();
  const firstCardBox = await page.locator(".record-list-item").first().boundingBox();
  const firstIdentityBox = await page.locator(".record-list-identity").first().boundingBox();
  const headingToCardGap =
    headingBox && firstCardBox ? firstCardBox.y - (headingBox.y + headingBox.height) : 0;
  assert.equal(
    headingToCardGap >= 20,
    true,
    `Current records heading should remain visually separated from the first card: ${headingToCardGap}px.`,
  );
  const headingLeftInset =
    headingBox && workspaceBox ? headingBox.x - workspaceBox.x : 0;
  assert.equal(
    headingLeftInset >= 4,
    true,
    `Current records heading should retain a visible left inset: ${headingLeftInset}px.`,
  );
  const recordContentLeftInset =
    firstIdentityBox && firstCardBox ? firstIdentityBox.x - firstCardBox.x : 0;
  assert.equal(
    recordContentLeftInset >= 16,
    true,
    `Record content should remain clear of its left border: ${recordContentLeftInset}px.`,
  );
  const mobileWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(
    mobileWidth.document <= mobileWidth.viewport,
    true,
    `Record list should not overflow a mobile viewport: ${JSON.stringify(mobileWidth)}`,
  );

  process.stdout.write(
    "Record-list browser check passed: collapsed controls retain valid targets, mount details only on demand, preserve keyboard focus, separate archive actions, keep headings clear of card borders, and fit mobile width.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
