import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReviewerChanges,
  evaluatePublicationSafety,
  evaluatePublicCopy,
  normalizeGitOutput,
  parsePorcelainStatus,
} from "./create-reviewer-evidence-manifest.mjs";

test("preserves the leading porcelain status column while removing the final newline", () => {
  assert.equal(normalizeGitOutput(" M .gitignore\r\n"), " M .gitignore");
});

test("parses clean and changed porcelain status without inventing changes", () => {
  assert.deepEqual(parsePorcelainStatus(""), []);
  assert.deepEqual(parsePorcelainStatus(" M README.md\n?? SECURITY.md"), [
    { code: " M", path: "README.md" },
    { code: "??", path: "SECURITY.md" },
  ]);
});

test("separates the reviewed publication tranche from generated and unexpected changes", () => {
  assert.deepEqual(
    classifyReviewerChanges([
      { code: " M", path: "README.md" },
      { code: " M", path: "frontend-site-dist.tar" },
      { code: "??", path: "notes/private-draft.md" },
    ]),
    {
      candidate: [{ code: " M", path: "README.md" }],
      excluded: [{ code: " M", path: "frontend-site-dist.tar" }],
      unexpected: [{ code: "??", path: "notes/private-draft.md" }],
    },
  );
});

test("accepts current, bounded public claims", () => {
  const errors = evaluatePublicCopy({
    "README.md": [
      "https://openescrow.io/demo",
      "234 passing Foundry tests across 22 suites",
      "Base Sepolia",
      "has not been independently audited",
    ].join("\n"),
    "SECURITY.md": "Base Sepolia public-interest prototype; not audited",
    "docs/release-evidence-index.md":
      "This does not claim the newest source is publicly deployed. Say public on Base Sepolia.",
    "frontend/src/Root.tsx": 'if (path === "/funding") {}',
    "frontend/src/components/Layout.tsx": '<a href="/funding">Funding</a>',
    "frontend/src/components/FundingPage.tsx": [
      "Funding disclosures are being verified.",
      "This page does not state a zero balance.",
      "Applications and nominations are never ledger receipts.",
      "A contribution does not buy control.",
    ].join("\n"),
    "frontend/src/lib/fundingTransparency.ts": [
      "openingBalanceConfirmed: false",
      'entry.type !== "application"',
      "hasConfirmedFundingDisclosure",
    ].join("\n"),
  });
  assert.deepEqual(errors, []);
});

test("rejects stale links, stale test counts, and missing deployment boundaries", () => {
  const errors = evaluatePublicCopy({
    "README.md": "openescrow-demo.omrigross.chatgpt.site\n221 passing Foundry tests",
    "SECURITY.md": "",
    "docs/release-evidence-index.md": "",
  });
  assert.ok(errors.some((error) => error.includes("openescrow.io/demo")));
  assert.ok(errors.some((error) => error.includes("234 passing Foundry tests")));
  assert.ok(errors.some((error) => error.includes("retired public copy")));
  assert.ok(errors.some((error) => error.includes("newest source is publicly deployed")));
});

test("rejects private identifiers and credential-like material from the publication tranche", () => {
  const errors = evaluatePublicationSafety({
    "docs/owner-actions.md": [
      ["C:\\", "Users\\Example\\AppData"].join(""),
      ["maintainer", "@", "gmail.com"].join(""),
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      ["../", "../", "grant-assets/funding-roadmap/private.md"].join(""),
    ].join("\n"),
    "README.md": "Public project documentation only.",
  });

  assert.ok(errors.some((error) => error.includes("local Windows user path")));
  assert.ok(errors.some((error) => error.includes("personal consumer mailbox")));
  assert.ok(errors.some((error) => error.includes("private-key material")));
  assert.ok(errors.some((error) => error.includes("private funding-workspace path")));
  assert.equal(errors.some((error) => error.startsWith("README.md")), false);
});
