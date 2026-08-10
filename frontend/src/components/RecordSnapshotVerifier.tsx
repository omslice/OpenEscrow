import { useLayoutEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  AgreementActivityRegistryABI,
  OPEN_ESCROW_ADDRESS,
  OpenEscrowABI,
  ZERO_ADDRESS,
} from "../contracts/config";
import {
  decryptRecordArchive,
  parseEncryptedRecordArchive,
} from "../lib/recordArchive";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import { shortAddr } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";

type SnapshotVerification = {
  hash: `0x${string}`;
  anchoredBy: `0x${string}`[];
  agreementId: string | null;
  onchainStatus: "not_applicable" | "verified" | "not_anchored" | "unavailable";
};

type ContractReader = (parameters: {
  address: `0x${string}`;
  abi: typeof OpenEscrowABI;
  functionName: string;
  args: readonly unknown[];
}) => Promise<unknown>;

export function RecordSnapshotVerifier({
  proposalId,
  agreementId,
  registryReady,
  registryChecking,
}: {
  proposalId: string;
  agreementId?: bigint;
  registryReady: boolean;
  registryChecking: boolean;
}) {
  const publicClient = usePublicClient();
  const [file, setFile] = useState<File | null>(null);
  const [verificationKey, setVerificationKey] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SnapshotVerification | null>(null);
  const verificationScopeKey = JSON.stringify([
    proposalId,
    agreementId?.toString() ?? null,
    registryReady,
  ]);
  const verificationScope = useMemo(
    () => createAsyncOperationScope(verificationScopeKey),
    [verificationScopeKey],
  );

  useLayoutEffect(() => {
    verificationScope.open();
    setFile(null);
    setVerificationKey("");
    setWorking(false);
    setError(null);
    setResult(null);
    return () => verificationScope.close();
  }, [verificationScope]);

  async function verify() {
    const selectedFile = file;
    const selectedVerificationKey = verificationKey;
    if (!selectedFile) {
      setError("Choose the encrypted OpenEscrow record file first.");
      return;
    }
    const operationId = verificationScope.start();
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (selectedFile.size > 8_000_000) {
        throw new Error("Encrypted record files must be smaller than 8 MB.");
      }
      const archive = parseEncryptedRecordArchive(await selectedFile.text());
      if (!verificationScope.isCurrent(operationId)) return;
      if (archive.record.proposalId !== proposalId) {
        throw new Error("This encrypted record belongs to a different OpenEscrow proposal.");
      }
      if (
        agreementId !== undefined &&
        archive.record.agreementId !== agreementId.toString()
      ) {
        throw new Error("This encrypted record belongs to a different finalized agreement.");
      }
      const decrypted = await decryptRecordArchive(
        archive,
        selectedVerificationKey,
      );
      if (!verificationScope.isCurrent(operationId)) return;
      const onchain = decrypted.snapshot.onchain as
        | {
            chainId?: number;
            escrowAddress?: string;
            activityRegistryAddress?: string;
            agreementId?: string | null;
          }
        | undefined;
      if (
        decrypted.snapshot.schema === "openescrow.agreement-record.v3" &&
        (onchain?.chainId !== 84532 ||
          onchain.escrowAddress?.toLowerCase() !==
            OPEN_ESCROW_ADDRESS.toLowerCase() ||
          onchain.activityRegistryAddress?.toLowerCase() !==
            AGREEMENT_ACTIVITY_REGISTRY_ADDRESS.toLowerCase())
      ) {
        throw new Error(
          "This encrypted record belongs to a different OpenEscrow release.",
        );
      }
      if (
        onchain?.agreementId !== undefined &&
        onchain.agreementId !== archive.record.agreementId
      ) {
        throw new Error("The agreement number in this file does not match its contents.");
      }

      let anchoredBy: `0x${string}`[] = [];
      let onchainStatus: SnapshotVerification["onchainStatus"] =
        agreementId === undefined ? "not_applicable" : "unavailable";
      if (agreementId !== undefined && registryReady && publicClient) {
        try {
          const readContract = publicClient.readContract as unknown as ContractReader;
          const agreement = (await readContract({
            address: OPEN_ESCROW_ADDRESS,
            abi: OpenEscrowABI,
            functionName: "getAgreement",
            args: [agreementId],
          })) as Agreement;
          if (!verificationScope.isCurrent(operationId)) return;
          const parties = Array.from(
            new Set(
              [agreement.landlord, agreement.tenant, agreement.arbiter]
                .filter((party) => party.toLowerCase() !== ZERO_ADDRESS)
                .map((party) => party.toLowerCase()),
            ),
          ) as `0x${string}`[];
          const anchorChecks = await Promise.all(
            parties.map(async (party) => ({
              party,
              anchored: (await readContract({
                address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
                abi: AgreementActivityRegistryABI,
                functionName: "anchoredBy",
                args: [agreementId, decrypted.hash, party],
              })) as boolean,
            })),
          );
          if (!verificationScope.isCurrent(operationId)) return;
          anchoredBy = anchorChecks
            .filter((check) => check.anchored)
            .map((check) => check.party);
          onchainStatus = anchoredBy.length ? "verified" : "not_anchored";
        } catch {
          if (!verificationScope.isCurrent(operationId)) return;
          onchainStatus = "unavailable";
        }
      }
      setResult({
        hash: decrypted.hash,
        anchoredBy,
        agreementId: archive.record.agreementId,
        onchainStatus,
      });
    } catch (cause) {
      if (!verificationScope.isCurrent(operationId)) return;
      setError(
        cause instanceof Error ? cause.message : "The encrypted record could not be verified.",
      );
    } finally {
      if (verificationScope.isCurrent(operationId)) setWorking(false);
    }
  }

  return (
    <section className="record-snapshot-verifier" aria-labelledby={`verify-record-${proposalId}`}>
      <div>
        <strong id={`verify-record-${proposalId}`}>Check an encrypted record</strong>
        <p className="field-help">
          Choose the encrypted record and enter its separately saved key. The check happens
          entirely in this browser. When available, OpenEscrow also confirms the optional public
          proof on the test network.
        </p>
      </div>
      <label>
        Encrypted record file
        <input
          key={verificationScope.key}
          type="file"
          accept="application/json,.json"
          disabled={working}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError(null);
            setResult(null);
          }}
        />
      </label>
      <label>
        Verification key
        <input
          type="password"
          value={verificationKey}
          autoComplete="off"
          spellCheck={false}
          placeholder="oe1_..."
          disabled={working}
          onChange={(event) => {
            setVerificationKey(event.target.value);
            setError(null);
            setResult(null);
          }}
        />
      </label>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={
          working ||
          !file ||
          !verificationKey.trim()
        }
        onClick={() => void verify()}
      >
        {working
          ? "Checking encrypted record..."
          : agreementId !== undefined && registryReady
            ? "Check record and public proof"
            : "Check encrypted record"}
      </button>
      {agreementId !== undefined && !registryReady && (
        <p className="field-help">
          You can still verify the downloaded record now.{" "}
          {registryChecking
            ? "The public proof service is still being checked."
            : "The public proof check will be skipped until the record service is connected to this OpenEscrow release."}
        </p>
      )}
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div
          className={
            result.onchainStatus === "not_applicable" ||
            result.onchainStatus === "verified"
              ? "proof-verification-success"
              : "proof-verification-warning"
          }
        >
          <p className="verification-result-summary" role="status">
            <strong>
              {result.onchainStatus === "not_applicable"
                ? "Encrypted record opened and verified"
                : result.onchainStatus === "verified"
                  ? "Encrypted record and public proof verified"
                  : result.onchainStatus === "not_anchored"
                    ? "Record verified; no matching public proof found"
                    : "Record verified; public proof check unavailable"}
            </strong>
            <span>
              {result.onchainStatus === "not_applicable"
                ? "The downloaded file is intact. This proposal has not been finalized as an active deposit yet."
                : result.onchainStatus === "verified"
                  ? "The downloaded file is intact and matches a public timestamped proof."
                  : result.onchainStatus === "not_anchored"
                    ? "The downloaded file is intact, but no current agreement party has saved a matching public proof."
                    : "The downloaded file is intact. Try again later to check its public timestamped proof."}
            </span>
          </p>
          <details className="technical-details verification-proof-details">
            <summary>Verification details</summary>
            <code title={result.hash}>SHA-256: {result.hash}</code>
            {result.onchainStatus === "verified" && (
              <span>
                Proof saved by wallet {result.anchoredBy.length === 1 ? "address" : "addresses"}:{" "}
                {result.anchoredBy.map(shortAddr).join(", ")}.
              </span>
            )}
          </details>
        </div>
      )}
    </section>
  );
}
