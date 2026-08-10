import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRecoveryJsonIf,
  clearRecoveryValue,
  clearRecoveryValueIfMatches,
  getBrowserRecoveryStorage,
  isTransactionHash,
  readRecoveryJson,
  readRecoveryTransaction,
  readRecoveryValue,
  replaceRecoveryUrl,
  writeRecoveryJson,
  writeRecoveryValue,
  type BrowserRecoveryStorage,
} from "./browserRecovery.ts";
import { createAsyncOperationScope } from "./asyncOperationScope.ts";

class MemoryStorage implements BrowserRecoveryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const hash = `0x${"ab".repeat(32)}` as const;

test("transaction recovery accepts exact hashes and discards corrupt values", () => {
  const storage = new MemoryStorage();
  storage.setItem("valid", hash);
  storage.setItem("invalid", "0x1234");

  assert.equal(isTransactionHash(hash), true);
  assert.equal(readRecoveryTransaction("valid", storage), hash);
  assert.equal(readRecoveryTransaction("invalid", storage), null);
  assert.equal(storage.getItem("invalid"), null);
});

test("conditional recovery clearing preserves a newer transaction", () => {
  const storage = new MemoryStorage();
  const newerHash = `0x${"cd".repeat(32)}` as const;
  storage.setItem("pending", newerHash);

  assert.equal(
    clearRecoveryValueIfMatches("pending", hash, storage),
    false,
  );
  assert.equal(storage.getItem("pending"), newerHash);
  assert.equal(
    clearRecoveryValueIfMatches("pending", newerHash, storage),
    true,
  );
  assert.equal(storage.getItem("pending"), null);
});

test("a late receipt save cannot clear a newer scoped transaction", () => {
  const storage = new MemoryStorage();
  const scope = createAsyncOperationScope("tenant-funding");
  const olderHash = hash;
  const newerHash = `0x${"ef".repeat(32)}` as const;
  storage.setItem("pending", olderHash);
  const olderSave = scope.start();

  storage.setItem("pending", newerHash);
  const newerSave = scope.start();

  assert.equal(scope.isCurrent(olderSave), false);
  assert.equal(
    clearRecoveryValueIfMatches("pending", olderHash, storage),
    false,
  );
  assert.equal(storage.getItem("pending"), newerHash);
  assert.equal(scope.isCurrent(newerSave), true);
});

test("conditional JSON clearing removes only the matching receipt payload", () => {
  const storage = new MemoryStorage();
  const newerReceipt = {
    type: "activity_hash_published",
    transactionHash: `0x${"12".repeat(32)}`,
  };
  writeRecoveryJson("activity", newerReceipt, storage);

  assert.equal(
    clearRecoveryJsonIf(
      "activity",
      (value) =>
        (value as { transactionHash?: string })?.transactionHash === hash,
      storage,
    ),
    false,
  );
  assert.deepEqual(
    readRecoveryJson(
      "activity",
      (value): value is typeof newerReceipt =>
        (value as { transactionHash?: string })?.transactionHash ===
        newerReceipt.transactionHash,
      storage,
    ),
    newerReceipt,
  );
  assert.equal(
    clearRecoveryJsonIf(
      "activity",
      (value) =>
        (value as { transactionHash?: string })?.transactionHash ===
        newerReceipt.transactionHash,
      storage,
    ),
    true,
  );
  assert.equal(storage.getItem("activity"), null);
});

test("structured recovery validates data before returning it", () => {
  const storage = new MemoryStorage();
  const validate = (
    value: unknown,
  ): value is { agreementId: string; transactionHash: `0x${string}` } => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.agreementId === "string" &&
      isTransactionHash(candidate.transactionHash)
    );
  };

  assert.equal(
    writeRecoveryJson(
      "pending",
      { agreementId: "12", transactionHash: hash },
      storage,
    ),
    true,
  );
  assert.deepEqual(readRecoveryJson("pending", validate, storage), {
    agreementId: "12",
    transactionHash: hash,
  });

  storage.setItem("pending", "{partial");
  assert.equal(readRecoveryJson("pending", validate, storage), null);
  assert.equal(storage.getItem("pending"), null);
});

test("blocked browser storage never interrupts transaction recovery", () => {
  const blocked: BrowserRecoveryStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(readRecoveryValue("pending", blocked), null);
  assert.equal(writeRecoveryValue("pending", hash, blocked), false);
  assert.equal(clearRecoveryValue("pending", blocked), false);
  assert.equal(readRecoveryTransaction("pending", blocked), null);
  assert.equal(writeRecoveryJson("pending", { transactionHash: hash }, blocked), false);
});

test("browser storage discovery fails closed when storage getters are blocked", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperties(
      {},
      {
        localStorage: {
          get() {
            throw new Error("local storage blocked");
          },
        },
        sessionStorage: {
          get() {
            throw new Error("session storage blocked");
          },
        },
      },
    ),
  });
  try {
    assert.equal(getBrowserRecoveryStorage("local"), null);
    assert.equal(getBrowserRecoveryStorage("session"), null);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("history replacement reports failure without interrupting recovery controls", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        replaceState() {
          throw new Error("history unavailable");
        },
      },
    },
  });
  try {
    assert.equal(replaceRecoveryUrl("https://openescrow.example/"), false);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
