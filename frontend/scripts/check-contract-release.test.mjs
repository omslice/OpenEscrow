import assert from "node:assert/strict";
import test from "node:test";
import {
  bytecodeSha256,
  canonicalJson,
  EVM_RUNTIME_LIMIT_BYTES,
  MIN_RUNTIME_MARGIN_BYTES,
  parseForgeJson,
  runtimeMetrics,
  summarizeForgeTests,
  validateDependencyLock,
} from "./check-contract-release.mjs";

test("contract assurance accepts a Foundry warning before an intact JSON report", () => {
  assert.deepEqual(
    parseForgeJson('Missing dependencies found. Installing now...\n{"ok":true}', "report"),
    { ok: true },
  );
  assert.throws(
    () => parseForgeJson("warning {broken", "report"),
    /was not valid JSON/,
  );
});

test("contract assurance canonicalizes object keys without reordering ABI entries", () => {
  const first = [{ name: "f", inputs: [{ type: "uint256", name: "id" }] }];
  const equivalent = [{ inputs: [{ name: "id", type: "uint256" }], name: "f" }];
  const reordered = [
    { name: "g", inputs: [] },
    { name: "f", inputs: [{ type: "uint256", name: "id" }] },
  ];
  assert.equal(canonicalJson(first), canonicalJson(equivalent));
  assert.notEqual(canonicalJson(first), canonicalJson(reordered));
});

test("contract assurance enforces a deployment-size safety margin", () => {
  const safeBytes = EVM_RUNTIME_LIMIT_BYTES - MIN_RUNTIME_MARGIN_BYTES;
  const safe = runtimeMetrics(`0x${"11".repeat(safeBytes)}`);
  assert.equal(safe.runtimeBytes, safeBytes);
  assert.equal(safe.marginBytes, MIN_RUNTIME_MARGIN_BYTES);
  assert.match(safe.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.throws(
    () => runtimeMetrics(`0x${"11".repeat(safeBytes + 1)}`),
    /EVM size margin/,
  );
  assert.throws(() => runtimeMetrics("0x123"), /missing or malformed/);
  assert.throws(() => bytecodeSha256("0xzz", "Creation bytecode"), /Creation bytecode/);
});

test("contract assurance summarizes Foundry JSON and fails on a mutant failure", () => {
  const passing = summarizeForgeTests({
    "test/A.t.sol:A": {
      test_results: {
        "test_one()": { status: "Success" },
        "test_optional()": { status: "Skipped" },
      },
    },
  });
  assert.deepEqual(passing, {
    suites: 1,
    total: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
  });
  assert.throws(
    () =>
      summarizeForgeTests({
        "test/A.t.sol:A": {
          test_results: { "test_mutant()": { status: "Failure" } },
        },
      }),
    /failed=1/,
  );
});

test("contract assurance rejects a dependency tree that differs from its reviewed lock", () => {
  const actual = {
    path: "lib/example",
    gitlink: "a".repeat(40),
    sha256: `sha256:${"b".repeat(64)}`,
    fileCount: 10,
    totalBytes: 100,
  };
  assert.doesNotThrow(() => validateDependencyLock(actual, { ...actual }));
  assert.throws(
    () => validateDependencyLock(actual, { ...actual, fileCount: 9 }),
    /fileCount does not match/,
  );
  assert.throws(
    () => validateDependencyLock(actual, undefined),
    /gitlink does not match/,
  );
});
