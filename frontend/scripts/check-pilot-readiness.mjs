import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildEvidenceEncryptionCheck } from "./pilot-readiness-evidence.mjs";

const PILOT_READINESS_ARTIFACT_SCHEMA_VERSION =
  "openescrow-pilot-readiness/v1";
const RELEASE_PROVENANCE_SCHEMA_VERSION = "openescrow-release/v1";
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json") || args.includes("-j");
const artifactRequested =
  args.includes("--artifact") ||
  args.includes("-a") ||
  args.some((arg) => arg.startsWith("--artifact-dir=")) ||
  args.some((arg) => arg.startsWith("--artifact-path=")) ||
  process.env.PILOT_READINESS_ARTIFACT_DIR;
const artifactDirArg = args.find((arg) => arg.startsWith("--artifact-dir="));
const artifactPathArg = args.find((arg) => arg.startsWith("--artifact-path="));
const artifactDir = artifactDirArg
  ? artifactDirArg.slice("--artifact-dir=".length)
  : process.env.PILOT_READINESS_ARTIFACT_DIR || ".pilot-readiness";
const explicitArtifactPath = artifactPathArg
  ? artifactPathArg.slice("--artifact-path=".length)
  : null;
const baseUrlArg = args.find((arg) => arg && !arg.startsWith("-"));
const baseUrl = (baseUrlArg || process.env.OPENESCROW_BASE_URL || "https://openescrow-demo.omrigross.chatgpt.site/").replace(/\/+$/, "");

let readiness = {};
let readinessEndpointError = null;
try {
  const response = await fetch(`${baseUrl}/api/system/readiness`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `OpenEscrow readiness check failed with HTTP ${response.status}.`,
    );
  }
  const parsed = await response.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "OpenEscrow readiness check returned an invalid JSON response.",
    );
  }
  readiness = parsed;
} catch (error) {
  readinessEndpointError =
    error instanceof Error
      ? error.message
      : "OpenEscrow readiness endpoint is unavailable.";
}

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
    label: "Exact deployed release provenance",
    ready:
      readiness.release?.schemaVersion ===
        RELEASE_PROVENANCE_SCHEMA_VERSION &&
      typeof readiness.release?.commitSha === "string" &&
      /^[0-9a-f]{40}$/.test(readiness.release.commitSha),
    detail:
      readiness.release?.schemaVersion ===
        RELEASE_PROVENANCE_SCHEMA_VERSION &&
      typeof readiness.release?.commitSha === "string" &&
      /^[0-9a-f]{40}$/.test(readiness.release.commitSha)
        ? `commit ${readiness.release.commitSha}`
        : "exact packaged source commit is missing or invalid",
    required: true,
    action:
      "Build and publish the candidate through an exact-source OpenEscrow release workflow, then rerun this check.",
    validate:
      "readiness.release.schemaVersion === openescrow-release/v1 and readiness.release.commitSha is a full Git SHA",
  },
  {
    label: "Automatic email provider",
    ready: readiness.email?.configured === true,
    detail: readiness.email?.provider || "not configured",
    required: true,
    action: "Set one of: RESEND_API_KEY OR EMAIL_WEBHOOK_URL + EMAIL_WEBHOOK_TOKEN in runtime env.",
    validate: "readiness.email.configured === true",
  },
  {
    label: "Hosted notification scheduler",
    ready: readiness.email?.schedulerHealthy === true,
    detail: readiness.email?.schedulerLastRunAt
      ? `last ran ${readiness.email.schedulerLastRunAt} (${minutesLabel(readiness.email.schedulerAgeMinutes)} ago)`
      : "no hosted run recorded",
    required: true,
    action:
      "Enable the deployment's `*/15 * * * *` scheduled handler and confirm a successful hosted run.",
    validate:
      "readiness.email.schedulerConfigured === true and readiness.email.schedulerHealthy === true",
  },
  {
    label: "Private evidence storage",
    ready: readiness.evidence?.configured === true,
    detail: readiness.evidence?.mode || "not configured",
    required: true,
    action:
      "Verify private evidence storage binding (R2/S3) exists and read/write credentials are set in deployment.",
    validate: "readiness.evidence.configured === true",
  },
  buildEvidenceEncryptionCheck(readiness.evidence),
  {
    label: "Evidence file-content validation",
    ready: readiness.evidence?.contentTypeValidation === true,
    detail: readiness.evidence?.contentTypeValidation
      ? "PDF and image signatures enforced"
      : "not enabled",
    required: true,
    action: "No action expected; this is managed by code and build.",
    validate: "readiness.evidence.contentTypeValidation === true",
  },
  {
    label: "Agreement lifecycle state guards",
    ready: readiness.recordIntegrity?.lifecycleStateGuards === true,
    detail: readiness.recordIntegrity?.lifecycleStateGuards
      ? "enabled"
      : "not enabled",
    required: true,
    action:
      "No owner action expected; verify deployed build includes latest server commit for lifecycle guard enforcement.",
    validate: "readiness.recordIntegrity.lifecycleStateGuards === true",
  },
  {
    label: "Onchain transaction receipt verification",
    ready:
      readiness.recordIntegrity?.transactionReceiptVerification === true,
    detail: readiness.recordIntegrity?.transactionReceiptVerification
      ? `enabled for ${readiness.recordIntegrity?.chain || "the configured chain"}`
      : "not enabled",
    required: true,
    action:
      "No owner action expected from this rollout; confirm RPC and chain mapping are healthy after deploy.",
    validate:
      "readiness.recordIntegrity.transactionReceiptVerification === true",
  },
  {
    label: "Version-matched onchain record registry",
    ready: readiness.recordIntegrity?.activityRegistry?.ready === true,
    detail: readiness.recordIntegrity?.activityRegistry?.ready
      ? `bound to ${readiness.recordIntegrity.activityRegistry.expectedEscrowAddress}`
      : readiness.recordIntegrity?.activityRegistry?.error ||
        "registry binding not verified",
    required: true,
    action:
      "Set VERIFY_ACTIVITY_REGISTRY_BINDING=true and confirm expected escrow contract binding in deployment settings.",
    validate:
      "readiness.recordIntegrity.activityRegistry.configured === true and readiness.recordIntegrity.activityRegistry.ready === true",
  },
  {
    label: "Server-attested property addresses",
    ready: readiness.addressValidation?.configured === true,
    detail: readiness.addressValidation?.configured
      ? `${readiness.addressValidation.provider} responses are signed`
      : "ADDRESS_ATTESTATION_SECRET is not configured",
    required: true,
    action:
      "Set ADDRESS_ATTESTATION_SECRET (32+ byte secret) in production-like deployment environment.",
    validate: "readiness.addressValidation.configured === true",
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
    action:
      "Confirm compliance release gate source allowlist and last pull is successful after source refresh.",
    validate: "readiness.complianceSources.ready === true",
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
    action:
      "Set COMPLIANCE_SOURCE_MONITOR_ENABLED=true and schedule the configured compliance monitor job.",
    validate:
      "readiness.complianceSources.monitorHealthy === true and readiness.complianceSources.configured === true",
  },
  {
    label: "Encrypted decentralized evidence",
    ready: readiness.evidence?.decentralizedReady === true,
    detail: readiness.evidence?.decentralizedReady
      ? "available"
      : "optional pilot experiment not configured",
    required: false,
    action: "Optional Phase-2 hardening only.",
    validate: "readiness.evidence.decentralizedReady === true",
  },
];

const readinessEndpointCheck = {
  label: "Hosted readiness endpoint",
  ready: readinessEndpointError === null,
  detail:
    readinessEndpointError ||
    "reachable and returned a valid HTTP 200 JSON response",
  required: true,
  action:
    "Verify the deployed /api/system/readiness route and network availability, then rerun this check.",
  validate: "GET /api/system/readiness returns HTTP 200 JSON",
};
if (readinessEndpointError) {
  checks.splice(0, checks.length, readinessEndpointCheck);
} else {
  checks.unshift(readinessEndpointCheck);
}

console.log(`OpenEscrow pilot readiness: ${baseUrl}`);
const requiredFailed = [];
const optionalFailed = [];
for (const check of checks) {
  const marker = check.ready ? "PASS" : check.required ? "ACTION" : "OPTIONAL";
  console.log(`${marker.padEnd(8)} ${check.label}: ${check.detail}`);
  if (!check.ready) {
    if (check.required) {
      requiredFailed.push(check);
    } else {
      optionalFailed.push(check);
    }
  }
}

const requiredActionCount = requiredFailed.length;
const optionalAvailable = optionalFailed.filter((check) => check.ready === false).length;
if (requiredActionCount > 0) {
  const actionsByCheck = requiredFailed.filter(Boolean);
  if (actionsByCheck.length > 0) {
    console.log("\nOwner remediation actions:");
    for (const check of actionsByCheck) {
      console.log(`- ${check.label}`);
      if (check.action) {
        console.log(`  action: ${check.action}`);
      }
      if (check.validate) {
        console.log(`  validate: ${check.validate}`);
      }
    }
  }
  process.exitCode = 1;
} else {
  console.log("READY    External pilot services are configured.");
}

const payload = {
  artifactSchemaVersion: PILOT_READINESS_ARTIFACT_SCHEMA_VERSION,
  baseUrl,
  release: readiness.release ?? null,
  ok: requiredActionCount === 0,
  requiredActionCount,
  optionalAvailable,
  required: requiredFailed.map((check) => ({
    label: check.label,
    detail: check.detail,
  })),
  optional: optionalFailed.map((check) => ({
    label: check.label,
    detail: check.detail,
  })),
  checks,
};

if (jsonOutput) {
  console.log(JSON.stringify(payload, null, 2));
}

if (artifactRequested) {
  const checkedAt = new Date().toISOString();
  const readinessPayload = { ...payload, checkedAt };
  if (explicitArtifactPath) {
    const filePath = path.resolve(explicitArtifactPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(readinessPayload, null, 2));
    console.log(`Saved readiness evidence: ${filePath}`);
  } else {
    const safeHost = baseUrl
      .replace(/^https?:\/\//, "")
      .replace(/[^a-zA-Z0-9.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
    const fileName = `${safeHost}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = path.resolve(artifactDir, fileName);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(readinessPayload, null, 2));
    console.log(`Saved readiness evidence: ${filePath}`);
  }
}
