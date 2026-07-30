import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4176;
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
            archived: false,
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/negotiations\/(?:aaaaaaaa|bbbbbbbb)\?/, async (route) => {
    const account = route.request().url().includes("aaaaaaaa") ? "a" : "b";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildRecord(account)),
    });
  });
  await page.route("**/api/profile/record-archives", async (route) => {
    const token = route.request().headers()["privy-id-token"];
    if (token !== "identity-token-a") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Only account A is archived in this regression." }),
      });
      return;
    }
    archiveSeen.resolve();
    await archiveRelease.promise;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: "aaaaaaaa",
        role: "landlord",
        archived: true,
        archivedAt: "2026-07-30T20:01:00.000Z",
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

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /I am a landlord/ }).click();
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
    name: /Agreement invitations, funding, claims, responses, and rulings/,
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
    name: /Agreement invitations, funding, claims, responses, and rulings/,
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

  process.stdout.write(
    "Account-switch browser check passed: proposals, archives, wallet setup, inventory delivery, session containment, notification preferences, and test-email feedback remain isolated across live identity changes.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
