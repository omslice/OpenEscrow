import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  releaseReadinessUrl,
  waitForExpectedRelease,
} from "./dual-host-release-core.mjs";
import { assertCloudflareDeployedReadiness } from "./cloudflare-deployed-readiness-core.mjs";
import { verifyPrivyGoogleOrigin } from "./verify-privy-oauth-origin.mjs";

const execFileAsync = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const repository = path.resolve(frontend, "..");
const baseUrl = new URL(
  process.argv.find((arg) => /^https:\/\//.test(arg)) ||
    process.env.OPENESCROW_CLOUDFLARE_URL ||
    "https://openescrow.io/",
);
const { stdout: commitOutput } = await execFileAsync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
});
const expectedCommit = commitOutput.trim();
const requirePilotServices = process.argv.includes("--require-pilot-services");

function publicEnvValue(source, name) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = await fetch(baseUrl, { redirect: "error", cache: "no-store" });
const html = await home.text();
assert(home.status === 200, `Cloudflare MVP returned HTTP ${home.status}.`);
assert(html.includes('id="root"'), "Cloudflare MVP application shell is missing.");
for (const [name, expected] of [
  ["content-security-policy", "default-src 'self'"],
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
]) {
  assert(
    home.headers.get(name)?.includes(expected),
    `Cloudflare MVP is missing the required ${name} security header.`,
  );
}

const productionEnv = await readFile(path.join(frontend, ".env.production"), "utf8");
const privyAppId = publicEnvValue(productionEnv, "VITE_PRIVY_APP_ID");
assert(privyAppId, "The production build is missing its public Privy app ID.");
await verifyPrivyGoogleOrigin({
  appId: privyAppId,
  origin: baseUrl.origin,
});

const readinessResult = await waitForExpectedRelease({
  expectedCommit,
  onRetry: ({ attempt, attempts, delayMs, lastResult }) => {
    const observed = lastResult?.readiness?.release?.commitSha || "unavailable";
    console.log(
      `Waiting for Cloudflare release propagation (${attempt}/${attempts - 1}); observed ${observed}. Retrying in ${delayMs}ms.`,
    );
  },
  readAttempt: async (attempt) => {
    const readinessResponse = await fetch(
      releaseReadinessUrl(baseUrl, expectedCommit, `${Date.now().toString(36)}-${attempt}`),
      {
        headers: { accept: "application/json" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    let readiness;
    try {
      readiness = await readinessResponse.json();
    } catch {
      throw new Error("Cloudflare readiness did not return valid JSON.");
    }
    return { status: readinessResponse.status, readiness };
  },
});
assert(
  readinessResult.status === 200,
  `Cloudflare readiness endpoint returned HTTP ${readinessResult.status}.`,
);
const readiness = readinessResult.readiness;
assert(
  readiness.release?.schemaVersion === "openescrow-release/v1",
  "Cloudflare readiness is missing exact release provenance.",
);
assert(
  readiness.release?.commitSha === expectedCommit,
  `Cloudflare release ${readiness.release?.commitSha || "missing"} does not match ${expectedCommit}.`,
);
assert(readiness.release?.sourceDirty === false, "Cloudflare release was built from dirty source.");
assertCloudflareDeployedReadiness(readiness, { requirePilotServices });

console.log(
  `OpenEscrow Cloudflare ${requirePilotServices ? "pilot" : "core deployment"} verified: ${baseUrl.origin} (${expectedCommit}).`,
);
