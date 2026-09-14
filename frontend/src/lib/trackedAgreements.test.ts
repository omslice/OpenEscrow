import assert from "node:assert/strict";
import test from "node:test";
import { trackedAgreementStorageKey } from "./trackedAgreementStorage.ts";

test("tracked agreement storage is isolated by verified account", () => {
  const release = "84532:0x1111111111111111111111111111111111111111";
  const accountA = trackedAgreementStorageKey("did:privy:account-a", release);
  const accountB = trackedAgreementStorageKey("did:privy:account-b", release);

  assert.notEqual(accountA, accountB);
  assert.match(accountA, /^openescrow\.trackedAgreementIds\.release\./);
  assert.match(accountA, /\.account\./);
  assert.match(accountB, /^openescrow\.trackedAgreementIds\.release\./);
});

test("tracked agreement storage is isolated by contract release", () => {
  const account = "did:privy:account-a";
  const releaseA = "84532:0x1111111111111111111111111111111111111111";
  const releaseB = "84532:0x2222222222222222222222222222222222222222";

  assert.notEqual(
    trackedAgreementStorageKey(account, releaseA),
    trackedAgreementStorageKey(account, releaseB),
  );
});

test("anonymous recovery is still scoped to the active contract release", () => {
  const release = "84532:0x1111111111111111111111111111111111111111";
  assert.equal(
    trackedAgreementStorageKey(null, release),
    "openescrow.trackedAgreementIds.release.84532%3A0x1111111111111111111111111111111111111111",
  );
  assert.equal(
    trackedAgreementStorageKey("  ", release),
    "openescrow.trackedAgreementIds.release.84532%3A0x1111111111111111111111111111111111111111",
  );
});

test("tracked agreement storage rejects an empty contract release scope", () => {
  assert.throws(
    () => trackedAgreementStorageKey("did:privy:account-a", "  "),
    /requires a contract release scope/,
  );
});
