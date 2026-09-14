import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_DEPLOYMENT } from "./active-deployment.mjs";
import {
  ACTIVE_REGISTRY_ADDRESS,
  buildSelfHostConfig,
  normalizePublicUrl,
  validateSelfHostConfig,
} from "./self-host-config-core.mjs";

const validInput = {
  workerName: "tenant-coop-openescrow-testnet",
  accountId: "11111111111111111111111111111111",
  databaseName: "tenant-coop-openescrow-db",
  databaseId: "11111111-1111-4111-8111-111111111111",
  bucketName: "tenant-coop-openescrow-evidence",
  publicUrl: "https://tenant-coop-openescrow.tenantcoop.workers.dev/",
  privyAppId: "tenant_coop_privy_123",
  notificationFromEmail: "OpenEscrow <updates@tenant-coop.example>",
};

test("builds a fail-closed Base Sepolia Cloudflare configuration", () => {
  const config = buildSelfHostConfig(validInput);
  assert.deepEqual(validateSelfHostConfig(config), []);
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.equal(config.r2_buckets[0].binding, "EVIDENCE");
  assert.equal(config.vars.ACTIVITY_REGISTRY_ADDRESS, ACTIVE_REGISTRY_ADDRESS);
  assert.equal(config.vars.OPEN_ESCROW_ADDRESS, ACTIVE_DEPLOYMENT.escrow);
  assert.equal(config.vars.OPERATIONS_RESERVE_ADDRESS, ACTIVE_DEPLOYMENT.operationsReserve);
  assert.equal(config.vars.OPEN_ESCROW_DEPLOYMENT_BLOCK, String(ACTIVE_DEPLOYMENT.deploymentBlock));
  assert.equal(config.vars.ONCHAIN_ACTIVITY_INDEXER_ENABLED, "true");
  assert.equal(config.vars.VERIFY_ACTIVITY_REGISTRY_BINDING, "true");
  assert.equal(config.vars.VERIFY_TRANSACTION_RECEIPTS, "true");
  assert.equal(config.vars.EVIDENCE_STORAGE_MODE, "private-r2");
  assert.equal(config.triggers.crons[0], "*/15 * * * *");
});

test("rejects official resources, placeholders, mainnet gates, and weakened verification", () => {
  const config = buildSelfHostConfig(validInput);
  config.account_id = "ac83ad901f0f00358a9b59e81487d354";
  config.name = "openescrow";
  config.d1_databases[0].database_id = "00000000-0000-0000-0000-000000000000";
  config.r2_buckets[0].bucket_name = "openescrow-mvp-evidence-staging";
  config.vars.PUBLIC_APP_URL = "https://replace.example/";
  config.vars.VERIFY_TRANSACTION_RECEIPTS = "false";
  config.vars.FIAT_ONRAMP_ENABLED = "true";
  const errors = validateSelfHostConfig(config).join("\n");
  assert.match(errors, /must not target the OpenEscrow project Cloudflare account/);
  assert.match(errors, /must not reuse an OpenEscrow project-owned resource name/);
  assert.match(errors, /D1 database ID must be the UUID returned by Wrangler/);
  assert.match(errors, /Public URL must be the final origin only/);
  assert.match(errors, /VERIFY_TRANSACTION_RECEIPTS must remain true/);
  assert.match(errors, /Real-money and fiat funding must remain disabled/);
});

test("rejects missing or mixed-cohort self-host indexing configuration", () => {
  for (const key of ["OPEN_ESCROW_ADDRESS", "OPERATIONS_RESERVE_ADDRESS",
    "OPEN_ESCROW_DEPLOYMENT_BLOCK", "ONCHAIN_ACTIVITY_INDEXER_ENABLED"]) {
    const config = buildSelfHostConfig(validInput);
    delete config.vars[key];
    assert.ok(validateSelfHostConfig(config).some((error) => error.startsWith(`${key} must remain`)));
    config.vars[key] = key.endsWith("ADDRESS") ? `0x${"9".repeat(40)}` : "0";
    assert.ok(validateSelfHostConfig(config).some((error) => error.startsWith(`${key} must remain`)));
  }
});

test("normalizes only final HTTPS origins", () => {
  assert.equal(normalizePublicUrl("https://escrow.tenantcoop.org/"), "https://escrow.tenantcoop.org/");
  assert.throws(() => normalizePublicUrl("http://escrow.tenantcoop.org/"), /must use HTTPS/);
  assert.throws(() => normalizePublicUrl("https://escrow.tenantcoop.org/app"), /origin only/);
  assert.throws(() => normalizePublicUrl("https://replace.example/"), /origin only/);
});
