import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = readFileSync(
  path.join(frontendRoot, "..", "scripts", "Broadcast-BaseSepolia.ps1"),
  "utf8",
);
const rehearsal = readFileSync(
  path.join(frontendRoot, "scripts", "rehearse-contract-deployment.mjs"),
  "utf8",
);
const exporter = readFileSync(
  path.join(frontendRoot, "..", "scripts", "Export-BaseSepoliaDeployment.ps1"),
  "utf8",
);

test("Base Sepolia wrapper keeps exact-release assurance offline", () => {
  const rpcSelection = wrapper.indexOf(
    "$verifiedRpcUrl = Resolve-BaseSepoliaRpcUrl -RequestedRpcUrl $RpcUrl",
  );
  const rpcRemoval = wrapper.indexOf("Remove-Item Env:BASE_SEPOLIA_RPC_URL");
  const assurance = wrapper.indexOf("npm.cmd run contract:assure");
  const rehearsal = wrapper.indexOf("npm.cmd run deploy:rehearse");
  const broadcast = wrapper.indexOf("--rpc-url $verifiedRpcUrl");

  assert.ok(rpcSelection >= 0, "the checked endpoint must be held separately");
  assert.ok(rpcRemoval > rpcSelection, "the RPC environment must be cleared after liveness checks");
  assert.ok(assurance > rpcRemoval, "contract assurance must run without the RPC environment");
  assert.ok(rehearsal > assurance, "the local rehearsal must follow offline assurance");
  assert.ok(broadcast > rehearsal, "only the later broadcast may receive the verified endpoint");
  assert.equal(wrapper.includes("--rpc-url $env:BASE_SEPOLIA_RPC_URL"), false);
});

test("credential-free preflight stops before wallet access", () => {
  const preflightExit = wrapper.indexOf("if ($PreflightOnly)");
  const walletNotice = wrapper.indexOf("OpenEscrow Base Sepolia deployment");
  const forgeBroadcast = wrapper.indexOf('forge.exe" script');

  assert.ok(preflightExit >= 0);
  assert.ok(walletNotice > preflightExit);
  assert.ok(forgeBroadcast > walletNotice);
});

test("deployment rehearsal binds the yield token to its settlement asset", () => {
  assert.match(
    rehearsal,
    /compiled\.yieldToken,\s*\[\s*token\.address,?\s*\]/,
    "the local rehearsal must pass the freshly deployed testUSDC address to TestAaveUSDC",
  );
});

test("broadcast export reuses the verified Base Sepolia endpoint", () => {
  assert.match(
    wrapper,
    /Export-BaseSepoliaDeployment\.ps1[\s\S]*-ExpectedCommit \$candidateCommit[\s\S]*-RpcUrl \$verifiedRpcUrl/,
  );
});

test("deployment export verifies live code and every reciprocal cohort binding", () => {
  assert.match(exporter, /cast\.exe" code/);
  for (const signature of [
    "SETTLEMENT_ASSET()(address)",
    "TOKEN()(address)",
    "YIELD_TOKEN()(address)",
    "OPERATIONS_RESERVE()(address)",
    "ESCROW()(address)",
    "TREASURY()(address)",
  ]) {
    assert.ok(exporter.includes(signature), `missing live verification for ${signature}`);
  }
  assert.match(exporter, /liveBindingsVerified = \$true/);
});
