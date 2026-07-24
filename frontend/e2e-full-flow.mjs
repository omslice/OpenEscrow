// Drives a full agreement lifecycle through the ACTUAL running GUI (not direct cast
// calls) against the live Base Sepolia deployment: propose -> arbiter accept ->
// tenant fund -> claim -> partial dispute -> arbiter resolve -> both withdraw.
//
// There's no MetaMask in this headless environment, so this injects a minimal
// EIP-1193 provider into the page. Every account/chain query and every
// eth_sendTransaction call is proxied back to Node, where it's actually signed and
// broadcast with a real viem WalletClient using one of three funded Base Sepolia
// test keys (the same ones from the earlier cast-driven smoke test). Reads and
// receipt-waiting go through wagmi's own RPC transport untouched - only signing is
// mocked. This is a manual, costs-real-testnet-gas verification script, not part of
// `npm test` / CI - run it deliberately, not automatically.
//
// Requires: RPC_URL/PRIVATE_KEY in ../.env, TENANT_*/ARBITER_* in ../.env.testroles
// (never printed), the dev server already running on :5173, and Edge installed at
// the default Windows path.

import { chromium } from "playwright";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { mkdirSync } from "fs";
import { config } from "dotenv";

// quiet: true suppresses dotenv's own console output, including its randomized
// promotional "tips" (one of which advertises a third-party site aimed at AI
// agents specifically - not something to act on, just noise to turn off).
config({ path: "../.env", quiet: true });
config({ path: "../.env.testroles", quiet: true });

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const RPC_URL = process.env.RPC_URL;
const ACCOUNTS = {
  landlord: privateKeyToAccount(process.env.PRIVATE_KEY),
  tenant: privateKeyToAccount(process.env.TENANT_PRIVATE_KEY),
  arbiter: privateKeyToAccount(process.env.ARBITER_PRIVATE_KEY),
};

mkdirSync(".screenshots", { recursive: true });
let shotCount = 0;
async function shot(page, label) {
  shotCount += 1;
  const path = `.screenshots/flow-${String(shotCount).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  [screenshot] ${path}`);
}

async function main() {
  let currentRole = "landlord";

  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.exposeFunction("__ethRequest", async ({ method, params }) => {
    const account = ACCOUNTS[currentRole];
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return "0x14a34"; // 84532
      case "net_version":
        return "84532";
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "eth_sendTransaction": {
        const tx = params[0];
        const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(RPC_URL) });
        const hash = await walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
        });
        return hash;
      }
      default:
        throw new Error(`Unhandled EIP-1193 method in mock provider: ${method}`);
    }
  });

  await page.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      _listeners: {},
      request: async (args) => window.__ethRequest(args),
      on(event, handler) {
        (this._listeners[event] ||= []).push(handler);
      },
      removeListener(event, handler) {
        if (this._listeners[event]) {
          this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
        }
      },
      _emit(event, ...args) {
        (this._listeners[event] || []).forEach((h) => h(...args));
      },
    };
  });

  async function goto() {
    await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
    await page.getByText("OpenEscrow", { exact: true }).waitFor();
  }

  async function connect() {
    const connectBtn = page.getByRole("button", { name: "Connect Wallet" });
    if (await connectBtn.count()) {
      await connectBtn.click();
      await page.getByText("Base Sepolia", { exact: true }).waitFor({ timeout: 10000 });
    }
  }

  async function switchRole(role, label) {
    console.log(`--- Switching active role to ${role} (${label}) ---`);
    currentRole = role;
    await goto();
    await connect();
  }

  async function openMyAgreement(agreementId) {
    await page.getByRole("button", { name: "My agreements", exact: true }).click();
    await page.getByText(`#${agreementId}`, { exact: false }).first().waitFor({ timeout: 15000 });
  }

  console.log("=== Phase 1: landlord proposes agreement ===");
  await switchRole("landlord", "propose");
  await page.getByRole("button", { name: "Propose new agreement", exact: true }).click();
  await page.getByRole("heading", { name: "Propose a new agreement" }).waitFor();

  await page.getByLabel(/^Tenant address/i).fill(ACCOUNTS.tenant.address);
  await page.getByLabel(/^Arbiter address/i).fill(ACCOUNTS.arbiter.address);
  await page.getByLabel(/^Deposit amount/i).fill("50");

  const claimWindowStart = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes out
  const pad = (n) => String(n).padStart(2, "0");
  const localDatetime = `${claimWindowStart.getFullYear()}-${pad(claimWindowStart.getMonth() + 1)}-${pad(claimWindowStart.getDate())}T${pad(claimWindowStart.getHours())}:${pad(claimWindowStart.getMinutes())}`;
  await page.getByLabel(/^Claim window start/i).fill(localDatetime);
  // claimDays/responseDays/arbiterDays left at their defaults (30/2/3) - only
  // claimWindowStart matters for how long we actually have to wait in this run.

  await shot(page, "propose-form-filled");
  await page.getByRole("button", { name: "Create agreement" }).click();
  await page.getByText("Created agreement #").waitFor({ timeout: 30000 });
  const successText = await page.getByText("Created agreement #").innerText();
  const agreementId = successText.match(/#(\d+)/)[1];
  console.log(`Created agreement #${agreementId}`);
  await shot(page, "propose-success");

  console.log("=== Phase 2: arbiter accepts ===");
  await switchRole("arbiter", "accept");
  await openMyAgreement(agreementId);
  await page.getByRole("button", { name: "Accept arbiter role" }).click();
  await page.getByText("Ready to fund").waitFor({ timeout: 30000 });
  await shot(page, "arbiter-accepted");

  console.log("=== Phase 3: tenant approves + funds ===");
  await switchRole("tenant", "fund");
  await openMyAgreement(agreementId);
  await page.getByRole("button", { name: /^1\. Approve/ }).click();
  await page.getByRole("button", { name: "2. Accept and fund" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "2. Accept and fund" }).click();
  await page.getByText("Active", { exact: true }).waitFor({ timeout: 30000 });
  await shot(page, "tenant-funded");

  console.log("=== Waiting for claim window to open (~3 min from proposal) ===");
  const waitMs = claimWindowStart.getTime() - Date.now() + 5000;
  if (waitMs > 0) {
    console.log(`  sleeping ${Math.ceil(waitMs / 1000)}s...`);
    await page.waitForTimeout(waitMs);
  }

  console.log("=== Phase 4: landlord submits a claim ===");
  await switchRole("landlord", "claim");
  await openMyAgreement(agreementId);
  await page.getByRole("heading", { name: "Submit a claim" }).waitFor({ timeout: 60000 });
  await page.getByLabel(/^Claim amount/i).fill("20");
  await page.getByLabel(/^Evidence description/i).fill("Carpet stain beyond normal wear, unit 4B move-out inspection");
  await shot(page, "claim-form-filled");
  await page.getByRole("button", { name: "Submit claim" }).click();
  await page.getByText("Claim open").waitFor({ timeout: 30000 });
  await shot(page, "claim-submitted");

  console.log("=== Phase 5: tenant partially disputes ===");
  await switchRole("tenant", "respond");
  await openMyAgreement(agreementId);
  await page.getByRole("heading", { name: "Respond to claim" }).waitFor({ timeout: 30000 });
  await page.getByText("Accept partially").click();
  await page.getByLabel(/^Amount to accept/i).fill("8");
  await shot(page, "response-form-filled");
  await page.getByRole("button", { name: "Submit response" }).click();
  await page.getByText("Disputed", { exact: true }).waitFor({ timeout: 30000 });
  await shot(page, "dispute-created");

  console.log("=== Phase 6: arbiter resolves the dispute ===");
  await switchRole("arbiter", "resolve");
  await openMyAgreement(agreementId);
  await page.getByRole("heading", { name: "Resolve dispute" }).waitFor({ timeout: 30000 });
  await page.getByLabel(/^Award to landlord/i).fill("5");
  await shot(page, "resolve-form-filled");
  await page.getByRole("button", { name: "Submit ruling" }).click();
  await page.getByText("Closed", { exact: true }).waitFor({ timeout: 30000 });
  await shot(page, "dispute-resolved");

  console.log("=== Phase 7: withdrawals ===");
  await switchRole("tenant", "withdraw");
  await openMyAgreement(agreementId);
  const tenantWithdrawBtn = page.getByRole("button", { name: /^Withdraw/ });
  if (await tenantWithdrawBtn.count()) {
    await tenantWithdrawBtn.click();
    await page.getByText("Confirmed.").waitFor({ timeout: 30000 });
    await tenantWithdrawBtn.waitFor({ state: "detached", timeout: 15000 });
  }
  await shot(page, "tenant-withdrawn");

  await switchRole("landlord", "withdraw");
  await openMyAgreement(agreementId);
  const landlordWithdrawBtn = page.getByRole("button", { name: /^Withdraw/ });
  if (await landlordWithdrawBtn.count()) {
    await landlordWithdrawBtn.click();
    await page.getByText("Confirmed.").waitFor({ timeout: 30000 });
    await landlordWithdrawBtn.waitFor({ state: "detached", timeout: 15000 });
  }
  await shot(page, "landlord-withdrawn");

  console.log("\n=== DONE ===");
  console.log(`Agreement id: ${agreementId}`);
  console.log("Console errors seen:", consoleErrors.length ? consoleErrors : "none");

  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FLOW FAILED:", err);
    process.exit(1);
  });
