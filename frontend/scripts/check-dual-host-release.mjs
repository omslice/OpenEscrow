import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  normalizeBaseUrl,
  releaseReadinessUrl,
  validateDualHostRelease,
  validateHostedRelease,
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
      "https://openescrow.omslice.workers.dev/",
  ),
  "Cloudflare URL",
);
const expectedArgument = argument("expected", process.env.OPENESCROW_RELEASE_COMMIT);
const expectedCommit = expectedArgument ||
  (
    await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    })
  ).stdout.trim();

async function inspectHost(label, baseUrl) {
  let home;
  let readinessResponse;
  try {
    home = await fetch(baseUrl, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    readinessResponse = await fetch(releaseReadinessUrl(baseUrl, expectedCommit), {
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "request failed";
    throw new Error(`${label} could not be reached: ${detail}`);
  }
  const homeHtml = await home.text();
  let readiness;
  try {
    readiness = await readinessResponse.json();
  } catch {
    throw new Error(`${label} readiness did not return valid JSON.`);
  }
  return validateHostedRelease({
    label,
    baseUrl,
    homeStatus: home.status,
    homeHtml,
    readinessStatus: readinessResponse.status,
    readiness,
  });
}

const [sites, cloudflare] = await Promise.all([
  inspectHost("ChatGPT Sites", sitesUrl),
  inspectHost("Cloudflare", cloudflareUrl),
]);
const result = validateDualHostRelease({ sites, cloudflare, expectedCommit });
console.log(
  `OpenEscrow dual-host release verified: ${result.commitSha}\n` +
    `  ChatGPT Sites: ${result.sitesOrigin}\n` +
    `  Cloudflare: ${result.cloudflareOrigin}`,
);
