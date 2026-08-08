export const RELEASE_SCHEMA = "openescrow-release/v1";

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
