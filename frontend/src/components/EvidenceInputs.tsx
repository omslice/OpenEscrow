import { useState } from "react";
import { keccak256, toBytes } from "viem";
import {
  uploadEvidenceToIpfs,
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const contentHash = description ? keccak256(toBytes(description)) : ("0x" + "0".repeat(64)) as `0x${string}`;
  const valid = description.trim().length > 0 && uri.trim().length > 0;

  const fields = (
    <>
      <label>
        Evidence description (hashed locally, never sent on-chain as text)
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
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
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
                const uploaded = await uploadEvidenceToIpfs(access, file);
                setUri(uploaded.uri);
                setUploadMessage(`Uploaded to IPFS: ${uploaded.cid}`);
              } catch (error) {
                setUploadError(error instanceof Error ? error.message : "The upload failed.");
              } finally {
                setIsUploading(false);
              }
            }}
          >
            {isUploading ? "Uploading..." : "Upload documentation to IPFS"}
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
        Public IPFS is public and permanent. Remove names, physical addresses, account details, and
        other sensitive information before upload; use an encrypted document for anything private.
      </p>
    </>
  );

  return { fields, contentHash, uri, valid };
}
