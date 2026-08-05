import assert from "node:assert/strict";
import test from "node:test";
import { checkRoadmapDocuments } from "./check-roadmap-status.mjs";

const validRoadmap = `# Roadmap

## In progress
- **Verified:** Current evidence.

## Remaining
- **Planned:** Future work.

## Material unknowns
- Unknown.

## Validation and delivery evidence
- Check.
`;

const validLedger = `# Ledger

## In progress
- **Verified:** Current evidence.

## Remaining
- **Planned:** Future work.
`;

const validOwnerActions = `# Owner actions

## Actionable now
- [ ] Act.

## Needed before fiat sandbox evaluation
- [ ] Act.

## Needed before any real-money or production pilot
- [ ] Act.

## Completed owner actions
- [x] Done.
`;

const validWeekendChecklist = `# Weekend checklist

[owner](./owner-actions.md)
[contract](./base-sepolia-deployment.md)
[pilot](./testnet-pilot-runbook.md)
[incident](./testnet-incident-response-runbook.md)

## Safety boundary
## Choose the release path
## Credentialed setup
## Supervised checks
## What to return for verification

${Array.from({ length: 10 }, (_, index) => `- [ ] Step ${index + 1}.`).join("\n")}
`;

const validLegacy = {
  "legacy.md": "Superseded. See [roadmap](./mvp-roadmap.md).",
};

test("accepts the canonical roadmap and owner-checklist structure", () => {
  assert.deepEqual(
    checkRoadmapDocuments({
      roadmap: validRoadmap,
      validationLedger: validLedger,
      ownerActions: validOwnerActions,
      weekendChecklist: validWeekendChecklist,
      legacyDocuments: validLegacy,
    }),
    [],
  );
});

test("rejects status items placed under the wrong roadmap section", () => {
  const errors = checkRoadmapDocuments({
    roadmap: validRoadmap.replace(
      "- **Planned:** Future work.",
      "- **Verified:** Misplaced evidence.",
    ),
    validationLedger: validLedger.replace(
      "- **Planned:** Future work.",
      "- **Verified:** Misplaced evidence.",
    ),
    ownerActions: validOwnerActions,
    weekendChecklist: validWeekendChecklist,
    legacyDocuments: validLegacy,
  });

  assert.equal(
    errors.includes("Remaining must contain at least one Planned item."),
    true,
  );
  assert.equal(
    errors.includes("Verified items must not appear under Remaining."),
    true,
  );
  assert.equal(
    errors.includes(
      "The detailed validation ledger has a Verified item under Remaining.",
    ),
    true,
  );
});

test("rejects stale numeric deployment claims and active-looking legacy handoffs", () => {
  const errors = checkRoadmapDocuments({
    roadmap: validRoadmap,
    validationLedger: validLedger,
    ownerActions: `${validOwnerActions}\nThe public site remains on production version 56.`,
    weekendChecklist: validWeekendChecklist,
    legacyDocuments: { "legacy.md": "Current overnight instructions." },
  });

  assert.equal(
    errors.includes(
      "Owner checklist must not hard-code a production version that silently becomes stale.",
    ),
    true,
  );
  assert.equal(
    errors.includes(
      "legacy.md must identify itself as superseded and point to mvp-roadmap.md.",
    ),
    true,
  );
});

test("rejects incomplete or secret-bearing weekend owner instructions", () => {
  const errors = checkRoadmapDocuments({
    roadmap: validRoadmap,
    validationLedger: validLedger,
    ownerActions: validOwnerActions,
    weekendChecklist: validWeekendChecklist
      .replace("## Credentialed setup", "## Setup")
      .replace("- [ ] Step 10.", "password: abcdefghijklmnopqrstuvwxyz"),
    legacyDocuments: validLegacy,
  });

  assert.equal(
    errors.includes("Weekend owner checklist is missing ## Credentialed setup."),
    true,
  );
  assert.equal(
    errors.includes("Weekend owner checklist must retain its actionable unchecked steps."),
    true,
  );
  assert.equal(
    errors.includes("Owner documentation appears to contain assigned secret material."),
    true,
  );
});
