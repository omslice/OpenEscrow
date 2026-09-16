import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, multicall3Abi } from "viem";
import { ACTIVE_DEPLOYMENT } from "./active-deployment.mjs";

const port = 24000 + process.pid % 20000;
const baseUrl = `http://127.0.0.1:${port}`;
const abi = JSON.parse(readFileSync(new URL("../src/contracts/OpenEscrowABI.json", import.meta.url), "utf8"));
const current = ACTIVE_DEPLOYMENT.escrow.toLowerCase();
const first = `0x${"b".repeat(40)}`;
const second = `0x${"c".repeat(40)}`;
const addressesRead = [];
const errors = [];
let currentPresent = false;

function record(id, contractAddress) {
  return {
    id, status: "finalized", revision: 1,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    landlordName: "Test Landlord", landlordEmail: "account.a@example.test",
    tenantName: "Test Tenant", tenantEmail: "tenant@example.test", tenants: [],
    arbiterName: null, arbiterEmail: null, arbiterWallet: null, tenantWallet: null,
    tenantApproved: true, arbiterApproved: true,
    terms: { jurisdiction: "TEST", propertyAddress: `${id} Test Street`, deposit: "1000", operationsReserve: "0", tokenChoice: "plain", claimWindowStart: "2027-01-01T00:00:00Z", claimDays: "30", responseDays: "14", arbiterDays: "14" },
    onchainAgreementId: "1", onchainContractAddress: contractAddress, onchainTxHash: `0x${"1".repeat(64)}`,
    events: [],
  };
}
function records() {
  return [record("earlier-one", first), record("earlier-two", second), record("unverified", null),
    ...(currentPresent ? [record("current-one", current)] : [])];
}
function agreement(address) {
  const components = abi.find((entry) => entry.name === "getAgreement").outputs[0].components;
  const result = Object.fromEntries(components.map(({ name, type }) => [name,
    type === "address" ? `0x${"0".repeat(40)}` : type === "bool" ? false : 0n]));
  return { ...result, landlord: `0x${"a".repeat(40)}`, tenant: `0x${"d".repeat(40)}`,
    token: ACTIVE_DEPLOYMENT.usdc, phase: address === current ? 3 : 6,
    depositAmount: address === first ? 100_000_000n : 200_000_000n,
    claimWindowStart: 2_000_000_000n, claimPeriod: 3600n, responsePeriod: 3600n };
}
function emptyAbiValue(parameter) {
  if (parameter.type.endsWith("[]")) return [];
  if (parameter.type === "address") return `0x${"0".repeat(40)}`;
  if (parameter.type === "bool") return false;
  if (parameter.type === "string") return "";
  if (parameter.type.startsWith("bytes")) return `0x${"00".repeat(Number(parameter.type.slice(5)) || 0)}`;
  if (parameter.type === "tuple") return Object.fromEntries(parameter.components.map((entry) => [entry.name, emptyAbiValue(entry)]));
  return 0n;
}
const server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
  "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--mode", "account-switch-test"], {
  cwd: new URL("..", import.meta.url), env: { ...process.env, VITE_PRIVY_APP_ID: "deposit-deployment-test" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverError = "";
server.stderr.on("data", (data) => { serverError += data; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* server startup */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(ready, true, serverError);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((address) => {
    localStorage.setItem("openescrow:account-provider-activated", "1");
    sessionStorage.setItem("openescrow.workspaceRole", "landlord");
    sessionStorage.setItem("openescrow.workspaceRoleIdentity", "did:privy:account-a");
    localStorage.setItem(`openescrow.trackedAgreementIds.release.${encodeURIComponent(`84532:${address}`)}.account.${encodeURIComponent("did:privy:account-a")}`, '["1"]');
  }, current);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    if (path === "/api/system/readiness") body = {
      email: { configured: false }, evidence: { configured: false },
      recordIntegrity: { activityRegistry: { configured: false }, activityIndexer: { configured: false } },
      addressValidation: { configured: false }, complianceSources: { configured: false },
    };
    else if (path === "/api/profile/notification-preferences") body = { agreementActivity: false, deadlineReminders: false, consentedAt: null, updatedAt: null };
    else if (path === "/api/negotiations/discover") body = { accesses: records().map((r) => ({ proposalId: r.id, role: "landlord", token: `test-${r.id}` })) };
    else if (path.startsWith("/api/negotiations/")) {
      const selected = records().find((r) => path === `/api/negotiations/${r.id}`);
      if (selected) {
        assert.equal(route.request().headers().authorization, `Bearer test-${selected.id}`);
        body = selected;
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route(/^https:\/\/(sepolia\.base\.org|base-sepolia-rpc\.publicnode\.com)/, async (route) => {
    const requests = route.request().postDataJSON();
    function respond(request) {
      let result = "0x0";
      if (request.method === "eth_chainId") result = "0x14a34";
      else if (request.method === "eth_getLogs") result = [];
      else if (request.method === "eth_call") {
        const input = request.params[0];
        const address = input.to.toLowerCase();
        if (address === "0xca11bde05977b3631167028862be2a173976ca11") {
          const call = decodeFunctionData({ abi: multicall3Abi, data: input.data });
          assert.equal(call.functionName, "aggregate3");
          result = encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3",
            result: call.args[0].map(({ target, callData }) => ({ success: true, returnData: respond({
              jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: target, data: callData }, "latest"],
            }).result })),
          });
        } else if ([first, second, current].includes(address)) {
          const call = decodeFunctionData({ abi, data: input.data });
          if (call.functionName === "getAgreement") {
            addressesRead.push(address);
            result = encodeFunctionResult({ abi, functionName: "getAgreement", result: agreement(address) });
          } else if (call.functionName === "nextAgreementId") result = encodeFunctionResult({ abi, functionName: "nextAgreementId", result: 0n });
          else {
            const outputs = abi.find((entry) => entry.name === call.functionName).outputs;
            result = encodeFunctionResult({ abi, functionName: call.functionName,
              result: outputs.length === 1 ? emptyAbiValue(outputs[0]) : outputs.map(emptyAbiValue) });
          }
        }
      }
      return { jsonrpc: "2.0", id: request.id, result };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(Array.isArray(requests) ? requests.map(respond) : respond(requests)) });
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Proposals", exact: true }).click();
  await page.locator(".active-proposals-section").getByText("earlier-one Test Street", { exact: true }).waitFor();
  assert.equal(await page.locator("#start-proposal-button").evaluate((button) => Boolean(
    button.compareDocumentPosition(document.querySelector(".active-proposals-section")) & Node.DOCUMENT_POSITION_FOLLOWING)), true,
  "Start a new proposal must precede every existing proposal in reading and keyboard order.");
  await page.getByRole("tab", { name: "Deposits", exact: true }).click();
  const history = page.getByRole("list", { name: "Earlier saved deposits" });
  await history.getByRole("listitem").nth(2).waitFor();
  assert.equal(await history.getByRole("listitem").count(), 3);
  assert.equal(await page.getByRole("list", { name: "Active security deposits" }).count(), 0, "Polluted local IDs must not create a current deposit.");
  addressesRead.length = 0;
  const firstCard = history.getByRole("listitem").filter({ hasText: "earlier-one Test Street" });
  await firstCard.getByRole("button", { name: /Show earlier deposit/ }).click();
  await firstCard.getByText("100 test tokens", { exact: true }).waitFor();
  assert.equal(await firstCard.getByText("Closed", { exact: true }).isVisible(), true);
  assert.ok(addressesRead.includes(first));
  assert.equal(addressesRead.includes(current), false);
  const secondCard = history.getByRole("listitem").filter({ hasText: "earlier-two Test Street" });
  await secondCard.getByRole("button", { name: /Show earlier deposit/ }).click();
  await secondCard.getByText("200 test tokens", { exact: true }).waitFor();
  assert.ok(addressesRead.includes(second));
  const unknown = history.getByRole("listitem").filter({ hasText: "unverified Test Street" });
  addressesRead.length = 0;
  await unknown.getByRole("button", { name: /Show earlier deposit/ }).click();
  assert.equal(await unknown.getByText(/does not yet have a verified contract address/).isVisible(), true);
  assert.equal(addressesRead.includes(current), false);
  await unknown.getByRole("button", { name: "Open saved record" }).click();
  await page.locator("#record-proposal-unverified-landlord").getByRole("button", { name: "Download complete record report" }).waitFor();
  currentPresent = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Deposits", exact: true }).click();
  await page.getByRole("list", { name: "Active security deposits" }).getByText("current-one Test Street").waitFor();
  assert.equal(await history.getByRole("listitem").count(), 3, "Current and historical records with ID 1 must all survive.");
  await page.setViewportSize({ width: 390, height: 844 });
  await history.getByRole("listitem").filter({ hasText: "earlier-one Test Street" }).getByRole("button", { name: /Show earlier deposit/ }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  console.log("Deposit deployment browser check passed: original-contract reads, overlapping IDs, unverified records, stale local shortcuts, Record access and mobile layout.");
} catch (error) {
  if (serverError) console.error(serverError);
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill();
}
