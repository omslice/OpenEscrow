import assert from "node:assert/strict";
import test from "node:test";
import {
  validateExternalComplianceAttestation,
  validateExternalComplianceMonitor,
} from "../shared/external-compliance-monitor.js";

const sourceItem = {
  key: "state:nh",
  version: "nh-rules-2026-08-09.v12",
  url: "https://gc.nh.gov/rsa/html/lv/540-a/540-a-mrg.htm",
  externalMonitor: {
    kind: "github-source-attestation",
    url: "https://raw.githubusercontent.com/omslice/OpenEscrow/compliance-attestations/state-nh.json",
    expectedBodySha256: "a".repeat(64),
    maximumAgeMs: 48 * 60 * 60 * 1000,
    requiredMarkers: ["CHAPTER 540-A", "540-A:7 Return of Security Deposit"],
  },
};

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceKey: sourceItem.key,
    profileVersion: sourceItem.version,
    sourceUrl: sourceItem.url,
    finalUrl: sourceItem.url,
    checkedAt: "2026-08-09T12:00:00.000Z",
    status: "unchanged",
    httpStatus: 200,
    bodySha256: "a".repeat(64),
    markerChecks: sourceItem.externalMonitor.requiredMarkers.map((marker) => ({ marker, present: true })),
    ...overrides,
  };
}

test("external monitor configuration is strict and normalized", () => {
  assert.deepEqual(validateExternalComplianceMonitor(sourceItem), {
    url: sourceItem.externalMonitor.url,
    expectedBodySha256: "a".repeat(64),
    maximumAgeMs: 48 * 60 * 60 * 1000,
    requiredMarkers: sourceItem.externalMonitor.requiredMarkers,
  });
  assert.throws(
    () => validateExternalComplianceMonitor({ ...sourceItem, externalMonitor: { ...sourceItem.externalMonitor, url: "http://example.test" } }),
    /misconfigured/,
  );
});
test("a fresh matching attestation verifies the registered official source", () => {
  assert.deepEqual(
    validateExternalComplianceAttestation(payload(), sourceItem, new Date("2026-08-09T13:00:00.000Z")),
    {
      checkedAt: "2026-08-09T12:00:00.000Z",
      httpStatus: 200,
      bodySha256: "a".repeat(64),
      status: "unchanged",
    },
  );
});

test("changed content must be explicitly attested as changed", () => {
  const changed = payload({ bodySha256: "b".repeat(64), status: "changed" });
  assert.equal(
    validateExternalComplianceAttestation(changed, sourceItem, new Date("2026-08-09T13:00:00.000Z")).status,
    "changed",
  );
  assert.throws(
    () => validateExternalComplianceAttestation({ ...changed, status: "unchanged" }, sourceItem, new Date("2026-08-09T13:00:00.000Z")),
    /status does not match/,
  );
});

test("stale, mismatched, or structurally incomplete attestations fail closed", () => {
  const now = new Date("2026-08-12T13:00:00.000Z");
  assert.throws(() => validateExternalComplianceAttestation(payload(), sourceItem, now), /stale/);
  assert.throws(
    () => validateExternalComplianceAttestation(payload({ sourceKey: "state:ny" }), sourceItem, new Date("2026-08-09T13:00:00.000Z")),
    /does not match/,
  );
  assert.throws(
    () => validateExternalComplianceAttestation(payload({ markerChecks: [] }), sourceItem, new Date("2026-08-09T13:00:00.000Z")),
    /did not verify/,
  );
});
