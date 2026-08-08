import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const repository = path.resolve(frontend, "..");
const requestedEnvironment =
  process.argv.includes("--production") ? "production" : "staging";
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const config = JSON.parse(await readFile(path.join(frontend, "wrangler.jsonc"), "utf8"));
const sites = JSON.parse(
  await readFile(path.join(repository, ".openai", "hosting.json"), "utf8"),
);
const selected =
  requestedEnvironment === "production"
    ? config
    : { ...config, ...config.env?.staging };

assert(config.account_id === "ac83ad901f0f00358a9b59e81487d354", "Cloudflare owner account is not pinned.");
assert(config.name === "openescrow-mvp-testnet", "Production-testnet Worker name is invalid.");
assert(config.env?.staging?.name === "openescrow-mvp-staging", "Staging Worker name is invalid.");
assert(selected.assets?.binding === "ASSETS", "Static asset binding must remain ASSETS.");
assert(selected.assets?.run_worker_first === true, "MVP Worker must retain first-request handling.");

const d1 = selected.d1_databases || [];
const r2 = selected.r2_buckets || [];
assert(d1.length === 1 && d1[0].binding === sites.d1 && sites.d1 === "DB", "D1 binding name must remain DB.");
assert(r2.length === 1 && r2[0].binding === sites.r2 && sites.r2 === "EVIDENCE", "R2 binding name must remain EVIDENCE.");
assert(/^[0-9a-f-]{36}$/.test(d1[0]?.database_id || ""), "D1 database ID is invalid.");
assert(d1[0]?.migrations_dir === "../drizzle", "D1 migrations must use the repository drizzle directory.");
assert(r2[0]?.bucket_name?.startsWith("openescrow-mvp-evidence-"), "R2 bucket name is outside the OpenEscrow boundary.");
assert(selected.triggers?.crons?.length === 1 && selected.triggers.crons[0] === "*/15 * * * *", "The 15-minute scheduled handler is missing.");

const vars = selected.vars || {};
for (const key of Object.keys(vars)) {
  assert(
    !/(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|JWT)/i.test(key),
    `Runtime secret ${key} must not be stored in wrangler.jsonc.`,
  );
}
assert(vars.API_RATE_LIMIT_ENABLED === "true", "Hosted API rate limiting must remain enabled.");
assert(vars.COMPLIANCE_SOURCE_MONITOR_ENABLED === "true", "Compliance source monitoring must remain enabled.");
assert(vars.EVIDENCE_STORAGE_MODE === "private-r2", "Evidence storage must remain private R2.");
assert(vars.VERIFY_TRANSACTION_RECEIPTS === "true", "Transaction receipt verification must remain enabled.");
assert(vars.VERIFY_ACTIVITY_REGISTRY_BINDING === "true", "Registry binding verification must remain enabled.");

if (requestedEnvironment === "staging") {
  assert(
    vars.PUBLIC_APP_URL === "https://openescrow-mvp-staging.omrigross.workers.dev/",
    "Staging public application URL is invalid.",
  );
} else {
  assert(
    isHttpsOrigin(vars.PUBLIC_APP_URL || ""),
    "Production-testnet PUBLIC_APP_URL must be the selected canonical HTTPS origin before deployment.",
  );
}

if (errors.length) {
  console.error(`Cloudflare ${requestedEnvironment} configuration failed:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Cloudflare ${requestedEnvironment} configuration verified.`);
}
