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
    id: "session-containment",
    name: "pilot rehearsal: a verified account can contain its record sessions without affecting other parties",
    covers: ["session revocation", "other-party continuity", "invitation continuity"],
  },
  {
    id: "privacy-inventory",
    name: "pilot rehearsal: account data inventory is role-isolated and contains no access secrets",
    covers: ["privacy intake", "token exclusion", "cross-origin denial"],
  },
  {
    id: "evidence-tamper",
    name: "encrypted evidence fails closed when ciphertext, key material, or digest metadata is altered",
    covers: ["ciphertext integrity", "key mismatch", "digest mismatch"],
  },
  {
    id: "evidence-upload-outage",
    name: "pilot rehearsal: an evidence upload outage is retryable without a phantom record",
    covers: ["R2 outage", "no phantom evidence", "safe retry"],
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
