import path from "node:path";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const ACTIVE_ESCROW_ADDRESS =
  "0xF18BfDbFd3FF84c603CbDf895D2a96aC7260AE99";
export const ACTIVE_REGISTRY_ADDRESS =
  "0x5ba6533811ee528f6802bb969ab01ff95d7f092e";

const OFFICIAL_ACCOUNT_ID = "ac83ad901f0f00358a9b59e81487d354";
const OFFICIAL_RESOURCE_NAMES = new Set([
  "openescrow",
  "openescrow-mvp-testnet",
  "openescrow-mvp-staging",
  "openescrow-mvp-evidence-testnet",
  "openescrow-mvp-evidence-staging",
]);
const PLACEHOLDER = /replace|example|00000000-0000-0000-0000-000000000000/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
const RESOURCE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PRIVY_APP_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const EMAIL_FROM = /^[^<>\r\n]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireResourceName(value, label, errors) {
  const normalized = text(value);
  if (!RESOURCE_NAME.test(normalized) || PLACEHOLDER.test(normalized)) {
    errors.push(`${label} must be a concrete lowercase Cloudflare resource name.`);
  }
  if (OFFICIAL_RESOURCE_NAMES.has(normalized)) {
    errors.push(`${label} must not reuse an OpenEscrow project-owned resource name.`);
  }
  return normalized;
}

export function normalizePublicUrl(value) {
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new Error("Public URL must be a valid absolute HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Public URL must use HTTPS and must not contain credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || PLACEHOLDER.test(parsed.hostname)) {
    throw new Error("Public URL must be the final origin only, ending in / with no query or fragment.");
  }
  return parsed.toString();
}

export function buildSelfHostConfig({
  workerName,
  accountId,
  databaseName,
  databaseId,
  bucketName,
  publicUrl,
  privyAppId,
  notificationFromEmail,
}) {
  const config = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: workerName,
    account_id: accountId,
    main: "cloudflare-dist/server/index.js",
    compatibility_date: "2026-08-07",
    workers_dev: true,
    preview_urls: true,
    assets: {
      directory: "./cloudflare-dist/client",
      binding: "ASSETS",
      html_handling: "auto-trailing-slash",
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: databaseName,
        database_id: databaseId,
        migrations_dir: "../drizzle",
      },
    ],
    r2_buckets: [{ binding: "EVIDENCE", bucket_name: bucketName }],
    vars: {
      ACTIVITY_REGISTRY_ADDRESS: ACTIVE_REGISTRY_ADDRESS,
      API_RATE_LIMIT_ENABLED: "true",
      COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
      EVIDENCE_STORAGE_MODE: "private-r2",
      PRIVY_APP_ID: privyAppId,
      PUBLIC_APP_URL: normalizePublicUrl(publicUrl),
      VERIFY_ACTIVITY_REGISTRY_BINDING: "true",
      VERIFY_TRANSACTION_RECEIPTS: "true",
      ...(notificationFromEmail
        ? { NOTIFICATION_FROM_EMAIL: notificationFromEmail }
        : {}),
    },
    triggers: { crons: ["*/15 * * * *"] },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        head_sampling_rate: 0.1,
        invocation_logs: true,
      },
    },
  };
  const errors = validateSelfHostConfig(config);
  if (errors.length) throw new Error(errors.join("\n"));
  return config;
}

export function validateSelfHostConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["Wrangler configuration must be a JSON object."];
  }

  requireResourceName(config.name, "Worker name", errors);
  const accountId = text(config.account_id);
  if (!ACCOUNT_ID.test(accountId) || PLACEHOLDER.test(accountId)) {
    errors.push("Cloudflare account ID must be a concrete 32-character hexadecimal ID.");
  }
  if (accountId.toLowerCase() === OFFICIAL_ACCOUNT_ID) {
    errors.push("Self-hosted releases must not target the OpenEscrow project Cloudflare account.");
  }
  if (config.main !== "cloudflare-dist/server/index.js") {
    errors.push("Worker main must remain cloudflare-dist/server/index.js.");
  }
  if (config.workers_dev !== true) {
    errors.push("workers_dev must remain enabled for the supported first-run path.");
  }

  const assets = config.assets;
  if (
    assets?.directory !== "./cloudflare-dist/client" ||
    assets?.binding !== "ASSETS" ||
    assets?.run_worker_first !== true
  ) {
    errors.push("Static assets must use the reviewed ASSETS Worker-first binding.");
  }

  const databases = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  if (databases.length !== 1 || databases[0]?.binding !== "DB") {
    errors.push("Exactly one D1 binding named DB is required.");
  } else {
    requireResourceName(databases[0].database_name, "D1 database name", errors);
    if (!UUID.test(text(databases[0].database_id)) || PLACEHOLDER.test(text(databases[0].database_id))) {
      errors.push("D1 database ID must be the UUID returned by Wrangler.");
    }
    if (path.posix.normalize(text(databases[0].migrations_dir).replaceAll("\\", "/")) !== "../drizzle") {
      errors.push("D1 migrations_dir must remain ../drizzle.");
    }
  }

  const buckets = Array.isArray(config.r2_buckets) ? config.r2_buckets : [];
  if (buckets.length !== 1 || buckets[0]?.binding !== "EVIDENCE") {
    errors.push("Exactly one private R2 binding named EVIDENCE is required.");
  } else {
    requireResourceName(buckets[0].bucket_name, "R2 bucket name", errors);
  }

  const vars = config.vars || {};
  try {
    normalizePublicUrl(vars.PUBLIC_APP_URL);
  } catch (error) {
    errors.push(error.message);
  }
  if (!PRIVY_APP_ID.test(text(vars.PRIVY_APP_ID)) || PLACEHOLDER.test(text(vars.PRIVY_APP_ID))) {
    errors.push("PRIVY_APP_ID must be the self-hoster's own Privy public app ID.");
  }
  if (vars.NOTIFICATION_FROM_EMAIL && !EMAIL_FROM.test(text(vars.NOTIFICATION_FROM_EMAIL))) {
    errors.push('NOTIFICATION_FROM_EMAIL must look like "OpenEscrow <updates@your-domain>".');
  }
  const requiredVars = {
    ACTIVITY_REGISTRY_ADDRESS: ACTIVE_REGISTRY_ADDRESS,
    API_RATE_LIMIT_ENABLED: "true",
    COMPLIANCE_SOURCE_MONITOR_ENABLED: "true",
    EVIDENCE_STORAGE_MODE: "private-r2",
    VERIFY_ACTIVITY_REGISTRY_BINDING: "true",
    VERIFY_TRANSACTION_RECEIPTS: "true",
  };
  for (const [name, expected] of Object.entries(requiredVars)) {
    if (text(vars[name]).toLowerCase() !== expected.toLowerCase()) {
      errors.push(`${name} must remain ${expected} for the supported Base Sepolia package.`);
    }
  }
  if (vars.VITE_FIAT_ONRAMP_ENABLED === "true" || vars.FIAT_ONRAMP_ENABLED === "true") {
    errors.push("Real-money and fiat funding must remain disabled in this package.");
  }
  if (config.triggers?.crons?.length !== 1 || config.triggers.crons[0] !== "*/15 * * * *") {
    errors.push("The supported notification/compliance scheduler must remain on */15 * * * *.");
  }
  return errors;
}
