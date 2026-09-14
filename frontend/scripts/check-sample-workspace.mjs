import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = 22000 + process.pid % 20000;
const base = `http://127.0.0.1:${port}`;
const screenshots = new URL("../.screenshots/sample-workspace/", import.meta.url);
const server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--mode", "account-switch-test"], {
  cwd: root, env: { ...process.env, VITE_PRIVY_APP_ID: "openescrow-account-switch-test" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stderr.on("data", (chunk) => { serverLog += chunk; });
let browser;
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(base)).ok) break; } catch { /* Server is starting. */ }
    if (Date.now() > deadline) throw new Error("Sample workspace preview did not start.");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, colorScheme: "dark" });
  await context.addInitScript(() => {
    // Existing unrelated account data must survive demo reset and exit unchanged.
    localStorage.setItem("openescrow:existing-account-sentinel", "real-record-sentinel");
    sessionStorage.setItem("openescrow:existing-session-sentinel", "real-session-sentinel");
    window.__sampleIsolationCalls = [];
    const record = (operation) => {
      if (location.pathname === "/explore") window.__sampleIsolationCalls.push(operation);
    };
    for (const method of ["setItem", "removeItem", "clear", "getItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) { record(`storage.${method}`); return original.apply(this, args); };
    }
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { record("indexedDB.open"); return originalOpen(...args); };
    window.ethereum = { request: async () => { record("wallet.request"); throw new Error("Wallet access is forbidden in the sample workspace."); } };
  });
  const page = await context.newPage();
  const demoRequests = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const isApi = url.origin !== base || url.pathname.startsWith("/api/");
    if (isApi && new URL(page.url() === "about:blank" ? base : page.url()).pathname === "/explore") demoRequests.push(url.pathname);
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/negotiations/discover") return route.fulfill({ json: { accesses: [] } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Unavailable in this isolated browser check." } });
    return route.continue();
  });
  await page.goto(`${base}/?public-access-test=1`);
  await page.getByRole("heading", { name: "A better way to handle rental deposits.", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Your sample workspace" }).count(), 0);
  await page.getByRole("button", { name: "Try the testnet demo", exact: true }).waitFor();
  await page.getByRole("link", { name: "Try the mock demo", exact: true }).click();
  await page.getByRole("heading", { name: "Your sample workspace" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/explore");
  assert.equal(await page.getByText("Fictional landlord account · 4 sample agreements").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Sign out", exact: true }).count(), 0);
  await page.screenshot({ path: fileURLToPath(new URL("desktop.png", screenshots)), fullPage: true });
  const mainTabs = page.getByRole("tablist", { name: "Sample workspace", exact: true });
  for (const tab of ["About", "Proposals", "Deposits", "Record", "Dashboard"]) {
    await mainTabs.getByRole("tab", { name: tab, exact: true }).click();
    assert.equal(await mainTabs.getByRole("tab", { name: tab, exact: true }).getAttribute("aria-selected"), "true");
  }
  await mainTabs.getByRole("tab", { name: "Dashboard", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await mainTabs.getByRole("tab", { name: "Proposals", exact: true }).getAttribute("aria-selected"), "true");

  const open = async (id) => page.locator(`#sample-item-${id}`).getByRole("button", { name: /^Show details/ }).click();
  const detail = (id) => page.locator(`#sample-item-${id}`);
  const switchRole = async (role) => page.getByRole("button", { name: `${role} view`, exact: true }).click();
  await switchRole("Tenant");
  await open("SAMPLE-101");
  await page.getByRole("button", { name: "Simulate approving terms", exact: true }).click();
  await switchRole("Landlord");
  await open("SAMPLE-101");
  await page.getByRole("button", { name: "Simulate finalizing agreement", exact: true }).click();
  await page.getByRole("heading", { name: "All sample proposals are finalized" }).waitFor();
  await mainTabs.getByRole("tab", { name: "Deposits", exact: true }).click();
  await switchRole("Tenant");
  await open("SAMPLE-101");
  await page.getByRole("button", { name: "Simulate funding deposit", exact: true }).click();
  await detail("SAMPLE-101").getByRole("tab", { name: "Funds & withdrawals", exact: true }).click();
  assert.equal(await detail("SAMPLE-101").getByText("Simulated tenant deposit", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Simulate funding deposit", exact: true }).count(), 0);

  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await switchRole("Tenant");
  await mainTabs.getByRole("tab", { name: "Deposits", exact: true }).click();
  await open("SAMPLE-103");
  await detail("SAMPLE-103").getByRole("tab", { name: "Claims & resolution", exact: true }).click();
  await page.getByRole("button", { name: "View sample invoice", exact: true }).click();
  const document = page.getByRole("dialog", { name: "Itemized cleaning invoice" });
  await document.waitFor();
  assert.ok((await document.textContent()).includes("Total: $180"));
  await page.keyboard.press("Escape");
  await document.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent === "View sample invoice");
  await page.getByRole("button", { name: "Simulate accepting deduction", exact: true }).click();
  await page.getByRole("button", { name: "Simulate withdrawing refund", exact: true }).click();
  await detail("SAMPLE-103").getByRole("tab", { name: "Funds & withdrawals", exact: true }).click();
  assert.equal(await detail("SAMPLE-103").getByText("$1,470.00", { exact: true }).count(), 1);
  await switchRole("Landlord");
  await open("SAMPLE-103");
  await page.getByRole("button", { name: "Simulate withdrawing deduction", exact: true }).click();
  assert.equal(await detail("SAMPLE-103").getByText("Completed refund", { exact: true }).count(), 1);

  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await switchRole("Tenant");
  await mainTabs.getByRole("tab", { name: "Deposits", exact: true }).click();
  await open("SAMPLE-103");
  await page.getByRole("button", { name: "Simulate disputing deduction", exact: true }).click();
  assert.equal(await detail("SAMPLE-103").getByText("Claim disputed", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Simulate withdrawing/ }).count(), 0);

  assert.deepEqual(await page.evaluate(() => window.__sampleIsolationCalls), [], "Demo browsing and actions must not access storage or a wallet.");
  assert.deepEqual(demoRequests, [], "Demo navigation and actions must not call APIs, RPCs, or external services.");
  await page.reload();
  await page.getByRole("heading", { name: "Your sample workspace" }).waitFor();
  assert.equal(await page.getByText("Fictional landlord account · 4 sample agreements").count(), 1);
  await mainTabs.getByRole("tab", { name: "Record", exact: true }).click();
  await open("SAMPLE-103");
  await detail("SAMPLE-103").getByRole("tab", { name: "Activity", exact: true }).click();
  assert.equal(await detail("SAMPLE-103").getByText(/Disputed the sample deduction/).count(), 0);
  await page.getByRole("link", { name: "Exit demo", exact: true }).click();
  await page.getByRole("link", { name: "Try the mock demo", exact: true }).click();
  await page.getByRole("heading", { name: "Your sample workspace" }).waitFor();

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    await mainTabs.getByRole("tab", { name: "Dashboard", exact: true }).click();
    for (const tab of ["Dashboard", "Proposals", "Deposits", "Record", "About"]) {
      await mainTabs.getByRole("tab", { name: tab, exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `The ${tab} tab must fit a ${width}px viewport.`);
    }
    await mainTabs.getByRole("tab", { name: "Record", exact: true }).click();
    await open("SAMPLE-103");
    await detail("SAMPLE-103").getByRole("button", { name: /Itemized cleaning invoice/ }).click();
    await document.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const close = document.getByRole("button", { name: "Close document" });
    assert.ok((await close.boundingBox()).height >= 44);
    await close.click();
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    assert.equal(await mainTabs.getByRole("tab", { name: "Dashboard", exact: true }).getAttribute("aria-selected"), "true");
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: fileURLToPath(new URL("mobile.png", screenshots)), fullPage: true });
  assert.deepEqual(await page.evaluate(() => window.__sampleIsolationCalls), []);
  assert.deepEqual(demoRequests, []);

  await page.getByRole("link", { name: "Sign in / connect", exact: true }).click();
  await page.getByRole("button", { name: "Continue with Google", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Your sample workspace" }).count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("openescrow:existing-account-sentinel")), "real-record-sentinel");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("openescrow:existing-session-sentinel")), "real-session-sentinel");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await page.getByRole("button", { name: /I am a landlord/ }).click();
  await page.getByTitle("account.a@example.test").waitFor();
  for (const tab of ["Dashboard", "Proposals", "Deposits", "Record"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    assert.doesNotMatch(await page.locator("main").innerText(), /SAMPLE-10[1-4]|Willow Court|Cedar Studio|Morgan Reed|Avery Chen/);
  }
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })), /SAMPLE-10[1-4]|Willow Court|Cedar Studio|Morgan Reed|Avery Chen/);
  assert.deepEqual(pageErrors, []);
  process.stdout.write("Sample workspace checks passed: signed-out navigation, keyboard and document access, simulated lifecycle, reset/reload, 320px and 375px layouts, zero demo storage/API/wallet calls, and clean sign-in isolation.\n");
} catch (error) {
  if (serverLog) process.stderr.write(serverLog);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
