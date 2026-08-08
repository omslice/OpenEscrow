import assert from "node:assert/strict";
import test from "node:test";
import { verifyPrivyGoogleOrigin } from "./verify-privy-oauth-origin.mjs";

test("verifies that Privy accepts the hosted origin for Google OAuth", async () => {
  let captured;
  const result = await verifyPrivyGoogleOrigin({
    appId: "privy-test-app",
    origin: "https://openescrow.example/ignored-path",
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return Response.json({
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      });
    },
  });

  assert.deepEqual(result, {
    origin: "https://openescrow.example",
    provider: "https://accounts.google.com",
  });
  assert.equal(captured.url, "https://auth.privy.io/api/v1/oauth/init");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.origin, "https://openescrow.example");
  assert.equal(captured.init.headers["privy-app-id"], "privy-test-app");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.redirect_to, "https://openescrow.example/");
  assert.equal(body.provider, "google");
  assert.match(body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(body.state_code, /^[a-f0-9]{32}$/);
});

test("reports an origin rejected by Privy without exposing an authorization URL", async () => {
  await assert.rejects(
    verifyPrivyGoogleOrigin({
      appId: "privy-test-app",
      origin: "https://unlisted.example",
      fetchImpl: async () =>
        Response.json(
          { error: "Origin not allowed", code: "invalid_origin" },
          { status: 403 },
        ),
    }),
    /Privy rejected https:\/\/unlisted\.example with HTTP 403: Origin not allowed · invalid_origin/,
  );
});

test("fails closed when Privy returns an unexpected provider URL", async () => {
  await assert.rejects(
    verifyPrivyGoogleOrigin({
      appId: "privy-test-app",
      origin: "https://openescrow.example",
      fetchImpl: async () => Response.json({ url: "https://example.com/not-google" }),
    }),
    /expected Google authorization URL/,
  );
});

test("requires HTTPS for a hosted origin", async () => {
  await assert.rejects(
    verifyPrivyGoogleOrigin({
      appId: "privy-test-app",
      origin: "http://openescrow.example",
      fetchImpl: async () => Response.json({}),
    }),
    /must use HTTPS/,
  );
});
