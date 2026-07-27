const baseUrl = (
  process.argv[2] ||
  process.env.OPENESCROW_BASE_URL ||
  "https://openescrow-demo.omrigross.chatgpt.site/"
).replace(/\/+$/, "");

const response = await fetch(`${baseUrl}/api/system/readiness`, {
  headers: { accept: "application/json" },
});
if (!response.ok) {
  throw new Error(
    `OpenEscrow readiness check failed with HTTP ${response.status}.`,
  );
}

const readiness = await response.json();

function minutesLabel(minutes) {
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

const checks = [
  {
    label: "Automatic email provider",
    ready: readiness.email?.configured === true,
    detail: readiness.email?.provider || "not configured",
    required: true,
  },
  {
    label: "Hosted notification scheduler",
    ready: readiness.email?.schedulerHealthy === true,
    detail: readiness.email?.schedulerLastRunAt
      ? `last ran ${readiness.email.schedulerLastRunAt} (${minutesLabel(readiness.email.schedulerAgeMinutes)} ago)`
      : "no hosted run recorded",
    required: true,
  },
  {
    label: "Private evidence storage",
    ready: readiness.evidence?.configured === true,
    detail: readiness.evidence?.mode || "not configured",
    required: true,
  },
  {
    label: "Evidence encryption at rest",
    ready: readiness.evidence?.encryptedAtRest === true,
    detail: readiness.evidence?.encryptedAtRest
      ? "enabled"
      : "master key not configured",
    required: true,
  },
  {
    label: "Evidence file-content validation",
    ready: readiness.evidence?.contentTypeValidation === true,
    detail: readiness.evidence?.contentTypeValidation
      ? "PDF and image signatures enforced"
      : "not enabled",
    required: true,
  },
  {
    label: "Agreement lifecycle state guards",
    ready: readiness.recordIntegrity?.lifecycleStateGuards === true,
    detail: readiness.recordIntegrity?.lifecycleStateGuards
      ? "enabled"
      : "not enabled",
    required: true,
  },
  {
    label: "Onchain transaction receipt verification",
    ready:
      readiness.recordIntegrity?.transactionReceiptVerification === true,
    detail: readiness.recordIntegrity?.transactionReceiptVerification
      ? `enabled for ${readiness.recordIntegrity?.chain || "the configured chain"}`
      : "not enabled",
    required: true,
  },
  {
    label: "Version-matched onchain record registry",
    ready: readiness.recordIntegrity?.activityRegistry?.ready === true,
    detail: readiness.recordIntegrity?.activityRegistry?.ready
      ? `bound to ${readiness.recordIntegrity.activityRegistry.expectedEscrowAddress}`
      : readiness.recordIntegrity?.activityRegistry?.error ||
        "registry binding not verified",
    required: true,
  },
  {
    label: "Server-attested property addresses",
    ready: readiness.addressValidation?.configured === true,
    detail: readiness.addressValidation?.configured
      ? `${readiness.addressValidation.provider} responses are signed`
      : "ADDRESS_ATTESTATION_SECRET is not configured",
    required: true,
  },
  {
    label: "Official compliance source release gate",
    ready: readiness.complianceSources?.ready === true,
    detail: readiness.complianceSources?.ready
      ? `${readiness.complianceSources.tracked}/${readiness.complianceSources.total} sources verified`
      : `${readiness.complianceSources?.blocked ?? "unknown"} source checks block new compliance profiles` +
        (readiness.complianceSources?.lastRunAt
          ? ` (${minutesLabel(readiness.complianceSources.maxVerificationAgeDays * 24 * 60)} max source age)`
          : ""),
    required: true,
  },
  {
    label: "Compliance source monitor freshness",
    ready:
      readiness.complianceSources?.monitorHealthy === true &&
      readiness.complianceSources?.configured === true,
    detail: readiness.complianceSources?.configured
      ? readiness.complianceSources?.monitorLastRunAgeMinutes == null
        ? `monitor ${readiness.complianceSources?.monitorExpectedIntervalMinutes ? `target interval ${readiness.complianceSources?.monitorExpectedIntervalMinutes}m` : "has not run"}`
        : `last monitor run ${minutesLabel(readiness.complianceSources.monitorLastRunAgeMinutes)} ago`
      : "monitor not enabled",
    required: true,
  },
  {
    label: "Encrypted decentralized evidence",
    ready: readiness.evidence?.decentralizedReady === true,
    detail: readiness.evidence?.decentralizedReady
      ? "available"
      : "optional pilot experiment not configured",
    required: false,
  },
];

console.log(`OpenEscrow pilot readiness: ${baseUrl}`);
for (const check of checks) {
  const marker = check.ready ? "PASS" : check.required ? "ACTION" : "OPTIONAL";
  console.log(`${marker.padEnd(8)} ${check.label}: ${check.detail}`);
}

if (checks.some((check) => check.required && !check.ready)) {
  process.exitCode = 1;
} else {
  console.log("READY    External pilot services are configured.");
}
