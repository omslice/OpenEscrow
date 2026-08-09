import assert from "node:assert/strict";
import test from "node:test";
import {
  hasConfirmedFundingDisclosure,
  publishedFundingEntries,
  summarizePublishedFunding,
  type FundingDisclosure,
} from "./fundingTransparency.ts";

function disclosure(entries: FundingDisclosure["entries"]): FundingDisclosure {
  return {
    lastReviewed: "2026-08-09",
    openingBalanceConfirmed: true,
    confirmedThrough: "2026-08-09",
    recipientDescription: "Test recipient",
    fundingContact: "funding@example.org",
    entries,
  };
}

test("an unconfirmed opening state publishes no rows or implied zero total", () => {
  const unconfirmed = disclosure([
    {
      id: "received-but-not-confirmed",
      date: "2026-08-09",
      type: "grant",
      source: "Example",
      status: "received",
      usdReceived: 100,
      publicationApproved: true,
      lastVerified: "2026-08-09",
    },
  ]);
  unconfirmed.openingBalanceConfirmed = false;
  unconfirmed.confirmedThrough = null;

  assert.deepEqual(publishedFundingEntries(unconfirmed), []);
  assert.deepEqual(summarizePublishedFunding(unconfirmed), {
    committedUsd: 0,
    receivedUsd: 0,
    spentUsd: 0,
    inKindUsedUsd: 0,
  });
});

test("a confirmation flag without every required opening fact fails closed", () => {
  const incomplete = disclosure([]);
  incomplete.fundingContact = null;

  assert.equal(hasConfirmedFundingDisclosure(incomplete), false);
  assert.deepEqual(publishedFundingEntries(incomplete), []);
});

test("applications and unapproved records cannot enter the public ledger", () => {
  const entries = publishedFundingEntries(
    disclosure([
      {
        id: "application",
        date: "2026-08-09",
        type: "application",
        source: "Requested grant",
        status: "pending",
        usdCommitted: 75_000,
        usdReceived: 75_000,
        publicationApproved: true,
        lastVerified: "2026-08-09",
      },
      {
        id: "private-award",
        date: "2026-08-09",
        type: "grant",
        source: "Not approved for publication",
        status: "received",
        usdReceived: 1_000,
        publicationApproved: false,
        lastVerified: "2026-08-09",
      },
    ]),
  );

  assert.deepEqual(entries, []);
});

test("committed, received, spent, and in-kind totals remain separate", () => {
  const summary = summarizePublishedFunding(
    disclosure([
      {
        id: "grant",
        date: "2026-08-09",
        type: "grant",
        source: "Example grant",
        status: "partially_received",
        usdCommitted: 25_000,
        usdReceived: 10_000,
        usdSpent: 2_500,
        publicationApproved: true,
        lastVerified: "2026-08-09",
      },
      {
        id: "credit",
        date: "2026-08-09",
        type: "in_kind",
        source: "Example provider",
        status: "received",
        usdInKindUsed: 400,
        publicationApproved: true,
        lastVerified: "2026-08-09",
      },
    ]),
  );

  assert.deepEqual(summary, {
    committedUsd: 25_000,
    receivedUsd: 10_000,
    spentUsd: 2_500,
    inKindUsedUsd: 400,
  });
});
