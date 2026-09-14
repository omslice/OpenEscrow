import type { NegotiationRecord } from "./negotiations";

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function positiveCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

export function tenantClaimEmailStatus(record: NegotiationRecord | null) {
  const tenants = record?.tenants || [];
  const statusByTenantId = Object.fromEntries(
    tenants.map((tenant) => [tenant.id, false]),
  ) as Record<string, boolean>;
  if (!record || tenants.length === 0) {
    return { statusByTenantId, sentCount: 0, allSent: false };
  }

  const claimEvent = [...record.events]
    .reverse()
    .find(
      (event) =>
        event.action === "deduction_claim_submitted" ||
        event.action === "deduction_claim_amended",
    );
  if (!claimEvent) {
    return { statusByTenantId, sentCount: 0, allSent: false };
  }

  const activityType =
    claimEvent.action === "deduction_claim_amended"
      ? "claim_amended"
      : "claim_submitted";
  const sentEmails = new Set<string>();
  let legacyRecipientCount = 0;
  for (const event of record.events) {
    if (event.id <= claimEvent.id) continue;
    if (event.action === "claim_notification_sent") {
      const recipientEmails = event.metadata?.recipientEmails;
      if (Array.isArray(recipientEmails)) {
        for (const email of recipientEmails) {
          const normalized = normalizedEmail(email);
          if (normalized) sentEmails.add(normalized);
        }
      } else {
        legacyRecipientCount += positiveCount(event.metadata?.recipientCount);
      }
      continue;
    }
    if (
      event.action === "agreement_activity_notification_sent" &&
      event.metadata?.eventType === activityType &&
      event.metadata?.recipientRole === "tenant"
    ) {
      const normalized = normalizedEmail(event.metadata?.recipientEmail);
      if (normalized) sentEmails.add(normalized);
      else legacyRecipientCount += 1;
    }
  }

  for (const tenant of tenants) {
    if (sentEmails.has(normalizedEmail(tenant.email))) {
      statusByTenantId[tenant.id] = true;
    }
  }
  for (const tenant of tenants) {
    if (legacyRecipientCount <= 0) break;
    if (!statusByTenantId[tenant.id]) {
      statusByTenantId[tenant.id] = true;
      legacyRecipientCount -= 1;
    }
  }
  const sentCount = Object.values(statusByTenantId).filter(Boolean).length;
  return {
    statusByTenantId,
    sentCount,
    allSent: sentCount === tenants.length,
  };
}
