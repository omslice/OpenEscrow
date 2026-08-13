import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  activateCandidateManifest,
  validateIndependentVerification,
} from "./apply-deployment-candidate.mjs";

test("activating a candidate preserves evidence and marks the exact cohort active", () => {
  const candidate = {
    schema: "openescrow.deployment-manifest/v2",
    cohortStatus: "candidate-unconfigured",
    sourceCommit: "a".repeat(40),
    reciprocalConfiguration: { liveBindingsVerified: true },
  };
  const result = activateCandidateManifest(
    candidate,
    { cohortStatus: "active-testnet" },
    "2026-08-13T23:00:00.000Z",
  );
  assert.equal(result.cohortStatus, "active-testnet");
  assert.equal(result.sourceCommit, candidate.sourceCommit);
  assert.equal(result.verification.liveBindingsVerified, true);
  assert.equal(result.activatedAtUtc, "2026-08-13T23:00:00.000Z");
});

test("activation refuses to overwrite a non-active rollback manifest", () => {
  assert.throws(
    () => activateCandidateManifest({}, { cohortStatus: "candidate-unconfigured" }, "now"),
    /not an active testnet rollback source/,
  );
});

function verificationFixture() {
  const candidate = {
    schema: "openescrow.deployment-manifest/v2",
    sourceCommit: "a".repeat(40),
    tokens: {
      plain: "0x1111111111111111111111111111111111111111",
      yield: "0x2222222222222222222222222222222222222222",
    },
    openEscrow: { address: "0x3333333333333333333333333333333333333333" },
    operationsReserve: { address: "0x4444444444444444444444444444444444444444" },
    agreementActivityRegistry: {
      address: "0x5555555555555555555555555555555555555555",
    },
  };
  const source = `${JSON.stringify(candidate, null, 2)}\n`;
  const codeHashes = Object.fromEntries(
    ["TestUSDC", "TestAaveUSDC", "OpenEscrow", "OperationsReserve", "AgreementActivityRegistry"].map(
      (key, index) => [key, `0x${String(index + 1).repeat(64)}`],
    ),
  );
  const evidence = {
    schema: "openescrow.base-sepolia-independent-verification/v1",
    sourceCommit: candidate.sourceCommit,
    candidateManifest: "deployments/base-sepolia-candidate.json",
    candidateManifestSha256: createHash("sha256").update(source).digest("hex"),
    status: "passed",
    transactionCount: 6,
    contractAddresses: {
      TestUSDC: candidate.tokens.plain,
      TestAaveUSDC: candidate.tokens.yield,
      OpenEscrow: candidate.openEscrow.address,
      OperationsReserve: candidate.operationsReserve.address,
      AgreementActivityRegistry: candidate.agreementActivityRegistry.address,
    },
    rpcAgreement: ["https://rpc-one.invalid", "https://rpc-two.invalid"].map((rpcUrl) => ({
      rpcUrl,
      chainId: 84_532,
      receiptsVerified: 6,
      reciprocalBindingsVerified: true,
      codeHashes,
    })),
  };
  return { candidate, evidence, source };
}

test("candidate activation requires exact two-RPC independent verification", () => {
  const { candidate, evidence, source } = verificationFixture();
  assert.deepEqual(validateIndependentVerification(candidate, evidence, source), {
    candidateManifestSha256: evidence.candidateManifestSha256,
    rpcCount: 2,
    transactionCount: 6,
  });
});

test("candidate activation rejects evidence for different manifest bytes", () => {
  const { candidate, evidence, source } = verificationFixture();
  assert.throws(
    () => validateIndependentVerification(candidate, evidence, `${source} `),
    /exact candidate manifest bytes/,
  );
});

test("candidate activation rejects disagreement between RPC runtime code", () => {
  const { candidate, evidence, source } = verificationFixture();
  evidence.rpcAgreement[1].codeHashes = {
    ...evidence.rpcAgreement[1].codeHashes,
    OpenEscrow: `0x${"f".repeat(64)}`,
  };
  assert.throws(
    () => validateIndependentVerification(candidate, evidence, source),
    /disagree on OpenEscrow runtime code/,
  );
});
