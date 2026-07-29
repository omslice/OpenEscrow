import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4174;
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
      // The local Vite server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

const server = spawn(
  process.execPath,
  [viteEntrypoint, "--host", host, "--port", String(port), "--strictPort"],
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.route("**/api/address-suggestions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          {
            id: "first",
            label: "123 Main Street, Los Angeles, CA 90012",
            countryCode: "US",
            stateCode: "CA",
            city: "Los Angeles",
            county: "Los Angeles County",
            postalCode: "90012",
            latitude: 34.0522,
            longitude: -118.2437,
            attestation: "test-attestation",
          },
          {
            id: "second",
            label: "123 Main Street, San Diego, CA 92101",
            countryCode: "US",
            stateCode: "CA",
            city: "San Diego",
            county: "San Diego County",
            postalCode: "92101",
            latitude: 32.7157,
            longitude: -117.1611,
            attestation: "test-attestation",
          },
        ],
      }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const yieldSummary = page.getByText("Earn yield?", { exact: true });
  await yieldSummary.focus();
  await yieldSummary.press("Enter");
  const learnMore = page.getByRole("link", { name: "Learn more" });
  await learnMore.waitFor({ state: "visible" });
  await learnMore.click();
  const yieldDialog = page.getByRole("dialog");
  await yieldDialog.waitFor({ state: "visible" });
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Close yield explanation",
    "The yield dialog should move focus to its close control.",
  );
  await page.keyboard.press("Escape");
  await yieldDialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: /I am a landlord/ }).click();
  const workspaceTablist = page.getByRole("tablist", {
    name: "Landlord workspace",
  });
  const workspaceTabs = workspaceTablist.getByRole("tab");
  assert.equal(await workspaceTabs.count(), 4, "The workspace should expose four tabs.");

  const overviewTab = workspaceTablist.getByRole("tab", { name: "Overview" });
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  const proposalsTab = workspaceTablist.getByRole("tab", { name: "Proposals" });
  assert.equal(
    await proposalsTab.getAttribute("aria-selected"),
    "true",
    "ArrowRight should activate the next workspace tab.",
  );
  assert.equal(
    await proposalsTab.evaluate((element) => element === document.activeElement),
    true,
    "The active workspace tab should retain keyboard focus.",
  );

  const startProposal = page.getByRole("button", { name: "Start a new proposal" });
  await startProposal.click();
  const proposalBuilder = page.locator("#proposal-builder");
  await proposalBuilder.waitFor({ state: "visible" });
  assert.equal(
    await proposalBuilder.evaluate((element) => element === document.activeElement),
    true,
    "Opening the proposal editor should move focus to its labeled region.",
  );

  const address = page.getByRole("combobox", { name: "Rental property address" });
  await address.fill("123 Main");
  await page.getByRole("listbox").waitFor({ state: "visible" });
  await address.press("ArrowDown");
  assert.match(
    (await address.getAttribute("aria-activedescendant")) || "",
    /-option-0$/,
    "ArrowDown should expose the active address option.",
  );
  await address.press("Enter");
  assert.equal(
    await address.inputValue(),
    "123 Main Street, Los Angeles, CA 90012",
    "Enter should select the active address suggestion.",
  );
  assert.equal(
    await address.getAttribute("aria-expanded"),
    "false",
    "Selecting an address should close the suggestion list.",
  );

  await page.getByRole("button", { name: "Close proposal editor" }).click();
  await page.waitForTimeout(50);
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "start-proposal-button",
    "Closing the proposal editor should restore focus to its launcher.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    rootBox: document.getElementById("root")?.getBoundingClientRect().toJSON(),
    appBox: document.querySelector(".app-shell")?.getBoundingClientRect().toJSON(),
    tabBox: document.querySelector(".workspace-tabs")?.getBoundingClientRect().toJSON(),
    scrollContainers: Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className:
          typeof element.className === "string" ? element.className : "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }))
      .slice(0, 8),
    offenders: Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className:
            typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        };
      })
      .filter(
        (item) =>
          item.width > 0 &&
          (item.left < -1 || item.right > window.innerWidth + 1),
      )
      .slice(0, 8),
  }));
  assert.equal(
    mobileOverflow.documentWidth <= mobileOverflow.viewportWidth,
    true,
    `The critical workspace view should not overflow the mobile viewport: ${JSON.stringify(mobileOverflow)}`,
  );

  process.stdout.write(
    "Accessibility smoke check passed: modal focus, workspace tabs, proposal focus recovery, address keyboard selection, and mobile width.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
