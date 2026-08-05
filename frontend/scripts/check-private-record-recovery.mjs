import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const configuredPort = Number.parseInt(
  process.env.OPENESCROW_PRIVATE_RECORD_TEST_PORT || "",
  10,
);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1_024 && configuredPort <= 65_535
    ? configuredPort
    : 20_000 + (process.pid % 30_000);
const baseUrl = `http://${host}:${port}`;
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

const negotiationRecord = {
  id: "OE-P-RECOVERY",
  status: "finalized",
  revision: 1,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
  landlordName: "Test Landlord",
  landlordEmail: "landlord@example.test",
  tenantName: "Test Tenant",
  tenantEmail: "tenant@example.test",
  tenants: [
    {
      id: "tenant-1",
      name: "Test Tenant",
      email: "tenant@example.test",
      approved: true,
      wallet: "0x2222222222222222222222222222222222222222",
      isFundingTenant: true,
      acceptedAt: "2026-07-31T00:00:00.000Z",
      depositShareBps: 10_000,
    },
  ],
  arbiterName: null,
  arbiterEmail: null,
  terms: {
    jurisdiction: "non-specific-test",
    propertyAddress: "Synthetic test address",
    tokenChoice: "plain",
    deposit: "1",
    operationsReserve: "0",
    claimWindowStart: "2026-07-31T00:00:00.000Z",
    claimDays: "1",
    responseDays: "1",
    arbiterDays: "1",
  },
  tenantApproved: true,
  arbiterApproved: false,
  tenantWallet: "0x2222222222222222222222222222222222222222",
  arbiterWallet: null,
  onchainAgreementId: "43",
  onchainTxHash: `0x${"4".repeat(64)}`,
  events: [],
};

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

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

function routePrivateRecord(page, failAttempts = new Set([1, 2])) {
  let attempts = 0;
  return page.route(/\/api\/negotiations\/OE-P-RECOVERY$/, async (route) => {
    const requestUrl = new URL(route.request().url());
    assert.equal(
      requestUrl.searchParams.has("token"),
      false,
      "Private-record recovery must keep agreement access out of the URL.",
    );
    assert.equal(
      route.request().headers().authorization,
      "Bearer synthetic-private-record-recovery-token",
      "Private-record recovery must use its exact agreement authorization header.",
    );
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (failAttempts.has(attempts)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated private record outage" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(negotiationRecord),
    });
  });
}

async function routeClaimReceiptRecovery(page) {
  let attempts = 0;
  await page.route(/\/api\/negotiations\/OE-P-RECOVERY\/actions$/, async (route) => {
    attempts += 1;
    const body = JSON.parse(route.request().postData() || "{}");
    assert.equal(
      body.token,
      "synthetic-private-record-recovery-token",
      "The receipt retry must remain bound to the landlord's exact agreement access.",
    );
    assert.equal(body.type, "claim_submitted");
    assert.equal(body.transactionHash, `0x${"9".repeat(64)}`);
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated receipt-save outage" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(negotiationRecord),
    });
  });
  await page.route("**/api/evidence", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cid: "synthetic-recovery-file",
        uri: "openescrow://evidence/synthetic-recovery-file",
        gatewayUrl: "/api/evidence/synthetic-recovery-file",
        sha256: `0x${"7".repeat(64)}`,
        storageKind: "encrypted-private",
      }),
    });
  });
  return () => attempts;
}

async function routeDecisionReceiptRecovery(
  page,
  { type, transactionHash, timeout },
) {
  let attempts = 0;
  await page.route(
    /\/api\/negotiations\/OE-P-RECOVERY\/actions$/,
    async (route) => {
      attempts += 1;
      const body = JSON.parse(route.request().postData() || "{}");
      assert.equal(
        body.token,
        "synthetic-private-record-recovery-token",
        "Decision receipt retries must use the current scoped access without persisting it.",
      );
      assert.equal(body.type, type);
      assert.equal(body.transactionHash, transactionHash);
      if (timeout) assert.equal(body.timeout, timeout);
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated receipt-save outage" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(negotiationRecord),
      });
    },
  );
  return () => attempts;
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
        body: JSON.stringify(negotiationRecord),
      });
    },
  );
  return () => attempts;
}

async function pendingDecisionRecoveryEntries(page) {
  return page.evaluate(() => {
    const entries = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("openescrow:pending-decision-receipt:")) {
        entries.push([key, window.sessionStorage.getItem(key)]);
      }
    }
    return entries;
  });
}

async function pendingTerminalRecoveryEntries(page) {
  return page.evaluate(() => {
    const entries = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("openescrow:pending-terminal-receipt:")) {
        entries.push([key, window.sessionStorage.getItem(key)]);
      }
    }
    return entries;
  });
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

async function exerciseTerminalReceiptRecovery(
  browserInstance,
  {
    flow,
    role,
    actionType,
    timeout,
    transactionHash,
    transactionButton,
    retryButton,
    confirmedHeading,
    recoveredText,
    transactionCountKey,
  },
) {
  const page = await browserInstance.newPage({
    viewport: { width: 390, height: 844 },
  });
  const receiptAttempts = await routeDecisionReceiptRecovery(page, {
    type: actionType,
    transactionHash,
    timeout,
  });
  const pageUrl = `${baseUrl}/testing/private-record-recovery.html?role=${role}&flow=${flow}`;
  await page.goto(`${pageUrl}&tx=terminal-success`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: transactionButton }).click();

  const retry = page.getByRole("button", { name: retryButton });
  await retry.waitFor({ state: "visible" });
  await page
    .getByRole("heading", { name: confirmedHeading })
    .waitFor({ state: "visible" });
  assert.equal(
    await page.getByRole("button", { name: transactionButton }).count(),
    0,
    "A confirmed terminal action must hide the control that could submit another transaction.",
  );
  assert.equal(
    await retry.evaluate((element) => element === document.activeElement),
    true,
    "A failed terminal receipt save should focus its record-only retry.",
  );
  const retryBox = await retry.boundingBox();
  assert.equal(
    Boolean(retryBox && retryBox.height >= 44),
    true,
    "A terminal receipt retry must remain a 44px mobile touch target.",
  );
  const entries = await pendingTerminalRecoveryEntries(page);
  assert.equal(entries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(entries),
    /synthetic-private-record-recovery-token/,
    "A terminal receipt retry must not store its bearer token.",
  );
  assert.equal(
    await page.evaluate((key) => window.sessionStorage.getItem(key), transactionCountKey),
    "1",
  );

  const otherRole = role === "tenant" ? "landlord" : "tenant";
  await page.goto(`${baseUrl}/testing/private-record-recovery.html?role=${otherRole}&flow=${flow}`, {
    waitUntil: "networkidle",
  });
  assert.equal(
    await page.getByRole("button", { name: retryButton }).count(),
    0,
    "A different wallet and role must not see another participant's pending receipt.",
  );

  await page.goto(pageUrl, { waitUntil: "networkidle" });
  const recoveredRetry = page.getByRole("button", { name: retryButton });
  await recoveredRetry.waitFor({ state: "visible" });
  await page.getByText(recoveredText).waitFor({ state: "visible" });
  assert.equal(
    await recoveredRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should focus the terminal action's record-only retry.",
  );
  await recoveredRetry.press("Enter");
  await page.waitForFunction(() => {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      if (
        window.sessionStorage
          .key(index)
          ?.startsWith("openescrow:pending-terminal-receipt:")
      ) {
        return false;
      }
    }
    return true;
  });
  await page
    .getByRole("button", {
      name: new RegExp(`(?:Saving|${retryButton})`, "i"),
    })
    .waitFor({ state: "detached" });
  assert.equal(receiptAttempts(), 2);
  assert.equal(
    await page.evaluate((key) => window.sessionStorage.getItem(key), transactionCountKey),
    "1",
    "A record-only retry must never resubmit the confirmed transaction.",
  );
  assert.equal((await pendingTerminalRecoveryEntries(page)).length, 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Terminal receipt recovery should not overflow a mobile viewport.",
  );
  await page.close();
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
let releaseClaimNotification;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const claimPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await routePrivateRecord(claimPage, new Set([1, 2, 4]));
  let claimNotificationAttempts = 0;
  const claimNotificationPending = new Promise((resolve) => {
    releaseClaimNotification = resolve;
  });
  await claimPage.route(/\/api\/notifications\/claim$/, async (route) => {
    claimNotificationAttempts += 1;
    if (claimNotificationAttempts === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Automatic email could not be sent. Use the Gmail fallback.",
        }),
      });
      return;
    }
    await claimNotificationPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messageId: "synthetic-message-id" }),
    });
  });
  await claimPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=landlord`,
    { waitUntil: "networkidle" },
  );

  const claimAlert = claimPage.getByRole("alert", {
    name: "Private claim requirements could not be loaded",
  });
  await claimAlert.waitFor({ state: "visible" });
  const claimRetry = claimPage.getByRole("button", {
    name: "Try loading claim requirements again",
  });
  assert.equal(
    await claimRetry.evaluate((element) => element === document.activeElement),
    true,
    "The initial claim failure should focus its retry control.",
  );
  assert.equal(
    await claimPage
      .getByRole("checkbox", {
        name: /Every test deduction is separately itemized and described/,
      })
      .count(),
    0,
    "Unresolved private requirements must not fall back to a generic checklist.",
  );

  await claimRetry.press("Enter");
  const claimLoading = claimPage.getByRole("button", {
    name: "Loading claim requirements...",
  });
  await claimLoading.waitFor({ state: "visible" });
  assert.equal(await claimAlert.getAttribute("aria-busy"), "true");
  await claimRetry.waitFor({ state: "visible" });
  assert.equal(
    await claimRetry.evaluate((element) => element === document.activeElement),
    true,
    "A failed claim retry should return focus to its retry control.",
  );
  assert.equal(await claimAlert.getAttribute("aria-busy"), "false");

  await claimRetry.press("Enter");
  await claimAlert.waitFor({ state: "detached" });
  await claimPage
    .getByRole("checkbox", {
      name: /Every test deduction is separately itemized and described/,
    })
    .waitFor({ state: "visible" });
  assert.equal(
    await claimPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Claim recovery should not overflow a mobile viewport.",
  );

  const addLineItem = claimPage.getByRole("button", { name: "Add line item" });
  await addLineItem.focus();
  await addLineItem.press("Enter");
  const secondDeduction = claimPage.getByRole("group", { name: "Deduction 2" });
  await secondDeduction.waitFor({ state: "visible" });
  assert.equal(
    await secondDeduction.evaluate((element) => element === document.activeElement),
    true,
    "Adding a deduction should move keyboard focus to the new item.",
  );
  await claimPage
    .getByText("Deduction 2 added. Fill in its details.")
    .waitFor({ state: "attached" });
  const removeSecondDeduction = secondDeduction.getByRole("button", {
    name: "Remove deduction 2",
  });
  const removeButtonBox = await removeSecondDeduction.boundingBox();
  assert.equal(
    Boolean(removeButtonBox && removeButtonBox.height >= 44),
    true,
    "Claim line-item removal should remain a full-size mobile touch target.",
  );
  await removeSecondDeduction.focus();
  await removeSecondDeduction.press("Enter");
  const firstDeduction = claimPage.getByRole("group", { name: "Deduction 1" });
  assert.equal(
    await firstDeduction.evaluate((element) => element === document.activeElement),
    true,
    "Removing a deduction should move focus to the remaining item instead of the document body.",
  );
  await claimPage
    .getByText("Deduction 2 removed. 1 deduction remains.")
    .waitFor({ state: "attached" });
  assert.equal(
    await claimPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Adding and removing claim items should not introduce mobile overflow.",
  );

  const sendClaimEmail = claimPage.getByRole("button", {
    name: "Send tenant email(s)",
  });
  await sendClaimEmail.click();
  const claimNotificationFailure = claimPage.getByRole("alert").filter({
    hasText: "Automatic email could not be sent",
  });
  await claimNotificationFailure.waitFor({ state: "visible" });
  assert.equal(
    await claimNotificationFailure.evaluate((element) =>
      element.classList.contains("tx-error"),
    ),
    true,
    "A failed email whose copy contains the word sent must still use error styling and alert semantics.",
  );
  assert.equal(
    await sendClaimEmail.evaluate((element) => element === document.activeElement),
    true,
    "A failed automatic claim email should restore focus to its retry control.",
  );
  const sendClaimEmailBox = await sendClaimEmail.boundingBox();
  assert.equal(
    Boolean(sendClaimEmailBox && sendClaimEmailBox.height >= 44),
    true,
    "The focused claim-email retry should remain a 44px mobile touch target.",
  );
  await sendClaimEmail.press("Enter");
  const sendingClaimEmail = claimPage.getByRole("button", {
    name: "Sending tenant email(s)...",
  });
  await sendingClaimEmail.waitFor({ state: "visible" });
  assert.equal(
    await sendingClaimEmail.isDisabled(),
    true,
    "The automatic claim email must not allow duplicate sends while pending.",
  );
  releaseClaimNotification();
  releaseClaimNotification = undefined;
  await claimPage
    .getByText("Tenant claim email sent and added to the record.")
    .waitFor({ state: "visible" });
  await claimAlert.waitFor({ state: "visible" });
  assert.match(
    await claimAlert.innerText(),
    /accepted for delivery, but OpenEscrow could not refresh/i,
    "A successful delivery followed by a refresh outage must not be reported as an email failure.",
  );
  assert.equal(
    claimNotificationAttempts,
    2,
    "A display refresh outage must not repeat the delivered email.",
  );
  const postDeliveryRetry = claimPage.getByRole("button", {
    name: "Try loading claim requirements again",
  });
  assert.equal(
    await postDeliveryRetry.evaluate((element) => element === document.activeElement),
    true,
    "The post-delivery refresh outage should focus its retry control.",
  );
  await postDeliveryRetry.press("Enter");
  await claimAlert.waitFor({ state: "detached" });
  assert.equal(
    claimNotificationAttempts,
    2,
    "Refreshing the private record must never resend the tenant email.",
  );

  const claimReceiptPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await routePrivateRecord(claimReceiptPage, new Set());
  const claimReceiptAttempts = await routeClaimReceiptRecovery(claimReceiptPage);
  await claimReceiptPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=claim-receipt&tx=claim-success`,
    { waitUntil: "networkidle" },
  );
  await claimReceiptPage.getByLabel("Description").fill("Damaged synthetic test door");
  await claimReceiptPage.getByLabel("Amount (shares)").fill("0.5");
  await claimReceiptPage
    .getByRole("checkbox", {
      name: /Every test deduction is separately itemized and described/,
    })
    .check();
  await claimReceiptPage
    .getByRole("checkbox", {
      name: /supporting file includes applicable invoices/i,
    })
    .check();
  await claimReceiptPage
    .getByRole("button", { name: "Supporting file", exact: true })
    .setInputFiles({
      name: "synthetic-receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-synthetic-claim-receipt"),
    });
  await claimReceiptPage
    .getByText("Supporting file stored privately and ready to submit.")
    .waitFor({ state: "visible" });
  const submitClaim = claimReceiptPage.getByRole("button", {
    name: "Submit documented deduction claim",
  });
  await submitClaim.click();

  const receiptRetry = claimReceiptPage.getByRole("button", {
    name: "Retry saving claim receipt",
  });
  await receiptRetry.waitFor({ state: "visible" });
  assert.equal(
    await submitClaim.isDisabled(),
    true,
    "A confirmed claim with a pending private receipt must disable another onchain submission.",
  );
  assert.equal(
    await receiptRetry.evaluate((element) => element === document.activeElement),
    true,
    "A failed private receipt save should focus its retry control.",
  );
  const recoveryEntries = await claimReceiptPage.evaluate(() => {
    const entries = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("openescrow:pending-claim-receipt:")) {
        entries.push([key, window.sessionStorage.getItem(key)]);
      }
    }
    return entries;
  });
  assert.equal(recoveryEntries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(recoveryEntries),
    /synthetic-private-record-recovery-token/,
    "The durable receipt retry must not store its bearer token.",
  );
  assert.equal(
    await claimReceiptPage.evaluate(() =>
      window.sessionStorage.getItem("openescrow:test:claim-transaction-writes"),
    ),
    "1",
  );

  await claimReceiptPage.reload({ waitUntil: "networkidle" });
  const recoveredReceiptRetry = claimReceiptPage.getByRole("button", {
    name: "Retry saving claim receipt",
  });
  await recoveredReceiptRetry.waitFor({ state: "visible" });
  await claimReceiptPage
    .getByText(/recovered a confirmed testnet claim/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await claimReceiptPage
      .getByRole("button", { name: "Submit documented amendment" })
      .isDisabled(),
    true,
    "Reload recovery must disable a new onchain amendment until the confirmed claim receipt is saved.",
  );
  assert.equal(
    await recoveredReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should focus the one safe receipt action.",
  );
  await recoveredReceiptRetry.press("Enter");
  await claimReceiptPage.waitForFunction(() => {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      if (
        window.sessionStorage
          .key(index)
          ?.startsWith("openescrow:pending-claim-receipt:")
      ) {
        return false;
      }
    }
    return true;
  });
  await claimReceiptPage
    .getByRole("button", {
      name: /(?:Saving|Retry saving) claim receipt/,
    })
    .waitFor({ state: "detached" });
  assert.equal(claimReceiptAttempts(), 2);
  assert.equal(
    await claimReceiptPage.evaluate(() =>
      window.sessionStorage.getItem("openescrow:test:claim-transaction-writes"),
    ),
    "1",
    "Retrying the private receipt must never resubmit the onchain claim.",
  );
  assert.equal(
    await claimReceiptPage.evaluate(() => {
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        if (
          window.sessionStorage
            .key(index)
            ?.startsWith("openescrow:pending-claim-receipt:")
        ) {
          return false;
        }
      }
      return true;
    }),
    true,
    "A successful idempotent receipt save should clear only its matching recovery payload.",
  );
  assert.equal(
    await claimReceiptPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Durable claim receipt recovery should not overflow a mobile viewport.",
  );

  const responsePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await routePrivateRecord(responsePage);
  await responsePage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=tenant`,
    { waitUntil: "networkidle" },
  );

  const responseAlert = responsePage.getByRole("alert", {
    name: "Private response details could not be loaded",
  });
  await responseAlert.waitFor({ state: "visible" });
  const responseRetry = responsePage.getByRole("button", {
    name: "Try loading response details again",
  });
  assert.equal(
    await responseRetry.evaluate((element) => element === document.activeElement),
    true,
    "The initial response-detail failure should focus its retry control.",
  );
  assert.equal(
    await responsePage.getByRole("button", { name: "Approve deduction" }).isEnabled(),
    true,
    "A private-summary outage must not block the time-sensitive onchain response.",
  );

  await responseRetry.press("Enter");
  const responseLoading = responsePage.getByRole("button", {
    name: "Loading response details...",
  });
  await responseLoading.waitFor({ state: "visible" });
  assert.equal(await responseAlert.getAttribute("aria-busy"), "true");
  await responseRetry.waitFor({ state: "visible" });
  assert.equal(
    await responseRetry.evaluate((element) => element === document.activeElement),
    true,
    "A failed response-detail retry should return focus to its retry control.",
  );
  assert.equal(await responseAlert.getAttribute("aria-busy"), "false");

  await responseRetry.press("Enter");
  await responseAlert.waitFor({ state: "detached" });
  assert.equal(
    await responsePage.getByRole("button", { name: "Approve deduction" }).isEnabled(),
    true,
    "Successful private-summary recovery must preserve the response action.",
  );
  assert.equal(
    await responsePage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Response recovery should not overflow a mobile viewport.",
  );

  const responseReceiptPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await routePrivateRecord(responseReceiptPage, new Set());
  const responseReceiptAttempts = await routeDecisionReceiptRecovery(
    responseReceiptPage,
    {
      type: "claim_response",
      transactionHash: `0x${"8".repeat(64)}`,
    },
  );
  let responseNotificationAttempts = 0;
  await responseReceiptPage.route(
    /\/api\/notifications\/claim-response$/,
    async (route) => {
      responseNotificationAttempts += 1;
      const body = JSON.parse(route.request().postData() || "{}");
      assert.equal(body.token, "synthetic-private-record-recovery-token");
      assert.equal(body.transactionHash, `0x${"8".repeat(64)}`);
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated notification outage" }),
      });
    },
  );
  await responseReceiptPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=tenant&flow=response-receipt&tx=response-success`,
    { waitUntil: "networkidle" },
  );
  await responseReceiptPage.getByLabel("Dispute in full").check();
  await responseReceiptPage
    .getByLabel(/Decision explanation/)
    .fill("The synthetic invoice does not establish tenant responsibility.");
  await responseReceiptPage
    .getByRole("button", { name: "Dispute deduction" })
    .click();

  const responseReceiptRetry = responseReceiptPage.getByRole("button", {
    name: "Retry saving response receipt",
  });
  await responseReceiptRetry.waitFor({ state: "visible" });
  assert.equal(
    await responseReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed response receipt save should focus its retry control.",
  );
  assert.equal(
    await responseReceiptPage
      .getByRole("button", { name: "Dispute deduction" })
      .count(),
    0,
    "A confirmed response must hide the control that could submit another transaction.",
  );
  const responseRetryBox = await responseReceiptRetry.boundingBox();
  assert.equal(
    Boolean(responseRetryBox && responseRetryBox.height >= 44),
    true,
    "The response receipt retry must remain a 44px mobile touch target.",
  );
  const responseRecoveryEntries = await pendingDecisionRecoveryEntries(
    responseReceiptPage,
  );
  assert.equal(responseRecoveryEntries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(responseRecoveryEntries),
    /synthetic-private-record-recovery-token/,
    "The durable response retry must not store its bearer token.",
  );
  assert.equal(
    await responseReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:response-transaction-writes",
      ),
    ),
    "1",
  );

  await responseReceiptPage.reload({ waitUntil: "networkidle" });
  const recoveredResponseReceiptRetry = responseReceiptPage.getByRole(
    "button",
    { name: "Retry saving response receipt" },
  );
  await recoveredResponseReceiptRetry.waitFor({ state: "visible" });
  await responseReceiptPage
    .getByText(/recovered a confirmed testnet response/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await recoveredResponseReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should focus the response's record-only action.",
  );
  await recoveredResponseReceiptRetry.press("Enter");
  await recoveredResponseReceiptRetry.waitFor({ state: "detached" });
  const responseNotificationFailure = responseReceiptPage.getByRole("alert").filter({
    hasText: "Automatic email is unavailable",
  });
  await responseNotificationFailure.waitFor({ state: "visible" });
  const landlordEmailFallback = responseReceiptPage.getByRole("button", {
    name: "Email decision to landlord",
  });
  assert.equal(
    await landlordEmailFallback.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed automatic response notice should focus the first manual fallback.",
  );
  const landlordEmailFallbackBox = await landlordEmailFallback.boundingBox();
  assert.equal(
    Boolean(landlordEmailFallbackBox && landlordEmailFallbackBox.height >= 44),
    true,
    "The focused response-email fallback should remain a 44px mobile touch target.",
  );
  assert.equal(responseReceiptAttempts(), 2);
  assert.equal(responseNotificationAttempts, 1);
  assert.equal((await pendingDecisionRecoveryEntries(responseReceiptPage)).length, 0);
  assert.equal(
    await responseReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:response-transaction-writes",
      ),
    ),
    "1",
    "Retrying the response receipt must never resubmit the onchain decision.",
  );
  assert.equal(
    await responseReceiptPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Durable response receipt recovery should not overflow a mobile viewport.",
  );

  const rulingReceiptPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const rulingReceiptAttempts = await routeDecisionReceiptRecovery(
    rulingReceiptPage,
    {
      type: "arbiter_ruling",
      transactionHash: `0x${"6".repeat(64)}`,
    },
  );
  await rulingReceiptPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=arbiter&flow=ruling-receipt&tx=ruling-success`,
    { waitUntil: "networkidle" },
  );
  await rulingReceiptPage.getByLabel(/Award to landlord/).fill("0.25");
  await rulingReceiptPage
    .getByLabel("Ruling note")
    .fill("The synthetic documentation supports a partial allocation.");
  await rulingReceiptPage
    .getByRole("button", { name: "Submit ruling" })
    .click();

  const rulingReceiptRetry = rulingReceiptPage.getByRole("button", {
    name: "Retry saving ruling receipt",
  });
  await rulingReceiptRetry.waitFor({ state: "visible" });
  await rulingReceiptPage
    .getByRole("heading", { name: "Ruling confirmed" })
    .waitFor({ state: "visible" });
  assert.equal(
    await rulingReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed ruling receipt save should focus its retry control.",
  );
  assert.equal(
    await rulingReceiptPage.getByRole("button", { name: "Submit ruling" }).count(),
    0,
    "A confirmed ruling must hide the control that could submit another transaction.",
  );
  const rulingRetryBox = await rulingReceiptRetry.boundingBox();
  assert.equal(
    Boolean(rulingRetryBox && rulingRetryBox.height >= 44),
    true,
    "The ruling receipt retry must remain a 44px mobile touch target.",
  );
  const rulingRecoveryEntries = await pendingDecisionRecoveryEntries(
    rulingReceiptPage,
  );
  assert.equal(rulingRecoveryEntries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(rulingRecoveryEntries),
    /synthetic-private-record-recovery-token/,
    "The durable ruling retry must not store its bearer token.",
  );
  assert.equal(
    await rulingReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:ruling-transaction-writes",
      ),
    ),
    "1",
  );

  await rulingReceiptPage.reload({ waitUntil: "networkidle" });
  const recoveredRulingReceiptRetry = rulingReceiptPage.getByRole("button", {
    name: "Retry saving ruling receipt",
  });
  await recoveredRulingReceiptRetry.waitFor({ state: "visible" });
  await rulingReceiptPage
    .getByText(/recovered a confirmed testnet ruling/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await recoveredRulingReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should focus the ruling's record-only action.",
  );
  await recoveredRulingReceiptRetry.press("Enter");
  await rulingReceiptPage.waitForFunction(() => {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      if (
        window.sessionStorage
          .key(index)
          ?.startsWith("openescrow:pending-decision-receipt:")
      ) {
        return false;
      }
    }
    return true;
  });
  await rulingReceiptPage
    .getByRole("button", {
      name: /(?:Saving|Retry saving) ruling receipt/,
    })
    .waitFor({ state: "detached" });
  assert.equal(rulingReceiptAttempts(), 2);
  assert.equal((await pendingDecisionRecoveryEntries(rulingReceiptPage)).length, 0);
  assert.equal(
    await rulingReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:ruling-transaction-writes",
      ),
    ),
    "1",
    "Retrying the ruling receipt must never resubmit the onchain ruling.",
  );
  assert.equal(
    await rulingReceiptPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Durable ruling receipt recovery should not overflow a mobile viewport.",
  );

  await exerciseTerminalReceiptRecovery(browser, {
    flow: "withdrawal-receipt",
    role: "tenant",
    actionType: "withdrawal_completed",
    transactionHash: `0x${"5".repeat(64)}`,
    transactionButton: "Withdraw 0.5 USDC",
    retryButton: "Retry saving withdrawal receipt",
    confirmedHeading: "Withdrawal confirmed",
    recoveredText: /recovered a confirmed testnet withdrawal/i,
    transactionCountKey: "openescrow:test:withdrawal-transaction-writes",
  });

  const timeoutScenarios = [
    {
      flow: "no-claim-timeout-receipt",
      role: "tenant",
      timeout: "no_claim_refund",
      transactionHash: `0x${"3".repeat(64)}`,
      transactionButton: "Finalize tenant refund",
      confirmedHeading: "Refund confirmed",
    },
    {
      flow: "no-response-timeout-receipt",
      role: "landlord",
      timeout: "no_response_dispute",
      transactionHash: `0x${"2".repeat(64)}`,
      transactionButton: "Escalate to dispute",
      confirmedHeading: "Dispute escalation confirmed",
    },
    {
      flow: "arbiter-timeout-receipt",
      role: "tenant",
      timeout: "arbiter_timeout_refund",
      transactionHash: `0x${"1".repeat(64)}`,
      transactionButton: "Send disputed funds to tenant",
      confirmedHeading: "Timeout refund confirmed",
    },
  ];
  for (const scenario of timeoutScenarios) {
    await exerciseTerminalReceiptRecovery(browser, {
      ...scenario,
      actionType: "timeout_executed",
      retryButton: "Retry saving deadline-action receipt",
      recoveredText: /recovered a confirmed testnet deadline action/i,
      transactionCountKey: `openescrow:test:${scenario.flow}-transaction-writes`,
    });
  }

  const activityReceiptPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const activityReceiptAttempts = await routeActivityReceiptRecovery(
    activityReceiptPage,
  );
  const activityReceiptUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=activity-receipt&tx=activity-success&agreement=43`;
  const otherActivityReceiptUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=activity-receipt&tx=activity-success&agreement=44`;
  await activityReceiptPage.goto(activityReceiptUrl, {
    waitUntil: "networkidle",
  });
  await activityReceiptPage
    .getByText("Add a private timestamped proof", { exact: true })
    .click();
  await activityReceiptPage
    .getByLabel("Private note or document description")
    .fill("Synthetic move-out notice prepared for the rendered recovery check.");
  await activityReceiptPage
    .getByRole("button", { name: "Save timestamped proof" })
    .click();

  const activityRetry = activityReceiptPage.getByRole("button", {
    name: "Retry record save",
  });
  await activityRetry.waitFor({ state: "visible" });
  assert.equal(
    await activityReceiptPage
      .getByRole("button", { name: "Save timestamped proof" })
      .count(),
    0,
    "A confirmed activity proof with a pending private receipt must hide the control that could publish it again.",
  );
  assert.equal(
    await activityRetry.evaluate((element) => element === document.activeElement),
    true,
    "A failed activity receipt save should focus its record-only retry.",
  );
  const activityRetryBox = await activityRetry.boundingBox();
  assert.equal(
    Boolean(activityRetryBox && activityRetryBox.height >= 44),
    true,
    "The activity receipt retry must remain a 44px mobile touch target.",
  );
  const activityEntries = await pendingActivityRecoveryEntries(
    activityReceiptPage,
  );
  assert.equal(activityEntries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(activityEntries),
    /synthetic-private-record-recovery-token/,
    "The durable activity receipt retry must not store its bearer token.",
  );
  assert.equal(
    await activityReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:activity-transaction-writes",
      ),
    ),
    "1",
  );

  await activityReceiptPage.goto(otherActivityReceiptUrl, {
    waitUntil: "networkidle",
  });
  assert.equal(
    await activityReceiptPage
      .getByRole("button", { name: "Retry record save" })
      .count(),
    0,
    "A different agreement must not inherit another agreement's pending activity receipt.",
  );

  await activityReceiptPage.goto(activityReceiptUrl, { waitUntil: "networkidle" });
  await activityReceiptPage.reload({ waitUntil: "networkidle" });
  const recoveredActivityRetry = activityReceiptPage.getByRole("button", {
    name: "Retry record save",
  });
  await recoveredActivityRetry.waitFor({ state: "visible" });
  await activityReceiptPage
    .getByText(/recovered a confirmed timestamped proof/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await recoveredActivityRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should open the private-activity section and focus its record-only retry.",
  );
  await recoveredActivityRetry.press("Enter");
  await activityReceiptPage
    .getByRole("button", {
      name: /(?:Saving agreement record|Retry record save)/,
    })
    .waitFor({ state: "detached" });
  assert.equal(activityReceiptAttempts(), 2);
  const remainingActivityEntries = await pendingActivityRecoveryEntries(
    activityReceiptPage,
  );
  assert.equal(
    remainingActivityEntries.length,
    0,
    `The saved activity receipt should clear its exact recovery payload: ${JSON.stringify(remainingActivityEntries)}`,
  );
  assert.equal(
    await activityReceiptPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:activity-transaction-writes",
      ),
    ),
    "1",
    "Retrying the activity receipt must never publish another onchain proof.",
  );
  assert.equal(
    await activityReceiptPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Durable activity receipt recovery should not overflow a mobile viewport.",
  );
  await activityReceiptPage.close();

  process.stdout.write(
    "Private-record recovery browser check passed: claim requirements fail closed, line-item edits announce changes and retain keyboard focus with mobile-size controls, notification failures use error semantics and focus 44px retry/fallback actions, and confirmed claims, tenant responses, arbiter rulings, withdrawals, activity proofs, and every deadline outcome survive private-record outages and reloads without another transaction or stored bearer token; terminal retries remain wallet-scoped, time-sensitive responses remain available, and delivered email is not repeated by a record-only retry.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  releaseClaimNotification?.();
  await browser?.close();
  await stopServer(server);
}
