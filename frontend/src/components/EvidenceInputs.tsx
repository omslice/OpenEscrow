import { useState } from "react";
import {
  uploadEvidenceDocument,
  type NegotiationAccess,
} from "../lib/negotiations";

export function useEvidenceInputs(access?: NegotiationAccess | null) {
  const [uri, setUri] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFileHash, setUploadedFileHash] = useState<`0x${string}` | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const contentHash =
    uploadedFileHash || (("0x" + "0".repeat(64)) as `0x${string}`);
  const valid =
    Boolean(access) &&
    Boolean(file) &&
    Boolean(uploadedFileHash) &&
    uri.trim().length > 0 &&
    !isUploading;

  async function selectAndStoreFile(selectedFile: File | null) {
    setFile(selectedFile);
    setUploadedFileHash(null);
    setUri("");
    setUploadMessage(null);
    setUploadError(null);
    if (!selectedFile) return;
    if (!access) {
      setUploadError(
        "Open this agreement from your signed-in account before attaching documentation.",
      );
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await uploadEvidenceDocument(access, selectedFile);
      setUri(uploaded.uri);
      setUploadedFileHash(uploaded.sha256 as `0x${string}`);
      setUploadMessage(
        uploaded.storageKind === "private" ||
          uploaded.storageKind === "encrypted-private"
          ? "Supporting file stored privately and ready to submit."
          : "Supporting file encrypted, stored, and ready to submit.",
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const fields = (
    <>
      <div className="evidence-upload">
        <label>
          Supporting file
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={isUploading}
            onChange={(event) =>
              void selectAndStoreFile(event.target.files?.[0] || null)
            }
          />
        </label>
        <p className="field-help">
          Attach one PDF, invoice, receipt, estimate, labor record, or photo. OpenEscrow
          stores it automatically; no document link or technical reference is required.
        </p>
        {isUploading && <p className="hint">Storing supporting file…</p>}
        {uploadMessage && <p className="tx-success">{uploadMessage}</p>}
        {uploadError && <p className="tx-error">{uploadError}</p>}
      </div>
      <p className="warning">
        Supporting files are available only to agreement parties through OpenEscrow. This
        remains a testnet demo, so do not upload real tenancy records.
      </p>
    </>
  );

  return { fields, contentHash, uri, valid };
}
