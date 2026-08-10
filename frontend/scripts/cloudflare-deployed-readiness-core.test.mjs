import assert from "node:assert/strict";
import test from "node:test";
import { assertCloudflareDeployedReadiness } from "./cloudflare-deployed-readiness-core.mjs";

function readinessFixture() {
  return {
    email: {
      configured: false,
      participantDeliveryReady: false,
      deliveryStatusConfigured: false,
      schedulerConfigured: true,
      schedulerHealthy: true,
    },
    evidence: {
      configured: true,
      mode: "private-r2",
      encryptedAtRest: true,
      keyringReady: true,
    },
    addressValidation: { configured: true },
    recordIntegrity: {
      transactionReceiptVerification: true,
      activityRegistry: {
        configured: true,
        verificationEnabled: true,
        ready: false,
      },
      activityIndexer: {
        configured: true,
        healthy: false,
      },
    },
    complianceSources: {
      configured: true,
      ready: false,
    },
  };
}

test("core deployment verification distinguishes a published release from pilot readiness", () => {
  assert.doesNotThrow(() => assertCloudflareDeployedReadiness(readinessFixture()));
});

test("core deployment verification still requires every configured safety boundary", () => {
  const readiness = readinessFixture();
  readiness.recordIntegrity.activityRegistry.verificationEnabled = false;
  assert.throws(
    () => assertCloudflareDeployedReadiness(readiness),
    /activity registry verification boundary/i,
  );
});

test("strict pilot verification requires notification, scheduler, registry, indexer, and compliance readiness", () => {
  const readiness = readinessFixture();
  assert.throws(
    () =>
      assertCloudflareDeployedReadiness(readiness, {
        requirePilotServices: true,
      }),
    (error) => {
      assert.match(error.message, /4 blockers/i);
      assert.match(error.message, /notification delivery/i);
      assert.match(error.message, /not bound/i);
      assert.match(error.message, /activity indexer/i);
      assert.match(error.message, /compliance source baseline/i);
      return true;
    },
  );

  readiness.email.configured = true;
  assert.throws(
    () =>
      assertCloudflareDeployedReadiness(readiness, {
        requirePilotServices: true,
      }),
    /provider account/i,
  );
  readiness.email.participantDeliveryReady = true;
  readiness.email.deliveryStatusConfigured = true;
  readiness.email.schedulerHealthy = false;
  assert.throws(
    () =>
      assertCloudflareDeployedReadiness(readiness, {
        requirePilotServices: true,
      }),
    /scheduler/i,
  );

  readiness.email.schedulerHealthy = true;
  assert.throws(
    () =>
      assertCloudflareDeployedReadiness(readiness, {
        requirePilotServices: true,
      }),
    /not bound/i,
  );

  readiness.recordIntegrity.activityRegistry.ready = true;
  readiness.recordIntegrity.activityIndexer.healthy = true;
  assert.throws(
    () =>
      assertCloudflareDeployedReadiness(readiness, {
        requirePilotServices: true,
      }),
    /compliance source baseline/i,
  );

  readiness.complianceSources.ready = true;
  assert.doesNotThrow(() =>
    assertCloudflareDeployedReadiness(readiness, {
      requirePilotServices: true,
    }),
  );
});
