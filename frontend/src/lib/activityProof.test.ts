import assert from "node:assert/strict";
import test from "node:test";
import {
  assertActivityProofContext,
  canonicalActivityEnvelope,
  createActivityEnvelopeV2,
  hashActivityEnvelope,
  parseActivityProofFile,
  type ActivityProofFile,
} from "./activityProof.ts";

const escrow = "0x1111111111111111111111111111111111111111" as const;
const registry = "0x2222222222222222222222222222222222222222" as const;
const transactionHash = `0x${"3".repeat(64)}` as const;

function proofFile(): ActivityProofFile {
  const envelope = createActivityEnvelopeV2({
    escrowAddress: escrow,
    registryAddress: registry,
    agreementId: 42n,
    activityType: 3,
    content: "Notice delivered by certified mail.",
  });
  return {
    algorithm: "keccak256",
    contentHash: hashActivityEnvelope(envelope),
    transactionHash,
    envelope,
  };
}

test("versioned activity proof round trips with deterministic canonical bytes", () => {
  const proof = proofFile();
  const parsed = parseActivityProofFile(JSON.stringify(proof));

  assert.equal(parsed.envelope.version, "openescrow-activity-v2");
  assert.equal(hashActivityEnvelope(parsed.envelope), proof.contentHash);
  assert.doesNotThrow(() =>
    assertActivityProofContext(parsed, escrow, registry),
  );
  assert.equal(
    canonicalActivityEnvelope(parsed.envelope),
    '{"version":"openescrow-activity-v2","chainId":84532,"escrowAddress":"0x1111111111111111111111111111111111111111","registryAddress":"0x2222222222222222222222222222222222222222","agreementId":"42","activityType":3,"content":"Notice delivered by certified mail."}',
  );
});

test("tampered private content no longer matches the committed hash", () => {
  const proof = proofFile();
  const parsed = parseActivityProofFile(JSON.stringify(proof));
  parsed.envelope.content = "Notice was never delivered.";

  assert.notEqual(hashActivityEnvelope(parsed.envelope), proof.contentHash);
});

test("versioned proof rejects a different escrow or registry release", () => {
  const proof = proofFile();
  assert.throws(
    () =>
      assertActivityProofContext(
        proof,
        "0x4444444444444444444444444444444444444444",
        registry,
      ),
    /different OpenEscrow release/,
  );
  assert.throws(
    () =>
      assertActivityProofContext(
        proof,
        escrow,
        "0x5555555555555555555555555555555555555555",
      ),
    /different OpenEscrow release/,
  );
});

test("malformed activity proof fields are rejected", () => {
  const proof = proofFile();
  const malformed = {
    ...proof,
    envelope: { ...proof.envelope, chainId: 1 },
  };
  assert.throws(
    () => parseActivityProofFile(JSON.stringify(malformed)),
    /not a valid OpenEscrow private verification file/,
  );
  assert.throws(
    () => parseActivityProofFile("not-json"),
    /not a valid OpenEscrow private verification file/,
  );
});
