import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
const sources = await Promise.all(
  [
    "../src/WorkspaceApp.tsx",
    "../src/components/AgreementDashboard.tsx",
    "../src/components/ClaimSection.tsx",
    "../src/components/CreateAgreementForm.tsx",
    "../src/components/DepositAgreementListItem.tsx",
    "../src/components/PrivyAccountCenter.tsx",
    "../src/components/RecordListItem.tsx",
  ].map(async (path) => readFile(new URL(path, import.meta.url), "utf8")),
);
const source = sources.join("\n");

for (const contract of [
  ".btn:hover:not(:disabled)",
  ".btn:focus-visible",
  ".card input:focus-visible",
  ".notification-preferences .notification-choice:has(input:checked)",
  ".tenant-invite-row.approved",
  ".participant-grid > .participant-approved",
  ".technical-details > summary:focus-visible",
  ".record-archive-section > summary:focus-visible",
  ".funding-table tbody tr:nth-child(even)",
  "@media (pointer: coarse)",
  "@media (prefers-reduced-motion: reduce)",
]) {
  assert.ok(css.includes(contract), `Missing shared UX contract: ${contract}`);
}

for (const existingSurface of [
  "saved-proposal-card",
  "deposit-list-item",
  "record-list-item",
  "claim-line-item",
  "tenant-invite-row",
  "notification-choice",
  "participant-balance-tile",
]) {
  assert.ok(
    source.includes(existingSurface),
    `The UX system no longer maps to the existing ${existingSurface} surface.`,
  );
}

assert.ok(
  css.includes("min-height: 44px"),
  "The UX system must retain full-size touch targets.",
);
assert.ok(
  css.includes("outline: 3px solid color-mix(in srgb, var(--accent) 68%, transparent)"),
  "Dense disclosures and selectable cards must retain a visible keyboard focus ring.",
);

process.stdout.write(
  "Shared UX primitive check passed: buttons, forms, semantic states, dense cards, disclosures, tables, touch targets, and reduced motion remain covered.\n",
);
