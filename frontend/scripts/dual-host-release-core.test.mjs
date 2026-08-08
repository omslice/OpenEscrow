import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBaseUrl,
  releaseReadinessUrl,
  validateDualHostRelease,
  validateHostedRelease,
} from "./dual-host-release-core.mjs";

const commitSha = "a".repeat(40);

function hosted(label, origin, overrides = {}) {
  return validateHostedRelease({
    label,
    baseUrl: new URL(origin),
    homeStatus: 200,
    homeHtml: '<main id="root"></main>',
    readinessStatus: 200,
    readiness: {
      release: {
        schemaVersion: "openescrow-release/v1",
        commitSha,
        sourceDirty: false,
      },
    },
    ...overrides,
  });
}

test("normalizes HTTPS deployment URLs to an origin root", () => {
  assert.equal(
    normalizeBaseUrl("https://example.test/path?x=1#fragment", "Host").href,
    "https://example.test/",
  );
  assert.throws(
    () => normalizeBaseUrl("http://example.test", "Host"),
    /must use HTTPS/,
  );
});

test("uniquely cache-busts readiness for the exact expected release", () => {
  assert.equal(
    releaseReadinessUrl(
      new URL("https://example.test/"),
      commitSha,
      "unit-test",
    ).href,
    `https://example.test/api/system/readiness?release_check=${commitSha}.unit-test`,
  );
});

test("accepts two clean hosts serving the exact expected commit", () => {
  const result = validateDualHostRelease({
    sites: hosted("ChatGPT Sites", "https://sites.example/"),
    cloudflare: hosted("Cloudflare", "https://cloudflare.example/"),
    expectedCommit: commitSha,
  });
  assert.deepEqual(result, {
    schemaVersion: "openescrow-dual-host-release/v1",
    commitSha,
    sitesOrigin: "https://sites.example",
    cloudflareOrigin: "https://cloudflare.example",
  });
});

test("fails closed when either host lacks exact clean provenance", () => {
  assert.throws(
    () =>
      hosted("Cloudflare", "https://cloudflare.example/", {
        readiness: {
          release: {
            schemaVersion: "openescrow-release/v1",
            commitSha,
            sourceDirty: true,
          },
        },
      }),
    /not built from clean source/,
  );
  assert.throws(
    () =>
      hosted("ChatGPT Sites", "https://sites.example/", {
        readinessStatus: 503,
      }),
    /readiness returned HTTP 503/,
  );
});

test("rejects host drift and a shared but unexpected commit", () => {
  const sites = hosted("ChatGPT Sites", "https://sites.example/");
  const cloudflare = hosted("Cloudflare", "https://cloudflare.example/");
  assert.throws(
    () =>
      validateDualHostRelease({
        sites,
        cloudflare: { ...cloudflare, commitSha: "b".repeat(40) },
        expectedCommit: commitSha,
      }),
    /Host drift detected/,
  );
  assert.throws(
    () =>
      validateDualHostRelease({
        sites,
        cloudflare,
        expectedCommit: "c".repeat(40),
      }),
    /does not match the expected commit/,
  );
});
