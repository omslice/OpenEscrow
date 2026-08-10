import assert from "node:assert/strict";
import test from "node:test";
import {
  clearInvitationCredential,
  readInvitationCredential,
  setInvitationCredential,
} from "./invitationCredential.ts";

test("new invitation credentials stay in the client-only URL fragment", () => {
  const url = new URL("https://openescrow.example/?invite=tenant&proposal=proposal-1");
  setInvitationCredential(url, "fragment-secret");

  assert.equal(url.searchParams.has("token"), false);
  assert.equal(url.hash, "#token=fragment-secret");
  assert.deepEqual(readInvitationCredential(url), {
    token: "fragment-secret",
    present: true,
    conflicted: false,
    source: "fragment",
  });
  assert.equal(clearInvitationCredential(url), true);
  assert.equal(url.hash, "");
});

test("legacy query credentials remain readable once and are scrubbed", () => {
  const url = new URL(
    "https://openescrow.example/?invite=tenant&proposal=proposal-1&token=legacy-secret",
  );
  assert.equal(readInvitationCredential(url).token, "legacy-secret");
  assert.equal(readInvitationCredential(url).source, "query");
  clearInvitationCredential(url);
  assert.equal(url.searchParams.has("token"), false);
});

test("conflicting, malformed, and empty invitation credentials fail closed", () => {
  const conflict = new URL(
    "https://openescrow.example/?token=query-secret#token=fragment-secret",
  );
  assert.deepEqual(readInvitationCredential(conflict), {
    token: null,
    present: true,
    conflicted: true,
    source: null,
  });

  const duplicate = new URL(
    "https://openescrow.example/#token=first-secret&token=second-secret",
  );
  assert.equal(readInvitationCredential(duplicate).token, null);
  assert.equal(readInvitationCredential(duplicate).conflicted, true);
  clearInvitationCredential(duplicate);
  assert.equal(duplicate.hash, "");

  const repeatedAcrossLocations = new URL(
    "https://openescrow.example/?token=repeated-secret#token=repeated-secret",
  );
  assert.equal(readInvitationCredential(repeatedAcrossLocations).token, null);
  assert.equal(readInvitationCredential(repeatedAcrossLocations).conflicted, true);

  const malformedFragmentWithValidQuery = new URL(
    "https://openescrow.example/?token=query-secret#token=not%20url%20safe",
  );
  assert.equal(readInvitationCredential(malformedFragmentWithValidQuery).token, null);
  assert.equal(
    readInvitationCredential(malformedFragmentWithValidQuery).conflicted,
    true,
  );

  for (const url of [
    new URL("https://openescrow.example/#token="),
    new URL("https://openescrow.example/#token=not%20url%20safe"),
    new URL(`https://openescrow.example/#token=${"a".repeat(201)}`),
  ]) {
    const credential = readInvitationCredential(url);
    assert.equal(credential.present, true);
    assert.equal(credential.token, null);
    clearInvitationCredential(url);
    assert.equal(url.hash, "");
  }
});

test("credential cleanup preserves an unrelated fragment value", () => {
  const url = new URL(
    "https://openescrow.example/#view=record&token=fragment-secret",
  );
  clearInvitationCredential(url);
  assert.equal(url.hash, "#view=record");
});
