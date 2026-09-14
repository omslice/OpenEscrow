import assert from "node:assert/strict";
import test from "node:test";
import { tenantClaimEmailStatus } from "./claimNotificationStatus.ts";
import type { NegotiationRecord } from "./negotiations.ts";

function record(events: NegotiationRecord["events"]): NegotiationRecord {
  return {
    id: "proposal-1",
    status: "finalized",
    revision: 1,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    landlordName: "Landlord",
    landlordEmail: "landlord@example.com",
    tenantName: "Tenant One",
    tenantEmail: "one@example.com",
    tenants: [
      { id: "tenant-1", name: "Tenant One", email: "one@example.com", approved: true, wallet: null, isFundingTenant: true, acceptedAt: null, depositShareBps: 5000 },
      { id: "tenant-2", name: "Tenant Two", email: "two@example.com", approved: true, wallet: null, isFundingTenant: false, acceptedAt: null, depositShareBps: 5000 },
    ],
    arbiterName: null,
    arbiterEmail: null,
    terms: {
      jurisdiction: "OH",
      propertyAddress: "123 Main Street",
      tokenChoice: "plain",
      deposit: "100",
      operationsReserve: "5",
      claimWindowStart: "2026-08-11T00:00:00.000Z",
      claimDays: "30",
      responseDays: "14",
      arbiterDays: "14",
    },
    tenantApproved: true,
    arbiterApproved: true,
    tenantWallet: null,
    arbiterWallet: null,
    onchainAgreementId: "1",
    onchainTxHash: null,
    events,
  };
}

test("maps persisted automatic claim emails to their tenant recipients", () => {
  const status = tenantClaimEmailStatus(record([
    { id: 1, createdAt: "2026-08-11T00:00:00.000Z", actorRole: "landlord", action: "deduction_claim_submitted", summary: "Claim submitted", revision: 1 },
    ...["one@example.com", "two@example.com"].map((recipientEmail, index) => ({
      id: index + 2,
      createdAt: "2026-08-11T00:01:00.000Z",
      actorRole: "system" as const,
      action: "agreement_activity_notification_sent",
      summary: "Email sent",
      revision: 1,
      metadata: { eventType: "claim_submitted", recipientRole: "tenant", recipientEmail },
    })),
  ]));
  assert.deepEqual(status, {
    statusByTenantId: { "tenant-1": true, "tenant-2": true },
    sentCount: 2,
    allSent: true,
  });
});

test("a later amendment does not reuse earlier claim delivery state", () => {
  const status = tenantClaimEmailStatus(record([
    { id: 1, createdAt: "2026-08-11T00:00:00.000Z", actorRole: "landlord", action: "deduction_claim_submitted", summary: "Claim submitted", revision: 1 },
    { id: 2, createdAt: "2026-08-11T00:01:00.000Z", actorRole: "system", action: "claim_notification_sent", summary: "Emails sent", revision: 1, metadata: { recipientCount: 2 } },
    { id: 3, createdAt: "2026-08-11T00:02:00.000Z", actorRole: "landlord", action: "deduction_claim_amended", summary: "Claim amended", revision: 1 },
  ]));
  assert.equal(status.sentCount, 0);
  assert.equal(status.allSent, false);
});
