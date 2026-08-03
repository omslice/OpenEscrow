import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4175;
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

  const appPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await appPage.route(
    /\/src\/(?:AuthenticatedRoot|FallbackRoot)\.tsx(?:\?.*)?$/,
    async (route) => route.abort("failed"),
  );
  await appPage.goto(baseUrl, { waitUntil: "networkidle" });

  const appAlert = appPage.getByRole("alert", { name: "OpenEscrow loading error" });
  await appAlert.waitFor({ state: "visible" });
  await assertFocusedReload(appPage, "The app-level recovery action should receive focus.");
  assert.match(
    await appAlert.innerText(),
    /before repeating any transaction/i,
    "The app recovery message should prevent accidental transaction retries without exposing technical details.",
  );

  const workspacePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await workspacePage.route(
    /\/src\/components\/CreateAgreementForm\.tsx(?:\?.*)?$/,
    async (route) => route.abort("failed"),
  );
  await workspacePage.goto(baseUrl, { waitUntil: "networkidle" });
  const landlordWorkspace = workspacePage.getByRole("button", {
    name: /I am a landlord/,
  });
  await landlordWorkspace.waitFor({ state: "visible" });
  // Normal pointer activation is covered by the accessibility and account-switch checks. Dispatch
  // this setup click directly so Playwright's navigation waiter cannot consume the intentional
  // lazy-module failure that this recovery-specific page installs next.
  await landlordWorkspace.dispatchEvent("click");
  await workspacePage
    .getByRole("tablist", { name: "Landlord workspace" })
    .waitFor({ state: "visible" });
  await workspacePage.getByRole("tab", { name: "Proposals" }).click();
  await workspacePage.getByRole("button", { name: "Start a new proposal" }).click();

  const workspaceAlert = workspacePage.getByRole("alert", {
    name: "OpenEscrow section loading error",
  });
  await workspaceAlert.waitFor({ state: "visible" });
  await assertFocusedReload(
    workspacePage,
    "A failed workspace section should focus its recovery action.",
  );
  assert.equal(
    await workspacePage.getByRole("tablist", { name: "Landlord workspace" }).isVisible(),
    true,
    "A failed workspace section should not blank the rest of the app.",
  );

  const depositPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await depositPage.goto(`${baseUrl}/testing/agreement-load-recovery.html`, {
    waitUntil: "networkidle",
  });
  const depositAlert = depositPage.getByRole("alert", {
    name: "OE-A-000043 could not be loaded",
  });
  await depositAlert.waitFor({ state: "visible" });
  assert.match(
    await depositAlert.innerText(),
    /deposit has not been removed/i,
    "A connection failure should not imply that the deposit disappeared.",
  );
  assert.match(
    await depositAlert.innerText(),
    /before repeating any payment, claim, or withdrawal/i,
    "Deposit recovery should prevent duplicate user actions.",
  );

  const depositRetry = depositPage.getByRole("button", {
    name: "Try loading deposit again",
  });
  await depositRetry.focus();
  await depositRetry.press("Enter");
  await depositPage.getByText(/still could not reconnect/i).waitFor({
    state: "visible",
  });
  await assertFocusedElement(
    depositRetry,
    "A failed deposit retry should return focus to its recovery action.",
  );
  assert.equal(
    await depositAlert.getAttribute("aria-busy"),
    "false",
    "The deposit failure should clear its busy state after a failed retry.",
  );
  assert.equal(
    await depositPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Deposit recovery should not overflow a mobile viewport.",
  );

  await depositRetry.press("Enter");
  await depositPage.getByRole("status").waitFor({ state: "visible" });
  assert.match(
    await depositPage.getByRole("status").innerText(),
    /without repeating a deposit action/i,
    "A successful retry should return to the deposit without submitting a new action.",
  );

  const activityPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await activityPage.goto(`${baseUrl}/testing/activity-load-recovery.html`, {
    waitUntil: "networkidle",
  });
  const activityAlert = activityPage.getByRole("alert", {
    name: "Public record receipts could not be loaded",
  });
  await activityAlert.waitFor({ state: "visible" });
  assert.match(
    await activityAlert.innerText(),
    /agreement and saved activity have not been removed/i,
    "A receipt connection failure should not imply that agreement activity disappeared.",
  );
  const connectionError = activityAlert.getByText("Simulated RPC gateway timeout");
  assert.equal(
    await connectionError.isVisible(),
    false,
    "Technical receipt errors should be collapsed by default.",
  );
  const activityRetry = activityPage.getByRole("button", {
    name: "Try loading public receipts again",
  });
  await activityRetry.focus();
  await activityRetry.press("Enter");
  await activityAlert
    .getByText(/Still couldn't connect. Your saved record remains available/i)
    .waitFor({ state: "visible" });
  await assertFocusedElement(
    activityRetry,
    "A failed receipt retry should return focus to its recovery action.",
  );
  assert.equal(
    await activityAlert.getAttribute("aria-busy"),
    "false",
    "The receipt failure should clear its busy state after a failed retry.",
  );
  await activityRetry.press("Enter");
  await activityAlert
    .getByText("Simulated RPC gateway still unavailable (attempt 2)")
    .waitFor({ state: "attached" });
  await assertFocusedElement(
    activityRetry,
    "Every failed receipt retry should return focus to its recovery action.",
  );
  assert.equal(
    await activityAlert.getAttribute("aria-busy"),
    "false",
    "A repeated receipt failure should clear its busy state.",
  );
  await activityAlert.getByText("Connection details").click();
  await activityAlert
    .getByText("Simulated RPC gateway still unavailable (attempt 2)")
    .waitFor({ state: "visible" });
  assert.equal(
    await activityPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Receipt recovery should not overflow a mobile viewport.",
  );
  await activityRetry.press("Enter");
  await activityPage.getByRole("status").waitFor({ state: "visible" });
  assert.match(
    await activityPage.getByRole("status").innerText(),
    /without repeating an agreement action/i,
    "A successful receipt retry should recover without submitting another agreement action.",
  );

  process.stdout.write(
    "Load recovery check passed: app, workspace, deposit, and public-receipt connection failures remain visible, accessible, and actionable without duplicate transactions or blank pages.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}

async function assertFocusedReload(page, message) {
  const reload = page.getByRole("button", { name: "Reload OpenEscrow" });
  await reload.waitFor({ state: "visible" });
  assert.equal(
    await reload.evaluate((element) => element === document.activeElement),
    true,
    message,
  );
}

async function assertFocusedElement(locator, message, timeoutMs = 1_000) {
  const focused = await locator.evaluate(
    (element, timeout) =>
      new Promise((resolve) => {
        const deadline = performance.now() + timeout;
        const check = () => {
          if (element === document.activeElement) {
            resolve(true);
            return;
          }
          if (performance.now() >= deadline) {
            resolve(false);
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    timeoutMs,
  );
  assert.equal(focused, true, message);
}
