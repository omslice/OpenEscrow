export function buildEvidenceEncryptionCheck(evidence = {}) {
  const encryptedAtRest = evidence.encryptedAtRest === true;
  const keyringReady = evidence.keyringReady === true;
  const missingKeyCount = Number.isInteger(evidence.missingDecryptionKeyCount)
    ? evidence.missingDecryptionKeyCount
    : null;
  const unverifiedKeyCount = Number.isInteger(
    evidence.unverifiedEncryptionKeyCount,
  )
    ? evidence.unverifiedEncryptionKeyCount
    : null;
  const mismatchedKeyCount = Number.isInteger(
    evidence.mismatchedDecryptionKeyCount,
  )
    ? evidence.mismatchedDecryptionKeyCount
    : null;
  const referencedKeyCount = Number.isInteger(
    evidence.referencedEncryptionKeyCount,
  )
    ? evidence.referencedEncryptionKeyCount
    : null;

  let detail;
  let action;
  if (!encryptedAtRest) {
    detail =
      evidence.encryptionError ||
      "active evidence encryption key is not configured";
    action =
      "Set a base64-encoded 32-byte EVIDENCE_ENCRYPTION_KEY with a stable EVIDENCE_ENCRYPTION_KEY_ID, then restart the deployment.";
  } else if (!keyringReady) {
    if (mismatchedKeyCount && mismatchedKeyCount > 0) {
      detail = `${mismatchedKeyCount} configured evidence key backup${mismatchedKeyCount === 1 ? "" : "s"} ${mismatchedKeyCount === 1 ? "does" : "do"} not match the key material used for stored ciphertext`;
      action =
        "Restore the exact approved backup bytes for every mismatched key ID; do not guess, relabel, or replace existing ciphertext.";
    } else if (unverifiedKeyCount && unverifiedKeyCount > 0) {
      detail = `${unverifiedKeyCount} stored evidence key${unverifiedKeyCount === 1 ? "" : "s"} ${unverifiedKeyCount === 1 ? "lacks" : "lack"} verifiable key-fingerprint metadata`;
      action =
        "Complete the documented legacy-evidence recovery and fingerprint migration before relying on this keyring.";
    } else {
      detail =
        missingKeyCount && missingKeyCount > 0
          ? `${missingKeyCount} retained decryption key${missingKeyCount === 1 ? "" : "s"} required by stored evidence ${missingKeyCount === 1 ? "is" : "are"} missing`
          : "the complete retained evidence keyring could not be verified";
      action =
        "Restore every approved key ID referenced by stored evidence in EVIDENCE_DECRYPTION_KEYS; do not replace or discard ciphertext.";
    }
  } else {
    detail =
      referencedKeyCount == null
        ? "active key and retained keyring verified"
        : `active key and all ${referencedKeyCount} referenced key${referencedKeyCount === 1 ? "" : "s"} verified`;
    action = null;
  }

  return {
    label: "Evidence encryption and retained keyring",
    ready: encryptedAtRest && keyringReady,
    detail,
    required: true,
    action,
    validate:
      "readiness.evidence.encryptedAtRest === true and readiness.evidence.keyringReady === true",
  };
}
