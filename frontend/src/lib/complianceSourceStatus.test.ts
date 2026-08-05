import assert from "node:assert/strict";
import test from "node:test";
import {
  checkComplianceSourceStatus,
  complianceSourceStatusMessage,
  type ComplianceSourceStatus,
} from "./complianceSourceStatus.ts";

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

test("source check responses must match the requested profile and official source", async () => {
  const originalFetch = globalThis.fetch;
  const expectedSource = {
    citation: "Official source",
    url: "https://example.gov/rules",
  };
  let result: ComplianceSourceStatus = {
    jurisdiction: "us-ca",
    profileVersion: "ca-reviewed-1",
    source: { ...source, status: "unchanged" },
    immutableSnapshotNotice: "Finalized agreements keep their recorded snapshot.",
  };
  globalThis.fetch = async () => Response.json(result);

  try {
    assert.deepEqual(
      await checkComplianceSourceStatus("us-ca", "ca-reviewed-1", expectedSource),
      result,
    );

    result = { ...result, jurisdiction: "us-ny" };
    await assert.rejects(
      checkComplianceSourceStatus("us-ca", "ca-reviewed-1", expectedSource),
      /could not verify.*selected compliance profile/i,
    );

    result = {
      ...result,
      jurisdiction: "us-ca",
      source: { ...result.source, url: "https://example.gov/different-rules" },
    };
    await assert.rejects(
      checkComplianceSourceStatus("us-ca", "ca-reviewed-1", expectedSource),
      /could not verify.*selected compliance profile/i,
    );

    const inconsistentSources = [
      {
        ...source,
        status: "changed",
        requiresReview: false,
      },
      {
        ...source,
        status: "unchanged",
        requiresReview: true,
      },
      {
        ...source,
        status: "unchanged",
        lastCheckedAt: "2026-02-30T00:00:00.000Z",
      },
      {
        ...source,
        status: "changed",
        requiresReview: true,
        lastCheckedAt: "2026-07-29T00:00:00.000Z",
        lastVerifiedAt: "2026-07-30T00:00:00.000Z",
      },
      {
        ...source,
        status: "unreachable",
        requiresReview: true,
        lastCheckedAt: null,
      },
      {
        ...source,
        status: "pending",
        requiresReview: true,
        lastCheckedAt: null,
      },
    ] as const;
    for (const inconsistentSource of inconsistentSources) {
      result = {
        ...result,
        jurisdiction: "us-ca",
        source: inconsistentSource,
      } as ComplianceSourceStatus;
      await assert.rejects(
        checkComplianceSourceStatus("us-ca", "ca-reviewed-1", expectedSource),
        /could not verify.*selected compliance profile/i,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
