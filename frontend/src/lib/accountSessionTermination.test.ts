import assert from "node:assert/strict";
import test from "node:test";
import { terminateAccountSessions } from "./accountSessionTermination.ts";

test("account session termination completes in containment order", async () => {
  const events: string[] = [];
  const result = await terminateAccountSessions({
    async revoke() {
      events.push("revoke");
      return { revokedSessions: 3 };
    },
    clearLocalAccess() {
      events.push("clear-local");
    },
    isCurrentIdentity() {
      events.push("current-identity");
      return true;
    },
    onRevoked(count) {
      events.push(`revoked:${count}`);
    },
    async logout() {
      events.push("logout");
    },
    reload() {
      events.push("reload");
    },
  });

  assert.deepEqual(result, {
    outcome: "complete",
    revokedSessions: 3,
    localCleanupFailed: false,
  });
  assert.deepEqual(events, [
    "revoke",
    "current-identity",
    "clear-local",
    "current-identity",
    "revoked:3",
    "current-identity",
    "logout",
    "reload",
  ]);
});

test("identity change after revocation skips provider logout and reload", async () => {
  const events: string[] = [];
  const result = await terminateAccountSessions({
    async revoke() {
      events.push("revoke");
      return { revokedSessions: 2 };
    },
    clearLocalAccess() {
      events.push("clear-local");
    },
    isCurrentIdentity() {
      events.push("identity-changed");
      return false;
    },
    onRevoked() {
      events.push("revoked");
    },
    async logout() {
      events.push("logout");
    },
    reload() {
      events.push("reload");
    },
  });

  assert.deepEqual(result, {
    outcome: "identity_changed",
    revokedSessions: 2,
    localCleanupFailed: false,
    localCleanupSkipped: true,
  });
  assert.deepEqual(events, ["revoke", "identity-changed"]);
});

test("identity change in the revoked callback still skips provider logout", async () => {
  const events: string[] = [];
  let currentIdentity = true;
  const result = await terminateAccountSessions({
    async revoke() {
      events.push("revoke");
      return { revokedSessions: 1 };
    },
    clearLocalAccess() {
      events.push("clear-local");
    },
    isCurrentIdentity() {
      events.push(`current:${currentIdentity}`);
      return currentIdentity;
    },
    onRevoked() {
      events.push("revoked");
      currentIdentity = false;
    },
    async logout() {
      events.push("logout");
    },
    reload() {
      events.push("reload");
    },
  });

  assert.deepEqual(result, {
    outcome: "identity_changed",
    revokedSessions: 1,
    localCleanupFailed: false,
    localCleanupSkipped: false,
  });
  assert.deepEqual(events, [
    "revoke",
    "current:true",
    "clear-local",
    "current:true",
    "revoked",
    "current:false",
  ]);
});

test("identity guard failure fails closed before provider logout", async () => {
  const events: string[] = [];
  const result = await terminateAccountSessions({
    async revoke() {
      events.push("revoke");
      return { revokedSessions: 1 };
    },
    clearLocalAccess() {
      events.push("clear-local");
    },
    isCurrentIdentity() {
      events.push("identity-check");
      throw new Error("identity state unavailable");
    },
    async logout() {
      events.push("logout");
    },
    reload() {
      events.push("reload");
    },
  });

  assert.deepEqual(result, {
    outcome: "identity_changed",
    revokedSessions: 1,
    localCleanupFailed: false,
    localCleanupSkipped: true,
  });
  assert.deepEqual(events, ["revoke", "identity-check"]);
});

test("failed server revocation stops before local or provider cleanup", async () => {
  const events: string[] = [];
  await assert.rejects(
    terminateAccountSessions({
      async revoke() {
        events.push("revoke");
        throw new Error("server unavailable");
      },
      clearLocalAccess() {
        events.push("clear-local");
      },
      async logout() {
        events.push("logout");
      },
      reload() {
        events.push("reload");
      },
    }),
    /server unavailable/,
  );
  assert.deepEqual(events, ["revoke"]);
});

test("provider logout failure preserves completed revocation evidence", async () => {
  const result = await terminateAccountSessions({
    async revoke() {
      return { revokedSessions: 2 };
    },
    clearLocalAccess() {
      throw new Error("browser storage blocked");
    },
    async logout() {
      throw new Error("provider unavailable");
    },
    reload() {
      throw new Error("reload must not run");
    },
  });

  assert.equal(result.outcome, "logout_failed");
  assert.equal(result.revokedSessions, 2);
  assert.equal(result.localCleanupFailed, true);
  assert.match(
    result.error instanceof Error ? result.error.message : "",
    /provider unavailable/,
  );
});

test("reload failure remains distinct after revocation and provider logout", async () => {
  const result = await terminateAccountSessions({
    async revoke() {
      return { revokedSessions: 0 };
    },
    clearLocalAccess() {},
    async logout() {},
    reload() {
      throw new Error("navigation blocked");
    },
  });

  assert.equal(result.outcome, "reload_failed");
  assert.equal(result.revokedSessions, 0);
  assert.equal(result.localCleanupFailed, false);
  assert.match(
    result.error instanceof Error ? result.error.message : "",
    /navigation blocked/,
  );
});
