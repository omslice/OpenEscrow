import type { AgreementSnapshot } from "./negotiations";

export type EncryptedRecordArchive = {
  schema: "openescrow.encrypted-agreement-record.v1";
  encryption: {
    algorithm: "AES-256-GCM";
    iv: string;
  };
  integrity: {
    algorithm: "SHA-256";
    canonicalRecordHash: `0x${string}`;
  };
  record: {
    proposalId: string;
    agreementId: string | null;
  };
  ciphertext: string;
};

const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const KEY_PREFIX = "oe1_";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("The verification key or encrypted record is malformed.");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function archiveAdditionalData(
  proposalId: string,
  agreementId: string | null,
  canonicalRecordHash: string,
): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      schema: "openescrow.encrypted-agreement-record.v1",
      proposalId,
      agreementId,
      canonicalRecordHash,
    }),
  );
}

export async function sha256Hex(content: string): Promise<`0x${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  return `0x${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function encryptRecordSnapshot(
  snapshot: AgreementSnapshot,
  proposalId: string,
  agreementId?: bigint,
): Promise<{ archive: EncryptedRecordArchive; verificationKey: string }> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const normalizedAgreementId = agreementId?.toString() ?? null;
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(
        archiveAdditionalData(
          proposalId,
          normalizedAgreementId,
          snapshot.hash,
        ),
      ),
    },
    key,
    encoder.encode(snapshot.canonical),
  );
  return {
    archive: {
      schema: "openescrow.encrypted-agreement-record.v1",
      encryption: {
        algorithm: "AES-256-GCM",
        iv: bytesToBase64Url(iv),
      },
      integrity: {
        algorithm: "SHA-256",
        canonicalRecordHash: snapshot.hash,
      },
      record: {
        proposalId,
        agreementId: normalizedAgreementId,
      },
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    },
    verificationKey: `${KEY_PREFIX}${bytesToBase64Url(rawKey)}`,
  };
}

export function parseEncryptedRecordArchive(raw: string): EncryptedRecordArchive {
  const parsed = JSON.parse(raw) as Partial<EncryptedRecordArchive>;
  if (
    parsed.schema !== "openescrow.encrypted-agreement-record.v1" ||
    parsed.encryption?.algorithm !== "AES-256-GCM" ||
    typeof parsed.encryption.iv !== "string" ||
    parsed.integrity?.algorithm !== "SHA-256" ||
    !HASH_PATTERN.test(parsed.integrity.canonicalRecordHash || "") ||
    typeof parsed.record?.proposalId !== "string" ||
    !parsed.record.proposalId ||
    (parsed.record.agreementId !== null &&
      !/^(0|[1-9]\d*)$/u.test(parsed.record.agreementId || "")) ||
    typeof parsed.ciphertext !== "string" ||
    !parsed.ciphertext
  ) {
    throw new Error("This is not a valid encrypted OpenEscrow record.");
  }
  return parsed as EncryptedRecordArchive;
}

export async function decryptRecordArchive(
  archive: EncryptedRecordArchive,
  verificationKey: string,
): Promise<{ canonical: string; hash: `0x${string}`; snapshot: Record<string, unknown> }> {
  const normalizedKey = verificationKey.trim();
  if (!normalizedKey.startsWith(KEY_PREFIX)) {
    throw new Error("Enter the verification key saved with this encrypted record.");
  }
  const rawKey = base64UrlToBytes(normalizedKey.slice(KEY_PREFIX.length));
  const iv = base64UrlToBytes(archive.encryption.iv);
  if (rawKey.length !== 32 || iv.length !== 12) {
    throw new Error("The verification key or encrypted record is malformed.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(
          archiveAdditionalData(
            archive.record.proposalId,
            archive.record.agreementId,
            archive.integrity.canonicalRecordHash,
          ),
        ),
      },
      key,
      toArrayBuffer(base64UrlToBytes(archive.ciphertext)),
    );
  } catch {
    throw new Error("The verification key does not match this encrypted record, or the file changed.");
  }
  const canonical = decoder.decode(plaintext);
  const hash = await sha256Hex(canonical);
  if (hash.toLowerCase() !== archive.integrity.canonicalRecordHash.toLowerCase()) {
    throw new Error("The decrypted record does not match its integrity hash.");
  }
  const snapshot = JSON.parse(canonical) as Record<string, unknown>;
  if (
    (snapshot.schema !== "openescrow.agreement-record.v1" &&
      snapshot.schema !== "openescrow.agreement-record.v2") ||
    snapshot.proposalId !== archive.record.proposalId
  ) {
    throw new Error("The decrypted content is not the record described by this archive.");
  }
  return { canonical, hash, snapshot };
}
