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
const checks = [
  {
    label: "Automatic email provider",
    ready: readiness.email?.configured === true,
    detail: readiness.email?.provider || "not configured",
    required: true,
  },
  {
    label: "Hosted notification scheduler",
    ready: Boolean(readiness.email?.schedulerLastRunAt),
    detail: readiness.email?.schedulerLastRunAt
      ? `last ran ${readiness.email.schedulerLastRunAt}`
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
