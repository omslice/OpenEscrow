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

const finalizationRecord = {
  ...negotiationRecord,
  status: "ready",
  createdAt: "2026-07-30T00:00:00.000Z",
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
  terms: {
    jurisdiction: "testnet-generic",
    policyVersion: "generic-test-v1",
    propertyAddress: "Synthetic test address",
    tokenChoice: "plain",
    deposit: "1",
    operationsReserve: "5",
    monthlyRent: "1",
    claimWindowStart: "2027-07-25T18:10:00.000Z",
    claimDays: "30",
    responseDays: "7",
    arbiterDays: "7",
  },
  tenantApproved: true,
  arbiterApproved: false,
  tenantWallet: "0x2222222222222222222222222222222222222222",
  arbiterWallet: null,
  onchainAgreementId: null,
  onchainTxHash: null,
  events: [
    {
      id: 1,
      createdAt: "2026-07-31T00:00:00.000Z",
      actorRole: "system",
      action: "proposal_ready",
      summary: "All required parties approved revision 1.",
      revision: 1,
      metadata: null,
    },
  ],
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

async function routeFinalizationRecovery(page) {
  let preflightAttempts = 0;
  let finalizationAttempts = 0;
  await page.route(
    /\/api\/negotiations\/OE-P-RECOVERY(?:\/actions)?$/,
    async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      assert.equal(
        requestUrl.searchParams.has("token"),
        false,
        "Finalization recovery must keep agreement access out of the URL.",
      );
      if (request.method() === "GET") {
        assert.equal(
          request.headers().authorization,
          "Bearer synthetic-private-record-recovery-token",
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(finalizationRecord),
        });
        return;
      }

      const body = JSON.parse(request.postData() || "{}");
      assert.equal(
        body.token,
        "synthetic-private-record-recovery-token",
        "Finalization recovery must use the exact landlord access in memory.",
      );
      if (body.type === "preflight_finalize") {
        preflightAttempts += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...finalizationRecord,
            events: [
              ...finalizationRecord.events,
              {
                id: 2,
                createdAt: "2026-07-31T00:00:00.000Z",
                actorRole: "landlord",
                action: "finalization_preflight_passed",
                summary: "Validated revision 1 for onchain finalization.",
                revision: 1,
                metadata: null,
              },
            ],
          }),
        });
        return;
      }
      assert.equal(body.type, "finalize");
      assert.equal(body.agreementId, "43");
      assert.equal(body.transactionHash, `0x${"a".repeat(64)}`);
      finalizationAttempts += 1;
      if (finalizationAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated finalization Record outage" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...finalizationRecord,
          status: "finalized",
          onchainAgreementId: "43",
          onchainTxHash: `0x${"a".repeat(64)}`,
        }),
      });
    },
  );
  return {
    preflightAttempts: () => preflightAttempts,
    finalizationAttempts: () => finalizationAttempts,
  };
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

async function routeArbiterReplacementRecovery(page) {
  let attempts = 0;
  await page.route(
    /\/api\/negotiations\/OE-P-RECOVERY\/actions$/,
    async (route) => {
      attempts += 1;
      const body = JSON.parse(route.request().postData() || "{}");
      assert.equal(
        body.token,
        "synthetic-private-record-recovery-token",
        "Arbiter recovery must remain bound to the current private-record access.",
      );
      assert.equal(body.type, "arbiter_replacement_accepted");
      assert.equal(body.transactionHash, `0x${"d".repeat(64)}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...negotiationRecord,
          arbiterEmail: "replacement-arbiter@example.test",
          arbiterWallet: "0x5555555555555555555555555555555555555555",
          arbiterReplacement: null,
        }),
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

async function pendingFinalizationRecoveryEntries(page) {
  return page.evaluate(() => {
    const entries = [];
    for (const [kind, storage] of [
      ["local", window.localStorage],
      ["session", window.sessionStorage],
    ]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith("openescrow:pending-finalization:")) {
          entries.push([kind, key, storage.getItem(key)]);
        }
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
  await page.context().close();
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

  const finalizationPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const finalizationRecovery = await routeFinalizationRecovery(
    finalizationPage,
  );
  const finalizationUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=finalization-discovery`;
  await finalizationPage.goto(finalizationUrl, { waitUntil: "networkidle" });
  const finalizeProposal = finalizationPage.getByRole("button", {
    name: "Finalize approved proposal onchain",
  });
  await finalizeProposal.waitFor({ state: "visible" });
  const finalizeProposalBox = await finalizeProposal.boundingBox();
  assert.equal(
    Boolean(finalizeProposalBox && finalizeProposalBox.height >= 44),
    true,
    "The guarded finalization action must remain a 44px mobile touch target.",
  );
  await finalizeProposal.focus();
  await finalizeProposal.press("Enter");
  await finalizationPage
    .getByRole("button", { name: "Checking the approved proposal..." })
    .waitFor({ state: "visible" });
  const finalizationRetry = finalizationPage.getByRole("button", {
    name: "Finish adding finalization to Record",
  });
  await finalizationRetry.waitFor({ state: "visible" });
  assert.equal(
    await finalizationRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed recovered-finalization save should focus its Record-only retry.",
  );
  const finalizationRetryBox = await finalizationRetry.boundingBox();
  assert.equal(
    Boolean(finalizationRetryBox && finalizationRetryBox.height >= 44),
    true,
    "The finalization Record retry must remain a 44px mobile touch target.",
  );
  const confirmedFinalizationButton = finalizationPage.getByRole("button", {
    name: "Finalization confirmed—updating Record...",
  });
  assert.equal(
    await confirmedFinalizationButton.isDisabled(),
    true,
    "A discovered finalization must disable the control that could create a duplicate agreement.",
  );
  assert.equal(finalizationRecovery.preflightAttempts(), 1);
  assert.equal(finalizationRecovery.finalizationAttempts(), 1);
  assert.equal(
    await finalizationPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:finalization-searches",
      ),
    ),
    "1",
  );
  assert.equal(
    await finalizationPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:finalization-transaction-writes",
      ),
    ),
    null,
    "Recovering an existing finalization must not create another agreement.",
  );
  const pendingFinalizationEntries =
    await pendingFinalizationRecoveryEntries(finalizationPage);
  assert.equal(pendingFinalizationEntries.length, 1);
  assert.match(
    pendingFinalizationEntries[0][1],
    /:OE-P-RECOVERY:landlord:0x1111111111111111111111111111111111111111$/,
    "Finalization recovery must remain scoped to the proposal, role, and wallet.",
  );
  assert.doesNotMatch(
    JSON.stringify(pendingFinalizationEntries),
    /synthetic-private-record-recovery-token/,
    "Finalization recovery must not persist its agreement bearer.",
  );

  await finalizationPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=tenant&flow=finalization-discovery`,
    { waitUntil: "networkidle" },
  );
  assert.equal(
    await finalizationPage
      .getByRole("button", { name: "Finish adding finalization to Record" })
      .count(),
    0,
    "A tenant wallet must not inherit the landlord's pending finalization receipt.",
  );
  assert.equal(
    finalizationRecovery.finalizationAttempts(),
    1,
    "A role change must not submit another private Record action.",
  );

  await finalizationPage.goto(finalizationUrl, { waitUntil: "networkidle" });
  await finalizationPage
    .getByText(/This proposal is finalized as/i)
    .waitFor({ state: "visible" });
  assert.equal(finalizationRecovery.finalizationAttempts(), 2);
  assert.equal(
    (await pendingFinalizationRecoveryEntries(finalizationPage)).length,
    0,
    "A successful recovered finalization should clear only its scoped receipt.",
  );
  assert.equal(
    await finalizationPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:finalization-searches",
      ),
    ),
    "1",
    "Reload recovery must reuse the saved receipt without another public search.",
  );
  assert.equal(
    await finalizationPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:finalization-transaction-writes",
      ),
    ),
    null,
    "A Record-only retry must never create another agreement.",
  );
  assert.equal(
    await finalizationPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Finalization recovery should not overflow a mobile viewport.",
  );
  await finalizationPage.context().close();

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
  const firstDeductionBeforeAdd = claimPage.getByRole("group", { name: "Deduction 1" });
  assert.equal(
    await firstDeductionBeforeAdd.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
    1,
    "Claim line items should collapse to one readable column on mobile.",
  );
  const firstClaimFieldBox = await firstDeductionBeforeAdd.locator(".claim-field").first().boundingBox();
  const firstDeductionBox = await firstDeductionBeforeAdd.boundingBox();
  const firstClaimFieldInset =
    firstClaimFieldBox && firstDeductionBox
      ? firstClaimFieldBox.x - firstDeductionBox.x
      : 0;
  assert.equal(
    firstClaimFieldInset >= 14,
    true,
    `Claim fields should remain clear of their card border: ${firstClaimFieldInset}px.`,
  );
  await claimPage.setViewportSize({ width: 1100, height: 800 });
  const categoryFieldBox = await firstDeductionBeforeAdd
    .locator(".claim-field-category")
    .boundingBox();
  const amountFieldBox = await firstDeductionBeforeAdd
    .locator(".claim-field-amount")
    .boundingBox();
  const descriptionFieldBox = await firstDeductionBeforeAdd
    .locator(".claim-field-description")
    .boundingBox();
  assert.equal(
    Boolean(
      categoryFieldBox &&
        amountFieldBox &&
        descriptionFieldBox &&
        Math.abs(categoryFieldBox.y - amountFieldBox.y) < 2 &&
        amountFieldBox.x >= categoryFieldBox.x + categoryFieldBox.width + 12 &&
        descriptionFieldBox.y >= categoryFieldBox.y + categoryFieldBox.height + 10,
    ),
    true,
    "Desktop claim cards should pair category with amount and keep the explanation on its own row.",
  );
  await claimPage.setViewportSize({ width: 390, height: 844 });
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
    name: "Send tenant emails",
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
    name: "Sending tenant emails...",
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
    .getByText("Tenant claim emails sent and added to the record.")
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
  await claimPage.context().close();

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
  await claimReceiptPage.getByLabel("Amount (testUSDC)").fill("0.5");
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
    name: "Finish adding claim to Record",
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
    name: "Finish adding claim to Record",
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
    "Reload recovery must disable a new testnet amendment until the confirmed claim is added to the Record.",
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
      name: /(?:Adding claim to Record|Finish adding claim to Record)/,
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
    "Durable claim Record recovery should not overflow a mobile viewport.",
  );
  await claimReceiptPage.context().close();

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
  await responsePage.context().close();

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
    name: "Finish adding response to Record",
  });
  await responseReceiptRetry.waitFor({ state: "visible" });
  assert.equal(
    await responseReceiptRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed response Record update should focus its recovery control.",
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
    "The response Record recovery must remain a 44px mobile touch target.",
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
    { name: "Finish adding response to Record" },
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
    name: "Open backup email draft",
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
    "Finishing the response Record update must never resubmit the testnet decision.",
  );
  assert.equal(
    await responseReceiptPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Durable response Record recovery should not overflow a mobile viewport.",
  );
  await responseReceiptPage.context().close();

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
  await rulingReceiptPage
    .getByRole("heading", { name: "Decide how the disputed balance is split" })
    .waitFor({ state: "visible" });
  await rulingReceiptPage.getByLabel(/Award to landlord/).fill("0.25");
  await rulingReceiptPage
    .getByLabel("Ruling note")
    .fill("The synthetic documentation supports a partial allocation.");
  await rulingReceiptPage
    .getByRole("button", { name: "Submit ruling" })
    .click();

  const rulingReceiptRetry = rulingReceiptPage.getByRole("button", {
    name: "Finish adding ruling to Record",
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
    name: "Finish adding ruling to Record",
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
  await rulingReceiptPage.context().close();

  await exerciseTerminalReceiptRecovery(browser, {
    flow: "withdrawal-receipt",
    role: "tenant",
    actionType: "withdrawal_completed",
    transactionHash: `0x${"5".repeat(64)}`,
    transactionButton: "Withdraw 0.5 USDC",
    retryButton: "Finish adding withdrawal to Record",
    confirmedHeading: "Withdrawal confirmed",
    recoveredText: /recovered a confirmed testnet withdrawal/i,
    transactionCountKey: "openescrow:test:withdrawal-transaction-writes",
  });

  await exerciseTerminalReceiptRecovery(browser, {
    flow: "proposal-cancellation-receipt",
    role: "landlord",
    actionType: "onchain_proposal_cancelled",
    transactionHash: `0x${"f".repeat(64)}`,
    transactionButton: "Cancel proposal",
    retryButton: "Finish adding cancellation to Record",
    confirmedHeading: "Proposal cancellation confirmed",
    recoveredText: /recovered a confirmed testnet cancellation/i,
    transactionCountKey:
      "openescrow:test:proposal-cancellation-transaction-writes",
  });

  const cancellationDiscoveryPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const cancellationDiscoveryAttempts = await routeDecisionReceiptRecovery(
    cancellationDiscoveryPage,
    {
      type: "onchain_proposal_cancelled",
      transactionHash: `0x${"e".repeat(64)}`,
    },
  );
  const cancellationDiscoveryUrl = `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=proposal-cancellation-discovery&agreement=43`;
  await cancellationDiscoveryPage.goto(cancellationDiscoveryUrl, {
    waitUntil: "networkidle",
  });
  await cancellationDiscoveryPage
    .getByRole("heading", { name: "Proposal cancellation confirmed" })
    .waitFor({ state: "visible" });
  assert.equal(
    await cancellationDiscoveryPage
      .getByRole("button", { name: "Cancel proposal" })
      .count(),
    0,
    "A cancelled agreement with a stale Record must never offer another cancellation transaction.",
  );
  const findCancellation = cancellationDiscoveryPage.getByRole("button", {
    name: "Find cancellation and finish Record update",
  });
  const findCancellationBox = await findCancellation.boundingBox();
  assert.equal(
    Boolean(findCancellationBox && findCancellationBox.height >= 44),
    true,
    "Automatic cancellation recovery must remain a 44px mobile touch target.",
  );
  await findCancellation.focus();
  await findCancellation.press("Enter");
  await cancellationDiscoveryPage
    .getByRole("button", { name: "Finding cancellation..." })
    .waitFor({ state: "visible" });
  await cancellationDiscoveryPage
    .getByRole("alert")
    .filter({ hasText: "could not find the matching test-network cancellation" })
    .waitFor({ state: "visible" });
  assert.equal(
    await findCancellation.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed cancellation lookup should return focus to its safe retry.",
  );

  await findCancellation.press("Enter");
  await cancellationDiscoveryPage
    .getByRole("button", { name: "Finding cancellation..." })
    .waitFor({ state: "visible" });
  const cancellationRecordRetry = cancellationDiscoveryPage.getByRole(
    "button",
    { name: "Finish adding cancellation to Record" },
  );
  await cancellationRecordRetry.waitFor({ state: "visible" });
  assert.equal(
    await cancellationRecordRetry.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed save after automatic discovery should focus the record-only retry.",
  );
  const cancellationRecordRetryBox =
    await cancellationRecordRetry.boundingBox();
  assert.equal(
    Boolean(
      cancellationRecordRetryBox && cancellationRecordRetryBox.height >= 44,
    ),
    true,
    "The discovered cancellation's Record retry must remain a 44px mobile touch target.",
  );
  assert.equal(cancellationDiscoveryAttempts(), 1);
  assert.equal(
    await cancellationDiscoveryPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:proposal-cancellation-searches",
      ),
    ),
    "2",
    "The failed cancellation lookup and its explicit retry should remain separate searches.",
  );
  assert.equal(
    await cancellationDiscoveryPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:proposal-cancellation-transaction-writes",
      ),
    ),
    null,
    "Discovering a cancellation must never submit a new cancellation transaction.",
  );
  const discoveredCancellationEntries =
    await pendingTerminalRecoveryEntries(cancellationDiscoveryPage);
  assert.equal(discoveredCancellationEntries.length, 1);
  assert.doesNotMatch(
    JSON.stringify(discoveredCancellationEntries),
    /synthetic-private-record-recovery-token/,
    "The discovered cancellation retry must not persist its bearer token.",
  );

  await cancellationDiscoveryPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=proposal-cancellation-discovery&agreement=44`,
    { waitUntil: "networkidle" },
  );
  assert.equal(
    await cancellationDiscoveryPage
      .getByRole("button", { name: "Finish adding cancellation to Record" })
      .count(),
    0,
    "A different agreement must not inherit a discovered cancellation receipt.",
  );

  await cancellationDiscoveryPage.goto(cancellationDiscoveryUrl, {
    waitUntil: "networkidle",
  });
  const recoveredDiscoveredCancellation =
    cancellationDiscoveryPage.getByRole("button", {
      name: "Finish adding cancellation to Record",
    });
  await recoveredDiscoveredCancellation.waitFor({ state: "visible" });
  await cancellationDiscoveryPage
    .getByText(/recovered a confirmed testnet cancellation/i)
    .waitFor({ state: "visible" });
  assert.equal(
    await recoveredDiscoveredCancellation.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "Reload recovery should focus the discovered cancellation's record-only retry.",
  );
  await recoveredDiscoveredCancellation.press("Enter");
  await cancellationDiscoveryPage.waitForFunction(() => {
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
  await cancellationDiscoveryPage
    .getByRole("button", {
      name: /(?:Adding cancellation|Finish adding cancellation) to Record/i,
    })
    .waitFor({ state: "detached" });
  assert.equal(cancellationDiscoveryAttempts(), 2);
  assert.equal(
    (await pendingTerminalRecoveryEntries(cancellationDiscoveryPage)).length,
    0,
    "A saved discovered cancellation should clear its exact recovery payload.",
  );
  assert.equal(
    await cancellationDiscoveryPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:proposal-cancellation-searches",
      ),
    ),
    "2",
    "A Record-only retry must reuse the discovered receipt without searching again.",
  );
  assert.equal(
    await cancellationDiscoveryPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Automatic cancellation recovery should not overflow a mobile viewport.",
  );
  await cancellationDiscoveryPage.context().close();

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
      retryButton: "Finish adding deadline action to Record",
      recoveredText: /recovered a confirmed testnet deadline action/i,
      transactionCountKey: `openescrow:test:${scenario.flow}-transaction-writes`,
    });
  }

  const arbiterReplacementPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const arbiterReplacementAttempts = await routeArbiterReplacementRecovery(
    arbiterReplacementPage,
  );
  await arbiterReplacementPage.goto(
    `${baseUrl}/testing/private-record-recovery.html?role=landlord&flow=arbiter-replacement-recovery&agreement=43`,
    { waitUntil: "networkidle" },
  );
  await arbiterReplacementPage
    .getByRole("heading", { name: "Replace the arbiter (mutual consent)" })
    .waitFor({ state: "visible" });
  const automaticArbiterRecovery = arbiterReplacementPage.getByRole("button", {
    name: "Find confirmation and finish Record update",
  });
  const automaticRecoveryBox = await automaticArbiterRecovery.boundingBox();
  assert.equal(
    Boolean(automaticRecoveryBox && automaticRecoveryBox.height >= 44),
    true,
    "Automatic arbiter recovery must remain a 44px mobile touch target.",
  );
  const technicalRecovery = arbiterReplacementPage.locator("details", {
    hasText: "Technical recovery",
  });
  const technicalHashInput = arbiterReplacementPage.getByLabel(
    "Acceptance transaction hash",
  );
  assert.equal(
    await technicalHashInput.isVisible(),
    false,
    "Raw transaction-hash recovery should be collapsed by default.",
  );
  const technicalSummary = technicalRecovery.locator("summary");
  const technicalSummaryBox = await technicalSummary.boundingBox();
  assert.equal(
    Boolean(technicalSummaryBox && technicalSummaryBox.height >= 44),
    true,
    "The collapsed technical recovery summary must remain a 44px mobile touch target.",
  );
  await technicalSummary.focus();
  await technicalSummary.press("Enter");
  await technicalHashInput.waitFor({ state: "visible" });
  const technicalRecoveryButton = arbiterReplacementPage.getByRole("button", {
    name: "Use transaction hash to finish Record update",
  });
  const technicalRecoveryBox = await technicalRecoveryButton.boundingBox();
  assert.equal(
    Boolean(technicalRecoveryBox && technicalRecoveryBox.height >= 44),
    true,
    "The technical arbiter fallback must remain a 44px mobile touch target.",
  );
  await technicalSummary.press("Enter");
  await automaticArbiterRecovery.focus();
  await automaticArbiterRecovery.press("Enter");
  await arbiterReplacementPage
    .getByRole("button", { name: "Finding and verifying confirmation..." })
    .waitFor({ state: "visible" });
  const missingConfirmation = arbiterReplacementPage.getByRole("alert").filter({
    hasText: "could not find the matching test-network confirmation",
  });
  await missingConfirmation.waitFor({ state: "visible" });
  assert.equal(
    await automaticArbiterRecovery.evaluate(
      (element) => element === document.activeElement,
    ),
    true,
    "A failed automatic lookup should keep focus on its safe retry.",
  );
  await automaticArbiterRecovery.press("Enter");
  await arbiterReplacementPage
    .getByRole("button", { name: "Finding and verifying confirmation..." })
    .waitFor({ state: "visible" });
  await arbiterReplacementPage
    .getByRole("status")
    .filter({ hasText: "The new arbiter now has record access" })
    .waitFor({ state: "visible" });
  assert.equal(
    arbiterReplacementAttempts(),
    1,
    "Only the discovered, server-verified arbiter confirmation should update the Record.",
  );
  assert.equal(
    await arbiterReplacementPage.evaluate(() =>
      window.sessionStorage.getItem(
        "openescrow:test:arbiter-replacement-searches",
      ),
    ),
    "2",
    "The failed lookup and its explicit retry should remain separate searches.",
  );
  assert.equal(
    await arbiterReplacementPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Arbiter replacement recovery should not overflow a mobile viewport.",
  );
  await arbiterReplacementPage.context().close();

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
  await activityReceiptPage.context().close();

  process.stdout.write(
    "Private-record recovery browser check passed: proposal finalization checks for and recovers one unambiguous exact existing agreement before any new write, claim requirements fail closed, line-item edits announce changes and retain keyboard focus with mobile-size controls, notification failures use error semantics and focus 44px retry/fallback actions, interrupted arbiter access rotation and stale proposal cancellations use automatic bounded confirmation lookup, and confirmed finalizations, cancellations, claims, tenant responses, arbiter rulings, withdrawals, activity proofs, and every deadline outcome survive private-record outages and reloads without another transaction or stored bearer token; retries remain role-, wallet-, and agreement-scoped, time-sensitive responses remain available, and delivered email is not repeated by a record-only retry.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  releaseClaimNotification?.();
  await browser?.close();
  await stopServer(server);
}
