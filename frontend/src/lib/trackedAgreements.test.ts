import assert from "node:assert/strict";
import test from "node:test";
import { trackedAgreementStorageKey } from "./trackedAgreementStorage.ts";

test("tracked agreement storage is isolated by verified account", () => {
  const accountA = trackedAgreementStorageKey("did:privy:account-a");
  const accountB = trackedAgreementStorageKey("did:privy:account-b");

  assert.notEqual(accountA, accountB);
  assert.match(accountA, /^openescrow\.trackedAgreementIds\.account\./);
  assert.match(accountB, /^openescrow\.trackedAgreementIds\.account\./);
});

test("anonymous fallback retains the legacy device-local storage key", () => {
  assert.equal(
    trackedAgreementStorageKey(null),
    "openescrow.trackedAgreementIds",
  );
  assert.equal(
    trackedAgreementStorageKey("  "),
    "openescrow.trackedAgreementIds",
  );
});
