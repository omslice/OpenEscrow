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
  await workspacePage.getByRole("button", { name: /I am a landlord/ }).click();
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

  process.stdout.write(
    "Load recovery check passed: app bootstrap and workspace chunk failures remain actionable without blanking the page.\n",
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
