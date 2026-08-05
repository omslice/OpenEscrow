import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4182;
const baseUrl = `http://${host}:${port}`;
const proposalId = "OE-P-RENDERED-PILOT";
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

const tokens = {
  landlord: "rendered-landlord-access",
  "tenant-one": "rendered-tenant-one-access",
  "tenant-two": "rendered-tenant-two-access",
  arbiter: "rendered-arbiter-access",
};
const roleApiNames = {
  landlord: "landlord",
  "tenant-one": "tenant",
  "tenant-two": "tenant",
  arbiter: "arbiter",
};
const addresses = {
  landlord: "0x1111111111111111111111111111111111111111",
  "tenant-one": "0x2222222222222222222222222222222222222222",
  "tenant-two": "0x3333333333333333333333333333333333333333",
  arbiter: "0x4444444444444444444444444444444444444444",
};
const tenantIds = {
  "tenant-one": "tenant-rendered-one",
  "tenant-two": "tenant-rendered-two",
};
const expectedWithdrawals = {
  landlord: "225",
  "tenant-one": "465",
  "tenant-two": "310",
};

const lifecycle = {
  claim: null,
  responses: new Map(),
  ruling: null,
  withdrawn: new Set(),
  events: [],
  nextEventId: 1,
};
let claimNoticeChecked = false;

function addEvent(actorRole, action, summary, metadata) {
  lifecycle.events.push({
    id: lifecycle.nextEventId,
    createdAt: `2026-08-04T00:${String(lifecycle.nextEventId).padStart(2, "0")}:00.000Z`,
    actorRole,
    action,
    summary,
    revision: 1,
    metadata,
  });
  lifecycle.nextEventId += 1;
}

function stage() {
  if (!lifecycle.claim) return "funded";
  if (lifecycle.ruling) return "closed";
  if (lifecycle.responses.size < 2) return "claim-open";
  const accepted = [...lifecycle.responses.values()].map((entry) =>
    Number(entry.acceptedAmount),
  );
  return Math.min(...accepted) < 300 ? "disputed" : "closed";
}

function withdrawable(role) {
  if (stage() !== "closed" || lifecycle.withdrawn.has(role)) return 0;
  if (role === "landlord") return 225_000_000;
  if (role === "tenant-one") return 465_000_000;
  if (role === "tenant-two") return 310_000_000;
  return 0;
}

function recordFor(role) {
  const viewerTenantId = tenantIds[role];
  const viewerEmail =
    role === "tenant-one"
      ? "tenant-one@example.test"
      : role === "tenant-two"
        ? "tenant-two@example.test"
        : role === "landlord"
          ? "landlord@example.test"
          : "arbiter@example.test";
  return {
    id: proposalId,
    status: "finalized",
    revision: 1,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: `2026-08-04T00:${String(lifecycle.nextEventId).padStart(2, "0")}:30.000Z`,
    landlordName: "Rendered Landlord",
    landlordEmail: "landlord@example.test",
    tenantName: "Rendered Tenant One",
    tenantEmail: "tenant-one@example.test",
    tenants: [
      {
        id: tenantIds["tenant-one"],
        name: "Rendered Tenant One",
        email: "tenant-one@example.test",
        approved: true,
        wallet: addresses["tenant-one"],
        isFundingTenant: true,
        acceptedAt: "2026-08-04T00:00:00.000Z",
        depositShareBps: 6_000,
      },
      {
        id: tenantIds["tenant-two"],
        name: "Rendered Tenant Two",
        email: "tenant-two@example.test",
        approved: true,
        wallet: addresses["tenant-two"],
        isFundingTenant: false,
        acceptedAt: "2026-08-04T00:00:00.000Z",
        depositShareBps: 4_000,
      },
    ],
    arbiterName: "Rendered Arbiter",
    arbiterEmail: "arbiter@example.test",
    terms: {
      jurisdiction: "testnet-generic",
      policyVersion: "generic-test-v1",
      propertyAddress: "100 Synthetic Pilot Avenue",
      tokenChoice: "plain",
      deposit: "1000",
      operationsReserve: "5",
      monthlyRent: "1000",
      claimWindowStart: "2026-08-04T00:00:00.000Z",
      claimDays: "30",
      responseDays: "7",
      arbiterDays: "7",
    },
    tenantApproved: true,
    arbiterApproved: true,
    tenantWallet: addresses["tenant-one"],
    arbiterWallet: addresses.arbiter,
    onchainAgreementId: "43",
    onchainTxHash: `0x${"f".repeat(64)}`,
    ...(viewerTenantId ? { viewerTenantId } : {}),
    viewerEmail,
    events: lifecycle.events,
  };
}

function bootstrapFor(role) {
  const record = recordFor(role);
  return {
    role,
    stage: stage(),
    access: {
      proposalId,
      role: roleApiNames[role],
      token: tokens[role],
      source: "invite",
    },
    record,
    ...(role === "landlord"
      ? {
          landlordBundle: {
            record,
            access: {
              landlord: tokens.landlord,
              tenant: tokens["tenant-one"],
              tenants: [
                {
                  id: tenantIds["tenant-one"],
                  name: "Rendered Tenant One",
                  email: "tenant-one@example.test",
                  token: tokens["tenant-one"],
                  isFundingTenant: true,
                  depositShareBps: 6_000,
                },
                {
                  id: tenantIds["tenant-two"],
                  name: "Rendered Tenant Two",
                  email: "tenant-two@example.test",
                  token: tokens["tenant-two"],
                  isFundingTenant: false,
                  depositShareBps: 4_000,
                },
              ],
              arbiter: tokens.arbiter,
            },
          },
        }
      : {}),
    responseCount: lifecycle.responses.size,
    viewerResponded: lifecycle.responses.has(role),
    claimAmountMicros: lifecycle.claim ? "300000000" : "0",
    disputedMicros: stage() === "disputed" ? "150000000" : "0",
    landlordWithdrawableMicros: String(withdrawable("landlord")),
    tenantWithdrawableMicros: String(withdrawable(role)),
    withdrawnRoles: [...lifecycle.withdrawn],
  };
}

function reportHtml() {
  const rows = lifecycle.events
    .map(
      (event) =>
        `<li><strong>${event.actorRole}</strong>: ${event.summary}</li>`,
    )
    .join("");
  return `<!doctype html><html><body><h1>OpenEscrow complete rendered pilot record</h1><p>Rendered Landlord</p><p>Rendered Tenant One</p><p>Rendered Tenant Two</p><p>Rendered Arbiter</p><ol>${rows}</ol></body></html>`;
}

function errorResponse(route, status, error) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ error }),
  });
}

async function applyAction(route, role) {
  const body = JSON.parse(route.request().postData() || "{}");
  if (body.token !== tokens[role]) {
    return errorResponse(route, 403, "This synthetic access belongs to another participant.");
  }
  if (body.type === "claim_submitted") {
    if (role !== "landlord") {
      return errorResponse(route, 403, "Only the landlord may submit a claim.");
    }
    if (lifecycle.claim) {
      return errorResponse(route, 409, "The claim is already recorded.");
    }
    assert.equal(body.amount, "300");
    lifecycle.claim = body;
    addEvent(
      "landlord",
      "deduction_claim_submitted",
      "Submitted a documented 300 USDC deduction claim for the damaged entry door.",
      { ...body },
    );
  } else if (body.type === "claim_response") {
    if (role !== "tenant-one" && role !== "tenant-two") {
      return errorResponse(route, 403, "Only an invited tenant may answer the claim.");
    }
    if (!lifecycle.claim) {
      return errorResponse(route, 409, "The claim is not open.");
    }
    if (lifecycle.responses.has(role)) {
      return errorResponse(route, 409, "This tenant already responded.");
    }
    const expected = role === "tenant-one" ? "300" : "150";
    assert.equal(body.acceptedAmount, expected);
    lifecycle.responses.set(role, body);
    addEvent(
      "tenant",
      "claim_response_submitted",
      `${role === "tenant-one" ? "Rendered Tenant One" : "Rendered Tenant Two"} approved ${expected} USDC of the claim.`,
      { ...body, tenantId: tenantIds[role] },
    );
  } else if (body.type === "arbiter_ruling") {
    if (role !== "arbiter") {
      return errorResponse(route, 403, "Only the appointed arbiter may rule.");
    }
    if (stage() !== "disputed") {
      return errorResponse(route, 409, "The agreement is not ready for a ruling.");
    }
    assert.equal(body.awardToLandlord, "75");
    lifecycle.ruling = body;
    addEvent(
      "arbiter",
      "arbiter_ruling_submitted",
      "Awarded 75 USDC of the disputed balance to the landlord.",
      { ...body },
    );
  } else if (body.type === "withdrawal_completed") {
    if (!Object.hasOwn(expectedWithdrawals, role)) {
      return errorResponse(route, 403, "This participant has no withdrawal role.");
    }
    if (stage() !== "closed") {
      return errorResponse(route, 409, "The allocation is not final.");
    }
    if (lifecycle.withdrawn.has(role)) {
      return errorResponse(route, 409, "This participant already withdrew.");
    }
    assert.equal(body.amount, expectedWithdrawals[role]);
    lifecycle.withdrawn.add(role);
    addEvent(
      roleApiNames[role],
      "withdrawal_completed",
      `${role === "landlord" ? "Rendered Landlord" : role === "tenant-one" ? "Rendered Tenant One" : "Rendered Tenant Two"} withdrew ${body.amount} USDC.`,
      {
        ...body,
        ...(tenantIds[role] ? { tenantId: tenantIds[role] } : {}),
      },
    );
  } else if (
    body.type !== "claim_notification_prepared" &&
    body.type !== "claim_response_notification_prepared"
  ) {
    return errorResponse(route, 400, "Unexpected synthetic lifecycle action.");
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(recordFor(role)),
  });
}

async function routeContext(context, role) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/testing/pilot-lifecycle-state") {
      if (url.searchParams.get("role") !== role) {
        return errorResponse(route, 403, "The rendered role context changed.");
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bootstrapFor(role)),
      });
    }
    if (
      url.pathname === `/api/negotiations/${proposalId}` &&
      request.method() === "GET"
    ) {
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(request.headers().authorization, `Bearer ${tokens[role]}`);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(recordFor(role)),
      });
    }
    if (
      url.pathname === `/api/negotiations/${proposalId}/actions` &&
      request.method() === "POST"
    ) {
      return applyAction(route, role);
    }
    if (url.pathname === `/api/negotiations/${proposalId}/report`) {
      assert.equal(url.searchParams.get("download"), "1");
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(request.headers().authorization, `Bearer ${tokens[role]}`);
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition":
            'attachment; filename="openescrow-rendered-multi-party-report.html"',
        },
        body: reportHtml(),
      });
    }
    if (url.pathname === "/api/evidence" && request.method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cid: "rendered-pilot-evidence",
          uri: "openescrow://evidence/rendered-pilot-evidence",
          gatewayUrl: "/api/evidence/rendered-pilot-evidence",
          sha256: `0x${"a".repeat(64)}`,
          storageKind: "encrypted-private",
        }),
      });
    }
    if (url.pathname === "/api/notifications/claim") {
      assert.equal(role, "landlord");
      const body = JSON.parse(request.postData() || "{}");
      assert.equal(body.token, tokens.landlord);
      assert.deepEqual(Object.keys(body).sort(), [
        "proposalId",
        "reviewLinks",
        "token",
      ]);
      assert.equal(body.reviewLinks.length, 2);
      for (const tenantRole of ["tenant-one", "tenant-two"]) {
        const link = body.reviewLinks.find(
          (candidate) => candidate.tenantId === tenantIds[tenantRole],
        );
        assert.ok(link, `A private claim notice is required for ${tenantRole}.`);
        const reviewUrl = new URL(link.reviewUrl);
        assert.equal(reviewUrl.searchParams.has("token"), false);
        assert.equal(
          new URLSearchParams(reviewUrl.hash.slice(1)).get("token"),
          tokens[tenantRole],
        );
        assert.equal(
          body.reviewLinks.some(
            (candidate) =>
              candidate.tenantId !== tenantIds[tenantRole] &&
              candidate.reviewUrl.includes(tokens[tenantRole]),
          ),
          false,
        );
      }
      claimNoticeChecked = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messageId: "rendered-landlord-notification-1",
          messageIds: [
            "rendered-landlord-notification-1",
            "rendered-landlord-notification-2",
          ],
        }),
      });
    }
    if (url.pathname === "/api/notifications/claim-response") {
      const body = JSON.parse(request.postData() || "{}");
      assert.deepEqual(Object.keys(body).sort(), [
        "proposalId",
        "token",
        "transactionHash",
      ]);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ messageId: `rendered-${role}-notification` }),
      });
    }
    return route.fallback();
  });
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

async function openRole(browser, role) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routeContext(context, role);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/testing/pilot-lifecycle.html?role=${role}`, {
    waitUntil: "networkidle",
  });
  return { context, page, role };
}

async function waitForStage(page, expected) {
  await page
    .getByTestId("pilot-stage")
    .filter({ hasText: expected })
    .waitFor({ state: "visible" });
}

async function assertPrivateBrowserBoundary(entry) {
  assert.equal(new URL(entry.page.url()).searchParams.has("token"), false);
  const storage = await entry.page.evaluate(() => ({
    local: Object.entries(window.localStorage),
    session: Object.entries(window.sessionStorage),
  }));
  assert.doesNotMatch(
    JSON.stringify(storage),
    /rendered-(?:landlord|tenant-one|tenant-two|arbiter)-access/,
    `${entry.role} access must not be persisted in browser storage.`,
  );
  assert.equal(
    await entry.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    `${entry.role} lifecycle UI must not overflow a mobile viewport.`,
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
    "pilot-lifecycle-test",
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
const entries = [];
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const landlord = await openRole(browser, "landlord");
  entries.push(landlord);
  await waitForStage(landlord.page, "funded");
  await landlord.page.getByLabel("Description").fill("Damaged rendered entry door");
  await landlord.page.getByLabel("Amount (shares)").fill("300");
  await landlord.page
    .getByRole("checkbox", {
      name: /Every test deduction is separately itemized and described/,
    })
    .check();
  await landlord.page
    .getByRole("checkbox", {
      name: /supporting file includes applicable invoices/i,
    })
    .check();
  await landlord.page
    .getByRole("button", { name: "Supporting file", exact: true })
    .setInputFiles({
      name: "rendered-door.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-rendered-multi-party-pilot"),
    });
  await landlord.page
    .getByText("Supporting file stored privately and ready to submit.")
    .waitFor({ state: "visible" });
  await landlord.page
    .getByRole("button", { name: "Submit documented deduction claim" })
    .click();
  await waitForStage(landlord.page, "claim-open");
  await landlord.page
    .getByText("Every tenant receives a separate message with only their own private review link.")
    .waitFor({ state: "visible" });
  assert.equal(
    await landlord.page.locator(".claim-notice-recipient").count(),
    2,
  );
  for (const tenantLabel of ["Rendered Tenant One", "Rendered Tenant Two"]) {
    const emailButton = landlord.page.getByRole("button", {
      name: `Email ${tenantLabel}`,
    });
    const copyButton = landlord.page.getByRole("button", {
      name: `Copy notice for ${tenantLabel}`,
    });
    for (const button of [emailButton, copyButton]) {
      const box = await button.boundingBox();
      assert.equal(Boolean(box && box.height >= 44), true);
    }
  }
  await landlord.page
    .getByRole("button", { name: "Send tenant email(s)" })
    .click();
  await landlord.page
    .getByText("Tenant claim email sent and added to the record.")
    .waitFor({ state: "visible" });
  assert.equal(claimNoticeChecked, true);

  const tenantOne = await openRole(browser, "tenant-one");
  entries.push(tenantOne);
  await tenantOne.page
    .getByText("The landlord claimed 300 USDC.", { exact: false })
    .waitFor({ state: "visible" });
  const crossRoleStatus = await tenantOne.page.evaluate(
    async ({ currentProposalId, currentToken }) => {
      const response = await fetch(
        `/api/negotiations/${currentProposalId}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: currentToken,
            type: "arbiter_ruling",
            awardToLandlord: "75",
            note: "Cross-role attempt",
            transactionHash: `0x${"e".repeat(64)}`,
          }),
        },
      );
      return response.status;
    },
    { currentProposalId: proposalId, currentToken: tokens["tenant-one"] },
  );
  assert.equal(crossRoleStatus, 403);
  await tenantOne.page.getByRole("button", { name: "Approve deduction" }).click();
  await waitForStage(tenantOne.page, "claim-open");
  await tenantOne.page
    .getByText("Waiting for the remaining tenant response")
    .waitFor({ state: "visible" });

  const tenantTwo = await openRole(browser, "tenant-two");
  entries.push(tenantTwo);
  await tenantTwo.page
    .getByText("1 of 2 responses are currently recorded.")
    .waitFor({ state: "visible" });
  await tenantTwo.page.getByLabel("Approve part").check();
  await tenantTwo.page
    .getByLabel("Amount to approve (USDC; the rest becomes disputed)")
    .fill("150");
  await tenantTwo.page
    .getByLabel(/Decision explanation/)
    .fill("Only half of the claimed damage is supported by the synthetic file.");
  await tenantTwo.page
    .getByRole("button", { name: "Approve part and dispute remainder" })
    .click();
  await waitForStage(tenantTwo.page, "disputed");

  const arbiter = await openRole(browser, "arbiter");
  entries.push(arbiter);
  await arbiter.page.getByRole("heading", { name: "Resolve dispute" }).waitFor();
  await arbiter.page.getByLabel(/Award to landlord/).fill("75");
  await arbiter.page
    .getByLabel("Ruling note")
    .fill("The rendered evidence supports half of the disputed balance.");
  await arbiter.page.getByRole("button", { name: "Submit ruling" }).click();
  await waitForStage(arbiter.page, "closed");

  for (const entry of [landlord, tenantOne, tenantTwo]) {
    await entry.page.reload({ waitUntil: "networkidle" });
    await waitForStage(entry.page, "closed");
    await entry.page
      .getByText("Landlord allocation: 225 USDC")
      .waitFor({ state: "visible" });
    await entry.page
      .getByText("Tenant one allocation: 465 USDC")
      .waitFor({ state: "visible" });
    await entry.page
      .getByText("Tenant two allocation: 310 USDC")
      .waitFor({ state: "visible" });
  }

  for (const [entry, amount] of [
    [landlord, "225"],
    [tenantOne, "465"],
    [tenantTwo, "310"],
  ]) {
    const withdraw = entry.page.getByRole("button", {
      name: `Withdraw ${amount} USDC`,
    });
    await withdraw.waitFor({ state: "visible" });
    const box = await withdraw.boundingBox();
    assert.equal(Boolean(box && box.height >= 44), true);
    await withdraw.click();
    await withdraw.waitFor({ state: "hidden" });
    assert.equal(
      await entry.page.getByRole("button", { name: `Withdraw ${amount} USDC` }).count(),
      0,
    );
  }

  const duplicateWithdrawalStatus = await tenantOne.page.evaluate(
    async ({ currentProposalId, currentToken }) => {
      const response = await fetch(
        `/api/negotiations/${currentProposalId}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: currentToken,
            type: "withdrawal_completed",
            amount: "465",
            transactionHash: `0x${"6".repeat(64)}`,
          }),
        },
      );
      return response.status;
    },
    { currentProposalId: proposalId, currentToken: tokens["tenant-one"] },
  );
  assert.equal(duplicateWithdrawalStatus, 409);

  await landlord.page.reload({ waitUntil: "networkidle" });
  const reportButton = landlord.page.getByRole("button", {
    name: "Download complete record report",
  });
  const [download] = await Promise.all([
    landlord.page.waitForEvent("download"),
    reportButton.click(),
  ]);
  assert.equal(
    download.suggestedFilename(),
    "openescrow-rendered-multi-party-report.html",
  );
  const reportPath = await download.path();
  assert.ok(reportPath);
  const report = await readFile(reportPath, "utf8");
  for (const expected of [
    "Rendered Landlord",
    "Rendered Tenant One",
    "Rendered Tenant Two",
    "Rendered Arbiter",
    "300 USDC deduction claim",
    "approved 300 USDC",
    "approved 150 USDC",
    "Awarded 75 USDC",
    "withdrew 225 USDC",
    "withdrew 465 USDC",
    "withdrew 310 USDC",
  ]) {
    assert.match(report, new RegExp(expected));
  }

  for (const entry of entries) await assertPrivateBrowserBoundary(entry);
  assert.equal(lifecycle.responses.size, 2);
  assert.equal(lifecycle.withdrawn.size, 3);
  assert.equal(
    lifecycle.events.filter((event) => event.action === "withdrawal_completed").length,
    3,
  );

  process.stdout.write(
    "Rendered multi-party pilot lifecycle passed: one synthetic funded agreement moved through a landlord claim with two recipient-specific private notices, two exact tenant decisions, arbiter ruling, 225/465/310 allocations, three one-time withdrawals, and a complete header-authorized report across isolated mobile browser contexts with no bearer URL or browser-storage leakage.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await Promise.all(entries.map((entry) => entry.context.close()));
  await browser?.close();
  server.kill();
}
