import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { waitForSuccessfulTransactionReceipt } from "./successfulTransactionReceipt.ts";

test("successful sponsored receipts may continue to their follow-up action", async () => {
  const receipt = await waitForSuccessfulTransactionReceipt(async () => ({
    status: "success",
    transactionHash: "0xsuccess",
  }));

  assert.equal(receipt.status, "success");
  assert.equal(receipt.transactionHash, "0xsuccess");
});

test("reverted sponsored receipts stop before any success follow-up", async () => {
  let followUpRan = false;

  await assert.rejects(
    async () => {
      await waitForSuccessfulTransactionReceipt(
        async () => ({ status: "reverted" }),
        "The funding transaction was reverted. No deposit funding was recorded.",
      );
      followUpRan = true;
    },
    /reverted.*No deposit funding was recorded/i,
  );

  assert.equal(followUpRan, false);
});

test("unknown receipt states fail closed", async () => {
  await assert.rejects(
    () =>
      waitForSuccessfulTransactionReceipt(async () => ({
        status: "unknown",
      })),
    /did not complete.*No change was recorded/i,
  );
});

test("sponsored transaction flows cannot bypass the receipt-status guard", () => {
  for (const component of [
    "TenantFundAction.tsx",
    "TestFunds.tsx",
    "PrivateActivityPublisher.tsx",
    "RecordSnapshotControls.tsx",
  ]) {
    const source = readFileSync(
      new URL(`../components/${component}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /waitForSuccessfulTransactionReceipt/);
    assert.doesNotMatch(
      source,
      /await\s+publicClient\??\.waitForTransactionReceipt/,
      `${component} must not treat a mined receipt as successful without checking its status`,
    );
  }
});
