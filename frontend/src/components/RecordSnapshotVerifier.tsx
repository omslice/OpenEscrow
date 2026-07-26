import { useState } from "react";
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
import { shortAddr } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";

type SnapshotVerification = {
  hash: `0x${string}`;
  anchoredBy: `0x${string}`[];
  agreementId: string | null;
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

  async function verify() {
    if (!file) {
      setError("Choose the encrypted OpenEscrow record JSON first.");
      return;
    }
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (file.size > 8_000_000) {
        throw new Error("Encrypted record files must be smaller than 8 MB.");
      }
      const archive = parseEncryptedRecordArchive(await file.text());
      if (archive.record.proposalId !== proposalId) {
        throw new Error("This encrypted record belongs to a different OpenEscrow proposal.");
      }
      if (
        agreementId !== undefined &&
        archive.record.agreementId !== agreementId.toString()
      ) {
        throw new Error("This encrypted record belongs to a different onchain agreement.");
      }
      const decrypted = await decryptRecordArchive(archive, verificationKey);
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
          "This encrypted record belongs to a different OpenEscrow contract release.",
        );
      }
      if (
        onchain?.agreementId !== undefined &&
        onchain.agreementId !== archive.record.agreementId
      ) {
        throw new Error("The encrypted record's agreement reference does not match its contents.");
      }

      let anchoredBy: `0x${string}`[] = [];
      if (agreementId !== undefined) {
        if (!registryReady) {
          throw new Error(
            "Onchain verification is temporarily unavailable because the record service is not connected to this OpenEscrow release.",
          );
        }
        if (!publicClient) throw new Error("The Base Sepolia connection is not ready.");
        const readContract = publicClient.readContract as unknown as ContractReader;
        const agreement = (await readContract({
          address: OPEN_ESCROW_ADDRESS,
          abi: OpenEscrowABI,
          functionName: "getAgreement",
          args: [agreementId],
        })) as Agreement;
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
        anchoredBy = anchorChecks
          .filter((check) => check.anchored)
          .map((check) => check.party);
      }
      setResult({
        hash: decrypted.hash,
        anchoredBy,
        agreementId: archive.record.agreementId,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The encrypted record could not be verified.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="record-snapshot-verifier" aria-labelledby={`verify-record-${proposalId}`}>
      <div>
        <strong id={`verify-record-${proposalId}`}>Verify an encrypted record onchain</strong>
        <p className="field-help">
          Choose the encrypted JSON and paste its separately saved verification key. Decryption,
          hashing, and the Base Sepolia check happen in this browser.
        </p>
      </div>
      <label>
        Encrypted record JSON
        <input
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
          registryChecking ||
          (agreementId !== undefined && !registryReady) ||
          !file ||
          !verificationKey.trim()
        }
        onClick={() => void verify()}
      >
        {working ? "Verifying encrypted record..." : "Verify encrypted record onchain"}
      </button>
      {!registryChecking && agreementId !== undefined && !registryReady && (
        <p className="tx-error" role="alert">
          Onchain verification is temporarily unavailable because the record service is
          not connected to this OpenEscrow release.
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
            agreementId === undefined || result.anchoredBy.length
              ? "proof-verification-success"
              : "proof-verification-warning"
          }
          role="status"
        >
          <strong>
            {agreementId === undefined
              ? "Encrypted record decrypted and integrity verified"
              : result.anchoredBy.length
                ? "Encrypted record verified onchain"
                : "Record integrity verified, but no party anchor was found"}
          </strong>
          <code title={result.hash}>SHA-256: {result.hash}</code>
          {result.anchoredBy.length > 0 && (
            <span>
              Anchored by agreement {result.anchoredBy.length === 1 ? "party" : "parties"}{" "}
              {result.anchoredBy.map(shortAddr).join(", ")}.
            </span>
          )}
          {agreementId === undefined && (
            <span>This proposal has not been assigned an onchain agreement ID.</span>
          )}
          {agreementId !== undefined && result.anchoredBy.length === 0 && (
            <span>
              The file is intact, but its hash has not been anchored by a current agreement party.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
