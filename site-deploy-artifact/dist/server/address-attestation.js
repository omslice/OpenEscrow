import { normalizeAddressResolution } from "./shared/us-compliance-engine.js";

const VERSION = "oeaddr1";
const MINIMUM_SECRET_LENGTH = 32;
const MAXIMUM_FUTURE_SKEW_SECONDS = 5 * 60;
const TOKEN_PATTERN = /^oeaddr1\.(\d{10,})\.([A-Za-z0-9_-]{43})$/;

function cleanSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function addressAttestationConfigured(secret) {
  const value = cleanSecret(secret);
  return (
    value.length >= MINIMUM_SECRET_LENGTH &&
    !/^(replace|change|example|your[-_])/i.test(value)
  );
}

function canonicalAddress(value) {
  const address = normalizeAddressResolution(value);
  if (!address) return null;
  return JSON.stringify({
    provider: address.provider,
    providerFeatureId: address.providerFeatureId,
    label: address.label,
    countryCode: address.countryCode,
    stateCode: address.stateCode,
    city: address.city,
    county: address.county,
    postalCode: address.postalCode,
    latitude: address.latitude,
    longitude: address.longitude,
  });
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cleanSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function attestationMessage(issuedAt, canonical) {
  return new TextEncoder().encode(`${VERSION}\n${issuedAt}\n${canonical}`);
}

export async function createAddressAttestation(
  address,
  secret,
  now = Date.now(),
) {
  if (!addressAttestationConfigured(secret)) {
    throw new Error("Address attestation is not configured.");
  }
  const canonical = canonicalAddress(address);
  if (!canonical) throw new Error("A normalized U.S. address is required.");
  const issuedAt = Math.floor(Number(now) / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new Error("The address attestation time is invalid.");
  }
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, ["sign"]),
    attestationMessage(issuedAt, canonical),
  );
  return `${VERSION}.${issuedAt}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAddressAttestation(
  address,
  secret,
  now = Date.now(),
) {
  if (!addressAttestationConfigured(secret)) return false;
  const canonical = canonicalAddress(address);
  const match =
    typeof address?.attestation === "string"
      ? TOKEN_PATTERN.exec(address.attestation)
      : null;
  if (!canonical || !match) return false;
  const issuedAt = Number(match[1]);
  const nowSeconds = Math.floor(Number(now) / 1000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(nowSeconds) ||
    issuedAt <= 0 ||
    issuedAt > nowSeconds + MAXIMUM_FUTURE_SKEW_SECONDS
  ) {
    return false;
  }
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, ["verify"]),
      decodeBase64Url(match[2]),
      attestationMessage(issuedAt, canonical),
    );
  } catch {
    return false;
  }
}
