import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const errors = [];

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "SECURITY.md",
  "ROADMAP.md",
  "docs/release-evidence-index.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/accessibility_report.yml",
  ".github/ISSUE_TEMPLATE/compliance_source_update.yml",
  ".github/ISSUE_TEMPLATE/partner_feedback.yml",
  ".github/labels.yml",
  ".github/pull_request_template.md",
];

function readRequired(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  try {
    if (!statSync(absolutePath).isFile()) {
      errors.push(`${relativePath} is not a regular file.`);
      return "";
    }
    const contents = readFileSync(absolutePath, "utf8");
    if (!contents.trim()) errors.push(`${relativePath} is empty.`);
    return contents;
  } catch {
    errors.push(`${relativePath} is missing.`);
    return "";
  }
}

function requireText(contents, expected, label) {
  if (!contents.includes(expected)) errors.push(`${label} must include ${JSON.stringify(expected)}.`);
}

function rejectText(contents, rejected, label) {
  if (contents.includes(rejected)) errors.push(`${label} must not include ${JSON.stringify(rejected)}.`);
}

function latestContractSnapshot(contents, label) {
  const matches = [
    ...contents.matchAll(/(\d+)\s+(?:passing\s+)?(?:Foundry\s+)?tests across (\d+) suites/gi),
  ];
  if (matches.length === 0) {
    errors.push(`${label} does not contain a contract test/suite snapshot.`);
    return null;
  }
  const latest = matches.at(-1);
  return { tests: Number(latest[1]), suites: Number(latest[2]) };
}

function checkRelativeMarkdownLinks(relativePath, contents) {
  const documentDirectory = path.dirname(path.join(repositoryRoot, relativePath));
  const links = contents.matchAll(/\[[^\]]*\]\((?!https?:|mailto:|#)([^)]+)\)/g);
  for (const match of links) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    const targetWithoutFragment = rawTarget.split("#", 1)[0];
    if (!targetWithoutFragment) continue;
    const decodedTarget = decodeURIComponent(targetWithoutFragment);
    const absoluteTarget = path.resolve(documentDirectory, decodedTarget);
    try {
      statSync(absoluteTarget);
    } catch {
      errors.push(`${relativePath} links to missing local target ${JSON.stringify(rawTarget)}.`);
    }
  }
}

const documents = Object.fromEntries(
  requiredFiles.map((relativePath) => [relativePath, readRequired(relativePath)]),
);
const frontendReadme = readRequired("frontend/README.md");
const securityReview = readRequired("docs/security-review.md");

requireText(documents["README.md"], "https://openescrow.io/demo", "README.md");
requireText(frontendReadme, "https://openescrow.io/demo", "frontend/README.md");
for (const [label, contents] of [
  ["README.md", documents["README.md"]],
  ["frontend/README.md", frontendReadme],
]) {
  rejectText(contents, "openescrow-demo.omrigross.chatgpt.site", label);
}

const publicSnapshot = latestContractSnapshot(documents["README.md"], "README.md");
const reviewedSnapshot = latestContractSnapshot(securityReview, "docs/security-review.md");
if (
  publicSnapshot &&
  reviewedSnapshot &&
  (publicSnapshot.tests !== reviewedSnapshot.tests ||
    publicSnapshot.suites !== reviewedSnapshot.suites)
) {
  errors.push(
    `README.md contract snapshot ${publicSnapshot.tests}/${publicSnapshot.suites} does not match ` +
      `the latest security-review snapshot ${reviewedSnapshot.tests}/${reviewedSnapshot.suites}.`,
  );
}

for (const policy of [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "SECURITY.md",
]) {
  requireText(documents["README.md"], `(${policy})`, `README.md community-health links`);
  checkRelativeMarkdownLinks(policy, documents[policy]);
}
checkRelativeMarkdownLinks("README.md", documents["README.md"]);
checkRelativeMarkdownLinks(
  "docs/release-evidence-index.md",
  documents["docs/release-evidence-index.md"],
);

requireText(documents["SECURITY.md"], "Report a vulnerability privately", "SECURITY.md");
requireText(documents["SECURITY.md"], "privacy@openescrow.io", "SECURITY.md");
requireText(documents["SECURITY.md"], "does not currently operate a funded bug-bounty", "SECURITY.md");
requireText(documents["CODE_OF_CONDUCT.md"], "[CONDUCT]", "CODE_OF_CONDUCT.md");
requireText(documents["GOVERNANCE.md"], "founder-maintained", "GOVERNANCE.md");
requireText(documents["GOVERNANCE.md"], "Funding does not buy merge rights", "GOVERNANCE.md");
requireText(documents["MAINTAINERS.md"], "@omslice", "MAINTAINERS.md");
requireText(documents["CONTRIBUTING.md"], "Never put a suspected vulnerability", "CONTRIBUTING.md");
requireText(
  documents["README.md"],
  "(docs/release-evidence-index.md)",
  "README.md evidence-index link",
);
requireText(
  documents[".github/ISSUE_TEMPLATE/config.yml"],
  "https://github.com/omslice/OpenEscrow/security/policy",
  "issue-template config",
);

if (errors.length > 0) {
  console.error("Community-health check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Community-health check passed (${requiredFiles.length} required files; ` +
      `${publicSnapshot.tests} Foundry tests across ${publicSnapshot.suites} suites).`,
  );
}
