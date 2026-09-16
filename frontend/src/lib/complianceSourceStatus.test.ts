import assert from "node:assert/strict";
import test from "node:test";
import { syntheticStateProfile } from "../../scripts/fixtures/automatic-state-profile.mjs";
import { jurisdictionProfile, jurisdictionProfileForTerms, requirementSourceQuotes, type ComplianceSnapshot, type USJurisdictionProfile } from "./jurisdictions.ts";
import {
  checkComplianceSourceStatus,
  complianceSourceStatusMessage,
  complianceSourceStatusSummary,
  type ComplianceSourceStatus,
} from "./complianceSourceStatus.ts";

const source = {
  key: "state:ca",
  scope: "state",
  jurisdiction: "us-ca",
  citation: "Official source",
  url: "https://example.gov/rules",
  lastCheckedAt: "2026-07-30T00:00:00.000Z",
  lastVerifiedAt: "2026-07-30T00:00:00.000Z",
  requiresReview: false,
  monitoringException: null,
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
    /does not by itself establish.*legal requirement changed/i,
  );
  assert.match(
    complianceSourceStatusMessage({ ...source, status: "unreachable" }),
    /recorded profile remains unchanged/i,
  );
  const manuallyReviewed = {
    ...source,
    status: "manual-review-current",
    lastCheckedAt: "2026-08-08T14:00:00.000Z",
    lastVerifiedAt: null,
    monitoringException: {
      kind: "reviewed-origin-incompatibility",
      reviewedAt: "2026-08-08T13:30:24.766Z",
      expiresAt: "2026-08-29T13:30:24.766Z",
      note: "The official website blocks automated checks.",
    },
  } as const;
  assert.match(
    complianceSourceStatusMessage(manuallyReviewed),
    /reviewed.*manually/i,
  );
  assert.match(
    complianceSourceStatusSummary([manuallyReviewed]),
    /time-limited manual review/i,
  );
  assert.match(
    complianceSourceStatusSummary([
      { ...source, status: "unchanged" },
      {
        ...source,
        key: "overlay:federal-example:1",
        status: "unchanged",
      },
    ]),
    /all 2 official sources match/i,
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
    overlays: [],
    source: { ...source, status: "unchanged" },
    sources: [{ ...source, status: "unchanged" }],
    immutableSnapshotNotice: "Finalized agreements keep their recorded snapshot.",
  };
  globalThis.fetch = async () => Response.json(result);

  try {
    assert.deepEqual(
      await checkComplianceSourceStatus("us-ca", "ca-reviewed-1", [expectedSource]),
      result,
    );

    result = { ...result, jurisdiction: "us-ny" };
    await assert.rejects(
      checkComplianceSourceStatus("us-ca", "ca-reviewed-1", [expectedSource]),
      /could not verify.*selected compliance profile/i,
    );

    result = {
      ...result,
      jurisdiction: "us-ca",
      source: { ...result.source, url: "https://example.gov/different-rules" },
      sources: [
        { ...result.sources[0], url: "https://example.gov/different-rules" },
      ],
    };
    await assert.rejects(
      checkComplianceSourceStatus("us-ca", "ca-reviewed-1", [expectedSource]),
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
      {
        ...source,
        status: "manual-review-current",
        lastVerifiedAt: null,
        monitoringException: null,
      },
    ] as const;
    for (const inconsistentSource of inconsistentSources) {
      result = {
        ...result,
        jurisdiction: "us-ca",
        source: inconsistentSource,
        sources: [inconsistentSource],
      } as ComplianceSourceStatus;
      await assert.rejects(
        checkComplianceSourceStatus("us-ca", "ca-reviewed-1", [expectedSource]),
        /could not verify.*selected compliance profile/i,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("automatic state profiles survive reload, bind to their jurisdiction and evidence, and reject tampering", async () => {
  const originalFetch = globalThis.fetch;
  const base = jurisdictionProfile("us-ca")!;
  const profile = await syntheticStateProfile(base) as USJurisdictionProfile;
  const entry = { ...source, citation: base.statuteCitation, url: base.statuteUrl, status: "unchanged" as const,
    lastCheckedAt: "2026-09-16T20:05:00.000Z", lastVerifiedAt: "2026-09-16T20:00:00.000Z" };
  let result: ComplianceSourceStatus = {
    jurisdiction: base.code, profileVersion: base.version, overlays: [], source: entry, sources: [entry],
    immutableSnapshotNotice: "Finalized agreements retain their snapshot.", automaticUpdatesEnabled: true,
    automaticUpdate: { profile, changes: ["Synthetic test update"] },
  };
  const check = () => checkComplianceSourceStatus(base.code, base.version, [entry]);
  globalThis.fetch = async () => Response.json(result);
  try {
    assert.deepEqual((await check()).automaticUpdate?.profile, profile);
    const terms = { jurisdiction: base.code, policyVersion: profile.version,
      complianceSnapshot: { sourceUpdate: profile.sourceUpdate } as ComplianceSnapshot };
    assert.deepEqual(jurisdictionProfileForTerms(terms), profile);
    assert.equal(jurisdictionProfileForTerms({ ...terms, jurisdiction: "us-ny" }), null);
    assert.match(requirementSourceQuotes(profile)[0].quote, /Synthetic fixture/);
    for (const mutate of [
      (value: USJurisdictionProfile) => { value.requirements = ["Forged requirement"]; },
      (value: USJurisdictionProfile) => { value.version = "ca-auto-v2-000000000000000000000000"; },
      (value: USJurisdictionProfile) => { value.sourceUpdate!.sourceDigest = "0".repeat(64); },
      (value: USJurisdictionProfile) => { value.sourceUpdate!.sourceUrl = "https://unregistered.example/rules"; },
      (value: USJurisdictionProfile) => { value.sourceUpdate!.generatedAt = "2027-01-01T00:00:00.000Z"; },
    ]) {
      const altered = structuredClone(profile);
      mutate(altered);
      result = { ...result, automaticUpdate: { profile: altered, changes: [] } };
      await assert.rejects(check(), /could not verify.*selected compliance profile/i);
    }
  } finally { globalThis.fetch = originalFetch; }
});
