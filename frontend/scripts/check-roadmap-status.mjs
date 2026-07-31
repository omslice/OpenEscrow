import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_ROADMAP_HEADINGS = [
  "## In progress",
  "## Remaining",
  "## Material unknowns",
  "## Validation and delivery evidence",
];

function sectionBody(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) return null;
  const bodyStart = start + heading.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

export function checkRoadmapDocuments({
  roadmap,
  validationLedger,
  ownerActions,
  legacyDocuments,
}) {
  const errors = [];

  for (const heading of REQUIRED_ROADMAP_HEADINGS) {
    if (!roadmap.includes(heading)) {
      errors.push(`Canonical roadmap is missing ${heading}.`);
    }
  }

  const inProgress = sectionBody(roadmap, "## In progress");
  const remaining = sectionBody(roadmap, "## Remaining");
  if (inProgress && !inProgress.includes("**Verified:**")) {
    errors.push("In progress must contain at least one Verified item.");
  }
  if (inProgress?.includes("**Planned:**")) {
    errors.push("Planned items must not appear under In progress.");
  }
  if (remaining && !remaining.includes("**Planned:**")) {
    errors.push("Remaining must contain at least one Planned item.");
  }
  if (remaining?.includes("**Verified:**")) {
    errors.push("Verified items must not appear under Remaining.");
  }

  const ledgerRemaining = sectionBody(validationLedger, "## Remaining");
  if (ledgerRemaining?.includes("**Verified:**")) {
    errors.push("The detailed validation ledger has a Verified item under Remaining.");
  }

  for (const heading of [
    "## Actionable now",
    "## Needed before fiat sandbox evaluation",
    "## Needed before any real-money or production pilot",
    "## Completed owner actions",
  ]) {
    if (!ownerActions.includes(heading)) {
      errors.push(`Owner checklist is missing ${heading}.`);
    }
  }
  if (/public site remains on production version \d+/i.test(ownerActions)) {
    errors.push(
      "Owner checklist must not hard-code a production version that silently becomes stale.",
    );
  }

  for (const [name, contents] of Object.entries(legacyDocuments)) {
    if (!contents.includes("Superseded") || !contents.includes("mvp-roadmap.md")) {
      errors.push(`${name} must identify itself as superseded and point to mvp-roadmap.md.`);
    }
  }

  return errors;
}

function runCli() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..", "..");
  const read = (relativePath) =>
    readFileSync(path.join(repoRoot, relativePath), "utf8");
  const errors = checkRoadmapDocuments({
    roadmap: read("docs/mvp-roadmap.md"),
    validationLedger: read("docs/mvp-checkpoint-2026-07-29.md"),
    ownerActions: read("docs/owner-actions.md"),
    legacyDocuments: {
      "docs/overnight-roadmap-priority.md": read(
        "docs/overnight-roadmap-priority.md",
      ),
      "docs/overnight-readiness-handoff.md": read(
        "docs/overnight-readiness-handoff.md",
      ),
      "docs/overnight-handoff.md": read("docs/overnight-handoff.md"),
    },
  });

  if (errors.length > 0) {
    console.error("Roadmap status check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Roadmap status structure verified.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
