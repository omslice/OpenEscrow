import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const configuredPort = Number.parseInt(
  process.env.OPENESCROW_EVIDENCE_TEST_PORT || "",
  10,
);
const port =
  Number.isInteger(configuredPort) && configuredPort >= 1_024 && configuredPort <= 65_535
    ? configuredPort
    : 22_000 + (process.pid % 30_000);
const baseUrl = `http://${host}:${port}/testing/evidence-recovery.html`;
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
    "evidence-recovery-test",
  ],
  {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

let requestCount = 0;
let finishDelayedUpload;
let documentRequestCount = 0;
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.route("**/api/evidence", async (route) => {
    requestCount += 1;
    const request = route.request();
    assert.equal(request.method(), "POST");
    assert.match(
      (await request.headerValue("content-type")) || "",
      /^multipart\/form-data;/,
    );
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "OpenEscrow could not finish recording this supporting file. Try again.",
        }),
      });
      return;
    }
    if (requestCount === 3) {
      await new Promise((resolve) => {
        finishDelayedUpload = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        cid: `evidence-${requestCount}`,
        uri: `openescrow://evidence/evidence-${requestCount}`,
        gatewayUrl: `/api/evidence/evidence-${requestCount}`,
        sha256: `0x${String(requestCount).padStart(64, "0")}`,
        storageKind: "private",
      }),
    });
  });
  await page.route("**/api/evidence/018f4f6a-3f9d-7a21-a48d-123456789abc", async (route) => {
    documentRequestCount += 1;
    const request = route.request();
    assert.equal(request.method(), "POST");
    assert.equal(
      new URL(request.url()).search,
      "",
      "Agreement access must not be embedded in the supporting-file URL.",
    );
    assert.match(
      request.postDataBuffer()?.toString("utf8") || "",
      /access-b/,
      "The same-origin supporting-file request must carry the active agreement access in its body.",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7\nprivate supporting file"),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const fileInput = page.getByLabel("Supporting file", { exact: true });
  await fileInput.setInputFiles({
    name: "supporting-file.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nrendered evidence recovery"),
  });

  const uploadError = page.getByRole("alert");
  await uploadError.waitFor({ state: "visible" });
  assert.match(await uploadError.textContent(), /could not finish recording/i);
  const describedByAfterFailure = (await fileInput.getAttribute("aria-describedby")) || "";
  assert.match(describedByAfterFailure, /supporting-file-help/);
  assert.match(describedByAfterFailure, /supporting-file-warning/);
  assert.match(describedByAfterFailure, /supporting-file-error/);

  const retry = page.getByRole("button", {
    name: "Retry supporting file upload",
  });
  await retry.focus();
  await retry.press("Enter");
  await page.getByText("Supporting file stored privately and ready to submit.").waitFor({
    state: "visible",
  });
  assert.equal(requestCount, 2, "Retry should submit the already-selected file once.");
  assert.equal(
    await fileInput.evaluate((element) => element === document.activeElement),
    true,
    "A successful same-file retry should restore focus to the file control.",
  );
  const recoveredState = JSON.parse(
    (await page.getByTestId("evidence-state").textContent()) || "{}",
  );
  assert.equal(recoveredState.scope, "a");
  assert.equal(recoveredState.valid, true);
  assert.equal(recoveredState.uri, "openescrow://evidence/evidence-2");

  await fileInput.setInputFiles({
    name: "replacement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nreplacement evidence"),
  });
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return input?.getAttribute("aria-busy") === "true";
  });
  assert.equal(requestCount, 3);
  await page.getByRole("button", { name: "Use agreement B" }).click();
  finishDelayedUpload();
  await page.waitForTimeout(50);
  const switchedState = JSON.parse(
    (await page.getByTestId("evidence-state").textContent()) || "{}",
  );
  assert.equal(switchedState.scope, "b");
  assert.equal(switchedState.valid, false);
  assert.equal(switchedState.uri, "");
  assert.equal(
    await page.getByText("Supporting file stored privately and ready to submit.").count(),
    0,
    "A delayed upload must not populate a newly selected agreement.",
  );

  const evidenceItems = page.locator(".evidence-list li");
  assert.equal(await evidenceItems.count(), 2);
  const firstEvidence = evidenceItems.nth(0);
  const firstSummary = await firstEvidence
    .locator(".evidence-entry-summary")
    .innerText();
  assert.match(firstSummary, /Claim—unpaid rent/);
  assert.match(firstSummary, /Added/);
  assert.doesNotMatch(
    firstSummary,
    /0x|hash|uri|wallet|cryptographic/i,
    "The primary supporting-file summary should not expose technical identifiers.",
  );
  const firstDetails = firstEvidence.locator(
    "details.evidence-verification-details",
  );
  const secondDetails = evidenceItems
    .nth(1)
    .locator("details.evidence-verification-details");
  assert.equal(await firstDetails.getAttribute("open"), null);
  const firstDetailsSummary = firstDetails.getByText("Verification details", {
    exact: true,
  });
  const firstDetailsSummaryBox = await firstDetailsSummary.boundingBox();
  assert.equal(
    Boolean(firstDetailsSummaryBox && firstDetailsSummaryBox.height >= 44),
    true,
  );
  assert.equal(
    await firstDetails.getByText(/Digital fingerprint:/).isVisible(),
    false,
  );
  await firstDetailsSummary.click();
  await firstDetails.getByText(/Submitted by wallet: 0x1111.*1111/).waitFor();
  await firstDetails.getByText(/Digital fingerprint: 0x[a-f0-9]{64}/i).waitFor();
  assert.equal(
    await secondDetails.getByText(/Digital fingerprint:/).isVisible(),
    false,
    "Opening one supporting-file disclosure must not expand another.",
  );
  const privateFileButton = firstEvidence.getByRole("button", {
    name: "View supporting file for Claim—unpaid rent",
  });
  const privateFileButtonBox = await privateFileButton.boundingBox();
  assert.equal(Boolean(privateFileButtonBox && privateFileButtonBox.height >= 44), true);
  await privateFileButton.click();
  await page.waitForFunction(() =>
    document.querySelector(".evidence-document-link")?.textContent ===
    "View supporting file",
  );
  assert.equal(documentRequestCount, 1);

  const mobileWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(
    mobileWidth.document <= mobileWidth.viewport,
    true,
    `Evidence recovery should not overflow a mobile viewport: ${JSON.stringify(mobileWidth)}`,
  );

  process.stdout.write(
    "Evidence recovery browser check passed: same-file retry, focus, announcements, scope isolation, plain-language supporting-file summaries, independently collapsed verification details, token-free file URLs, mobile touch targets, and mobile width remain usable.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
}
