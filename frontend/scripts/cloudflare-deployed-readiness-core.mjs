function collectFailure(failures, condition, message) {
  if (!condition) failures.push(message);
}

export function assertCloudflareDeployedReadiness(
  readiness,
  { requirePilotServices = false } = {},
) {
  const failures = [];

  collectFailure(
    failures,
    readiness.evidence?.configured === true &&
      readiness.evidence?.mode === "private-r2",
    "Cloudflare EVIDENCE is not bound to private R2.",
  );
  collectFailure(
    failures,
    readiness.evidence?.encryptedAtRest === true &&
      readiness.evidence?.keyringReady === true,
    "Cloudflare evidence encryption and key recovery are not ready.",
  );
  collectFailure(
    failures,
    readiness.addressValidation?.configured === true,
    "Address attestation is not configured.",
  );
  collectFailure(
    failures,
    readiness.recordIntegrity?.transactionReceiptVerification === true,
    "Onchain receipt verification is not enabled.",
  );
  collectFailure(
    failures,
    readiness.recordIntegrity?.activityRegistry?.configured === true &&
      readiness.recordIntegrity?.activityRegistry?.verificationEnabled === true,
    "The activity registry verification boundary is not configured.",
  );
  collectFailure(
    failures,
    readiness.complianceSources?.configured === true,
    "The compliance source monitor is not enabled.",
  );

  if (requirePilotServices) {
    collectFailure(
      failures,
      readiness.email?.configured === true,
      "Notification delivery is not configured.",
    );
    collectFailure(
      failures,
      readiness.email?.schedulerConfigured === true &&
        readiness.email?.schedulerHealthy === true,
      "The notification scheduler is not healthy.",
    );
    collectFailure(
      failures,
      readiness.recordIntegrity?.activityRegistry?.ready === true,
      "The activity registry is not bound to the active escrow release.",
    );
    collectFailure(
      failures,
      readiness.complianceSources?.ready === true,
      "The compliance source baseline is not ready for a supervised pilot.",
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Cloudflare readiness failed (${failures.length} blocker${
        failures.length === 1 ? "" : "s"
      }):\n- ${failures.join("\n- ")}`,
    );
  }
}
