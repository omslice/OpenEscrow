import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { releaseReadinessUrl } from "./dual-host-release-core.mjs";
import { verifyPrivyGoogleOrigin } from "./verify-privy-oauth-origin.mjs";

const execFileAsync = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const repository = path.resolve(frontend, "..");
const baseUrl = new URL(
  process.argv.find((arg) => /^https:\/\//.test(arg)) ||
    process.env.OPENESCROW_CLOUDFLARE_URL ||
    "https://openescrow.omslice.workers.dev/",
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

const readinessResponse = await fetch(releaseReadinessUrl(baseUrl, expectedCommit), {
  headers: { accept: "application/json" },
  redirect: "error",
  cache: "no-store",
});
assert(
  readinessResponse.status === 200,
  `Cloudflare readiness endpoint returned HTTP ${readinessResponse.status}.`,
);
const readiness = await readinessResponse.json();
assert(
  readiness.release?.schemaVersion === "openescrow-release/v1",
  "Cloudflare readiness is missing exact release provenance.",
);
assert(
  readiness.release?.commitSha === expectedCommit,
  `Cloudflare release ${readiness.release?.commitSha || "missing"} does not match ${expectedCommit}.`,
);
assert(readiness.release?.sourceDirty === false, "Cloudflare release was built from dirty source.");
assert(
  readiness.evidence?.configured === true && readiness.evidence?.mode === "private-r2",
  "Cloudflare EVIDENCE is not bound to private R2.",
);
assert(
  readiness.evidence?.encryptedAtRest === true && readiness.evidence?.keyringReady === true,
  "Cloudflare evidence encryption and key recovery are not ready.",
);
assert(readiness.addressValidation?.configured === true, "Address attestation is not configured.");
if (requirePilotServices) {
  assert(readiness.email?.configured === true, "Notification delivery is not configured.");
}
assert(
  readiness.recordIntegrity?.transactionReceiptVerification === true,
  "Onchain receipt verification is not enabled.",
);
assert(
  readiness.recordIntegrity?.activityRegistry?.ready === true,
  "The activity registry is not bound to the active escrow release.",
);
assert(
  readiness.complianceSources?.configured === true,
  "The compliance source monitor is not enabled.",
);

console.log(
  `OpenEscrow Cloudflare ${requirePilotServices ? "pilot" : "core deployment"} verified: ${baseUrl.origin} (${expectedCommit}).`,
);
