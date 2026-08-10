import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptRecordArchive,
  encryptRecordSnapshot,
  parseEncryptedRecordArchive,
  sha256Hex,
} from "./recordArchive.ts";

async function snapshot() {
  const snapshotRecord = {
    schema: "openescrow.agreement-record.v3",
    proposalId: "proposal-123",
    onchain: {
      chainId: 84532,
      escrowAddress: "0x1111111111111111111111111111111111111111",
      activityRegistryAddress: "0x2222222222222222222222222222222222222222",
      agreementId: "7",
    },
    events: [{ id: 1, action: "posted_onchain" }],
  };
  const canonical = JSON.stringify(snapshotRecord);
  return {
    algorithm: "SHA-256" as const,
    hash: await sha256Hex(canonical),
    canonical,
    snapshot: snapshotRecord,
  };
}

test("encrypted agreement record decrypts to the exact canonical bytes", async () => {
  const source = await snapshot();
  const encrypted = await encryptRecordSnapshot(
    source,
    "proposal-123",
    7n,
  );
  const parsed = parseEncryptedRecordArchive(
    JSON.stringify(encrypted.archive),
  );
  const decrypted = await decryptRecordArchive(
    parsed,
    encrypted.verificationKey,
  );

  assert.equal(decrypted.canonical, source.canonical);
  assert.equal(decrypted.hash, source.hash);
  assert.deepEqual(decrypted.snapshot, source.snapshot);
});

test("wrong verification key and modified ciphertext fail closed", async () => {
  const source = await snapshot();
  const encrypted = await encryptRecordSnapshot(
    source,
    "proposal-123",
    7n,
  );
  const other = await encryptRecordSnapshot(source, "proposal-123", 7n);

  await assert.rejects(
    () =>
      decryptRecordArchive(encrypted.archive, other.verificationKey),
    /does not match this encrypted record, or the file changed/,
  );

  const tampered = structuredClone(encrypted.archive);
  const firstCiphertextCharacter = tampered.ciphertext[0];
  tampered.ciphertext = `${firstCiphertextCharacter === "A" ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
  await assert.rejects(
    () => decryptRecordArchive(tampered, encrypted.verificationKey),
    /does not match this encrypted record, or the file changed/,
  );
});

test("archive parser rejects an invalid record reference", async () => {
  const source = await snapshot();
  const encrypted = await encryptRecordSnapshot(
    source,
    "proposal-123",
    7n,
  );
  const malformed = {
    ...encrypted.archive,
    record: { ...encrypted.archive.record, agreementId: "-1" },
  };

  assert.throws(
    () => parseEncryptedRecordArchive(JSON.stringify(malformed)),
    /not a valid encrypted OpenEscrow record/,
  );
  assert.throws(
    () => parseEncryptedRecordArchive("not-json"),
    /not a valid encrypted OpenEscrow record file/,
  );
});
