import assert from "node:assert/strict";
import test from "node:test";
import {
  decisionReceiptRecoveryKey,
  isArbiterRulingReceiptAction,
  isClaimResponseReceiptAction,
  sameDecisionReceipt,
  type ArbiterRulingReceiptAction,
  type ClaimResponseReceiptAction,
} from "./decisionReceiptRecovery.ts";

const transactionHash = `0x${"ab".repeat(32)}`;
const response: ClaimResponseReceiptAction = {
  type: "claim_response",
  decision: "partial",
  acceptedAmount: "0.25",
  note: "Synthetic partial response",
  transactionHash,
};
const ruling: ArbiterRulingReceiptAction = {
  type: "arbiter_ruling",
  awardToLandlord: "0.1",
  note: "Synthetic ruling",
  transactionHash: `0x${"cd".repeat(32)}`,
};

test("decision receipt recovery accepts exact response and ruling payloads", () => {
  assert.equal(isClaimResponseReceiptAction(response), true);
  assert.equal(isArbiterRulingReceiptAction(ruling), true);
  assert.equal(
    sameDecisionReceipt(response, { ...response, note: "Normalized" }),
    true,
  );
});

test("decision receipt recovery rejects malformed and bearer-bearing payloads", () => {
  assert.equal(
    isClaimResponseReceiptAction({ ...response, transactionHash: "0x1234" }),
    false,
  );
  assert.equal(
    isClaimResponseReceiptAction({ ...response, token: "must-not-persist" }),
    false,
  );
  assert.equal(
    isArbiterRulingReceiptAction({ ...ruling, awardToLandlord: "-1" }),
    false,
  );
  assert.equal(
    isArbiterRulingReceiptAction({ ...ruling, type: "claim_response" }),
    false,
  );
});

test("decision recovery keys isolate action, agreement, role, and wallet", () => {
  const base = {
    receipt: "claim-response" as const,
    agreementId: "43",
    proposalId: "OE-P-RECOVERY",
    role: "tenant" as const,
    address: "0xABCDEF",
  };
  const key = decisionReceiptRecoveryKey(base);
  assert.match(key, /claim-response/);
  assert.match(key, /0xabcdef/);
  assert.notEqual(
    key,
    decisionReceiptRecoveryKey({ ...base, address: "0x123456" }),
  );
  assert.notEqual(
    key,
    decisionReceiptRecoveryKey({
      ...base,
      receipt: "arbiter-ruling",
      role: "arbiter",
    }),
  );
  assert.doesNotMatch(key, /private-invitation-bearer-token/);
});
