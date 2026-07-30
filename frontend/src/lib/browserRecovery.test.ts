import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRecoveryValue,
  getBrowserRecoveryStorage,
  isTransactionHash,
  readRecoveryJson,
  readRecoveryTransaction,
  readRecoveryValue,
  writeRecoveryJson,
  writeRecoveryValue,
  type BrowserRecoveryStorage,
} from "./browserRecovery.ts";

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
