import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4179;
const baseUrl = `http://${host}:${port}`;
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const assetsRoot = path.join(frontendRoot, "dist", "assets");
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
      // The production preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

function observeLocalScripts(page) {
  const assetNames = new Set();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === baseUrl &&
      url.pathname.startsWith("/assets/") &&
      url.pathname.endsWith(".js")
    ) {
      assetNames.add(path.basename(url.pathname));
    }
  });
  return assetNames;
}

async function isolateFromExternalProviders(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) {
      await route.continue();
      return;
    }
    await route.abort("failed");
  });
}

async function totalAssetBytes(assetNames) {
  const sizes = await Promise.all(
    [...assetNames].map(async (assetName) => (await stat(path.join(assetsRoot, assetName))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

const server = spawn(
  process.execPath,
  [
    viteEntrypoint,
    "preview",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: frontendRoot,
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

  const landingContext = await browser.newContext();
  await isolateFromExternalProviders(landingContext);
  await landingContext.grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin: baseUrl },
  );
  const landingPage = await landingContext.newPage();
  const landingAssets = observeLocalScripts(landingPage);
  await landingPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await landingPage
    .getByRole("heading", { name: "A better way to handle rental deposits." })
    .waitFor({ state: "visible" });
  await landingPage.waitForTimeout(1_500);

  const jurisdictionAsset = [...landingAssets].find((assetName) =>
    assetName.startsWith("jurisdictions-"),
  );
  const workspaceAsset = [...landingAssets].find((assetName) =>
    assetName.startsWith("WorkspaceApp-"),
  );
  const walletProvidersAsset = [...landingAssets].find((assetName) =>
    assetName.startsWith("WalletProviders-"),
  );
  assert.equal(
    jurisdictionAsset,
    undefined,
    "The public landing page must not preload the U.S. jurisdiction registry.",
  );
  assert.equal(
    workspaceAsset,
    undefined,
    "A clean logged-out visit must not preload the authenticated workspace.",
  );
  assert.equal(
    walletProvidersAsset,
    undefined,
    "A clean logged-out visit must not preload blockchain wallet providers.",
  );
  assert.ok(
    landingAssets.size <= 48,
    `The public landing page loaded ${landingAssets.size} JavaScript files; expected at most 48.`,
  );
  const landingBytes = await totalAssetBytes(landingAssets);
  assert.ok(
    landingBytes <= 2_270_000,
    `The public landing page loaded ${landingBytes} JavaScript bytes; expected at most 2270000.`,
  );
  const retrySecureSignIn = landingPage.getByRole("button", {
    name: "Retry secure sign-in",
  });
  await retrySecureSignIn.waitFor({ state: "visible" });
  await landingPage
    .getByRole("alert")
    .filter({ hasText: "Sign-in is taking longer than expected" })
    .waitFor({ state: "visible" });
  assert.equal(
    await landingPage
      .getByRole("heading", { name: "A better way to handle rental deposits." })
      .count(),
    1,
    "An account-provider outage must not hide the public landing page.",
  );
  assert.equal(
    await landingPage.locator("details.notification-center").count(),
    0,
    "A clean logged-out visit must not show an empty workspace notification control.",
  );
  const copyDonationAddress = landingPage.getByRole("button", {
    name: "Copy donation address omslice.eth",
  });
  await copyDonationAddress.waitFor({ state: "visible" });
  await copyDonationAddress.click();
  const donationCopyStatus = landingPage.locator(".donation-copy-status");
  await donationCopyStatus.waitFor({ state: "visible" });
  assert.equal(
    (await donationCopyStatus.textContent())?.trim(),
    "Donation address copied.",
    "The donation copy action must show a clear success message.",
  );
  assert.equal(
    await donationCopyStatus.getAttribute("role"),
    "status",
    "Successful donation copy feedback must use a polite status live region.",
  );
  assert.equal(
    await landingPage.evaluate(() => navigator.clipboard.readText()),
    "omslice.eth",
    "The public donation control must copy the exact ENS address.",
  );
  await landingPage.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
  });
  await copyDonationAddress.click();
  await landingPage
    .getByRole("alert")
    .filter({ hasText: "Select omslice.eth and copy it manually." })
    .waitFor({ state: "visible" });
  assert.equal(
    await landingPage.getByRole("button", { name: /I am a landlord/ }).count(),
    0,
    "A clean logged-out visit must not ask the visitor to choose a workspace role.",
  );
  await landingPage
    .getByRole("button", { name: "Try the testnet demo" })
    .click();
  await landingPage.waitForFunction(
    () => document.activeElement?.textContent?.trim() === "Retry secure sign-in",
  );
  await landingPage.setViewportSize({ width: 390, height: 844 });
  await landingPage
    .getByRole("heading", { name: "Sign in to try OpenEscrow" })
    .waitFor({ state: "visible" });
  const mobilePromptButton = landingPage.getByRole("button", {
    name: "Show sign-in options",
  });
  const mobilePromptButtonBox = await mobilePromptButton.boundingBox();
  assert.ok(
    mobilePromptButtonBox && mobilePromptButtonBox.height >= 44,
    "The public sign-in recovery action must remain a full-size mobile touch target.",
  );
  const mobileSignInRetryBox = await retrySecureSignIn.boundingBox();
  assert.ok(
    mobileSignInRetryBox && mobileSignInRetryBox.height >= 44,
    "The account-provider retry must remain a full-size mobile touch target.",
  );
  const mobileDonationButtonBox = await copyDonationAddress.boundingBox();
  assert.ok(
    mobileDonationButtonBox && mobileDonationButtonBox.height >= 44,
    "The donation copy action must remain a full-size mobile touch target.",
  );
  assert.equal(
    await landingPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "The public sign-in prompt must not create horizontal overflow at mobile width.",
  );
  await landingContext.close();

  const linkedContext = await browser.newContext();
  await isolateFromExternalProviders(linkedContext);
  const linkedPage = await linkedContext.newPage();
  const linkedAssets = observeLocalScripts(linkedPage);
  await linkedPage.goto(`${baseUrl}/?id=43&jurisdiction=us-ca`, {
    waitUntil: "domcontentloaded",
  });
  await linkedPage.waitForFunction(
    () => window.localStorage.getItem("openescrow:jurisdiction:43") === "us-ca",
  );
  assert.equal(
    [...linkedAssets].some((assetName) => assetName.startsWith("jurisdictions-")),
    true,
    "An agreement link with a jurisdiction hint must load and apply the registry on demand.",
  );
  await linkedContext.close();

  const invitationContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await isolateFromExternalProviders(invitationContext);
  const invitationPage = await invitationContext.newPage();
  const invitationAssets = observeLocalScripts(invitationPage);
  await invitationPage.goto(
    `${baseUrl}/?proposal=pilot-proposal&token=pilot-secret&invite=tenant`,
    { waitUntil: "domcontentloaded" },
  );
  await invitationPage
    .getByRole("heading", { name: "Secure sign-in is unavailable" })
    .waitFor({ state: "visible" });
  await invitationPage
    .getByRole("button", { name: "Retry secure sign-in" })
    .waitFor({ state: "visible" });
  const invitationRetryBox = await invitationPage
    .getByRole("button", { name: "Retry secure sign-in" })
    .boundingBox();
  assert.ok(
    invitationRetryBox && invitationRetryBox.height >= 44,
    "Invitation sign-in recovery must remain a full-size mobile touch target.",
  );
  assert.equal(
    await invitationPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Invitation sign-in recovery must not create horizontal overflow at mobile width.",
  );
  assert.equal(
    await invitationPage.locator("details.notification-center").count(),
    0,
    "A provider outage must not expose invitation workspace controls before authentication.",
  );
  assert.equal(
    new URL(invitationPage.url()).searchParams.has("token"),
    false,
    "A role-restricted invitation must scrub its bearer token from the URL.",
  );
  assert.equal(
    await invitationPage.evaluate(
      () =>
        JSON.parse(
          window.sessionStorage.getItem(
            "openescrow.negotiationAccess.pilot-proposal.tenant",
          ) || "{}",
        ).token,
    ),
    "pilot-secret",
    "A provider outage must retain the scrubbed invitation only in the current tab.",
  );
  assert.equal(
    [...invitationAssets].some(
      (assetName) =>
        assetName.startsWith("WorkspaceApp-") ||
        assetName.startsWith("WalletProviders-"),
    ),
    false,
    "A provider outage must fail closed before loading invitation workspace or wallet code.",
  );
  assert.equal(
    await invitationPage
      .getByRole("button", { name: /I am a landlord/ })
      .count(),
    0,
    "An invitation must not expose an unrestricted role selector.",
  );
  await invitationContext.close();

  const invalidInvitationContext = await browser.newContext();
  await isolateFromExternalProviders(invalidInvitationContext);
  const invalidInvitationPage = await invalidInvitationContext.newPage();
  const invalidInvitationAssets = observeLocalScripts(invalidInvitationPage);
  await invalidInvitationPage.goto(
    `${baseUrl}/?token=pilot-secret&invite=tenant`,
    { waitUntil: "domcontentloaded" },
  );
  await invalidInvitationPage
    .getByRole("heading", { name: "A better way to handle rental deposits." })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(invalidInvitationPage.url()).searchParams.has("token"),
    false,
    "An invalid invitation must still scrub its bearer token from the URL.",
  );
  assert.equal(
    new URL(invalidInvitationPage.url()).searchParams.has("invite"),
    false,
    "An invalid invitation must remove its untrusted role hint.",
  );
  assert.equal(
    [...invalidInvitationAssets].some((assetName) =>
      assetName.startsWith("WorkspaceApp-"),
    ),
    false,
    "An invalid invitation role must not preload the workspace.",
  );
  assert.equal(
    await invalidInvitationPage
      .getByRole("button", { name: /I am a landlord/ })
      .count(),
    0,
    "An invalid invitation must fall back to neutral sign-in without role selection.",
  );
  await invalidInvitationContext.close();

  const roleHintContext = await browser.newContext();
  await isolateFromExternalProviders(roleHintContext);
  const roleHintPage = await roleHintContext.newPage();
  const roleHintAssets = observeLocalScripts(roleHintPage);
  await roleHintPage.goto(`${baseUrl}/?invite=tenant`, {
    waitUntil: "domcontentloaded",
  });
  await roleHintPage
    .getByRole("heading", { name: "A better way to handle rental deposits." })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(roleHintPage.url()).searchParams.has("invite"),
    false,
    "A bare role hint is not an invitation and must be removed.",
  );
  assert.equal(
    [...roleHintAssets].some((assetName) =>
      assetName.startsWith("WorkspaceApp-"),
    ),
    false,
    "A bare role hint must keep the role-neutral public entry experience.",
  );
  await roleHintContext.close();

  const agreementInvitationContext = await browser.newContext();
  await isolateFromExternalProviders(agreementInvitationContext);
  const agreementInvitationPage = await agreementInvitationContext.newPage();
  const agreementInvitationAssets = observeLocalScripts(
    agreementInvitationPage,
  );
  await agreementInvitationPage.goto(
    `${baseUrl}/?id=43&jurisdiction=us-ca&invite=tenant`,
    { waitUntil: "domcontentloaded" },
  );
  await agreementInvitationPage
    .getByRole("heading", { name: "Secure sign-in is unavailable" })
    .waitFor({ state: "visible" });
  assert.equal(
    [...agreementInvitationAssets].some((assetName) =>
      assetName.startsWith("WorkspaceApp-"),
    ),
    false,
    "An agreement invitation must fail closed before workspace code during a provider outage.",
  );
  assert.equal(
    new URL(agreementInvitationPage.url()).searchParams.get("invite"),
    "tenant",
    "A valid agreement invitation must retain its role restriction.",
  );
  await agreementInvitationContext.close();

  console.log(
    `Landing-load check passed: ${landingAssets.size} JavaScript file(s), ${landingBytes} bytes, no eager workspace, jurisdiction registry, or blockchain wallet providers; the public explanation remains available during an account-provider outage, invitations retain same-tab recovery, and restricted entry fails closed before workspace code.`,
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
