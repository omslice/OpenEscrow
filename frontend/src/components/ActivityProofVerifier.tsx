import { useLayoutEffect, useMemo, useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
  OPEN_ESCROW_ADDRESS,
} from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { shortAddr } from "../lib/format";
import {
  assertActivityProofContext,
  hashActivityEnvelope,
  parseActivityProofFile,
  type ActivityProofFile,
} from "../lib/activityProof";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";

type VerificationResult = {
  proof: ActivityProofFile;
  computedHash: `0x${string}`;
  publisher: `0x${string}`;
  blockNumber: bigint;
};

const activityEvent = parseAbiItem(
  "event ActivityPublished(uint256 indexed agreementId, uint8 indexed activityType, address indexed party, bytes32 contentHash, uint64 timestamp)",
);

const activityTypeLabel: Record<number, string> = {
  1: "Private note",
  2: "Document receipt",
  3: "Formal notice",
  4: "Decision",
};

export function ActivityProofVerifier({ agreementId }: { agreementId: bigint }) {
  const publicClient = usePublicClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const verificationScopeKey = agreementId.toString();
  const verificationScope = useMemo(
    () => createAsyncOperationScope(verificationScopeKey),
    [verificationScopeKey],
  );

  useLayoutEffect(() => {
    verificationScope.open();
    setWorking(false);
    setError(null);
    setResult(null);
    return () => verificationScope.close();
  }, [verificationScope]);

  async function verify(file: File) {
    const operationId = verificationScope.start();
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (file.size > 100_000) {
        throw new Error("Private verification files must be smaller than 100 KB.");
      }
      if (!publicClient) {
        throw new Error("The public proof service is not ready. Try again shortly.");
      }
      const proof = parseActivityProofFile(await file.text());
      if (!verificationScope.isCurrent(operationId)) return;
      assertActivityProofContext(
        proof,
        OPEN_ESCROW_ADDRESS,
        AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
      );
      if (BigInt(proof.envelope.agreementId) !== agreementId) {
        throw new Error(
          `This proof belongs to ${agreementReference(proof.envelope.agreementId)}.`,
        );
      }
      const computedHash = hashActivityEnvelope(proof.envelope);
      if (computedHash.toLowerCase() !== proof.contentHash.toLowerCase()) {
        throw new Error(
          "The private text or document details no longer match this proof.",
        );
      }

      const receipt = await publicClient.getTransactionReceipt({
        hash: proof.transactionHash,
      });
      if (!verificationScope.isCurrent(operationId)) return;
      if (receipt.status !== "success") {
        throw new Error("The public receipt did not complete successfully.");
      }
      if (
        receipt.to?.toLowerCase() !==
        AGREEMENT_ACTIVITY_REGISTRY_ADDRESS.toLowerCase()
      ) {
        throw new Error(
          "This receipt belongs to a different OpenEscrow release.",
        );
      }
      const logs = await publicClient.getLogs({
        address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
        event: activityEvent,
        args: { agreementId },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });
      if (!verificationScope.isCurrent(operationId)) return;
      const matchingLog = logs.find(
        (log) =>
          log.transactionHash.toLowerCase() === proof.transactionHash.toLowerCase() &&
          Number(log.args.activityType) === proof.envelope.activityType &&
          log.args.contentHash.toLowerCase() === proof.contentHash.toLowerCase(),
      );
      const publisher = matchingLog?.args.party || null;
      if (!publisher) {
        throw new Error("No matching public OpenEscrow receipt was found.");
      }
      setResult({ proof, computedHash, publisher, blockNumber: receipt.blockNumber });
    } catch (cause) {
      if (!verificationScope.isCurrent(operationId)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The private verification file could not be checked.",
      );
    } finally {
      if (verificationScope.isCurrent(operationId)) setWorking(false);
    }
  }

  return (
    <details className="technical-details activity-proof-verifier">
      <summary>Check a private timestamped proof</summary>
      <p className="field-help">
        Choose the private verification file you downloaded earlier. It stays in this browser
        while OpenEscrow confirms that its contents match the public timestamped receipt.
      </p>
      <label>
        Private verification file
        <input
          key={verificationScope.key}
          type="file"
          accept="application/json,.json"
          disabled={working}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void verify(file);
            event.target.value = "";
          }}
        />
      </label>
      {working && <p className="field-help">Checking the file and public receipt…</p>}
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="proof-verification-success">
          <p className="tx-success" role="status">
            <strong>Proof verified</strong>
            <span>
              This private file matches {agreementReference(result.proof.envelope.agreementId)}
              {" "}and its public timestamped receipt.
            </span>
          </p>
          <details className="technical-details activity-verification-details">
            <summary>Verification details</summary>
            <span>
              Record type: {activityTypeLabel[result.proof.envelope.activityType] || "Other"}
            </span>
            <span>Saved by wallet: {shortAddr(result.publisher)}</span>
            <code title={result.computedHash}>
              Digital fingerprint: {result.computedHash}
            </code>
            <span>
              Confirmed in test-network block {result.blockNumber.toString()}.
            </span>
            <a
              href={`https://sepolia.basescan.org/tx/${result.proof.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View public receipt
            </a>
          </details>
        </div>
      )}
    </details>
  );
}
