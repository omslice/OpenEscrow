import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ACTIVE_DEPLOYMENT } from "./active-deployment.mjs";

const host = "127.0.0.1";
const configuredPort = Number.parseInt(
  process.env.OPENESCROW_RECORD_VERIFICATION_TEST_PORT || "",
  10,
);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1_024 && configuredPort <= 65_535
    ? configuredPort
    : 22_000 + (process.pid % 30_000);
const baseUrl = `http://${host}:${port}`;
const proposalId = "record-browser-pilot";
const accessToken = "record-browser-landlord-token";
const agreementId = "42";
const escrowAddress = ACTIVE_DEPLOYMENT.escrow;
const registryAddress = ACTIVE_DEPLOYMENT.activityRegistry;
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function recordFixture() {
  const now = "2026-07-30T20:00:00.000Z";
  return {
    id: proposalId,
    status: "finalized",
    revision: 2,
    createdAt: now,
    updatedAt: now,
    landlordName: "Rendered Landlord",
    landlordEmail: "rendered.landlord@example.test",
    tenantName: "Rendered Tenant",
    tenantEmail: "rendered.tenant@example.test",
    tenants: [
      {
        id: "rendered-tenant",
        name: "Rendered Tenant",
        email: "rendered.tenant@example.test",
        approved: true,
        wallet: "0x2000000000000000000000000000000000000002",
        isFundingTenant: true,
        acceptedAt: now,
        depositShareBps: 10_000,
      },
    ],
    arbiterName: null,
    arbiterEmail: null,
    terms: {
      jurisdiction: "TEST",
      propertyAddress: "100 Rendered Record Street",
      tokenChoice: "plain",
      deposit: "1000",
      operationsReserve: "0",
      claimWindowStart: "2027-01-01T00:00:00.000Z",
      claimDays: "30",
      responseDays: "14",
      arbiterDays: "14",
    },
    tenantApproved: true,
    arbiterApproved: false,
    tenantWallet: "0x2000000000000000000000000000000000000002",
    arbiterWallet: null,
    onchainAgreementId: agreementId,
    onchainTxHash: `0x${"1".repeat(64)}`,
    events: [
      {
        id: 1,
        createdAt: now,
        actorRole: "landlord",
        action: "proposal_created",
        summary: "Created the rendered record rehearsal.",
        revision: 1,
      },
      {
        id: 2,
        createdAt: now,
        actorRole: "system",
        action: "proposal_finalized",
        summary: "Finalized the rendered record rehearsal.",
        revision: 2,
      },
    ],
  };
}

function snapshotFixture() {
  const record = {
    schema: "openescrow.agreement-record.v3",
    proposalId,
    status: "finalized",
    revision: 2,
    createdAt: "2026-07-30T20:00:00.000Z",
    parties: {
      landlord: {
        name: "Rendered Landlord",
        email: "rendered.landlord@example.test",
      },
      tenants: [
        {
          id: "rendered-tenant",
          name: "Rendered Tenant",
          email: "rendered.tenant@example.test",
          wallet: "0x2000000000000000000000000000000000000002",
          isFundingTenant: true,
        },
      ],
      arbiter: null,
    },
    terms: recordFixture().terms,
    approvals: {
      tenants: [
        {
          id: "rendered-tenant",
          approved: true,
          acceptedAt: "2026-07-30T20:00:00.000Z",
        },
      ],
      arbiter: false,
    },
    onchain: {
      chainId: 84532,
      escrowAddress,
      activityRegistryAddress: registryAddress,
      agreementId,
      finalizationTransactionHash: `0x${"1".repeat(64)}`,
    },
    events: recordFixture().events,
  };
  const canonical = stableJson(record);
  return {
    algorithm: "SHA-256",
    hash: `0x${createHash("sha256").update(canonical).digest("hex")}`,
    canonical,
    snapshot: record,
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

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
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
    "record-verification-test",
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
  const snapshot = snapshotFixture();
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });

  await page.route(
    /^https:\/\/(?:sepolia\.base\.org|base-sepolia-rpc\.publicnode\.com)\/?$/u,
    async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Base Sepolia intentionally unavailable." }),
    });
    },
  );
  const privateReadRequests = [];
  let reportAttempts = 0;
  await page.route("**/api/negotiations/**", async (route) => {
    const url = new URL(route.request().url());
    const authorization = route.request().headers().authorization;
    const isPrivateRead = [
      `/api/negotiations/${proposalId}`,
      `/api/negotiations/${proposalId}/report`,
      `/api/negotiations/${proposalId}/snapshot`,
    ].includes(url.pathname);
    if (isPrivateRead) {
      privateReadRequests.push({
        pathname: url.pathname,
        search: url.search,
        authorization,
      });
    }
    if (
      url.pathname === `/api/negotiations/${proposalId}` &&
      authorization === `Bearer ${accessToken}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(recordFixture()),
      });
      return;
    }
    if (
      url.pathname === `/api/negotiations/${proposalId}/report` &&
      authorization === `Bearer ${accessToken}` &&
      url.searchParams.get("download") === "1"
    ) {
      reportAttempts += 1;
      if (reportAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "The complete record is temporarily unavailable. Try again.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: {
          "content-disposition":
            'attachment; filename="openescrow-rendered-complete-record.html"',
        },
        body: "<!doctype html><title>OpenEscrow rendered complete record</title>",
      });
      return;
    }
    if (
      url.pathname === `/api/negotiations/${proposalId}/snapshot` &&
      authorization === `Bearer ${accessToken}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(snapshot),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unexpected rendered rehearsal request." }),
    });
  });

  await page.goto(
    `${baseUrl}/?proposal=${proposalId}&access=landlord#token=${accessToken}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.getByRole("tab", { name: "Record" }).click();
  await page.getByText(
    "Download the complete timestamped report, save a private encrypted backup, and check it against an optional public proof.",
  ).waitFor({ state: "visible" });
  const recordToggle = page.getByRole("button", {
    name: /Finalized agreement record/,
  });
  await recordToggle.waitFor({ state: "visible" });
  await recordToggle.click();

  const completeRecordButton = page.getByRole("button", {
    name: "Download complete record report",
  });
  await completeRecordButton.click();
  await page
    .getByRole("alert")
    .filter({
      hasText: "The complete record is temporarily unavailable. Try again.",
    })
    .waitFor({ state: "visible" });
  assert.equal(
    await completeRecordButton.isEnabled(),
    true,
    "A report outage should restore the download action for an explicit retry.",
  );
  assert.equal(
    await completeRecordButton.evaluate(
      (element) => document.activeElement === element,
    ),
    true,
    "A report outage should keep keyboard focus on the retryable download action.",
  );
  const [completeRecordDownload] = await Promise.all([
    page.waitForEvent("download"),
    completeRecordButton.click(),
  ]);
  assert.equal(
    completeRecordDownload.suggestedFilename(),
    "openescrow-rendered-complete-record.html",
  );
  const completeRecordPath = await completeRecordDownload.path();
  assert.ok(completeRecordPath, "The complete record report should have a local path.");
  assert.match(
    await readFile(completeRecordPath, "utf8"),
    /OpenEscrow rendered complete record/,
  );
  await page.getByText("Complete timestamped record downloaded.").waitFor({
    state: "visible",
  });

  const downloadRecord = page.getByRole("button", {
    name: "Download encrypted record",
  });
  await downloadRecord.waitFor({ state: "visible" });
  const [archiveDownload] = await Promise.all([
    page.waitForEvent("download"),
    downloadRecord.click(),
  ]);
  const archivePath = await archiveDownload.path();
  assert.ok(archivePath, "The encrypted record download should have a local path.");
  const archiveBytes = await readFile(archivePath);
  await page.getByText(
    "Encrypted record downloaded. Save the verification key separately before leaving this page.",
  ).waitFor({ state: "visible" });

  const [keyDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download verification key" }).click(),
  ]);
  const keyPath = await keyDownload.path();
  assert.ok(keyPath, "The verification-key download should have a local path.");
  const keyText = await readFile(keyPath, "utf8");
  const verificationKey = keyText.match(/oe1_[A-Za-z0-9_-]+/u)?.[0];
  assert.ok(verificationKey, "The downloaded key file should contain an OpenEscrow key.");

  await page.getByLabel("Encrypted record file").setInputFiles({
    name: archiveDownload.suggestedFilename(),
    mimeType: "application/json",
    buffer: archiveBytes,
  });
  const keyInput = page.getByLabel("Verification key");
  const verifyButton = page.getByRole("button", {
    name: "Check encrypted record",
  });
  await page.getByText(
    "The public proof check will be skipped until the record service is connected to this OpenEscrow release.",
  ).waitFor({ state: "visible" });
  const fingerprintDetails = page.locator(".record-proof-details summary");
  const snapshotFingerprint = page.locator(".record-proof-details code");
  assert.equal(
    await snapshotFingerprint.isVisible(),
    false,
    "The raw record fingerprint should stay collapsed by default.",
  );
  await fingerprintDetails.focus();
  assert.equal(
    await fingerprintDetails.evaluate((element) => document.activeElement === element),
    true,
    "The technical fingerprint disclosure should be keyboard focusable.",
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await snapshotFingerprint.isVisible(),
    true,
    "The exact record fingerprint should remain available on request.",
  );
  const keyPayloadIndex = "oe1_".length;
  const wrongKey = `${verificationKey.slice(0, keyPayloadIndex)}${
    verificationKey[keyPayloadIndex] === "A" ? "B" : "A"
  }${verificationKey.slice(keyPayloadIndex + 1)}`;
  await keyInput.fill(wrongKey);
  assert.equal(
    await verifyButton.isEnabled(),
    true,
    "Local verification should remain enabled while the registry is unavailable.",
  );
  await verifyButton.click();
  await page.getByText(
    "The verification key does not match this encrypted record, or the file changed.",
  ).waitFor({ state: "visible" });

  await keyInput.fill(verificationKey);
  await verifyButton.click();
  await page.getByText(
    "Record verified; public proof check unavailable",
  ).waitFor({ state: "visible" });
  const resultSummary = page.locator(".verification-result-summary");
  const friendlyResult = await resultSummary.innerText();
  assert.match(friendlyResult, /downloaded file is intact/i);
  assert.doesNotMatch(
    friendlyResult,
    /0x|sha-256|base sepolia|wallet/i,
    "The primary verification result should not expose technical identifiers.",
  );
  const verificationDetails = page.getByText("Verification details", {
    exact: true,
  });
  const verificationDetailsBox = await verificationDetails.boundingBox();
  assert.equal(
    Boolean(verificationDetailsBox && verificationDetailsBox.height >= 44),
    true,
    "The optional verification disclosure should remain a 44px mobile target.",
  );
  const verifiedFingerprint = page.locator(".verification-proof-details code");
  assert.equal(
    await verifiedFingerprint.isVisible(),
    false,
    "Verification should lead with the plain-language result.",
  );
  await verificationDetails.click();
  assert.equal(
    await verifiedFingerprint.isVisible(),
    true,
    "Technical verification details should remain available on request.",
  );
  assert.equal(
    await verifiedFingerprint.getAttribute("title"),
    snapshot.hash,
    "The rendered verifier should show the exact downloaded record hash.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "The expanded Record workflow should not cause horizontal overflow on a narrow screen.",
  );
  assert.ok(
    privateReadRequests.some(
      ({ pathname, search }) =>
        pathname === `/api/negotiations/${proposalId}` && search === "",
    ),
    "The rendered workspace should load its agreement through the token-free route.",
  );
  assert.ok(
    privateReadRequests.some(
      ({ pathname, search }) =>
        pathname === `/api/negotiations/${proposalId}/report` &&
        search === "?download=1",
    ),
    "The rendered report should retain only its non-secret download flag.",
  );
  assert.ok(
    privateReadRequests.some(
      ({ pathname, search }) =>
        pathname === `/api/negotiations/${proposalId}/snapshot` && search === "",
    ),
    "The rendered encrypted export should load its snapshot through the token-free route.",
  );
  for (const privateReadRequest of privateReadRequests) {
    assert.equal(
      privateReadRequest.authorization,
      `Bearer ${accessToken}`,
      privateReadRequest.pathname,
    );
    assert.equal(privateReadRequest.search.includes(accessToken), false);
    assert.equal(privateReadRequest.search.includes("token="), false);
  }

  process.stdout.write(
    "Record verification browser check passed: header-authorized readable report download, plain-language results without technical identifiers, keyboard-accessible verification details, mobile width, encrypted export, separate key download, wrong-key rejection, and local integrity verification remain usable during a public-proof outage.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
}
