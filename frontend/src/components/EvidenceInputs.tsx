import { useState } from "react";
import { keccak256, toBytes } from "viem";
import {
  uploadEvidenceDocument,
  type NegotiationAccess,
} from "../lib/negotiations";

/**
 * Shared evidence-entry UX: the description text is hashed client-side and only the
 * hash goes on-chain, alongside a caller-supplied pointer/URI. Per spec decision 6,
 * the raw description is never itself sent to the contract - only keccak256(description).
 */
export function useEvidenceInputs(access?: NegotiationAccess | null) {
  const [description, setDescription] = useState("");
  const [uri, setUri] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFileHash, setUploadedFileHash] = useState<`0x${string}` | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const contentHash =
    uploadedFileHash ||
    (description
      ? keccak256(toBytes(description))
      : (("0x" + "0".repeat(64)) as `0x${string}`));
  const valid = description.trim().length > 0 && uri.trim().length > 0;

  const fields = (
    <>
      <label>
        Evidence description (kept private; only a verification hash is sent onchain)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 'Move-out inspection notes, unit 4B, water damage in kitchen ceiling'"
          rows={3}
        />
      </label>
      {access && (
        <div className="evidence-upload">
          <label>
            Invoice or supporting document
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setUploadedFileHash(null);
                setUri("");
                setUploadMessage(null);
              }}
            />
          </label>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!file || isUploading}
            onClick={async () => {
              if (!file) return;
              setIsUploading(true);
              setUploadError(null);
              setUploadMessage(null);
              try {
                const uploaded = await uploadEvidenceDocument(access, file);
                setUri(uploaded.uri);
                setUploadedFileHash(uploaded.sha256 as `0x${string}`);
                setUploadMessage(
                  uploaded.storageKind === "private"
                    ? `Stored privately. SHA-256 receipt: ${uploaded.sha256.slice(0, 14)}…`
                    : `Published to IPFS: ${uploaded.reference}`,
                );
              } catch (error) {
                setUploadError(error instanceof Error ? error.message : "The upload failed.");
              } finally {
                setIsUploading(false);
              }
            }}
          >
            {isUploading ? "Uploading..." : "Store supporting documentation"}
          </button>
          {uploadMessage && <p className="tx-success">{uploadMessage}</p>}
          {uploadError && <p className="tx-error">{uploadError}</p>}
        </div>
      )}
      <label>
        Evidence pointer / URI (required)
        <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://... or a privacy-safe document pointer" />
      </label>
      <p className="warning">
        The default evidence vault limits retrieval to agreement-party links and records a
        content hash for verification. A manually entered IPFS URI remains public and permanent.
        This is still a testnet demo, so do not upload real tenancy records.
      </p>
    </>
  );

  return { fields, contentHash, uri, valid };
}
