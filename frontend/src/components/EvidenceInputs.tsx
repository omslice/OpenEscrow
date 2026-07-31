import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  uploadEvidenceDocument,
  type NegotiationAccess,
} from "../lib/negotiations";

export function useEvidenceInputs(access?: NegotiationAccess | null) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = `${generatedId}-supporting-file`;
  const helpId = `${generatedId}-supporting-file-help`;
  const statusId = `${generatedId}-supporting-file-status`;
  const errorId = `${generatedId}-supporting-file-error`;
  const warningId = `${generatedId}-supporting-file-warning`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreFileFocusAfterRetryRef = useRef(false);
  const uploadScope = useMemo(
    () =>
      createAsyncOperationScope(
        `${access?.proposalId || "no-proposal"}:${access?.role || "no-role"}:${
          access?.token ? "access" : "no-access"
        }`,
      ),
    [access?.proposalId, access?.role, access?.token],
  );
  const [stateScope, setStateScope] = useState(uploadScope);
  const [uri, setUri] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFileHash, setUploadedFileHash] = useState<`0x${string}` | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    uploadScope.open();
    setStateScope(uploadScope);
    setUri("");
    setFile(null);
    setUploadedFileHash(null);
    setIsUploading(false);
    setIsRetrying(false);
    setUploadMessage(null);
    setUploadError(null);
    restoreFileFocusAfterRetryRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
    return () => uploadScope.close();
  }, [uploadScope]);

  const scopeIsCurrent = stateScope === uploadScope;
  const scopedFile = scopeIsCurrent ? file : null;
  const scopedUri = scopeIsCurrent ? uri : "";
  const scopedUploadMessage = scopeIsCurrent ? uploadMessage : null;
  const scopedUploadError = scopeIsCurrent ? uploadError : null;
  const scopedIsUploading = scopeIsCurrent && isUploading;
  const scopedIsRetrying = scopeIsCurrent && isRetrying;
  useLayoutEffect(() => {
    if (
      restoreFileFocusAfterRetryRef.current &&
      !scopedIsUploading &&
      scopedUploadMessage
    ) {
      restoreFileFocusAfterRetryRef.current = false;
      fileInputRef.current?.focus({ preventScroll: true });
    }
  }, [scopedIsUploading, scopedUploadMessage]);
  const contentHash =
    (scopeIsCurrent && uploadedFileHash) ||
    (("0x" + "0".repeat(64)) as `0x${string}`);
  const valid =
    scopeIsCurrent &&
    Boolean(access) &&
    Boolean(scopedFile) &&
    Boolean(uploadedFileHash) &&
    scopedUri.trim().length > 0 &&
    !scopedIsUploading;

  async function selectAndStoreFile(
    selectedFile: File | null,
    retrying = false,
  ) {
    const operationId = uploadScope.start();
    setStateScope(uploadScope);
    setFile(selectedFile);
    setUploadedFileHash(null);
    setUri("");
    setUploadMessage(null);
    setUploadError(null);
    setIsRetrying(retrying);
    if (!selectedFile) {
      setIsUploading(false);
      setIsRetrying(false);
      return;
    }
    if (!access) {
      setUploadError(
        "Open this agreement from your signed-in account before attaching documentation.",
      );
      setIsUploading(false);
      setIsRetrying(false);
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await uploadEvidenceDocument(access, selectedFile);
      if (!uploadScope.isCurrent(operationId)) return;
      setUri(uploaded.uri);
      setUploadedFileHash(uploaded.sha256 as `0x${string}`);
      setUploadMessage(
        uploaded.storageKind === "private" ||
          uploaded.storageKind === "encrypted-private"
          ? "Supporting file stored privately and ready to submit."
          : "Supporting file encrypted, stored, and ready to submit.",
      );
      if (retrying) {
        restoreFileFocusAfterRetryRef.current = true;
      }
    } catch (error) {
      if (!uploadScope.isCurrent(operationId)) return;
      setUploadError(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      if (uploadScope.isCurrent(operationId)) {
        setIsUploading(false);
        setIsRetrying(false);
      }
    }
  }

  const describedBy = [
    helpId,
    warningId,
    scopedIsUploading || scopedUploadMessage ? statusId : null,
    scopedUploadError ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const fields = (
    <>
      <div className="evidence-upload" aria-busy={scopedIsUploading}>
        <label htmlFor={inputId}>Supporting file</label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          aria-busy={scopedIsUploading}
          aria-describedby={describedBy}
          onChange={(event) =>
            void selectAndStoreFile(event.target.files?.[0] || null)
          }
        />
        <p className="field-help" id={helpId}>
          Attach one PDF, invoice, receipt, estimate, labor record, or photo. OpenEscrow
          stores it automatically; no document link or technical reference is required.
        </p>
        {scopedIsUploading && (
          <p
            className="hint"
            id={statusId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {scopedIsRetrying
              ? "Retrying supporting file upload..."
              : "Storing supporting file..."}
          </p>
        )}
        {scopedUploadMessage && (
          <p
            className="tx-success"
            id={statusId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {scopedUploadMessage}
          </p>
        )}
        {scopedUploadError && (
          <p className="tx-error" id={errorId} role="alert">
            {scopedUploadError}
          </p>
        )}
        {(scopedUploadError || scopedIsRetrying) && scopedFile && access && (
          <button
            className="btn btn-secondary"
            type="button"
            aria-disabled={scopedIsUploading}
            onClick={() => {
              if (!scopedIsUploading) void selectAndStoreFile(scopedFile, true);
            }}
          >
            {scopedIsUploading ? "Retrying upload..." : "Retry supporting file upload"}
          </button>
        )}
      </div>
      <p className="warning" id={warningId}>
        Supporting files are available only to agreement parties through OpenEscrow. This
        remains a testnet demo, so do not upload real tenancy records.
      </p>
    </>
  );

  return { fields, contentHash, uri: scopedUri, valid };
}
