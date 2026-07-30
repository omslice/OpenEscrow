import { type ServiceReadiness } from "./negotiations.ts";

export interface ServiceReadinessAction {
  label: string;
  detail: string;
}

export interface ServiceReadinessSummary {
  ready: boolean;
  blockers: string[];
  issueCount: number;
}

function summarizeScheduleAndDeliveryIssues(readiness: ServiceReadiness): string[] {
  const blockers: string[] = [];

  if (!readiness.email.configured) {
    blockers.push(
      "Configure an automatic email provider (for production delivery and test-email checks).",
    );
  }

  if (readiness.email.schedulerConfigured && !readiness.email.schedulerHealthy) {
    const age =
      readiness.email.schedulerAgeMinutes !== null
        ? ` (last run ${readiness.email.schedulerAgeMinutes} min ago)`
        : "";
    blockers.push(
      `Verify the hosted scheduler is active and running about every ${readiness.email.schedulerExpectedIntervalMinutes} minutes${age}.`,
    );
  }

  if (!readiness.email.schedulerLastRunAt) {
    blockers.push(
      "Enable the hosted scheduler so notification cron jobs can run after deployment.",
    );
  }

  if (!readiness.evidence.encryptedAtRest) {
    blockers.push(
      "Set the evidence encryption key so stored deposit evidence is encrypted at rest.",
    );
  } else if (readiness.evidence.keyringReady === false) {
    blockers.push(
      "Restore every retained evidence decryption key still referenced by stored evidence.",
    );
  }

  if (!readiness.recordIntegrity.activityRegistry.ready) {
    blockers.push(
      "Verify the onchain activity registry binding is deployed and matched to the escrow contract.",
    );
  }

  if (!readiness.addressValidation.configured) {
    blockers.push("Configure address attestation so property checks are tamper-resistant.");
  }

  if (!readiness.complianceSources.ready) {
    blockers.push(
      "Resolve compliance source monitoring alerts for changed/stale/unreachable/blocked profiles.",
    );
  }

  return blockers;
}

export function getServiceReadinessBlockers(
  serviceReadiness: ServiceReadiness | null,
): string[] {
  return serviceReadiness ? summarizeScheduleAndDeliveryIssues(serviceReadiness) : [];
}

export function getServiceReadinessActions(
  serviceReadiness: ServiceReadiness | null,
): ServiceReadinessAction[] {
  if (!serviceReadiness) return [];
  const actions: ServiceReadinessAction[] = [];
  if (!serviceReadiness.email.configured) {
    actions.push({
      label: "Configure mail delivery",
      detail:
        "Add RESEND_API_KEY (or EMAIL_WEBHOOK_URL + EMAIL_WEBHOOK_TOKEN) in hosted runtime secrets, then redeploy.",
    });
  }

  if (!serviceReadiness.email.schedulerConfigured) {
    actions.push({
      label: "Enable notifications scheduler",
      detail: "Create a */15 * * * * cron trigger for this project and keep it running.",
    });
  } else if (!serviceReadiness.email.schedulerHealthy) {
    actions.push({
      label: "Stabilize scheduler cadence",
      detail:
        "Keep the */15 minute cron trigger enabled and wait for a successful hosted run after deployment.",
    });
  }

  if (!serviceReadiness.evidence.encryptedAtRest) {
    actions.push({
      label: "Configure encrypted evidence key",
      detail:
        serviceReadiness.evidence.encryptionError ||
        "Set a base64-encoded 32-byte EVIDENCE_ENCRYPTION_KEY and a stable EVIDENCE_ENCRYPTION_KEY_ID. Retain prior keys in EVIDENCE_DECRYPTION_KEYS during rotation.",
    });
  } else if (serviceReadiness.evidence.keyringReady === false) {
    actions.push({
      label: "Restore evidence keyring",
      detail: `Restore the approved backup for ${serviceReadiness.evidence.missingDecryptionKeyCount ?? "one or more"} retained evidence key(s) in EVIDENCE_DECRYPTION_KEYS. Do not replace or guess missing key material.`,
    });
  }

  if (!serviceReadiness.recordIntegrity.activityRegistry.ready) {
    actions.push({
      label: "Verify registry binding",
      detail:
        "Copy ACTIVITY_REGISTRY_ADDRESS from the matching deployment manifest, set VERIFY_ACTIVITY_REGISTRY_BINDING=true, and redeploy.",
    });
  }

  if (!serviceReadiness.addressValidation.configured) {
    actions.push({
      label: "Enable address attestation",
      detail:
        "Set ADDRESS_ATTESTATION_SECRET (secret string at least 32 bytes) so address claims are signed before use.",
    });
  }

  if (!serviceReadiness.complianceSources.ready) {
    actions.push({
      label: "Unblock compliance monitor",
      detail:
        "Enable COMPLIANCE_SOURCE_MONITOR_ENABLED and resolve pending/changed/stale/blocked source alerts before enabling address-routed profiles.",
    });
  }

  return actions;
}

export function summarizeServiceReadiness(
  serviceReadiness: ServiceReadiness | null,
): ServiceReadinessSummary {
  const blockers = getServiceReadinessBlockers(serviceReadiness);
  return {
    ready: Boolean(serviceReadiness) && blockers.length === 0,
    blockers,
    issueCount: blockers.length,
  };
}

export function formatComplianceIssueSummary(
  serviceReadiness: ServiceReadiness["complianceSources"] | null | undefined,
): string {
  if (!serviceReadiness) return "No compliance source snapshot is available.";
  return `${serviceReadiness.pending} pending, ${serviceReadiness.changed} changed, ${serviceReadiness.unreachable} unreachable, ${serviceReadiness.stale} stale, ${serviceReadiness.blocked} blocked.`;
}
