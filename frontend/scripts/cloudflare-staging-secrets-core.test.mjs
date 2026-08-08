import assert from "node:assert/strict";
import test from "node:test";
import {
  createStagingSecretPayload,
  validateStagingSecretPayload,
} from "./cloudflare-staging-secrets-core.mjs";

const boundary = {
  accountId: "a".repeat(32),
  workerName: "openescrow",
};

test("creates exact-length staging secrets without exposing a production boundary", () => {
  let byte = 1;
  const payload = createStagingSecretPayload({
    ...boundary,
    now: new Date("2026-08-08T10:00:00.000Z"),
    random(length) {
      return Buffer.alloc(length, byte++);
    },
  });
  const secrets = validateStagingSecretPayload(payload, boundary);
  assert.equal(Buffer.from(secrets.EVIDENCE_ENCRYPTION_KEY, "base64").length, 32);
  assert.equal(Buffer.from(secrets.ADDRESS_ATTESTATION_SECRET, "base64url").length, 48);
  assert.equal(secrets.EVIDENCE_ENCRYPTION_KEY_ID, "cloudflare-staging-20260808");
  assert.equal(payload.environment, "staging");
});

test("rejects a backup from another account, Worker, or malformed key material", () => {
  const payload = createStagingSecretPayload({ ...boundary, now: new Date("2026-08-08") });
  assert.throws(
    () => validateStagingSecretPayload(payload, { ...boundary, workerName: "other" }),
    /another deployment boundary/,
  );
  assert.throws(
    () =>
      validateStagingSecretPayload(
        {
          ...payload,
          secrets: { ...payload.secrets, EVIDENCE_ENCRYPTION_KEY: "short" },
        },
        boundary,
      ),
    /evidence key is invalid/,
  );
});
