import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDurableFundingCheckoutEvent,
  buildNegotiationInviteUrl,
  captureNegotiationAccessFromUrl,
  clearAccountNegotiationAccesses,
  clearLandlordBundle,
  createDurableFundingCheckout,
  listNegotiationAccesses,
  loadNegotiation,
  loadNegotiationReport,
  loadNegotiationSnapshot,
  readLandlordBundle,
  readLatestLandlordAccess,
  readNegotiationAccess,
  recoverNegotiationAccessForAccount,
  recoverDurableFundingCheckout,
  rememberLandlordBundle,
  storeNegotiationAccess,
  type CreatedNegotiation,
  type NegotiationAccess,
} from "./negotiations.ts";
import {
  createFundingCheckoutAttempt,
  createFundingIntent,
} from "../../shared/funding-routes.js";

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
    assert.notEqual(
      localStorage.getItem(
        "openescrow.negotiationAccess.account-proposal.landlord",
      ),
      null,
    );
    assert.equal(
      localStorage.getItem(
        "openescrow.negotiationAccess.invited-proposal.tenant",
      ),
      null,
    );
    assert.notEqual(
      sessionStorage.getItem(
        "openescrow.negotiationAccess.invited-proposal.tenant",
      ),
      null,
    );
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
    "https://openescrow.example/?invite=tenant&proposal=blocked-invite#token=secret-invite-token",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: blocked,
      sessionStorage: blocked,
      location: {
        origin: "https://openescrow.example",
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
    assert.equal(currentUrl.hash, "");
    assert.equal(currentUrl.searchParams.get("access"), null);
    assert.equal(currentUrl.searchParams.get("invite"), "tenant");
    assert.deepEqual(
      readNegotiationAccess("blocked-invite", "tenant"),
      captured,
    );
    assert.deepEqual(
      captureNegotiationAccessFromUrl(),
      captured,
      "A StrictMode remount should reuse current-page invitation access even when storage is blocked.",
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

    currentUrl = new URL(
      "https://openescrow.example/?invite=tenant&token=missing-proposal",
    );
    assert.equal(captureNegotiationAccessFromUrl(), null);
    assert.equal(currentUrl.searchParams.get("token"), null);
    assert.equal(currentUrl.searchParams.get("invite"), null);

    currentUrl = new URL(
      "https://openescrow.example/?invite=tenant&proposal=conflicted&token=query-secret#token=fragment-secret",
    );
    assert.equal(captureNegotiationAccessFromUrl(), null);
    assert.equal(currentUrl.searchParams.has("token"), false);
    assert.equal(currentUrl.hash, "");
    assert.equal(currentUrl.searchParams.has("invite"), false);

    const generated = new URL(
      buildNegotiationInviteUrl("tenant", "generated-invite", "generated-secret"),
    );
    assert.equal(generated.searchParams.get("invite"), "tenant");
    assert.equal(generated.searchParams.get("proposal"), "generated-invite");
    assert.equal(generated.searchParams.has("token"), false);
    assert.equal(generated.hash, "#token=generated-secret");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("captured invitation access remains session-scoped and clears a legacy local copy", () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  let currentUrl = new URL(
    "https://openescrow.example/?invite=tenant&proposal=session-invite&token=session-secret",
  );
  const key = "openescrow.negotiationAccess.session-invite.tenant";
  localStorage.setItem(
    key,
    JSON.stringify({
      proposalId: "session-invite",
      role: "tenant",
      token: "legacy-local-secret",
      source: "invite",
    }),
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
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
    assert.equal(currentUrl.searchParams.get("token"), null);
    assert.equal(localStorage.getItem(key), null);
    assert.deepEqual(
      JSON.parse(sessionStorage.getItem(key) || "{}"),
      captured,
    );
    assert.equal(
      localStorage.getItem("openescrow.negotiationAccessIndex"),
      null,
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("durable sandbox checkout requests keep bearer access and bigint amounts out of URLs", async () => {
  const originalFetch = globalThis.fetch;
  const captured: Array<{ url: string; body: Record<string, unknown> }> = [];
  const access: NegotiationAccess = {
    proposalId: "proposal-funding",
    role: "tenant",
    token: "tenant-secret",
  };
  const intent = createFundingIntent({
    assetId: "usdc",
    walletAddress: "0x1111111111111111111111111111111111111111",
    amountMicros: 1_205_000_000n,
    environment: "sandbox",
    onrampEnabled: true,
    productionApproved: false,
  });
  const checkout = createFundingCheckoutAttempt(intent, {
    attemptId: "sandbox-api-test-attempt",
  });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(input),
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    });
    const url = String(input);
    if (url.endsWith("/recover")) {
      return Response.json({
        checkout,
        requestedIntentMatched: true,
        durable: true,
        sandboxOnly: true,
      });
    }
    if (url.endsWith("/events")) {
      return Response.json({
        checkout,
        duplicate: false,
        durable: true,
        sandboxOnly: true,
      });
    }
    return Response.json({
      checkout,
      created: true,
      requestedIntentMatched: true,
      durable: true,
      sandboxOnly: true,
    });
  }) as typeof fetch;

  try {
    await createDurableFundingCheckout(access, intent, checkout.attemptId);
    await recoverDurableFundingCheckout(access, intent);
    await appendDurableFundingCheckoutEvent(access, checkout.attemptId, {
      eventId: "provider:test-event",
      status: "submitted",
      providerStatus: "processing",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    captured.map(({ url }) => url),
    [
      "/api/negotiations/proposal-funding/funding-checkouts",
      "/api/negotiations/proposal-funding/funding-checkouts/recover",
      "/api/negotiations/proposal-funding/funding-checkouts/sandbox-api-test-attempt/events",
    ],
  );
  for (const requestRecord of captured) {
    assert.equal(requestRecord.url.includes("tenant-secret"), false);
    assert.equal(requestRecord.body.token, "tenant-secret");
  }
  assert.equal(
    (
      captured[0].body.intent as {
        amountMicros: string;
      }
    ).amountMicros,
    "1205000000",
  );
  assert.equal(captured[2].body.eventId, "provider:test-event");
});

test("signed-in account recovery replaces an expired invitation for the same proposal and role", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const expiredInvite: NegotiationAccess = {
    proposalId: "proposal-recovered",
    role: "tenant",
    token: "expired-invite-secret",
    source: "invite",
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage },
  });
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("privy-id-token"), "verified-identity");
    return Response.json({
      accesses: [
        {
          proposalId: "another-proposal",
          role: "tenant",
          token: "another-account-secret",
        },
        {
          proposalId: "proposal-recovered",
          role: "tenant",
          token: "current-account-secret",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const recovered = await recoverNegotiationAccessForAccount(
      expiredInvite,
      "verified-identity",
    );
    assert.deepEqual(recovered, {
      proposalId: "proposal-recovered",
      role: "tenant",
      token: "current-account-secret",
      source: "account",
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("private agreement reads use an authorization header instead of a bearer URL", async () => {
  const originalFetch = globalThis.fetch;
  const captured: Array<{ url: string; headers: Headers }> = [];
  const access: NegotiationAccess = {
    proposalId: "proposal/private read",
    role: "tenant",
    token: "tenant-private-read-secret",
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    captured.push({ url, headers: new Headers(init?.headers) });
    if (url.includes("/report?")) {
      return new Response("<!doctype html><title>Complete record</title>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition":
            'attachment; filename="openescrow-private-read-complete-record.html"',
        },
      });
    }
    if (url.endsWith("/snapshot")) {
      return Response.json({ algorithm: "SHA-256", hash: "0x1234" });
    }
    return Response.json({ id: access.proposalId, status: "finalized" });
  }) as typeof fetch;

  try {
    await loadNegotiation(access);
    const report = await loadNegotiationReport(access);
    await loadNegotiationSnapshot(access);
    assert.equal(report.filename, "openescrow-private-read-complete-record.html");
    assert.match(report.content, /Complete record/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    captured.map(({ url }) => url),
    [
      "/api/negotiations/proposal%2Fprivate%20read",
      "/api/negotiations/proposal%2Fprivate%20read/report?download=1",
      "/api/negotiations/proposal%2Fprivate%20read/snapshot",
    ],
  );
  for (const privateRead of captured) {
    assert.equal(privateRead.url.includes("token="), false);
    assert.equal(privateRead.url.includes(access.token), false);
    assert.equal(
      privateRead.headers.get("authorization"),
      `Bearer ${access.token}`,
    );
  }
});

test("private agreement reads replace non-JSON server failures with recovery guidance", async () => {
  const originalFetch = globalThis.fetch;
  const access: NegotiationAccess = {
    proposalId: "proposal-unreadable-response",
    role: "tenant",
    token: "tenant-private-read-secret",
  };

  globalThis.fetch = (async () =>
    new Response("<!doctype html><title>Temporary upstream response</title>", {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => loadNegotiation(access),
      /OpenEscrow could not read the server response\. Check your connection and try again\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
