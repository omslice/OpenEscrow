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

function routePrivateRecord(page, failAttempts = new Set([1, 2])) {
  let attempts = 0;
  return page.route(/\/api\/negotiations\/OE-P-RECOVERY\?token=/, async (route) => {
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
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const claimPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await routePrivateRecord(claimPage, new Set([1, 2, 4]));
  let claimNotificationAttempts = 0;
  await claimPage.route(/\/api\/notifications\/claim$/, async (route) => {
    claimNotificationAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
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

  const sendClaimEmail = claimPage.getByRole("button", {
    name: "Send tenant email(s)",
  });
  await sendClaimEmail.click();
  const sendingClaimEmail = claimPage.getByRole("button", {
    name: "Sending tenant email(s)...",
  });
  await sendingClaimEmail.waitFor({ state: "visible" });
  assert.equal(
    await sendingClaimEmail.isDisabled(),
    true,
    "The automatic claim email must not allow duplicate sends while pending.",
  );
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
    1,
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
    1,
    "Refreshing the private record must never resend the tenant email.",
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

  process.stdout.write(
    "Private-record recovery browser check passed: claim requirements fail closed, time-sensitive tenant responses remain available, retries announce progress and restore focus, successful retries recover at mobile width, and a delivered claim email is never repeated by a record-only retry.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
