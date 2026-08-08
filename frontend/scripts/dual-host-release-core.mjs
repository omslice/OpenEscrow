export const RELEASE_SCHEMA = "openescrow-release/v1";
export const RELEASE_PROPAGATION_ATTEMPTS = 20;
export const RELEASE_PROPAGATION_DELAY_MS = 2_500;

const defaultWait = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export function normalizeBaseUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function releaseReadinessUrl(
  baseUrl,
  expectedCommit,
  checkId = Date.now().toString(36),
) {
  const url = new URL("api/system/readiness", baseUrl);
  if (expectedCommit) {
    url.searchParams.set("release_check", `${expectedCommit}.${checkId}`);
  }
  return url;
}

export async function waitForExpectedRelease({
  expectedCommit,
  readAttempt,
  attempts = RELEASE_PROPAGATION_ATTEMPTS,
  delayMs = RELEASE_PROPAGATION_DELAY_MS,
  wait = defaultWait,
  onRetry,
}) {
  if (!/^[0-9a-f]{40}$/.test(expectedCommit || "")) {
    throw new Error("Expected release commit must be a full Git SHA.");
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 30) {
    throw new Error("Release propagation attempts must be between 1 and 30.");
  }
  let lastResult;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      lastResult = await readAttempt(attempt);
      lastError = undefined;
      if (
        lastResult?.status === 200 &&
        lastResult?.readiness?.release?.commitSha === expectedCommit
      ) {
        return lastResult;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await onRetry?.({ attempt, attempts, delayMs, lastResult, lastError });
      await wait(delayMs);
    }
  }
  if (lastResult) return lastResult;
  throw lastError || new Error("Release readiness could not be read.");
}

export function validateHostedRelease({
  label,
  baseUrl,
  homeStatus,
  homeHtml,
  readinessStatus,
  readiness,
}) {
  if (homeStatus !== 200) {
    throw new Error(`${label} homepage returned HTTP ${homeStatus}.`);
  }
  if (!homeHtml.includes('id="root"')) {
    throw new Error(`${label} does not expose the OpenEscrow application shell.`);
  }
  if (readinessStatus !== 200) {
    throw new Error(`${label} readiness returned HTTP ${readinessStatus}.`);
  }
  if (readiness?.release?.schemaVersion !== RELEASE_SCHEMA) {
    throw new Error(`${label} readiness is missing exact release provenance.`);
  }
  if (!/^[0-9a-f]{40}$/.test(readiness.release.commitSha || "")) {
    throw new Error(`${label} readiness does not report a full Git commit SHA.`);
  }
  if (readiness.release.sourceDirty !== false) {
    throw new Error(`${label} was not built from clean source.`);
  }
  return {
    label,
    origin: baseUrl.origin,
    commitSha: readiness.release.commitSha,
  };
}

export function validateDualHostRelease({ sites, cloudflare, expectedCommit }) {
  if (sites.commitSha !== cloudflare.commitSha) {
    throw new Error(
      `Host drift detected: Sites reports ${sites.commitSha}, while Cloudflare reports ${cloudflare.commitSha}.`,
    );
  }
  if (expectedCommit && sites.commitSha !== expectedCommit) {
    throw new Error(
      `Both hosts report ${sites.commitSha}, which does not match the expected commit ${expectedCommit}.`,
    );
  }
  return {
    schemaVersion: "openescrow-dual-host-release/v1",
    commitSha: sites.commitSha,
    sitesOrigin: sites.origin,
    cloudflareOrigin: cloudflare.origin,
  };
}
