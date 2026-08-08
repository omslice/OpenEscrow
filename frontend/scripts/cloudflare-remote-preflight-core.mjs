export const CLOUDFLARE_PREFLIGHT_SCHEMA = "openescrow-cloudflare-preflight/v1";

export function selectedCloudflareConfig(config, environment = "staging") {
  if (!config || typeof config !== "object") {
    throw new Error("Cloudflare configuration is missing.");
  }
  if (environment === "production") return config;
  const environmentConfig = config.env?.[environment];
  if (!environmentConfig || typeof environmentConfig !== "object") {
    throw new Error(`Cloudflare environment ${environment} is not configured.`);
  }
  return { ...config, ...environmentConfig };
}

export function remoteResourceExpectations(config, environment = "staging") {
  const selected = selectedCloudflareConfig(config, environment);
  const database = selected.d1_databases?.find((item) => item.binding === "DB");
  const evidence = selected.r2_buckets?.find((item) => item.binding === "EVIDENCE");
  if (!database?.database_id || !database?.database_name) {
    throw new Error(`Cloudflare ${environment} does not declare the DB binding.`);
  }
  if (!evidence?.bucket_name) {
    throw new Error(`Cloudflare ${environment} does not declare the EVIDENCE binding.`);
  }
  if (!config.account_id) {
    throw new Error("Cloudflare account_id is not pinned.");
  }
  return {
    schemaVersion: CLOUDFLARE_PREFLIGHT_SCHEMA,
    environment,
    accountId: config.account_id,
    workerName: selected.name,
    database,
    evidence,
  };
}

export function parseJsonOutput(output, label) {
  const trimmed = String(output || "").trim();
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const startCandidates = [firstObject, firstArray].filter((index) => index >= 0);
  if (startCandidates.length === 0) {
    throw new Error(`${label} did not return JSON.`);
  }
  const start = Math.min(...startCandidates);
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export function validateRemoteResources({ expectations, databaseInfo, bucketInfo }) {
  const failures = [];
  if (databaseInfo?.uuid !== expectations.database.database_id) {
    failures.push("Remote D1 ID does not match the pinned DB binding.");
  }
  if (databaseInfo?.name !== expectations.database.database_name) {
    failures.push("Remote D1 name does not match the pinned DB binding.");
  }
  if (bucketInfo?.name !== expectations.evidence.bucket_name) {
    failures.push("Remote R2 bucket does not match the pinned EVIDENCE binding.");
  }
  return failures;
}

export function migrationsAreCurrent(output) {
  return /no migrations to apply/i.test(String(output || ""));
}
