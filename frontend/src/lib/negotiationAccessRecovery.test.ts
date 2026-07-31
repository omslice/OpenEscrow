import assert from "node:assert/strict";
import test from "node:test";
import {
  negotiationAccessStorageKey,
  preserveNegotiationAccessForReload,
  recoverNegotiationAccessForEntry,
} from "./negotiationAccessRecovery.ts";
import type { NegotiationAccess } from "./negotiations.ts";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

test("a scrubbed invitation can resume in the same tab without becoming an account session", () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage },
  });

  const access: NegotiationAccess = {
    proposalId: "proposal-reload",
    role: "tenant",
    token: "private-invitation-token",
    source: "invite",
  };
  const key = negotiationAccessStorageKey(access.proposalId, access.role);

  try {
    assert.equal(preserveNegotiationAccessForReload(access), true);
    assert.equal(localStorage.getItem(key), null);
    assert.deepEqual(
      JSON.parse(sessionStorage.getItem(key) || "{}"),
      access,
    );
    assert.deepEqual(
      recoverNegotiationAccessForEntry(access.proposalId, access.role),
      access,
    );
    assert.equal(
      recoverNegotiationAccessForEntry(access.proposalId, "landlord"),
      null,
    );

    sessionStorage.setItem(
      key,
      JSON.stringify({ ...access, source: "account" }),
    );
    assert.equal(
      recoverNegotiationAccessForEntry(access.proposalId, access.role),
      null,
    );

    sessionStorage.setItem(key, "{broken");
    assert.equal(
      recoverNegotiationAccessForEntry(access.proposalId, access.role),
      null,
    );
    assert.equal(sessionStorage.getItem(key), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
