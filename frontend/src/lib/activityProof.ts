import { keccak256, toBytes } from "viem";

export type ActivityEnvelopeV1 = {
  version: "openescrow-activity-v1";
  agreementId: string;
  activityType: 1 | 2 | 3 | 4;
  content: string;
};

export type ActivityEnvelopeV2 = {
  version: "openescrow-activity-v2";
  chainId: 84532;
  escrowAddress: `0x${string}`;
  registryAddress: `0x${string}`;
  agreementId: string;
  activityType: 1 | 2 | 3 | 4;
  content: string;
};

export type ActivityEnvelope = ActivityEnvelopeV1 | ActivityEnvelopeV2;

export type ActivityProofFile = {
  algorithm: "keccak256";
  contentHash: `0x${string}`;
  transactionHash: `0x${string}`;
  envelope: ActivityEnvelope;
};

const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export function createActivityEnvelopeV2(parameters: {
  escrowAddress: `0x${string}`;
  registryAddress: `0x${string}`;
  agreementId: bigint;
  activityType: 1 | 2 | 3 | 4;
  content: string;
}): ActivityEnvelopeV2 {
  return {
    version: "openescrow-activity-v2",
    chainId: 84532,
    escrowAddress: parameters.escrowAddress,
    registryAddress: parameters.registryAddress,
    agreementId: parameters.agreementId.toString(),
    activityType: parameters.activityType,
    content: parameters.content,
  };
}

export function canonicalActivityEnvelope(envelope: ActivityEnvelope): string {
  if (envelope.version === "openescrow-activity-v2") {
    return JSON.stringify({
      version: "openescrow-activity-v2",
      chainId: envelope.chainId,
      escrowAddress: envelope.escrowAddress,
      registryAddress: envelope.registryAddress,
      agreementId: envelope.agreementId,
      activityType: envelope.activityType,
      content: envelope.content,
    });
  }
  return JSON.stringify({
    version: "openescrow-activity-v1",
    agreementId: envelope.agreementId,
    activityType: envelope.activityType,
    content: envelope.content,
  });
}

export function hashActivityEnvelope(envelope: ActivityEnvelope): `0x${string}` {
  return keccak256(toBytes(canonicalActivityEnvelope(envelope)));
}

export function parseActivityProofFile(raw: string): ActivityProofFile {
  let parsed: Partial<ActivityProofFile>;
  try {
    parsed = JSON.parse(raw) as Partial<ActivityProofFile>;
  } catch {
    throw new Error("This is not a valid OpenEscrow private verification file.");
  }
  const envelope = parsed.envelope as Partial<ActivityEnvelope> | undefined;
  if (
    parsed.algorithm !== "keccak256" ||
    !hashPattern.test(parsed.contentHash || "") ||
    !hashPattern.test(parsed.transactionHash || "") ||
    (envelope?.version !== "openescrow-activity-v1" &&
      envelope?.version !== "openescrow-activity-v2") ||
    !/^(0|[1-9]\d*)$/.test(envelope.agreementId || "") ||
    ![1, 2, 3, 4].includes(Number(envelope.activityType)) ||
    typeof envelope.content !== "string" ||
    envelope.content.length < 4 ||
    envelope.content.length > 2_000
  ) {
    throw new Error("This is not a valid OpenEscrow private verification file.");
  }
  if (
    envelope.version === "openescrow-activity-v2" &&
    (envelope.chainId !== 84532 ||
      !addressPattern.test(envelope.escrowAddress || "") ||
      !addressPattern.test(envelope.registryAddress || ""))
  ) {
    throw new Error("This is not a valid OpenEscrow private verification file.");
  }
  return parsed as ActivityProofFile;
}

export function assertActivityProofContext(
  proof: ActivityProofFile,
  expectedEscrow: `0x${string}`,
  expectedRegistry: `0x${string}`,
) {
  if (
    proof.envelope.version === "openescrow-activity-v2" &&
    (proof.envelope.escrowAddress.toLowerCase() !==
      expectedEscrow.toLowerCase() ||
      proof.envelope.registryAddress.toLowerCase() !==
        expectedRegistry.toLowerCase())
  ) {
    throw new Error(
      "This file belongs to a different OpenEscrow release.",
    );
  }
}
