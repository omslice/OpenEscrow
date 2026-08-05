import assert from "node:assert/strict";
import test from "node:test";
import {
  clearInviteRole,
  readInviteRole,
  readWorkspaceRole,
  selectWorkspaceRole,
} from "./inviteContext.ts";

class BlockedSessionStorage implements Storage {
  get length(): number {
    throw new Error("session storage blocked");
  }

  clear() {
    throw new Error("session storage blocked");
  }

  getItem(_key: string): string | null {
    throw new Error("session storage blocked");
  }

  key(_index: number): string | null {
    throw new Error("session storage blocked");
  }

  removeItem(_key: string) {
    throw new Error("session storage blocked");
  }

  setItem(_key: string, _value: string) {
    throw new Error("session storage blocked");
  }
}

test("workspace selection remains usable when session storage is blocked", () => {
  const originalWindow = globalThis.window;
  let currentUrl = new URL("https://openescrow.example/");
  let blockHistory = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: new BlockedSessionStorage(),
      location: {
        get href() {
          return currentUrl.toString();
        },
        get search() {
          return currentUrl.search;
        },
      },
      history: {
        replaceState(_state: unknown, _title: string, nextUrl: string) {
          if (blockHistory) throw new Error("history unavailable");
          currentUrl = new URL(nextUrl);
        },
      },
      dispatchEvent() {
        return true;
      },
    },
  });

  try {
    selectWorkspaceRole("landlord");
    assert.equal(readWorkspaceRole(), "landlord");

    currentUrl = new URL(
      "https://openescrow.example/?invite=tenant&proposal=proposal-1#token=secret",
    );
    assert.equal(readInviteRole(), "tenant");
    assert.equal(readWorkspaceRole(), "tenant");
    selectWorkspaceRole("landlord");
    assert.equal(readWorkspaceRole(), "tenant");

    blockHistory = true;
    clearInviteRole();
    assert.equal(readInviteRole(), null);
    assert.equal(readWorkspaceRole(), null);
    assert.equal(currentUrl.hash, "#token=secret");
    currentUrl.hash = "yield-stablecoins";
    assert.equal(readInviteRole(), null);
    currentUrl.searchParams.set("token", "replacement-secret");
    assert.equal(readInviteRole(), "tenant");
  } finally {
    clearInviteRole();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
