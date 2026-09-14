import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REVIEWER_EVIDENCE_SCHEMA = "openescrow.reviewer-evidence/v1";

export const REVIEWER_FILES = Object.freeze([
  ".gitignore",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "ROADMAP.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/accessibility_report.yml",
  ".github/ISSUE_TEMPLATE/compliance_source_update.yml",
  ".github/ISSUE_TEMPLATE/partner_feedback.yml",
  ".github/labels.yml",
  ".github/pull_request_template.md",
  "foundry.toml",
  "contracts/dependency-lock.json",
  "contracts/OpenEscrow.sol",
  "contracts/OperationsReserve.sol",
  "contracts/AgreementActivityRegistry.sol",
  "contracts/TestUSDC.sol",
  "contracts/TestAaveUSDC.sol",
  "script/DeployBaseSepolia.s.sol",
  "scripts/Broadcast-BaseSepolia.ps1",
  "deployments/base-sepolia-latest.json",
  "docs/base-sepolia-deployment.md",
  "docs/mvp-roadmap.md",
  "docs/owner-actions.md",
  "docs/grant-reviewer-guide.md",
  "frontend/README.md",
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/scripts/check-community-health.mjs",
  "frontend/scripts/check-landing-load.mjs",
  "frontend/scripts/create-reviewer-evidence-manifest.mjs",
  "frontend/scripts/create-reviewer-evidence-manifest.test.mjs",
  "frontend/src/App.css",
  "frontend/src/Root.tsx",
  "frontend/src/components/FundingPage.tsx",
  "frontend/src/components/Layout.tsx",
  "frontend/src/contracts/OpenEscrowABI.json",
  "frontend/src/contracts/OperationsReserveABI.json",
  "frontend/src/contracts/AgreementActivityRegistryABI.json",
  "frontend/src/lib/fundingTransparency.ts",
  "frontend/src/lib/fundingTransparency.test.ts",
  "frontend/src/lib/fundingTransparencyPage.test.ts",
  "docs/release-evidence-index.md",
  "docs/reviewer-publication-runbook.md",
  "docs/independent-audit-handoff.md",
  "docs/contract-threat-model.md",
  "docs/privacy-threat-model.md",
  "docs/security-review.md",
]);

export const REVIEWER_PUBLICATION_TRANCHE_FILES = Object.freeze([
  ".gitignore",
  ".github/ISSUE_TEMPLATE/accessibility_report.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/compliance_source_update.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/partner_feedback.yml",
  ".github/labels.yml",
  ".github/pull_request_template.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "README.md",
  "SECURITY.md",
  "docs/base-sepolia-deployment.md",
  "docs/grant-reviewer-guide.md",
  "docs/mvp-roadmap.md",
  "docs/owner-actions.md",
  "docs/release-evidence-index.md",
  "docs/reviewer-publication-runbook.md",
  "docs/security-review.md",
  "frontend/README.md",
  "frontend/package.json",
  "frontend/scripts/check-community-health.mjs",
  "frontend/scripts/check-landing-load.mjs",
  "frontend/scripts/create-reviewer-evidence-manifest.mjs",
  "frontend/scripts/create-reviewer-evidence-manifest.test.mjs",
  "scripts/Broadcast-BaseSepolia.ps1",
  "frontend/src/App.css",
  "frontend/src/Root.tsx",
  "frontend/src/components/FundingPage.tsx",
  "frontend/src/components/Layout.tsx",
  "frontend/src/lib/fundingTransparency.test.ts",
  "frontend/src/lib/fundingTransparency.ts",
  "frontend/src/lib/fundingTransparencyPage.test.ts",
]);

export const REVIEWER_EXCLUDED_WORKTREE_PATHS = Object.freeze({
  "frontend-site-dist.tar":
    "Generated deployment archive with separate ownership and provenance; reconcile independently.",
});

const REQUIRED_PUBLIC_COPY = Object.freeze([
  ["README.md", "https://openescrow.io/demo"],
  ["README.md", "251 passing Foundry tests across 24 suites"],
  ["README.md", "Base Sepolia"],
  ["README.md", "has not been independently audited"],
  ["SECURITY.md", "Base Sepolia public-interest prototype"],
  ["SECURITY.md", "not audited"],
  ["docs/grant-reviewer-guide.md", "https://openescrow.io"],
  ["docs/grant-reviewer-guide.md", "Base Sepolia"],
  ["docs/grant-reviewer-guide.md", "not real funds"],
  ["docs/release-evidence-index.md", "newest source is publicly deployed"],
  ["docs/release-evidence-index.md", "public on Base Sepolia"],
  ["frontend/src/Root.tsx", 'path === "/funding"'],
  ["frontend/src/components/Layout.tsx", 'href="/funding"'],
  ["frontend/src/components/FundingPage.tsx", "Funding disclosures are being verified."],
  ["frontend/src/components/FundingPage.tsx", "does not state a zero balance"],
  ["frontend/src/components/FundingPage.tsx", "Applications and nominations are never ledger receipts."],
  ["frontend/src/components/FundingPage.tsx", "A contribution does not buy control"],
  ["frontend/src/lib/fundingTransparency.ts", "openingBalanceConfirmed: false"],
  ["frontend/src/lib/fundingTransparency.ts", 'entry.type !== "application"'],
  ["frontend/src/lib/fundingTransparency.ts", "hasConfirmedFundingDisclosure"],
]);

const RETIRED_PUBLIC_COPY = Object.freeze([
  "openescrow-demo.omrigross.chatgpt.site",
  "136 passing",
  "221 passing Foundry tests",
]);

const FORBIDDEN_PUBLICATION_PATTERNS = Object.freeze([
  ["private-key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub access token", /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/],
  ["Slack access token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["bearer credential", /\bBearer\s+[A-Za-z0-9._~-]{20,}\b/i],
  ["personal consumer mailbox", /[A-Z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook)\.com\b/i],
  ["local Windows user path", /[A-Z]:\\Users\\/i],
  ["local Codex path", /(?:^|[\\/])\.codex(?:[\\/]|$)/i],
  ["private funding-workspace path", /(?:\.\.[\\/])+grant-assets[\\/]/i],
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function normalizeGitOutput(output) {
  return output.trimEnd();
}

function git(repositoryRoot, args) {
  return normalizeGitOutput(execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }));
}

export function buildFileRecord(repositoryRoot, relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const stats = statSync(absolutePath);
  if (!stats.isFile()) throw new Error(`${relativePath} is not a regular file.`);
  const bytes = readFileSync(absolutePath);
  return {
    path: relativePath.split(path.sep).join("/"),
    bytes: bytes.length,
    lines: bytes.length === 0 ? 0 : bytes.toString("utf8").split(/\r?\n/).length,
    sha256: sha256(bytes),
  };
}

export function parsePorcelainStatus(status) {
  if (!status.trim()) return [];
  return status.split(/\r?\n/).filter(Boolean).map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3).replace(/^"|"$/g, ""),
  }));
}

export function classifyReviewerChanges(status) {
  const candidatePaths = new Set(REVIEWER_PUBLICATION_TRANCHE_FILES);
  const excludedPaths = new Set(Object.keys(REVIEWER_EXCLUDED_WORKTREE_PATHS));
  return status.reduce(
    (classification, change) => {
      if (candidatePaths.has(change.path)) classification.candidate.push(change);
      else if (excludedPaths.has(change.path)) classification.excluded.push(change);
      else classification.unexpected.push(change);
      return classification;
    },
    { candidate: [], excluded: [], unexpected: [] },
  );
}

export function evaluatePublicCopy(documents) {
  const errors = [];
  for (const [relativePath, required] of REQUIRED_PUBLIC_COPY) {
    if (!documents[relativePath]?.includes(required)) {
      errors.push(`${relativePath} is missing ${JSON.stringify(required)}.`);
    }
  }
  for (const retired of RETIRED_PUBLIC_COPY) {
    for (const [relativePath, contents] of Object.entries(documents)) {
      if (contents.includes(retired)) {
        errors.push(`${relativePath} contains retired public copy ${JSON.stringify(retired)}.`);
      }
    }
  }
  return errors;
}

export function evaluatePublicationSafety(documents) {
  const errors = [];
  for (const [relativePath, contents] of Object.entries(documents)) {
    for (const [label, pattern] of FORBIDDEN_PUBLICATION_PATTERNS) {
      if (pattern.test(contents)) errors.push(`${relativePath} contains ${label}.`);
    }
  }
  return errors;
}

function trackingState(repositoryRoot) {
  let upstream = null;
  let ahead = null;
  let behind = null;
  try {
    upstream = git(repositoryRoot, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
    const counts = git(repositoryRoot, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])
      .split(/\s+/)
      .map(Number);
    [behind, ahead] = counts;
  } catch {
    // A local branch without an upstream is a publication blocker recorded below.
  }
  return { upstream, ahead, behind };
}

export function collectReviewerEvidence(repositoryRoot, generatedAt = new Date().toISOString()) {
  const requiredDocuments = Object.fromEntries(
    [
      "README.md",
      "SECURITY.md",
      "docs/grant-reviewer-guide.md",
      "docs/release-evidence-index.md",
      "frontend/src/Root.tsx",
      "frontend/src/components/Layout.tsx",
      "frontend/src/components/FundingPage.tsx",
      "frontend/src/lib/fundingTransparency.ts",
    ].map((relativePath) => [
      relativePath,
      readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    ]),
  );
  const status = parsePorcelainStatus(
    git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
  );
  const publicationDocuments = Object.fromEntries(
    REVIEWER_PUBLICATION_TRANCHE_FILES.map((relativePath) => [
      relativePath,
      readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    ]),
  );
  const branch = git(repositoryRoot, ["branch", "--show-current"]);
  const sourceCommit = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const trackedAtCommit = new Set(
    git(repositoryRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split(/\r?\n/),
  );
  const fileManifest = REVIEWER_FILES.map((relativePath) => ({
    ...buildFileRecord(repositoryRoot, relativePath),
    trackedAtCommit: trackedAtCommit.has(relativePath),
  }));
  const copyErrors = evaluatePublicCopy(requiredDocuments);
  const publicationSafetyErrors = evaluatePublicationSafety(publicationDocuments);
  const changeClassification = classifyReviewerChanges(status);
  const untrackedRequiredFiles = fileManifest
    .filter((record) => !record.trackedAtCommit)
    .map((record) => record.path);
  const tracking = trackingState(repositoryRoot);
  const blockers = [
    ...copyErrors,
    ...publicationSafetyErrors,
    ...(status.length > 0
      ? [`Working tree has ${status.length} modified or untracked path(s).`]
      : []),
    ...(changeClassification.excluded.length > 0
      ? [
          `${changeClassification.excluded.length} separately owned generated artifact(s) require reconciliation.`,
        ]
      : []),
    ...(changeClassification.unexpected.length > 0
      ? [
          `${changeClassification.unexpected.length} worktree change(s) fall outside the reviewed publication tranche.`,
        ]
      : []),
    ...(untrackedRequiredFiles.length > 0
      ? [`${untrackedRequiredFiles.length} reviewer file(s) are not present in sourceCommit.`]
      : []),
    ...(!branch ? ["HEAD is detached."] : []),
    ...(!tracking.upstream ? ["Current branch has no configured upstream."] : []),
  ];

  return {
    schema: REVIEWER_EVIDENCE_SCHEMA,
    generatedAt,
    status: blockers.length === 0 ? "publication-candidate" : "blocked",
    source: {
      commit: sourceCommit,
      branch,
      ...tracking,
      clean: status.length === 0,
      changes: status,
      publicationTranche: {
        candidatePaths: REVIEWER_PUBLICATION_TRANCHE_FILES,
        candidateChanges: changeClassification.candidate,
        excludedChanges: changeClassification.excluded.map((change) => ({
          ...change,
          reason: REVIEWER_EXCLUDED_WORKTREE_PATHS[change.path],
        })),
        unexpectedChanges: changeClassification.unexpected,
      },
    },
    publicReferences: {
      product: "https://openescrow.io",
      walkthrough: "https://openescrow.io/demo",
      repository: "https://github.com/omslice/OpenEscrow",
      network: "Base Sepolia",
      chainId: 84532,
    },
    claimSnapshot: {
      contractTests: { passed: 238, suites: 23, skippedLiveFork: 1 },
      assurance: "Internal automated and manual evidence; no independent audit is claimed.",
      deploymentBoundary:
        "The current source candidate is newer than the immutable public Base Sepolia contract cohort.",
      fundingTransparency:
        "The source candidate includes a fail-closed /funding route. Its opening balance, recipient, and contact remain unconfirmed, and it is not claimed as deployed.",
    },
    checks: {
      publicCopy: {
        passed: copyErrors.length === 0,
        errors: copyErrors,
      },
      publicationSafety: {
        passed: publicationSafetyErrors.length === 0,
        errors: publicationSafetyErrors,
      },
      requiredFilesTrackedAtCommit: {
        passed: untrackedRequiredFiles.length === 0,
        untracked: untrackedRequiredFiles,
      },
    },
    files: fileManifest,
    blockers,
    safetyBoundary:
      "This manifest contains public-source hashes only. It is not an audit, legal approval, deployment authorization, or proof of external outcomes.",
  };
}

function runCli() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDirectory, "..");
  const repositoryRoot = path.resolve(frontendRoot, "..");
  const shouldWrite = process.argv.includes("--write");
  const shouldCheck = process.argv.includes("--check");
  const requireClean = process.argv.includes("--require-clean");
  const evidence = collectReviewerEvidence(repositoryRoot);

  if (shouldWrite) {
    const outputDirectory = path.join(repositoryRoot, ".reviewer-evidence");
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, "latest.json");
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`Reviewer evidence written: ${outputPath}`);
  }

  console.log(
    `Reviewer evidence ${evidence.status}: ${evidence.files.length} files, ` +
      `${evidence.source.changes.length} working-tree changes, ${evidence.blockers.length} blocker(s).`,
  );
  for (const blocker of evidence.blockers) console.log(`- ${blocker}`);

  if (
    (shouldCheck && (!evidence.checks.publicCopy.passed || !evidence.checks.publicationSafety.passed)) ||
    (requireClean && evidence.status !== "publication-candidate")
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reviewer evidence generation failed.");
    process.exitCode = 1;
  }
}
