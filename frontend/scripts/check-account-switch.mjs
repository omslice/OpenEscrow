import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const configuredPort = Number.parseInt(
  process.env.OPENESCROW_ACCOUNT_SWITCH_TEST_PORT || "",
  10,
);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1_024 && configuredPort <= 65_535
    ? configuredPort
    : 21_000 + (process.pid % 30_000);
const baseUrl = `http://${host}:${port}`;
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function buildRecord(account) {
  const now = "2026-07-30T20:00:00.000Z";
  const isA = account === "a";
  return {
    id: isA ? "aaaaaaaa" : "bbbbbbbb",
    status: "draft",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    landlordName: isA ? "Account A" : "Account B",
    landlordEmail: `account.${account}@example.test`,
    tenantName: isA ? "Tenant A" : "Tenant B",
    tenantEmail: `tenant.${account}@example.test`,
    tenants: [
      {
        id: `tenant-${account}`,
        name: isA ? "Tenant A" : "Tenant B",
        email: `tenant.${account}@example.test`,
        approved: false,
        wallet: null,
        isFundingTenant: true,
        acceptedAt: null,
        depositShareBps: 10_000,
      },
    ],
    arbiterName: null,
    arbiterEmail: null,
    terms: {
      jurisdiction: "TEST",
      propertyAddress: `${isA ? "100" : "200"} Test Street`,
      tokenChoice: "plain",
      deposit: "1000",
      operationsReserve: "0",
      claimWindowStart: "2027-01-01T00:00:00.000Z",
      claimDays: "30",
      responseDays: "14",
      arbiterDays: "14",
    },
    tenantApproved: false,
    arbiterApproved: false,
    tenantWallet: null,
    arbiterWallet: null,
    onchainAgreementId: null,
    onchainTxHash: null,
    events: [
      {
        id: 1,
        createdAt: now,
        actorRole: "landlord",
        action: "proposal_created",
        summary: `Created account ${account.toUpperCase()} proposal.`,
        revision: 1,
      },
    ],
  };
}

function inventoryFor(account) {
  return {
    schema: "openescrow.account-data-inventory.v1",
    generatedAt: "2026-07-30T20:00:00.000Z",
    scope: `account-${account}`,
    verifiedEmailCount: 1,
    records: [],
    accountSettings: {
      activeRecordSessions: 0,
      archivedRecordPreferences: 0,
      notificationPreferences: null,
    },
    boundaries: {
      includesPrivateEvidence: false,
      includesInvitationOrSessionTokens: false,
      includesOtherParticipantDetails: false,
      deletesOrChangesData: false,
      publicBlockchainRecordsCanBeErased: false,
    },
  };
}

function readyServiceReadiness() {
  const now = "2026-07-30T20:00:00.000Z";
  return {
    email: {
      configured: true,
      provider: "resend",
      participantDeliveryReady: true,
      senderMode: "participant-capable",
      deliveryStatusConfigured: true,
      schedulerConfigured: true,
      schedulerLastRunAt: now,
      schedulerHealthy: true,
      schedulerExpectedIntervalMinutes: 15,
      schedulerAgeMinutes: 1,
    },
    evidence: {
      configured: true,
      mode: "private-r2",
      encryptedAtRest: true,
      activeEncryptionKeyId: "test-active-key",
      retainedDecryptionKeyCount: 1,
      referencedEncryptionKeyCount: 1,
      missingDecryptionKeyCount: 0,
      unverifiedEncryptionKeyCount: 0,
      mismatchedDecryptionKeyCount: 0,
      keyringReady: true,
      encryptionError: null,
      decentralizedReady: false,
    },
    recordIntegrity: {
      lifecycleStateGuards: true,
      transactionReceiptVerification: true,
      chain: "Base Sepolia",
      activityRegistry: {
        configured: true,
        verificationEnabled: true,
        ready: true,
        registryAddress: "0x1000000000000000000000000000000000000001",
        expectedEscrowAddress: "0x2000000000000000000000000000000000000002",
        boundEscrowAddress: "0x2000000000000000000000000000000000000002",
        checkedAt: now,
        error: null,
      },
    },
    addressValidation: {
      configured: true,
      provider: "Photon / OpenStreetMap",
      tamperResistantProfiles: true,
    },
    complianceSources: {
      configured: true,
      proposalGateEnforced: true,
      total: 61,
      tracked: 61,
      changed: 0,
      unreachable: 0,
      pending: 0,
      stale: 0,
      blocked: 0,
      lastRunAt: now,
      monitorHealthy: true,
      monitorExpectedIntervalMinutes: 15,
      monitorLastRunAgeMinutes: 1,
      maxVerificationAgeDays: 21,
      ready: true,
    },
  };
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      const workspaceModule = response.ok
        ? await fetch(`${baseUrl}/src/WorkspaceApp.tsx`)
        : null;
      if (response.ok && workspaceModule?.ok) return;
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
    "account-switch-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      VITE_PRIVY_APP_ID: "openescrow-account-switch-test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

const archiveRelease = deferred();
const archiveSeen = deferred();
const inventoryRelease = deferred();
const inventorySeen = deferred();
const revokeRelease = deferred();
const revokeSeen = deferred();
const preferenceRelease = deferred();
const preferenceSeen = deferred();
const testEmailRelease = deferred();
const testEmailSeen = deferred();
const accountArchiveState = { a: false, b: false };
let delayedArchiveHandled = false;
let downloadedFiles = 0;
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  page.on("download", () => {
    downloadedFiles += 1;
  });

  await page.route("**/api/system/readiness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(readyServiceReadiness()),
    });
  });
  await page.route("**/api/profile/notification-preferences", async (route) => {
    if (route.request().method() === "PUT") {
      assert.equal(
        route.request().headers()["privy-id-token"],
        "identity-token-b",
        "The delayed preference save must remain bound to account B.",
      );
      assert.deepEqual(route.request().postDataJSON(), {
        agreementActivity: true,
        deadlineReminders: false,
        consentedAt: null,
        updatedAt: null,
      });
      preferenceSeen.resolve();
      await preferenceRelease.promise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agreementActivity: true,
          deadlineReminders: false,
          consentedAt: "2026-07-30T20:02:00.000Z",
          updatedAt: "2026-07-30T20:02:00.000Z",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        agreementActivity: false,
        deadlineReminders: false,
        consentedAt: null,
        updatedAt: null,
      }),
    });
  });
  await page.route("**/api/profile/test-email", async (route) => {
    assert.equal(
      route.request().headers()["privy-id-token"],
      "identity-token-a",
      "The delayed test email must remain bound to account A.",
    );
    testEmailSeen.resolve();
    await testEmailRelease.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sent: true,
        duplicate: false,
        provider: "resend",
        messageId: "account-a-test-message",
      }),
    });
  });
  await page.route("**/api/negotiations/discover", async (route) => {
    const token = route.request().headers()["privy-id-token"];
    const account = token === "identity-token-a" ? "a" : "b";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accesses: [
          {
            proposalId: account === "a" ? "aaaaaaaa" : "bbbbbbbb",
            role: "landlord",
            token: `record-token-${account}`,
            archived: accountArchiveState[account],
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/negotiations\/(?:aaaaaaaa|bbbbbbbb)$/, async (route) => {
    const account = route.request().url().includes("aaaaaaaa") ? "a" : "b";
    const requestUrl = new URL(route.request().url());
    assert.equal(
      requestUrl.searchParams.has("token"),
      false,
      "Account-discovered record access must keep its bearer out of the URL.",
    );
    assert.equal(
      route.request().headers().authorization,
      `Bearer record-token-${account}`,
      "Account-discovered record access must use the matching authorization header.",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildRecord(account)),
    });
  });
  await page.route("**/api/profile/record-archives", async (route) => {
    const token = route.request().headers()["privy-id-token"];
    const body = route.request().postDataJSON();
    if (token !== "identity-token-a") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Only account A is archived in this regression." }),
      });
      return;
    }
    assert.deepEqual(body, {
      proposalId: "aaaaaaaa",
      role: "landlord",
      archived: body.archived,
    });
    assert.equal(typeof body.archived, "boolean");
    if (body.archived && !delayedArchiveHandled) {
      delayedArchiveHandled = true;
      archiveSeen.resolve();
      await archiveRelease.promise;
    }
    accountArchiveState.a = body.archived;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: "aaaaaaaa",
        role: "landlord",
        archived: body.archived,
        archivedAt: body.archived ? "2026-07-30T20:01:00.000Z" : null,
      }),
    });
  });
  await page.route("**/api/profile/data-inventory", async (route) => {
    const token = route.request().headers()["privy-id-token"];
    if (token !== "identity-token-b") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(inventoryFor("a")),
      });
      return;
    }
    inventorySeen.resolve();
    await inventoryRelease.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(inventoryFor("b")),
    });
  });
  await page.route("**/api/profile/account-sessions/revoke", async (route) => {
    const token = route.request().headers()["privy-id-token"];
    assert.equal(
      token,
      "identity-token-a",
      "The session-containment request must remain bound to account A.",
    );
    revokeSeen.resolve();
    await revokeRelease.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revoked: true, revokedSessions: 2 }),
    });
  });

  const invitationContext = await browser.newContext();
  const invitationPage = await invitationContext.newPage();
  await invitationPage.goto(
    `${baseUrl}/?proposal=pilot-proposal&invite=tenant&public-access-test=1#token=pilot-secret`,
    { waitUntil: "domcontentloaded" },
  );
  await invitationPage
    .getByRole("button", { name: "Continue as tenant with Google" })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(invitationPage.url()).searchParams.has("token"),
    false,
    "A role-aware invitation must scrub its bearer token before sign-in.",
  );
  assert.equal(new URL(invitationPage.url()).hash.includes("token="), false);
  assert.equal(
    await invitationPage.locator("details.notification-center > summary").count(),
    1,
    "A loaded invitation workspace must retain its agreement notification control.",
  );
  assert.equal(
    await invitationPage.getByRole("button", { name: /I am a landlord/ }).count(),
    0,
    "A specific invitation must not expose an unrestricted role selector.",
  );
  await invitationContext.close();

  const recoverableInvitationContext = await browser.newContext();
  const recoverableInvitationPage = await recoverableInvitationContext.newPage();
  const workspaceModulePattern = "**/src/WorkspaceApp.tsx*";
  await recoverableInvitationPage.route(
    workspaceModulePattern,
    async (route) => route.abort("failed"),
  );
  await recoverableInvitationPage.goto(
    `${baseUrl}/?proposal=recoverable-proposal&invite=tenant&public-access-test=1#token=recoverable-secret`,
    { waitUntil: "domcontentloaded" },
  );
  await recoverableInvitationPage
    .getByRole("heading", { name: "OpenEscrow couldn't finish loading" })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(recoverableInvitationPage.url()).searchParams.has("token"),
    false,
    "A failed workspace download must not put the invitation token back in the URL.",
  );
  assert.equal(
    new URL(recoverableInvitationPage.url()).hash.includes("token="),
    false,
  );
  assert.equal(
    await recoverableInvitationPage.evaluate(
      () =>
        JSON.parse(
          window.sessionStorage.getItem(
            "openescrow.negotiationAccess.recoverable-proposal.tenant",
          ) || "{}",
        ).token,
    ),
    "recoverable-secret",
    "A scrubbed invitation must retain same-tab recovery before the workspace downloads.",
  );
  assert.equal(
    await recoverableInvitationPage.evaluate(
      () =>
        window.localStorage.getItem(
          "openescrow.negotiationAccess.recoverable-proposal.tenant",
        ),
    ),
    null,
    "A bearer invitation must not be promoted into persistent local storage.",
  );
  await recoverableInvitationPage.unroute(workspaceModulePattern);
  await recoverableInvitationPage
    .getByRole("button", { name: "Reload OpenEscrow" })
    .click();
  await recoverableInvitationPage
    .getByRole("button", { name: "Continue as tenant with Google" })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(recoverableInvitationPage.url()).searchParams.has("token"),
    false,
    "Reload recovery must keep the bearer token out of browser history.",
  );
  await recoverableInvitationContext.close();

  const agreementInvitationContext = await browser.newContext();
  const agreementInvitationPage = await agreementInvitationContext.newPage();
  await agreementInvitationPage.goto(
    `${baseUrl}/?id=43&jurisdiction=us-ca&invite=tenant&public-access-test=1`,
    { waitUntil: "domcontentloaded" },
  );
  await agreementInvitationPage
    .getByRole("button", { name: "Continue as tenant with Google" })
    .waitFor({ state: "visible" });
  assert.equal(
    new URL(agreementInvitationPage.url()).searchParams.get("invite"),
    "tenant",
    "A valid agreement invitation must retain its role restriction.",
  );
  await agreementInvitationContext.close();

  const returningAccountContext = await browser.newContext();
  await returningAccountContext.addInitScript(() => {
    window.localStorage.setItem(
      "openescrow:account-provider-activated",
      "1",
    );
  });
  const returningAccountPage = await returningAccountContext.newPage();
  await returningAccountPage.goto(`${baseUrl}/?public-access-test=1`, {
    waitUntil: "domcontentloaded",
  });
  await returningAccountPage.waitForFunction(
    () => Boolean(window.__openEscrowAccountSwitchTest),
  );
  await returningAccountPage
    .getByRole("button", { name: "Continue with Google" })
    .waitFor({ state: "visible" });
  assert.deepEqual(
    await returningAccountPage.evaluate(
      () => window.__openEscrowAccountSwitchTest?.snapshot().loginAttempts,
    ),
    [],
    "A prior activation hint may restore the provider but must not start sign-in by itself.",
  );
  await returningAccountContext.close();

  const rejectedLoginContext = await browser.newContext();
  const rejectedLoginPage = await rejectedLoginContext.newPage();
  await rejectedLoginPage.goto(
    `${baseUrl}/?public-access-test=1&login-reject-test=1`,
    { waitUntil: "domcontentloaded" },
  );
  await rejectedLoginPage
    .getByRole("button", { name: "Continue with a wallet" })
    .click();
  await rejectedLoginPage
    .getByRole("alert")
    .filter({ hasText: "Sign-in did not open" })
    .waitFor({ state: "visible" });
  assert.equal(
    await rejectedLoginPage
      .getByRole("heading", { name: "A better way to handle rental deposits." })
      .count(),
    1,
    "A rejected provider-on-demand sign-in must retain the public explanation.",
  );
  assert.equal(
    await rejectedLoginPage.getByRole("tab", { name: "Dashboard" }).count(),
    0,
    "A rejected sign-in must not load an authenticated workspace.",
  );
  await rejectedLoginPage
    .getByRole("button", { name: "Continue with a wallet" })
    .click();
  await rejectedLoginPage
    .getByRole("alert")
    .filter({ hasText: "Sign-in could not start" })
    .waitFor({ state: "visible" });
  await rejectedLoginPage
    .getByRole("button", { name: "Continue with a wallet" })
    .click();
  await rejectedLoginPage
    .getByRole("heading", { name: "How are you using OpenEscrow today?" })
    .waitFor({ state: "visible" });
  assert.deepEqual(
    await rejectedLoginPage.evaluate(
      () => window.__openEscrowAccountSwitchTest?.snapshot().loginAttempts,
    ),
    ["wallet", "wallet", "wallet"],
    "Rejected automatic and direct wallet sign-in attempts must recover through the same method without a reload.",
  );
  await rejectedLoginContext.close();

  await page.goto(`${baseUrl}/?public-access-test=1`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("heading", { name: "Sign in to try OpenEscrow" })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: /I am a landlord/ }).count(),
    0,
    "A clean signed-out visit must not choose an agreement role before account authentication.",
  );
  await page
    .getByRole("button", { name: "Continue with Google" })
    .click();
  await page
    .getByRole("heading", { name: "How are you using OpenEscrow today?" })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(
      () => window.__openEscrowAccountSwitchTest?.snapshot().loginAttempts,
    ),
    ["google"],
    "The first public Google choice must open the matching provider method without a second click.",
  );
  await page.getByRole("button", { name: /I am a landlord/ }).click();
  const accountRoleBadge = page.locator(
    "details.account-profile-disclosure > summary .account-role-badge",
  );
  await accountRoleBadge.waitFor({ state: "visible" });
  assert.equal(
    await accountRoleBadge.textContent(),
    "Landlord",
    "The collapsed account summary must identify the active workspace role.",
  );
  await page.getByRole("tab", { name: "Proposals" }).click();
  await page.getByRole("heading", { name: "OE-P-AAAAAAAA" }).waitFor();
  await page.waitForFunction(
    () =>
      window.__openEscrowAccountSwitchTest?.snapshot().walletAttempts[
        "account-a"
      ] >= 1,
  );

  const accountACard = page
    .locator("article.saved-proposal-card")
    .filter({ hasText: "OE-P-AAAAAAAA" });
  await accountACard.getByRole("button", { name: "Archive" }).click();
  await archiveSeen.promise;

  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-b");
  });
  await page.getByTitle("account.b@example.test").waitFor();
  await page.getByRole("tab", { name: "Proposals" }).click();
  await page.getByRole("heading", { name: "OE-P-BBBBBBBB" }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "OE-P-AAAAAAAA" }).count(),
    0,
    "Account A's proposal must disappear immediately after selecting account B.",
  );
  await page.waitForFunction(
    () =>
      window.__openEscrowAccountSwitchTest?.snapshot().walletAttempts[
        "account-b"
      ] >= 1,
  );

  archiveRelease.resolve();
  await page.waitForTimeout(100);
  assert.equal(
    await page.getByText("OE-P-AAAAAAAA archived.", { exact: true }).count(),
    0,
    "A completed account A archive must not announce or update inside account B.",
  );
  assert.equal(
    await page.getByRole("heading", { name: "OE-P-BBBBBBBB" }).count(),
    1,
    "Account B's proposal must remain visible after account A's archive completes.",
  );

  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.resolveWallet("account-a");
    window.__openEscrowAccountSwitchTest?.resolveWallet("account-b");
  });
  await page.waitForFunction(() => {
    const snapshot = window.__openEscrowAccountSwitchTest?.snapshot();
    return (
      snapshot?.walletCounts["account-a"] === 1 &&
      snapshot.walletCounts["account-b"] === 1
    );
  });

  await page.locator("details.account-profile-disclosure > summary").click();
  assert.equal(
    await page.locator(".account-info-card").count(),
    2,
    "Account identity and wallets should render as two scannable information cards.",
  );
  assert.equal(
    await page.locator(".notification-choice").count(),
    2,
    "Notification preferences should render as two clear consumer choices.",
  );
  await page.getByText("Email notifications are ready", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".account-security-option").count(),
    2,
    "Inventory and session-safety actions should remain visibly separated.",
  );
  const deliveryDetails = page.locator("details.notification-technical-details");
  assert.equal(
    await deliveryDetails.getAttribute("open"),
    null,
    "Provider and scheduler diagnostics should start collapsed for consumers.",
  );
  const deliveryDetailsBox = await deliveryDetails.getByText("Delivery details", {
    exact: true,
  }).boundingBox();
  assert.equal(
    Boolean(deliveryDetailsBox && deliveryDetailsBox.height >= 44),
    true,
    "Delivery diagnostics should retain a full-size disclosure target.",
  );
  await page.getByRole("button", { name: "Download data inventory" }).click();
  await inventorySeen.promise;
  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-a");
  });
  await page.getByTitle("account.a@example.test").waitFor();
  inventoryRelease.resolve();
  await page.waitForTimeout(150);

  assert.equal(
    downloadedFiles,
    0,
    "An inventory prepared for account B must not download after account A becomes active.",
  );
  assert.equal(
    await page.getByText(/Downloaded an inventory of/).count(),
    0,
    "A stale account B inventory must not publish success feedback in account A.",
  );

  await page.locator("details.account-profile-disclosure > summary").click();
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page
    .getByRole("button", { name: "End record sessions & sign out" })
    .click();
  await revokeSeen.promise;
  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-b");
  });
  await page.getByTitle("account.b@example.test").waitFor();
  revokeRelease.resolve();
  await page.waitForTimeout(150);

  const finalSnapshot = await page.evaluate(() =>
    window.__openEscrowAccountSwitchTest?.snapshot(),
  );
  assert.equal(
    Object.values(finalSnapshot?.logoutCalls ?? {}).reduce(
      (total, calls) => total + calls,
      0,
    ),
    0,
    "Account A's completed session revocation must not sign out account B.",
  );
  assert.equal(
    finalSnapshot?.currentAccount,
    "account-b",
    "Account B must remain the active provider identity after account A's revocation completes.",
  );
  assert.equal(
    await page.getByTitle("account.b@example.test").count(),
    1,
    "Account B must remain visibly mounted after account A's revocation completes.",
  );

  await page.locator("details.account-profile-disclosure > summary").click();
  const accountBActivityPreference = page.getByRole("checkbox", {
    name: /Agreement updates/,
  });
  assert.equal(
    await accountBActivityPreference.isChecked(),
    false,
    "Account B's activity preference starts disabled.",
  );
  await accountBActivityPreference.check();
  await preferenceSeen.promise;
  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-a");
  });
  await page.getByTitle("account.a@example.test").waitFor();
  await page.locator("details.account-profile-disclosure > summary").click();
  const accountAActivityPreference = page.getByRole("checkbox", {
    name: /Agreement updates/,
  });
  assert.equal(
    await accountAActivityPreference.isChecked(),
    false,
    "Account A must not inherit account B's optimistic preference state.",
  );
  preferenceRelease.resolve();
  await page.waitForTimeout(150);
  assert.equal(
    await page.getByText(/Preferences synced to your account/).count(),
    0,
    "Account B's completed preference save must not publish feedback in account A.",
  );
  assert.equal(
    await accountAActivityPreference.isChecked(),
    false,
    "Account B's saved preference response must not update account A.",
  );

  await page.getByRole("button", { name: "Send test email" }).click();
  await testEmailSeen.promise;
  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-b");
  });
  await page.getByTitle("account.b@example.test").waitFor();
  testEmailRelease.resolve();
  await page.waitForTimeout(150);
  assert.equal(
    await page.getByText("Test email sent. Check this account's inbox.").count(),
    0,
    "Account A's completed test email must not publish feedback in account B.",
  );
  await page.locator("details.account-profile-disclosure > summary").click();
  assert.equal(
    await page.getByRole("button", { name: "Send test email" }).count(),
    1,
    "Account B must retain an idle test-email control after account A's request completes.",
  );
  assert.equal(
    await page.getByRole("button", { name: "Sending..." }).count(),
    0,
    "Account B must not inherit account A's pending test-email state.",
  );

  await page.evaluate(() => {
    window.__openEscrowAccountSwitchTest?.switchAccount("account-a");
  });
  await page.getByTitle("account.a@example.test").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileAccountDisclosure = page.locator(
    "details.account-profile-disclosure > summary",
  );
  await mobileAccountDisclosure.click();
  await assertMobileActionTarget(
    page.getByRole("button", { name: "Download data inventory" }),
    "Download account inventory",
  );
  await assertMobileActionTarget(
    page.getByRole("button", { name: "End record sessions & sign out" }),
    "End record sessions",
  );
  const mobileNotificationChoices = page.locator(".notification-choice");
  for (let index = 0; index < (await mobileNotificationChoices.count()); index += 1) {
    const choiceBox = await mobileNotificationChoices.nth(index).boundingBox();
    assert.equal(
      Boolean(choiceBox && choiceBox.height >= 44),
      true,
      "Notification choices should remain full-size mobile touch targets.",
    );
  }
  const accountMobileWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(
    accountMobileWidth.document <= accountMobileWidth.viewport,
    true,
    `Account settings should not overflow mobile width: ${JSON.stringify(accountMobileWidth)}`,
  );
  await mobileAccountDisclosure.click();
  await page.getByRole("tab", { name: "Proposals" }).click();

  const proposalArchiveSummary = page.getByText("Archived proposals (1)", {
    exact: true,
  });
  await proposalArchiveSummary.waitFor({ state: "visible" });
  assert.equal(
    await page
      .locator("section.active-proposals-section > article.saved-proposal-card")
      .filter({ hasText: "OE-P-AAAAAAAA" })
      .count(),
    0,
    "A server-archived proposal must not remain in the current proposal list.",
  );
  await proposalArchiveSummary.click();
  const archivedProposalCard = page
    .locator(".proposal-archive-list article.saved-proposal-card")
    .filter({ hasText: "OE-P-AAAAAAAA" });
  const restoreProposalButton = archivedProposalCard.getByRole("button", {
    name: "Restore",
  });
  await assertMobileActionTarget(restoreProposalButton, "Restore proposal");
  await restoreProposalButton.click();
  await page
    .getByText("OE-P-AAAAAAAA restored.", { exact: true })
    .waitFor({ state: "visible" });
  const currentProposalCard = page
    .locator("section.active-proposals-section > article.saved-proposal-card")
    .filter({ hasText: "OE-P-AAAAAAAA" });
  await currentProposalCard.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.textContent?.includes("OE-P-AAAAAAAA"),
  );

  await page.getByRole("tab", { name: "Record" }).click();
  const currentRecordCard = page
    .locator("article.record-list-item")
    .filter({ hasText: "OE-P-AAAAAAAA" });
  await currentRecordCard.waitFor({ state: "visible" });
  const archiveRecordButton = currentRecordCard.getByRole("button", {
    name: "Archive",
  });
  await assertMobileActionTarget(archiveRecordButton, "Archive record");
  await archiveRecordButton.click();
  await page
    .getByText("OE-P-AAAAAAAA archived.", { exact: true })
    .waitFor({ state: "visible" });
  const recordArchiveSummary = page.getByText("Archived records (1)", {
    exact: true,
  });
  await recordArchiveSummary.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(
      () => document.activeElement?.id === "record-archive-summary",
    ),
    true,
    "Archiving a record should focus the newly available archive summary.",
  );
  const archivedRecordCard = page
    .locator("details.record-archive-section article.record-list-item")
    .filter({ hasText: "OE-P-AAAAAAAA" });
  const restoreRecordButton = archivedRecordCard.getByRole("button", {
    name: "Restore",
  });
  await assertMobileActionTarget(restoreRecordButton, "Restore record");
  await restoreRecordButton.click();
  await page
    .getByText("OE-P-AAAAAAAA restored.", { exact: true })
    .waitFor({ state: "visible" });
  await currentRecordCard.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Proposal and record archive controls must fit a mobile viewport.",
  );

  process.stdout.write(
    "Account-switch browser check passed: neutral and role-aware invitation sign-in recover safely; proposal and Record archives restore in the rendered mobile workspace; and archives, wallet setup, inventory delivery, session containment, notification preferences, and test-email feedback remain isolated across live identity changes.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
}
