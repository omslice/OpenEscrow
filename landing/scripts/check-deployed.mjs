const baseUrl = new URL(
  process.env.OPENESCROW_LANDING_URL ||
    "https://openescrow-landing-staging.omrigross.workers.dev/",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const home = await fetch(baseUrl, { redirect: "error" });
const html = await home.text();
assert(home.status === 200, `Landing page returned HTTP ${home.status}.`);
assert(
  html.includes("Rental deposits deserve a clearer path."),
  "Landing page headline is missing.",
);
assert(
  html.includes(`rel="canonical" href="${baseUrl.origin}/"`),
  "Canonical URL does not match the deployed origin.",
);
assert(
  html.includes(`property="og:image" content="${baseUrl.origin}/og.png"`),
  "Social preview URL does not match the deployed origin.",
);

for (const [name, expected] of [
  ["content-security-policy", "default-src 'self'"],
  ["permissions-policy", "camera=()"],
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
]) {
  assert(
    home.headers.get(name)?.includes(expected),
    `Required ${name} response header is missing.`,
  );
}

const missing = await fetch(new URL("missing-page", baseUrl), { redirect: "error" });
assert(missing.status === 404, `Missing page returned HTTP ${missing.status}, not 404.`);

const unsupported = await fetch(baseUrl, { method: "POST", redirect: "error" });
assert(unsupported.status === 405, `POST returned HTTP ${unsupported.status}, not 405.`);
assert(
  unsupported.headers.get("x-frame-options") === "DENY",
  "POST response is missing the security-header envelope.",
);

const releaseResponse = await fetch(new URL("release.json", baseUrl), {
  redirect: "error",
  cache: "no-store",
});
assert(
  releaseResponse.status === 200,
  `Landing release provenance returned HTTP ${releaseResponse.status}.`,
);
const release = await releaseResponse.json();
assert(
  release.schemaVersion === "openescrow-landing-release/v1",
  "Landing release provenance schema is invalid.",
);
assert(/^[0-9a-f]{40}$/.test(release.commitSha || ""), "Landing release commit is invalid.");
assert(release.sourceDirty === false, "Landing deployment was built from dirty source.");

console.log(
  `OpenEscrow landing deployment verified: ${baseUrl.origin} (${release.commitSha}).`,
);
