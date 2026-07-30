import { runServerRehearsal } from "./rehearsal-runner.mjs";

const expectedScenarios = [
  {
    id: "archive-restore",
    name: "pilot rehearsal: archive and restore permissions are isolated by signed-in account",
    covers: ["archive", "restore", "cross-account authorization"],
  },
  {
    id: "record-proof",
    name: "pilot rehearsal: record export and proof include claim, decision, and receipts",
    covers: ["report export", "canonical JSON", "snapshot hash", "receipt trail"],
  },
  {
    id: "disputed-claim",
    name: "pilot rehearsal: a disputed claim completes funding, ruling, and withdrawals once",
    covers: ["multi-tenant funding", "partial dispute", "arbiter ruling", "withdrawals"],
  },
  {
    id: "accepted-claim",
    name: "pilot rehearsal: an accepted claim resolves allocations, withdrawals, and record export",
    covers: ["full claim acceptance", "allocation", "withdrawals", "record export"],
  },
  {
    id: "no-claim-refund",
    name: "pilot rehearsal: a no-claim refund and withdrawal are role-safe and one-time",
    covers: ["no-claim timeout", "refund", "role authorization", "idempotency"],
  },
  {
    id: "evidence-upload-outage",
    name: "pilot rehearsal: an evidence upload outage is retryable without a phantom record",
    covers: ["R2 outage", "retry", "metadata consistency", "privacy-safe error"],
  },
  {
    id: "evidence-download-outage",
    name: "pilot rehearsal: an evidence download outage fails closed without storage details",
    covers: ["R2 outage", "fail-closed download", "privacy-safe error"],
  },
  {
    id: "notification-outage",
    name: "pilot rehearsal: a notification outage is retryable without a phantom delivery",
    covers: ["email outage", "retry", "delivery idempotency", "event consistency"],
  },
  {
    id: "arbiter-invite-reset",
    name: "pilot rehearsal: the landlord can reset an arbiter link and invalidate prior sessions",
    covers: ["arbiter recovery", "link rotation", "session invalidation", "role authorization"],
  },
  {
    id: "arbiter-account-recovery",
    name: "pilot rehearsal: verified arbiter discovery is isolated and survives link rotation",
    covers: [
      "verified identity",
      "arbiter recovery",
      "cross-account isolation",
      "archive isolation",
    ],
  },
  {
    id: "account-session-containment",
    name: "pilot rehearsal: a verified account can contain its record sessions without affecting other parties",
    covers: [
      "session revocation",
      "cross-account isolation",
      "invitation continuity",
      "verified rediscovery",
    ],
  },
  {
    id: "account-data-inventory",
    name: "pilot rehearsal: account data inventory is role-isolated and contains no access secrets",
    covers: [
      "privacy inventory",
      "role isolation",
      "token exclusion",
      "cross-origin denial",
    ],
  },
  {
    id: "sandbox-funding-recovery",
    name: "pilot rehearsal: sandbox checkout recovery is durable and separate from agreement funding",
    covers: [
      "sandbox-only funding",
      "durable recovery",
      "idempotent provider events",
      "refund retry",
      "agreement-funding separation",
    ],
  },
];

runServerRehearsal({
  artifactDirectoryName: ".pilot-rehearsal",
  artifactPrefix: "openescrow-pilot-rehearsal",
  schema: "openescrow.pilot-rehearsal.v1",
  consoleLabel: "pilot",
  expectedScenarios,
  testNamePattern: "^pilot rehearsal:",
  safetyBoundary:
    "In-memory workflow simulation only; no hosted identities, wallets, contracts, providers, secrets, or real funds.",
});
