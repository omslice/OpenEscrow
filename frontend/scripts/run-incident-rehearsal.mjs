import { runServerRehearsal } from "./rehearsal-runner.mjs";

const expectedScenarios = [
  {
    id: "identity-forgery",
    name: "signed-in discovery rejects expired, wrong-audience, and forged identity tokens",
    covers: ["identity verification", "session denial", "no phantom sessions"],
  },
  {
    id: "cross-account-isolation",
    name: "pilot rehearsal: archive and restore permissions are isolated by signed-in account",
    covers: ["role isolation", "archive isolation", "cross-account denial"],
  },
  {
    id: "cross-site-read-isolation",
    name: "sensitive authorized reads reject cross-site browser requests without an Origin header",
    covers: [
      "Fetch Metadata",
      "record and report isolation",
      "private evidence isolation",
      "public endpoint continuity",
    ],
  },
  {
    id: "evidence-url-bearer-denial",
    name: "private evidence retrieval is party-only and rejects bearer tokens in URLs",
    covers: [
      "party-only evidence access",
      "URL bearer denial",
      "browser-history privacy",
      "token-free storage references",
    ],
  },
  {
    id: "session-containment",
    name: "pilot rehearsal: a verified account can contain its record sessions without affecting other parties",
    covers: [
      "session revocation",
      "cross-site write denial",
      "other-party continuity",
      "invitation continuity",
    ],
  },
  {
    id: "lost-tenant-invitation",
    name: "pilot rehearsal: a landlord can replace one lost tenant link without disrupting a co-tenant",
    covers: [
      "lost invitation",
      "targeted link rotation",
      "stale-session denial",
      "co-tenant continuity",
    ],
  },
  {
    id: "privacy-inventory",
    name: "pilot rehearsal: account data inventory is role-isolated and contains no access secrets",
    covers: [
      "privacy intake",
      "multi-agreement metadata",
      "encrypted-evidence exclusion",
      "archive and notification preservation",
      "session containment and rediscovery",
      "token exclusion",
      "cross-site denial",
    ],
  },
  {
    id: "evidence-tamper",
    name: "encrypted evidence fails closed when ciphertext, key material, or digest metadata is altered",
    covers: ["ciphertext integrity", "key mismatch", "digest mismatch"],
  },
  {
    id: "evidence-key-rotation",
    name: "pilot rehearsal: isolated evidence backup restoration rejects missing and mismatched keys",
    covers: [
      "pre-rotation evidence",
      "retained keyring",
      "active key rotation",
      "missing-key readiness",
      "mislabeled backup rejection",
      "isolated D1 and R2 restoration",
      "exact-byte restoration",
    ],
  },
  {
    id: "evidence-upload-outage",
    name: "pilot rehearsal: an evidence upload outage is retryable without a phantom record",
    covers: ["R2 outage", "no phantom evidence", "safe retry"],
  },
  {
    id: "evidence-r2-metadata-outage",
    name: "pilot rehearsal: an evidence metadata outage deletes the incomplete R2 upload before retry",
    covers: ["R2 cleanup", "D1 outage", "no orphaned object", "safe retry"],
  },
  {
    id: "evidence-ipfs-metadata-outage",
    name: "pilot rehearsal: an evidence metadata outage unpins incomplete encrypted IPFS before retry",
    covers: [
      "encrypted IPFS cleanup",
      "D1 outage",
      "no incomplete pin",
      "safe retry",
    ],
  },
  {
    id: "evidence-download-outage",
    name: "pilot rehearsal: an evidence download outage fails closed without storage details",
    covers: ["R2 outage", "fail-closed read", "privacy-safe error"],
  },
  {
    id: "notification-outage",
    name: "pilot rehearsal: a notification outage is retryable without a phantom delivery",
    covers: ["provider outage", "no phantom delivery", "idempotent recovery"],
  },
  {
    id: "receipt-spoofing",
    name: "configured receipt verification accepts only the expected Base Sepolia agreement event",
    covers: ["chain receipt", "contract binding", "event validation"],
  },
  {
    id: "legacy-landlord-receipt-recovery",
    name: "legacy finalized records re-prove and preserve the landlord wallet before landlord receipts",
    covers: [
      "legacy receipt recovery",
      "original creator verification",
      "landlord isolation",
      "fail-closed recovery",
    ],
  },
  {
    id: "rpc-fallback",
    name: "receipt verification falls back when the official public RPC is rate limited",
    covers: ["RPC outage", "bounded fallback", "receipt continuity"],
  },
];

runServerRehearsal({
  artifactDirectoryName: ".incident-rehearsal",
  artifactPrefix: "openescrow-incident-rehearsal",
  schema: "openescrow.incident-rehearsal.v1",
  consoleLabel: "incident-response",
  expectedScenarios,
  safetyBoundary:
    "In-memory incident-control simulation only; no hosted data, participant accounts, providers, secrets, contracts, notifications, or real funds are touched.",
});
