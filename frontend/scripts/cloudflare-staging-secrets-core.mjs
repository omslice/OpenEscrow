import { randomBytes } from "node:crypto";

export const STAGING_SECRET_SCHEMA = "openescrow-cloudflare-staging-secrets/v1";

export function createStagingSecretPayload({
  accountId,
  workerName,
  now = new Date(),
  random = randomBytes,
}) {
  if (!/^[0-9a-f]{32}$/.test(accountId || "")) {
    throw new Error("The Cloudflare account ID is invalid.");
  }
  if (!/^[a-z0-9-]{1,63}$/.test(workerName || "")) {
    throw new Error("The Cloudflare Worker name is invalid.");
  }
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const secrets = {
    EVIDENCE_ENCRYPTION_KEY: random(32).toString("base64"),
    EVIDENCE_ENCRYPTION_KEY_ID: `cloudflare-staging-${date}`,
    ADDRESS_ATTESTATION_SECRET: random(48).toString("base64url"),
  };
  if (Buffer.from(secrets.EVIDENCE_ENCRYPTION_KEY, "base64").length !== 32) {
    throw new Error("The generated evidence key is not 32 bytes.");
  }
  if (Buffer.from(secrets.ADDRESS_ATTESTATION_SECRET, "base64url").length < 32) {
    throw new Error("The generated address-attestation secret is too short.");
  }
  return {
    schemaVersion: STAGING_SECRET_SCHEMA,
    createdAt: now.toISOString(),
    accountId,
    workerName,
    environment: "staging",
    secrets,
  };
}

export function validateStagingSecretPayload(payload, expected) {
  if (payload?.schemaVersion !== STAGING_SECRET_SCHEMA) {
    throw new Error("The staging secret backup schema is invalid.");
  }
  if (
    payload.accountId !== expected.accountId ||
    payload.workerName !== expected.workerName ||
    payload.environment !== "staging"
  ) {
    throw new Error("The staging secret backup belongs to another deployment boundary.");
  }
  const evidenceKey = payload.secrets?.EVIDENCE_ENCRYPTION_KEY;
  const keyId = payload.secrets?.EVIDENCE_ENCRYPTION_KEY_ID;
  const addressSecret = payload.secrets?.ADDRESS_ATTESTATION_SECRET;
  if (Buffer.from(evidenceKey || "", "base64").length !== 32) {
    throw new Error("The staging evidence key is invalid.");
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(keyId || "")) {
    throw new Error("The staging evidence key ID is invalid.");
  }
  if (Buffer.from(addressSecret || "", "base64url").length < 32) {
    throw new Error("The staging address-attestation secret is invalid.");
  }
  return payload.secrets;
}
