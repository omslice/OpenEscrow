function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertCloudflareDeployedReadiness(
  readiness,
  { requirePilotServices = false } = {},
) {
  assert(
    readiness.evidence?.configured === true &&
      readiness.evidence?.mode === "private-r2",
    "Cloudflare EVIDENCE is not bound to private R2.",
  );
  assert(
    readiness.evidence?.encryptedAtRest === true &&
      readiness.evidence?.keyringReady === true,
    "Cloudflare evidence encryption and key recovery are not ready.",
  );
  assert(
    readiness.addressValidation?.configured === true,
    "Address attestation is not configured.",
  );
  assert(
    readiness.recordIntegrity?.transactionReceiptVerification === true,
    "Onchain receipt verification is not enabled.",
  );
  assert(
    readiness.recordIntegrity?.activityRegistry?.configured === true &&
      readiness.recordIntegrity?.activityRegistry?.verificationEnabled === true,
    "The activity registry verification boundary is not configured.",
  );
  assert(
    readiness.complianceSources?.configured === true,
    "The compliance source monitor is not enabled.",
  );

  if (!requirePilotServices) return;

  assert(readiness.email?.configured === true, "Notification delivery is not configured.");
  assert(
    readiness.email?.schedulerConfigured === true &&
      readiness.email?.schedulerHealthy === true,
    "The notification scheduler is not healthy.",
  );
  assert(
    readiness.recordIntegrity?.activityRegistry?.ready === true,
    "The activity registry is not bound to the active escrow release.",
  );
  assert(
    readiness.complianceSources?.ready === true,
    "The compliance source baseline is not ready for a supervised pilot.",
  );
}
