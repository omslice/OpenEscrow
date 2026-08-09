import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";

const host = "127.0.0.1";
const port = 4174;
const baseUrl = `http://${host}:${port}`;
const viteEntrypoint = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

function buildSavedProposal(input) {
  const now = new Date().toISOString();
  const tenants = (input.tenants || []).map((tenant, index) => ({
    id: `tenant-${index + 1}`,
    name: tenant.name,
    email: tenant.email,
    approved: false,
    wallet: null,
    isFundingTenant: index === 0,
    acceptedAt: null,
    depositShareBps: tenant.depositShareBps,
  }));
  return {
    record: {
      id: "OE-P-RECOVERY",
      status: "draft",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      landlordName: input.landlordName || null,
      landlordEmail: input.landlordEmail || "",
      tenantName: input.tenantName,
      tenantEmail: input.tenantEmail,
      tenants,
      arbiterName: null,
      arbiterEmail: null,
      terms: input.terms,
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
          summary: "Created the test proposal.",
          revision: 1,
        },
      ],
    },
    access: {
      landlord: "landlord-recovery-token",
      tenant: "tenant-recovery-token",
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        token: `${tenant.id}-recovery-token`,
        isFundingTenant: tenant.isFundingTenant,
        depositShareBps: tenant.depositShareBps,
      })),
      arbiter: null,
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
      // The local Vite server is still starting.
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
    "accessibility-test",
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let destructiveProposalRequests = 0;
  let complianceSourceChecks = 0;

  await page.route("**/api/address-suggestions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          {
            id: "first",
            label: "123 Main Street, Los Angeles, CA 90012",
            countryCode: "US",
            stateCode: "CA",
            city: "Los Angeles",
            county: "Los Angeles County",
            postalCode: "90012",
            latitude: 34.0522,
            longitude: -118.2437,
            attestation: "test-attestation",
          },
          {
            id: "second",
            label: "123 Main Street, San Diego, CA 92101",
            countryCode: "US",
            stateCode: "CA",
            city: "San Diego",
            county: "San Diego County",
            postalCode: "92101",
            latitude: 32.7157,
            longitude: -117.1611,
            attestation: "test-attestation",
          },
        ],
      }),
    });
  });
  await page.route("**/api/compliance/source-status", async (route) => {
    complianceSourceChecks += 1;
    assert.equal(route.request().method(), "POST");
    const input = route.request().postDataJSON();
    if (complianceSourceChecks === 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "OpenEscrow could not reach the official source right now. The recorded profile remains unchanged.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify((() => {
        const expectedVersions = new Map([
          [input.jurisdiction, input.profileVersion],
          ...(input.overlays || []).map((overlay) => [
            overlay.id,
            overlay.version,
          ]),
        ]);
        const sources = COMPLIANCE_SOURCE_REGISTRY.filter(
          (sourceItem) =>
            expectedVersions.get(sourceItem.jurisdiction) === sourceItem.version,
        ).map((sourceItem) => ({
          ...sourceItem,
          status: "unchanged",
          lastCheckedAt: "2026-07-30T12:00:00.000Z",
          lastVerifiedAt: "2026-07-30T12:00:00.000Z",
          requiresReview: false,
        }));
        return {
          jurisdiction: input.jurisdiction,
          profileVersion: input.profileVersion,
          overlays: input.overlays || [],
          source: sources[0],
          sources,
          immutableSnapshotNotice:
            "Finalized agreements keep their recorded compliance snapshot.",
        };
      })()),
    });
  });
  await page.route(/\/api\/negotiations$/, async (route) => {
    assert.equal(route.request().method(), "POST");
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSavedProposal(input)),
    });
  });
  await page.route(/\/api\/negotiations\/[^/]+\/actions$/, async (route) => {
    destructiveProposalRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "A blocked confirmation must not reach the server." }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /I am a landlord/ }).click();
  const workspaceTablist = page.getByRole("tablist", {
    name: "Landlord workspace",
  });
  const workspaceTabs = workspaceTablist.getByRole("tab");
  assert.equal(await workspaceTabs.count(), 5, "The workspace should expose five tabs.");
  const aboutTab = workspaceTablist.getByRole("tab", { name: "About" });
  await aboutTab.click();
  assert.equal(
    await aboutTab.getAttribute("aria-selected"),
    "true",
    "The project explanation should open in the About workspace tab.",
  );
  await page.getByRole("heading", { name: "Built by Omri Gross" }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Housing Blockchain Article" }).getAttribute("href"),
    "https://medium.com/emerging-govtech/on-blockchains-importance-for-housing-4fd4e4c06530",
    "The About tab should link to Omri's housing article.",
  );
  assert.equal(
    await page.getByRole("link", { name: "GitHub" }).getAttribute("href"),
    "https://github.com/omslice/OpenEscrow",
    "The About tab should link to the public source repository.",
  );
  assert.equal(
    await page.getByRole("link", { name: "LinkedIn" }).getAttribute("href"),
    "https://www.linkedin.com/company/openescrow",
    "The About tab should link to the OpenEscrow LinkedIn page.",
  );
  assert.equal(
    await page.getByRole("link", { name: "Farcaster" }).getAttribute("href"),
    "https://farcaster.xyz/openescrow",
    "The About tab should link to the OpenEscrow Farcaster profile.",
  );
  assert.equal(
    await page.getByRole("link", { name: "Connect with Omri" }).getAttribute("href"),
    "https://linktr.ee/omslice",
    "The About tab should link to Omri's Linktree.",
  );
  const selfHostDownload = page.getByRole("button", {
    name: "Download self-hosted OpenEscrow (coming soon)",
  });
  assert.equal(
    await selfHostDownload.isDisabled(),
    true,
    "The self-host download should remain explicitly unavailable until a supported package exists.",
  );

  const yieldSummary = page.getByText("Earn yield?", { exact: true });
  await yieldSummary.focus();
  await yieldSummary.press("Enter");
  const learnMore = page.getByRole("link", { name: "Learn more" });
  await learnMore.waitFor({ state: "visible" });
  await learnMore.click();
  const yieldDialog = page.getByRole("dialog");
  await yieldDialog.waitFor({ state: "visible" });
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "Close yield explanation",
    "The yield dialog should move focus to its close control.",
  );
  const yieldZoomGeometry = await page.evaluate(() => {
    document.documentElement.style.zoom = "0.8";
    const heading = document.querySelector(".yield-explainer-heading");
    const firstCard = document.querySelector(".yield-asset-card");
    const badges = Array.from(document.querySelectorAll(".yield-asset-badge"));
    const headingBox = heading?.getBoundingClientRect();
    const cardBox = firstCard?.getBoundingClientRect();
    return {
      headingBottom: headingBox?.bottom || 0,
      cardTop: cardBox?.top || 0,
      badges: badges.map((badge) => ({
        height: badge.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(badge).fontSize),
      })),
    };
  });
  assert.equal(
    yieldZoomGeometry.cardTop - yieldZoomGeometry.headingBottom >= 12,
    true,
    `The yield heading must not overlap its cards at 80% zoom: ${JSON.stringify(yieldZoomGeometry)}`,
  );
  assert.equal(
    yieldZoomGeometry.badges.every(
      (badge) => badge.height >= 24 && badge.fontSize >= 12,
    ),
    true,
    `Yield asset badges should remain readable at 80% zoom: ${JSON.stringify(yieldZoomGeometry.badges)}`,
  );
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.keyboard.press("Escape");
  await yieldDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.matches(".yield-option"),
    undefined,
    { timeout: 1_000 },
  );
  assert.equal(
    await yieldSummary.evaluate((element) => element === document.activeElement),
    true,
    "Closing the yield dialog should restore focus to the visible tooltip control.",
  );

  const overviewTab = workspaceTablist.getByRole("tab", { name: "Dashboard" });
  assert.deepEqual(
    await workspaceTablist.locator('[role="tab"] .tab-label').allTextContents(),
    ["About", "Dashboard", "Proposals", "Deposits", "Record"],
    "The workspace tabs should begin with About, followed by Dashboard and the workflow tabs.",
  );
  assert.equal(
    await workspaceTablist
      .getByRole("tab", { name: "About" })
      .locator(".tab-icon")
      .innerText(),
    "💡",
    "The About tab should use the same colored emoji treatment as the workflow tabs.",
  );
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  const proposalsTab = workspaceTablist.getByRole("tab", { name: "Proposals" });
  assert.equal(
    await proposalsTab.getAttribute("aria-selected"),
    "true",
    "ArrowRight should activate the next workspace tab.",
  );
  assert.equal(
    await proposalsTab.evaluate((element) => element === document.activeElement),
    true,
    "The active workspace tab should retain keyboard focus.",
  );

  const startProposal = page.getByRole("button", { name: "Start a new proposal" });
  await startProposal.click();
  const proposalBuilder = page.locator("#proposal-builder");
  await proposalBuilder.waitFor({ state: "visible" });
  assert.equal(
    await proposalBuilder.evaluate((element) => element === document.activeElement),
    true,
    "Opening the proposal editor should move focus to its labeled region.",
  );

  await page.getByLabel("Tenant first and last name").fill("Taylor Tenant");
  await page.getByLabel("Tenant email address").fill("taylor.tenant@example.com");
  const address = page.getByRole("combobox", { name: "Rental property address" });
  const addressListId = await address.getAttribute("aria-controls");
  assert.ok(addressListId, "The address combobox should identify its suggestion list.");
  const addressList = page.locator(`[id="${addressListId}"]`);
  assert.equal(
    await addressList.count(),
    1,
    "The address combobox target should exist before suggestions open.",
  );
  assert.equal(await addressList.isHidden(), true);
  assert.equal(await address.getAttribute("aria-haspopup"), "listbox");
  await address.fill("123 Main");
  await addressList.waitFor({ state: "visible" });
  await address.press("ArrowDown");
  assert.match(
    (await address.getAttribute("aria-activedescendant")) || "",
    /-option-0$/,
    "ArrowDown should expose the active address option.",
  );
  await address.press("Enter");
  assert.equal(
    await address.inputValue(),
    "123 Main Street, Los Angeles, CA 90012",
    "Enter should select the active address suggestion.",
  );
  assert.equal(
    await address.getAttribute("aria-expanded"),
    "false",
    "Selecting an address should close the suggestion list.",
  );
  assert.equal(
    await addressList.isHidden(),
    true,
    "The controlled suggestion list should remain present but hidden after selection.",
  );
  assert.equal(
    await addressList.getByRole("option").count(),
    0,
    "Closed address suggestions should unmount their interactive options.",
  );

  await page.getByRole("button", { name: "Continue to deposit terms" }).click();
  await page.waitForFunction(
    () => document.activeElement?.id === "proposal-panel-terms",
  );
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "proposal-panel-terms",
    "Continuing should move focus into the newly visible deposit-terms panel.",
  );
  const sourcePanel = page.getByRole("region", {
    name: "Official requirements sources",
  });
  assert.equal(
    await sourcePanel.getByRole("link").first().getAttribute("href"),
    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5.",
    "The address-routed profile should expose its official source link.",
  );
  assert.ok(
    (await sourcePanel.getByRole("link").count()) > 1,
    "The address-routed profile should expose every applied official source link.",
  );
  const sourceCheckButton = sourcePanel.getByRole("button", {
    name: "Check official sources for updates",
  });
  const currentSourceMessage = sourcePanel.getByText(
    /All \d+ official sources match the reviewed requirements\./,
    {
      exact: false,
    },
  );
  await sourceCheckButton.click();
  await currentSourceMessage.waitFor({ state: "visible" });
  assert.equal(complianceSourceChecks, 1);
  assert.match(await sourcePanel.textContent(), /Checked .*2026/);

  await sourceCheckButton.click();
  const sourceCheckError = sourcePanel.getByRole("alert");
  await sourceCheckError.waitFor({ state: "visible" });
  assert.match(await sourceCheckError.textContent(), /could not reach the official source/i);
  assert.equal(complianceSourceChecks, 2);
  assert.equal(
    await currentSourceMessage.count(),
    0,
    "A failed recheck must not leave the prior success result beside the error.",
  );
  assert.doesNotMatch(await sourcePanel.textContent(), /Checked .*2026/);

  await sourceCheckButton.click();
  await currentSourceMessage.waitFor({ state: "visible" });
  assert.equal(complianceSourceChecks, 3);
  assert.equal(
    await sourceCheckError.count(),
    0,
    "A later successful recheck should clear the retryable source error.",
  );
  await page.getByLabel("Monthly rent").fill("1500");
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.waitForFunction(
    () => document.activeElement?.id === "proposal-panel-review",
  );
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "proposal-panel-review",
    "Continuing should move focus into the newly visible proposal-review panel.",
  );
  await page.getByRole("button", { name: "Save proposal for review" }).click();
  await page.getByText(
    "Proposal saved. Invitations are now unlocked for this exact revision.",
  ).waitFor({ state: "visible" });

  await page.evaluate(() => {
    window.confirm = () => {
      throw new Error("Browser confirmation blocked");
    };
  });
  const cancelProposal = page.getByRole("button", {
    name: "Cancel and remove proposal",
  });
  await cancelProposal.focus();
  await cancelProposal.press("Enter");
  const confirmationError = page.getByText(
    "This browser could not show the confirmation prompt. Check its dialog permissions and try again.",
  );
  await confirmationError.waitFor({ state: "visible" });
  assert.equal(
    destructiveProposalRequests,
    0,
    "A failed browser confirmation must not send a destructive proposal request.",
  );
  assert.equal(
    await cancelProposal.isVisible(),
    true,
    "A proposal should remain available after its confirmation prompt fails.",
  );
  assert.equal(
    await cancelProposal.evaluate((element) => element === document.activeElement),
    true,
    "Keyboard focus should stay on the retryable destructive action after confirmation fails.",
  );
  assert.equal(
    await page.locator("#proposal-form-feedback").getAttribute("aria-live"),
    "assertive",
    "The blocked-confirmation guidance should be announced immediately.",
  );
  assert.equal(
    await page.getByText(
      "Proposal saved. Invitations are now unlocked for this exact revision.",
    ).count(),
    0,
    "A stale success message should not remain beside a blocked-confirmation error.",
  );

  await page.getByRole("button", { name: "Start another proposal" }).click();
  await page.waitForFunction(
    () => document.activeElement?.id === "proposal-panel-participants",
  );
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "proposal-panel-participants",
    "Resetting a proposal should move focus into the newly visible participants panel.",
  );

  await page.getByRole("button", { name: "Close proposal editor" }).click();
  await page.waitForTimeout(50);
  assert.equal(
    await page.locator(":focus").getAttribute("id"),
    "start-proposal-button",
    "Closing the proposal editor should restore focus to its launcher.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    rootBox: document.getElementById("root")?.getBoundingClientRect().toJSON(),
    appBox: document.querySelector(".app-shell")?.getBoundingClientRect().toJSON(),
    tabBox: document.querySelector(".workspace-tabs")?.getBoundingClientRect().toJSON(),
    scrollContainers: Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className:
          typeof element.className === "string" ? element.className : "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: getComputedStyle(element).overflowX,
      }))
      .slice(0, 8),
    offenders: Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className:
            typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        };
      })
      .filter(
        (item) =>
          item.width > 0 &&
          (item.left < -1 || item.right > window.innerWidth + 1),
      )
      .slice(0, 8),
  }));
  assert.equal(
    mobileOverflow.documentWidth <= mobileOverflow.viewportWidth,
    true,
    `The critical workspace view should not overflow the mobile viewport: ${JSON.stringify(mobileOverflow)}`,
  );

  process.stdout.write(
    "Accessibility smoke check passed: modal focus, workspace tabs, proposal focus recovery, blocked destructive confirmation, address keyboard selection, source-check retry recovery, and mobile width.\n",
  );
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
