import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceReadiness } from "./negotiations";
import {
  formatComplianceIssueSummary,
  getServiceReadinessBlockers,
  getServiceReadinessActions,
  summarizeServiceReadiness,
} from "./serviceReadiness.ts";

const baseReadiness = (): ServiceReadiness => ({
  email: {
    configured: true,
    provider: "resend",
    schedulerConfigured: true,
    schedulerLastRunAt: "2026-07-26T00:00:00.000Z",
    schedulerHealthy: true,
    schedulerExpectedIntervalMinutes: 15,
    schedulerAgeMinutes: 1,
  },
  evidence: {
    configured: true,
    mode: "private-r2",
    encryptedAtRest: true,
    decentralizedReady: false,
  },
  recordIntegrity: {
    lifecycleStateGuards: true,
    transactionReceiptVerification: true,
    chain: "Base Sepolia",
    activityRegistry: {
      configured: true,
      verificationEnabled: true,
      ready: true,
      registryAddress: "0xRegistry",
      expectedEscrowAddress: "0xEscrow",
      boundEscrowAddress: "0xEscrow",
      checkedAt: "2026-07-26T00:00:00.000Z",
      error: null,
    },
  },
  addressValidation: {
    configured: true,
    provider: "Photon / OpenStreetMap",
    tamperResistantProfiles: true,
  },
  complianceSources: {
    configured: true,
    proposalGateEnforced: true,
    total: 60,
    tracked: 60,
    changed: 0,
    unreachable: 0,
    pending: 0,
    stale: 0,
    blocked: 0,
    lastRunAt: "2026-07-26T00:00:00.000Z",
    monitorHealthy: true,
    monitorExpectedIntervalMinutes: 1440,
    monitorLastRunAgeMinutes: 10,
    maxVerificationAgeDays: 1,
    ready: true,
  },
});

test("summarizeServiceReadiness reports ready state when no blockers exist", () => {
  const summary = summarizeServiceReadiness(baseReadiness());
  assert.equal(summary.ready, true);
  assert.equal(summary.issueCount, 0);
  assert.deepEqual(summary.blockers, []);
});

test("summarizeServiceReadiness aggregates readiness blockers", () => {
  const degraded = baseReadiness();
  degraded.email.configured = false;
  degraded.evidence.encryptedAtRest = false;
  degraded.recordIntegrity.activityRegistry.ready = false;
  degraded.addressValidation.configured = false;
  degraded.complianceSources.ready = false;
  degraded.complianceSources.changed = 2;
  degraded.complianceSources.stale = 1;
  degraded.complianceSources.unreachable = 0;
  degraded.complianceSources.blocked = 3;

  const summary = summarizeServiceReadiness(degraded);
  assert.equal(summary.ready, false);
  assert.equal(summary.issueCount, 5);
  assert.match(summary.blockers[0], /Configure an automatic email provider/);
  assert.match(summary.blockers[1], /Set the evidence encryption key/);
  assert.match(summary.blockers[2], /Verify the onchain activity registry binding/);
  assert.match(summary.blockers[3], /Configure address attestation/);
  assert.match(summary.blockers[4], /Resolve compliance source monitoring alerts/);
});

test("formatComplianceIssueSummary uses all source counters", () => {
  const compliance = baseReadiness().complianceSources;
  compliance.pending = 1;
  compliance.changed = 2;
  compliance.unreachable = 3;
  compliance.stale = 4;
  compliance.blocked = 5;
  assert.equal(
    formatComplianceIssueSummary(compliance),
    "1 pending, 2 changed, 3 unreachable, 4 stale, 5 blocked.",
  );
});

test("getServiceReadinessBlockers returns no issues when readiness is null", () => {
  assert.deepEqual(getServiceReadinessBlockers(null), []);
});

test("getServiceReadinessActions returns remediation guidance", () => {
  const degraded = baseReadiness();
  degraded.email.configured = false;
  degraded.email.schedulerHealthy = false;
  degraded.evidence.encryptedAtRest = false;
  degraded.recordIntegrity.activityRegistry.ready = false;
  degraded.addressValidation.configured = false;
  degraded.complianceSources.ready = false;
  const actions = getServiceReadinessActions(degraded);
  assert.equal(actions.length, 6);
  const labels = actions.map((action) => action.label);
  assert(labels.includes("Configure mail delivery"));
  assert(labels.includes("Stabilize scheduler cadence"));
  assert(labels.includes("Rotate encrypted evidence key"));
  assert(labels.includes("Verify registry binding"));
  assert(labels.includes("Enable address attestation"));
  assert(labels.includes("Unblock compliance monitor"));
  assert.match(
    actions.find((action) => action.label === "Configure mail delivery")?.detail ?? "",
    /RESEND_API_KEY|EMAIL_WEBHOOK/,
  );
});

test("getServiceReadinessActions returns no actions when readiness is null", () => {
  assert.deepEqual(getServiceReadinessActions(null), []);
});
