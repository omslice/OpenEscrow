import assert from "node:assert/strict";
import test from "node:test";
import {
  claimReceiptRecoveryKey,
  isClaimReceiptAction,
  sameClaimReceipt,
  type ClaimReceiptAction,
} from "./claimReceiptRecovery.ts";

const transactionHash = `0x${"ab".repeat(32)}`;
const action: ClaimReceiptAction = {
  type: "claim_submitted",
  amount: "0.5",
  category: "Damage beyond ordinary wear",
  items: [
    {
      category: "11",
      description: "Damaged test door",
      amount: "0.5",
    },
  ],
  note: "Synthetic test claim",
  evidenceUri: "openescrow://evidence/synthetic-recovery-file",
  evidenceHash: `0x${"cd".repeat(32)}`,
  claimConfirmations: {
    itemizedStatement: true,
    supportingDocuments: true,
  },
  transactionHash,
};

test("claim receipt recovery accepts the bounded retry payload", () => {
  assert.equal(isClaimReceiptAction(action), true);
  assert.equal(
    sameClaimReceipt(action, { ...action, note: "Server-normalized note" }),
    true,
  );
});

test("claim receipt recovery rejects malformed or unrelated browser data", () => {
  assert.equal(isClaimReceiptAction({ ...action, transactionHash: "0x1234" }), false);
  assert.equal(isClaimReceiptAction({ ...action, items: [] }), false);
  assert.equal(
    isClaimReceiptAction({
      ...action,
      claimConfirmations: { supportingDocuments: false },
    }),
    false,
  );
  assert.equal(
    isClaimReceiptAction({ ...action, type: "withdrawal_completed" }),
    false,
  );
});

test("claim recovery storage is isolated without embedding the bearer token", () => {
  const token = "private-invitation-bearer-token";
  const key = claimReceiptRecoveryKey({
    agreementId: "43",
    proposalId: "OE-P-RECOVERY",
    role: "landlord",
    address: "0xABCDEF",
  });
  assert.match(key, /OE-P-RECOVERY/);
  assert.match(key, /0xabcdef/);
  assert.doesNotMatch(key, new RegExp(token));
  assert.doesNotMatch(JSON.stringify(action), new RegExp(token));
  assert.notEqual(
    key,
    claimReceiptRecoveryKey({
      agreementId: "43",
      proposalId: "OE-P-RECOVERY",
      role: "landlord",
      address: "0x123456",
    }),
  );
});
