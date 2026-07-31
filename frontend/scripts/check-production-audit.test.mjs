import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProductionAudit } from "./check-production-audit.mjs";

const advisory = "GHSA-w5hq-g745-h8pq";
const report = {
  auditReportVersion: 2,
  vulnerabilities: {
    uuid: {
      severity: "moderate",
      via: [
        {
          name: "uuid",
          url: `https://github.com/advisories/${advisory}`,
        },
      ],
    },
    wallet: {
      severity: "moderate",
      via: ["uuid"],
    },
  },
  metadata: {
    vulnerabilities: {
      total: 2,
      moderate: 2,
      high: 0,
      critical: 0,
    },
  },
};

const policy = {
  schemaVersion: "openescrow-npm-audit-policy/v1",
  exceptions: [
    {
      advisory,
      package: "uuid",
      reviewedVersions: ["8.3.2", "9.0.1"],
      severity: "moderate",
      expiresOn: "2026-08-30",
      scope: "Testnet only",
      rationale: "No affected API call; upstream fix is breaking.",
    },
  ],
};

test("accepts a clean audit with no policy exceptions", () => {
  assert.deepEqual(
    evaluateProductionAudit(
      {
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: {
            total: 0,
            moderate: 0,
            high: 0,
            critical: 0,
          },
        },
      },
      {
        schemaVersion: "openescrow-npm-audit-policy/v1",
        exceptions: [],
      },
      new Date("2026-07-31T12:00:00Z"),
    ),
    {
      errors: [],
      summary: {
        total: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        exceptions: 0,
      },
    },
  );
});

test("accepts one traceable, active moderate exception across transitive paths", () => {
  assert.deepEqual(
    evaluateProductionAudit(
      report,
      policy,
      new Date("2026-07-30T12:00:00Z"),
      { uuid: ["8.3.2", "9.0.1"] },
    ),
    {
      errors: [],
      summary: {
        total: 2,
        moderate: 2,
        high: 0,
        critical: 0,
        exceptions: 1,
      },
    },
  );
});

test("rejects an unknown moderate advisory", () => {
  const unknown = structuredClone(report);
  unknown.vulnerabilities.uuid.via[0].url =
    "https://github.com/advisories/GHSA-1111-2222-3333";
  const result = evaluateProductionAudit(
    unknown,
    policy,
    new Date("2026-07-30T12:00:00Z"),
    { uuid: ["8.3.2", "9.0.1"] },
  );
  assert.equal(
    result.errors.some((error) =>
      error.includes("unapproved moderate advisory GHSA-1111-2222-3333"),
    ),
    true,
  );
});

test("rejects an expired exception", () => {
  const result = evaluateProductionAudit(
    report,
    policy,
    new Date("2026-08-31T00:00:00Z"),
    { uuid: ["8.3.2", "9.0.1"] },
  );
  assert.equal(
    result.errors.includes(`${advisory.toUpperCase()} expired on 2026-08-30.`),
    true,
  );
});

test("high and critical vulnerabilities cannot be allowlisted", () => {
  const severe = structuredClone(report);
  severe.vulnerabilities.uuid.severity = "high";
  severe.metadata.vulnerabilities.moderate = 1;
  severe.metadata.vulnerabilities.high = 1;
  const result = evaluateProductionAudit(
    severe,
    policy,
    new Date("2026-07-30T12:00:00Z"),
    { uuid: ["8.3.2", "9.0.1"] },
  );
  assert.equal(
    result.errors.includes("uuid has an unallowable high vulnerability."),
    true,
  );
});

test("rejects a vulnerable package version outside the reviewed lock state", () => {
  const result = evaluateProductionAudit(
    report,
    policy,
    new Date("2026-07-30T12:00:00Z"),
    { uuid: ["8.3.2", "10.0.0"] },
  );
  assert.equal(
    result.errors.includes(
      `${advisory.toUpperCase()} has unreviewed uuid version 10.0.0.`,
    ),
    true,
  );
  assert.equal(
    result.errors.includes(
      `${advisory.toUpperCase()} policy version 9.0.1 is no longer installed and must be reviewed.`,
    ),
    true,
  );
});
