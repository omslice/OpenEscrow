export type BrowserRecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type BrowserRecoveryStorageKind = "local" | "session";

export function getBrowserRecoveryStorage(
  kind: BrowserRecoveryStorageKind = "local",
): BrowserRecoveryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function browserStorage(
  storage?: BrowserRecoveryStorage,
): BrowserRecoveryStorage | null {
  if (storage) return storage;
  return getBrowserRecoveryStorage();
}

export function readRecoveryValue(
  key: string,
  storage?: BrowserRecoveryStorage,
) {
  try {
    return browserStorage(storage)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRecoveryValue(
  key: string,
  value: string,
  storage?: BrowserRecoveryStorage,
) {
  try {
    const target = browserStorage(storage);
    if (!target) return false;
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function clearRecoveryValue(
  key: string,
  storage?: BrowserRecoveryStorage,
) {
  try {
    const target = browserStorage(storage);
    if (!target) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearRecoveryValueIfMatches(
  key: string,
  expectedValue: string,
  storage?: BrowserRecoveryStorage,
) {
  try {
    const target = browserStorage(storage);
    if (!target || target.getItem(key) !== expectedValue) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearRecoveryJsonIf(
  key: string,
  matches: (value: unknown) => boolean,
  storage?: BrowserRecoveryStorage,
) {
  try {
    const target = browserStorage(storage);
    const stored = target?.getItem(key);
    if (!target || stored === null) return false;
    const parsed: unknown = JSON.parse(stored);
    if (!matches(parsed)) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function replaceRecoveryUrl(
  url: string | URL,
  state: unknown = null,
) {
  if (typeof window === "undefined") return false;
  try {
    window.history.replaceState(state, "", url.toString());
    return true;
  } catch {
    return false;
  }
}

export function isTransactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function readRecoveryTransaction(
  key: string,
  storage?: BrowserRecoveryStorage,
) {
  const stored = readRecoveryValue(key, storage);
  if (isTransactionHash(stored)) return stored;
  if (stored !== null) clearRecoveryValue(key, storage);
  return null;
}

export function readRecoveryJson<T>(
  key: string,
  validate: (value: unknown) => value is T,
  storage?: BrowserRecoveryStorage,
): T | null {
  const stored = readRecoveryValue(key, storage);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (validate(parsed)) return parsed;
  } catch {
    // Corrupt or partial recovery data is removed below.
  }
  clearRecoveryValue(key, storage);
  return null;
}

export function writeRecoveryJson(
  key: string,
  value: unknown,
  storage?: BrowserRecoveryStorage,
) {
  try {
    return writeRecoveryValue(key, JSON.stringify(value), storage);
  } catch {
    return false;
  }
}
