import { useState } from "react";
import { keccak256, parseAbiItem, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import {
  AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
} from "../contracts/config";
import { shortAddr } from "../lib/format";

type ActivityEnvelope = {
  version: "openescrow-activity-v1";
  agreementId: string;
  activityType: 1 | 2 | 3 | 4;
  content: string;
};

type ActivityProofFile = {
  algorithm: "keccak256";
  contentHash: `0x${string}`;
  transactionHash: `0x${string}`;
  envelope: ActivityEnvelope;
};

type VerificationResult = {
  proof: ActivityProofFile;
  computedHash: `0x${string}`;
  publisher: `0x${string}`;
  blockNumber: bigint;
};

const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const activityEvent = parseAbiItem(
  "event ActivityPublished(uint256 indexed agreementId, uint8 indexed activityType, address indexed party, bytes32 contentHash, uint64 timestamp)",
);

function parseProofFile(raw: string): ActivityProofFile {
  const parsed = JSON.parse(raw) as Partial<ActivityProofFile>;
  const envelope = parsed.envelope as Partial<ActivityEnvelope> | undefined;
  if (
    parsed.algorithm !== "keccak256" ||
    !hashPattern.test(parsed.contentHash || "") ||
    !hashPattern.test(parsed.transactionHash || "") ||
    envelope?.version !== "openescrow-activity-v1" ||
    !/^(0|[1-9]\d*)$/.test(envelope.agreementId || "") ||
    ![1, 2, 3, 4].includes(Number(envelope.activityType)) ||
    typeof envelope.content !== "string" ||
    envelope.content.length < 4 ||
    envelope.content.length > 2_000
  ) {
    throw new Error("This is not a valid OpenEscrow activity proof file.");
  }
  return parsed as ActivityProofFile;
}

function canonicalEnvelope(envelope: ActivityEnvelope) {
  return JSON.stringify({
    version: "openescrow-activity-v1",
    agreementId: envelope.agreementId,
    activityType: envelope.activityType,
    content: envelope.content,
  });
}

export function ActivityProofVerifier({ agreementId }: { agreementId: bigint }) {
  const publicClient = usePublicClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  async function verify(file: File) {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (file.size > 100_000) {
        throw new Error("Proof files must be smaller than 100 KB.");
      }
      if (!publicClient) {
        throw new Error("The Base Sepolia connection is not ready.");
      }
      const proof = parseProofFile(await file.text());
      if (BigInt(proof.envelope.agreementId) !== agreementId) {
        throw new Error(`This proof belongs to agreement #${proof.envelope.agreementId}.`);
      }
      const computedHash = keccak256(toBytes(canonicalEnvelope(proof.envelope)));
      if (computedHash.toLowerCase() !== proof.contentHash.toLowerCase()) {
        throw new Error("The private content no longer matches the proof hash.");
      }

      const receipt = await publicClient.getTransactionReceipt({
        hash: proof.transactionHash,
      });
      if (receipt.status !== "success") {
        throw new Error("The referenced transaction did not succeed.");
      }
      const logs = await publicClient.getLogs({
        address: AGREEMENT_ACTIVITY_REGISTRY_ADDRESS,
        event: activityEvent,
        args: { agreementId },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });
      const matchingLog = logs.find(
        (log) =>
          log.transactionHash.toLowerCase() === proof.transactionHash.toLowerCase() &&
          Number(log.args.activityType) === proof.envelope.activityType &&
          log.args.contentHash.toLowerCase() === proof.contentHash.toLowerCase(),
      );
      const publisher = matchingLog?.args.party || null;
      if (!publisher) {
        throw new Error("No matching OpenEscrow activity receipt was found in this transaction.");
      }
      setResult({ proof, computedHash, publisher, blockNumber: receipt.blockNumber });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The proof file could not be verified.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <details className="technical-details activity-proof-verifier">
      <summary>Verify a private activity proof</summary>
      <p className="field-help">
        Select a downloaded OpenEscrow proof JSON. It stays in this browser while the app checks
        its content hash and matching Base Sepolia receipt.
      </p>
      <label>
        Private proof JSON
        <input
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
      {working && <p className="field-help">Checking the file and onchain receipt…</p>}
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="proof-verification-success" role="status">
          <strong>Proof verified</strong>
          <span>
            Agreement #{result.proof.envelope.agreementId} · activity type{" "}
            {result.proof.envelope.activityType} · publisher {shortAddr(result.publisher)}
          </span>
          <code title={result.computedHash}>{result.computedHash}</code>
          <span>Confirmed in block {result.blockNumber.toString()}.</span>
          <a
            href={`https://sepolia.basescan.org/tx/${result.proof.transactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Open verified transaction
          </a>
        </div>
      )}
    </details>
  );
}
