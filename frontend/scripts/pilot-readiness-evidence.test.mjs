import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceEncryptionCheck } from "./pilot-readiness-evidence.mjs";

test("pilot evidence readiness requires encryption and the complete retained keyring", () => {
  const check = buildEvidenceEncryptionCheck({
    encryptedAtRest: true,
    keyringReady: true,
    referencedEncryptionKeyCount: 2,
    missingDecryptionKeyCount: 0,
  });

  assert.equal(check.ready, true);
  assert.match(check.detail, /all 2 referenced keys verified/);
});

test("pilot evidence readiness blocks when stored evidence references a missing key", () => {
  const check = buildEvidenceEncryptionCheck({
    encryptedAtRest: true,
    keyringReady: false,
    referencedEncryptionKeyCount: 2,
    missingDecryptionKeyCount: 1,
  });

  assert.equal(check.ready, false);
  assert.match(check.detail, /1 retained decryption key.*is missing/);
  assert.match(check.action, /Restore every approved key ID/);
  assert.match(check.validate, /keyringReady === true/);
});

test("pilot evidence readiness rejects a mislabeled backup with the wrong key bytes", () => {
  const check = buildEvidenceEncryptionCheck({
    encryptedAtRest: true,
    keyringReady: false,
    referencedEncryptionKeyCount: 2,
    missingDecryptionKeyCount: 0,
    unverifiedEncryptionKeyCount: 0,
    mismatchedDecryptionKeyCount: 1,
  });

  assert.equal(check.ready, false);
  assert.match(check.detail, /configured evidence key backup.*does not match/);
  assert.match(check.action, /exact approved backup bytes/);
  assert.match(check.action, /do not guess, relabel, or replace/);
});

test("pilot evidence readiness rejects encrypted legacy rows without a key fingerprint", () => {
  const check = buildEvidenceEncryptionCheck({
    encryptedAtRest: true,
    keyringReady: false,
    referencedEncryptionKeyCount: 1,
    missingDecryptionKeyCount: 0,
    unverifiedEncryptionKeyCount: 1,
    mismatchedDecryptionKeyCount: 0,
  });

  assert.equal(check.ready, false);
  assert.match(check.detail, /lacks verifiable key-fingerprint metadata/);
  assert.match(check.action, /legacy-evidence recovery and fingerprint migration/);
});

test("pilot evidence readiness fails closed when an older endpoint omits keyring status", () => {
  const check = buildEvidenceEncryptionCheck({
    encryptedAtRest: true,
  });

  assert.equal(check.ready, false);
  assert.match(check.detail, /could not be verified/);
});
