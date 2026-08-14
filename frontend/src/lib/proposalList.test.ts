import assert from "node:assert/strict";
import test from "node:test";
import { compactActiveProposals, type ProposalListItem } from "./proposalList.ts";

function item(
  proposalId: string,
  status: string,
  updatedAt: string,
): ProposalListItem {
  return {
    access: { proposalId, role: "tenant" },
    record: { id: proposalId, status, updatedAt },
  };
}

test("a new proposal remains visible beside an older finalized agreement", () => {
  const current = item("new-proposal", "draft", "2026-08-14T22:23:51.146Z");
  const olderAgreement = item("older-agreement", "finalized", "2026-08-14T22:25:43.400Z");
  assert.deepEqual(
    compactActiveProposals([current, olderAgreement]).map(
      (candidate) => candidate.access.proposalId,
    ),
    ["older-agreement", "new-proposal"],
  );
});

test("proposal lists exclude closed records and deduplicate only the exact proposal role", () => {
  const current = item("proposal", "draft", "2026-08-14T22:23:51.146Z");
  assert.deepEqual(
    compactActiveProposals([
      current,
      current,
      item("cancelled", "cancelled", "2026-08-14T22:26:00.000Z"),
      item("superseded", "superseded", "2026-08-14T22:27:00.000Z"),
    ]),
    [current],
  );
});
