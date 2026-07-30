import assert from "node:assert/strict";
import test from "node:test";
import {
  captureNegotiationAccessFromUrl,
  clearAccountNegotiationAccesses,
  clearLandlordBundle,
  listNegotiationAccesses,
  readLandlordBundle,
  readLatestLandlordAccess,
  readNegotiationAccess,
  rememberLandlordBundle,
  storeNegotiationAccess,
  type CreatedNegotiation,
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

class BlockedStorage implements Storage {
  get length(): number {
    throw new Error("storage blocked");
  }

  clear() {
    throw new Error("storage blocked");
  }

  getItem(_key: string): string | null {
    throw new Error("storage blocked");
  }

  key(_index: number): string | null {
    throw new Error("storage blocked");
  }

  removeItem(_key: string) {
    throw new Error("storage blocked");
  }

  setItem(_key: string, _value: string) {
    throw new Error("storage blocked");
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
    localStorage.setItem(
      "openescrow.negotiationAccess.account-proposal",
      JSON.stringify(accountLandlord),
    );
    assert.equal(listNegotiationAccesses().length, 2);
    assert.equal(readLatestLandlordAccess()?.token, "account-session");

    clearAccountNegotiationAccesses();

    assert.deepEqual(listNegotiationAccesses(), [invitationTenant]);
    assert.equal(
      localStorage.getItem("openescrow.negotiationAccess.account-proposal"),
      null,
    );
    assert.equal(readLatestLandlordAccess(), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("blocked storage cannot blank an invitation or leave its bearer token in the URL", () => {
  const originalWindow = globalThis.window;
  const blocked = new BlockedStorage();
  let currentUrl = new URL(
    "https://openescrow.example/?invite=tenant&proposal=blocked-invite&token=secret-invite-token",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: blocked,
      sessionStorage: blocked,
      location: {
        get href() {
          return currentUrl.toString();
        },
      },
      history: {
        replaceState(_state: unknown, _title: string, nextUrl: string) {
          currentUrl = new URL(nextUrl);
        },
      },
    },
  });

  try {
    const captured = captureNegotiationAccessFromUrl();
    assert.deepEqual(captured, {
      proposalId: "blocked-invite",
      role: "tenant",
      token: "secret-invite-token",
      source: "invite",
    });
    assert.equal(currentUrl.searchParams.get("token"), null);
    assert.equal(currentUrl.searchParams.get("access"), null);
    assert.equal(currentUrl.searchParams.get("invite"), "tenant");
    assert.deepEqual(
      readNegotiationAccess("blocked-invite", "tenant"),
      captured,
    );

    rememberLandlordBundle({
      record: { id: "blocked-bundle" },
      access: {
        landlord: "landlord-secret",
        tenant: "tenant-secret",
        tenants: [],
        arbiter: null,
      },
    } as unknown as CreatedNegotiation);
    assert.equal(readLandlordBundle("blocked-bundle")?.proposalId, "blocked-bundle");
    clearLandlordBundle("blocked-bundle");
    assert.equal(readLandlordBundle("blocked-bundle"), null);

    currentUrl = new URL(
      "https://openescrow.example/?proposal=malformed&access=viewer&token=must-also-be-removed",
    );
    assert.equal(captureNegotiationAccessFromUrl(), null);
    assert.equal(currentUrl.searchParams.get("token"), null);
    assert.equal(currentUrl.searchParams.get("access"), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
