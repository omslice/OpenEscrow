import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAccountNegotiationAccesses,
  listNegotiationAccesses,
  readLatestLandlordAccess,
  storeNegotiationAccess,
  type NegotiationAccess,
} from "./negotiations.ts";

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

test("ending account sessions clears only account-discovery access from browser storage", () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage },
  });

  const accountLandlord: NegotiationAccess = {
    proposalId: "account-proposal",
    role: "landlord",
    token: "account-session",
    source: "account",
  };
  const invitationTenant: NegotiationAccess = {
    proposalId: "invited-proposal",
    role: "tenant",
    token: "invitation-link",
    source: "invite",
  };

  try {
    storeNegotiationAccess(accountLandlord, true);
    storeNegotiationAccess(invitationTenant, true);
    assert.equal(listNegotiationAccesses().length, 2);
    assert.equal(readLatestLandlordAccess()?.token, "account-session");

    clearAccountNegotiationAccesses();

    assert.deepEqual(listNegotiationAccesses(), [invitationTenant]);
    assert.equal(readLatestLandlordAccess(), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
