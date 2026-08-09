import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  normalizeBaseUrl,
  releaseReadinessUrl,
  validateDualHostRelease,
  validateHostedRelease,
  validateRetiredLandingRoute,
  waitForExpectedRelease,
} from "./dual-host-release-core.mjs";

const execFileAsync = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, "..", "..");

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const sitesUrl = normalizeBaseUrl(
  argument(
    "sites",
    process.env.OPENESCROW_SITES_URL ||
      "https://openescrow-demo.omrigross.chatgpt.site/",
  ),
  "ChatGPT Sites URL",
);
const cloudflareUrl = normalizeBaseUrl(
  argument(
    "cloudflare",
    process.env.OPENESCROW_CLOUDFLARE_URL ||
      "https://openescrow.io/",
  ),
  "Cloudflare URL",
);
const retiredLandingUrl = normalizeBaseUrl(
  argument(
    "retired-landing",
    process.env.OPENESCROW_RETIRED_LANDING_URL ||
      "https://openescrow-landing-staging.omslice.workers.dev/",
  ),
  "Retired landing Worker URL",
);
const expectedArgument = argument("expected", process.env.OPENESCROW_RELEASE_COMMIT);
const expectedCommit = expectedArgument ||
  (
    await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    })
  ).stdout.trim();

async function inspectHost(label, baseUrl, canonicalBaseUrl) {
  let home;
  try {
    home = await fetch(baseUrl, {
      redirect: canonicalBaseUrl ? "manual" : "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "request failed";
    throw new Error(`${label} could not be reached: ${detail}`);
  }
  const homeHtml = await home.text();
  const readinessResult = await waitForExpectedRelease({
    expectedCommit,
    readAttempt: async (attempt) => {
      let response;
      try {
        response = await fetch(
          releaseReadinessUrl(
            baseUrl,
            expectedCommit,
            `${Date.now().toString(36)}-${attempt}`,
          ),
          {
            headers: { accept: "application/json" },
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : "request failed";
        throw new Error(`${label} readiness could not be reached: ${detail}`);
      }
      let readiness;
      try {
        readiness = await response.json();
      } catch {
        throw new Error(`${label} readiness did not return valid JSON.`);
      }
      return { status: response.status, readiness };
    },
  });
  return validateHostedRelease({
    label,
    baseUrl,
    homeStatus: home.status,
    homeHtml,
    homeLocation: home.headers.get("location"),
    canonicalBaseUrl,
    readinessStatus: readinessResult.status,
    readiness: readinessResult.readiness,
  });
}

async function inspectRetiredLanding(label, baseUrl) {
  let response;
  try {
    response = await fetch(baseUrl, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "request failed";
    throw new Error(`${label} route state could not be verified: ${detail}`);
  }
  return validateRetiredLandingRoute({
    label,
    baseUrl,
    status: response.status,
  });
}

const [sites, cloudflare, retiredLanding] = await Promise.all([
  inspectHost("ChatGPT Sites", sitesUrl, cloudflareUrl),
  inspectHost("Cloudflare", cloudflareUrl),
  inspectRetiredLanding("Retired landing Worker", retiredLandingUrl),
]);
const result = validateDualHostRelease({ sites, cloudflare, expectedCommit });
console.log(
  `OpenEscrow dual-host release verified: ${result.commitSha}\n` +
    `  ChatGPT Sites: ${result.sitesOrigin}\n` +
    `  Cloudflare: ${result.cloudflareOrigin}\n` +
    `  Retired landing route: HTTP ${retiredLanding.status} at ${retiredLanding.origin}`,
);
