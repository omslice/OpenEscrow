import assert from "node:assert/strict";
import test from "node:test";
import { complianceSourceStatusMessage } from "./complianceSourceStatus.ts";

const source = {
  citation: "Official source",
  url: "https://example.gov/rules",
  lastCheckedAt: "2026-07-30T00:00:00.000Z",
  lastVerifiedAt: "2026-07-30T00:00:00.000Z",
  requiresReview: false,
} as const;

test("compliance source messages never claim changed rules were automatically adopted", () => {
  assert.match(
    complianceSourceStatusMessage({ ...source, status: "unchanged" }),
    /matches the reviewed profile baseline/i,
  );
  assert.match(
    complianceSourceStatusMessage({
      ...source,
      status: "changed",
      requiresReview: true,
    }),
    /will not rewrite.*automatically/i,
  );
  assert.match(
    complianceSourceStatusMessage({ ...source, status: "unreachable" }),
    /recorded profile remains unchanged/i,
  );
});
