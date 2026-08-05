import { runServerRehearsal } from "./rehearsal-runner.mjs";

const expectedScenarios = [
  {
    id: "archive-restore",
    name: "pilot rehearsal: archive and restore permissions are isolated by signed-in account",
    covers: ["archive", "restore", "cross-account authorization"],
  },
  {
    id: "rendered-archive-restore",
    name: "pilot rehearsal: rendered proposal and record archives restore in the account workspace",
    covers: [
      "rendered proposal archive",
      "rendered proposal restore",
      "rendered Record archive",
      "rendered Record restore",
      "focus recovery",
      "mobile width",
    ],
  },
  {
    id: "record-proof",
    name: "pilot rehearsal: record export and proof include claim, decision, and receipts",
    covers: ["report export", "canonical JSON", "snapshot hash", "receipt trail"],
  },
  {
    id: "rendered-record-verification",
    name: "pilot rehearsal: encrypted record export and local verification remain usable",
    covers: [
      "rendered Record workflow",
      "encrypted JSON export",
      "separate verification key",
      "wrong-key rejection",
      "local integrity verification",
      "public-proof outage",
      "keyboard disclosure",
      "mobile width",
    ],
  },
  {
    id: "rendered-multi-party-lifecycle",
    name: "pilot rehearsal: rendered landlord, tenants, and arbiter complete one shared lifecycle",
    covers: [
      "rendered landlord claim",
      "two isolated tenant decisions",
      "arbiter role handoff",
      "exact allocation",
      "one-time withdrawals",
      "complete report",
      "mobile width",
      "bearer privacy",
    ],
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
    covers: [
      "separate signed landlord and tenant identities",
      "funded agreement",
      "premature withdrawal denial",
      "no-claim timeout",
      "refund",
      "role authorization",
      "idempotency",
      "report and stable snapshot",
    ],
  },
  {
    id: "evidence-upload-outage",
    name: "pilot rehearsal: an evidence upload outage is retryable without a phantom record",
    covers: ["R2 outage", "retry", "metadata consistency", "privacy-safe error"],
  },
  {
    id: "evidence-r2-metadata-outage",
    name: "pilot rehearsal: an evidence metadata outage deletes the incomplete R2 upload before retry",
    covers: [
      "R2 cleanup",
      "D1 atomicity",
      "no phantom evidence",
      "safe retry",
    ],
  },
  {
    id: "evidence-ipfs-metadata-outage",
    name: "pilot rehearsal: an evidence metadata outage unpins incomplete encrypted IPFS before retry",
    covers: [
      "encrypted IPFS cleanup",
      "D1 atomicity",
      "no phantom evidence",
      "safe retry",
    ],
  },
  {
    id: "evidence-download-outage",
    name: "pilot rehearsal: an evidence download outage fails closed without storage details",
    covers: ["R2 outage", "fail-closed download", "privacy-safe error"],
  },
  {
    id: "evidence-backup-restoration",
    name: "pilot rehearsal: isolated evidence backup restoration rejects missing and mismatched keys",
    covers: [
      "isolated D1 and R2 restoration",
      "missing backup rejection",
      "mislabeled backup rejection",
      "key fingerprint verification",
      "exact-byte recovery",
    ],
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
    id: "tenant-invite-recovery",
    name: "pilot rehearsal: a landlord can replace one lost tenant link without disrupting a co-tenant",
    covers: [
      "tenant recovery",
      "targeted link rotation",
      "session invalidation",
      "co-tenant continuity",
      "approved-term continuity",
    ],
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
      "multi-agreement metadata",
      "encrypted-evidence exclusion",
      "archive and notification preservation",
      "session containment and rediscovery",
      "role isolation",
      "token exclusion",
      "cross-site denial",
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
  {
    id: "private-activity-receipt-recovery",
    name: "pilot rehearsal: private activity receipt recovery cannot republish a confirmed proof",
    covers: [
      "exact-agreement recovery",
      "duplicate publication prevention",
      "bearer exclusion",
      "reload focus recovery",
      "mobile touch target",
    ],
  },
  {
    id: "rendered-production-funding-lock",
    name: "pilot rehearsal: unverified production funding results stay locked",
    covers: [
      "unverified browser result",
      "duplicate purchase prevention",
      "reload recovery",
      "wallet refresh isolation",
      "sandbox reset exclusion",
      "mobile width",
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
  additionalChecks: [
    {
      name: "pilot rehearsal: rendered proposal and record archives restore in the account workspace",
      target: "scripts/check-account-switch.mjs",
      command: process.execPath,
      args: ["scripts/check-account-switch.mjs"],
    },
    {
      name: "pilot rehearsal: encrypted record export and local verification remain usable",
      target: "scripts/check-record-verification.mjs",
      command: process.execPath,
      args: ["scripts/check-record-verification.mjs"],
    },
    {
      name: "pilot rehearsal: rendered landlord, tenants, and arbiter complete one shared lifecycle",
      target: "scripts/check-pilot-lifecycle.mjs",
      command: process.execPath,
      args: ["scripts/check-pilot-lifecycle.mjs"],
    },
    {
      name: "pilot rehearsal: private activity receipt recovery cannot republish a confirmed proof",
      target: "scripts/check-private-activity-recovery.mjs",
      command: process.execPath,
      args: ["scripts/check-private-activity-recovery.mjs"],
    },
    {
      name: "pilot rehearsal: unverified production funding results stay locked",
      target: "scripts/check-funding-production-lock.mjs",
      command: process.execPath,
      args: ["scripts/check-funding-production-lock.mjs"],
    },
  ],
});
