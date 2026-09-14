import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./check-pilot-readiness.mjs", import.meta.url),
);
const frontendDir = fileURLToPath(new URL("../", import.meta.url));

function readyResponse() {
  return {
    release: {
      schemaVersion: "openescrow-release/v1",
      commitSha: "50e3ffcb2a4ce2ef61225f9363a893c2944041e1",
    },
    email: {
      configured: true,
      provider: "test-provider",
      participantDeliveryReady: true,
      deliveryStatusConfigured: true,
      schedulerConfigured: true,
      schedulerHealthy: true,
      schedulerLastRunAt: "2026-07-30T18:00:00.000Z",
      schedulerAgeMinutes: 1,
    },
    evidence: {
      configured: true,
      mode: "private-r2",
      encryptedAtRest: true,
      keyringReady: true,
      referencedEncryptionKeyCount: 2,
      missingDecryptionKeyCount: 0,
      unverifiedEncryptionKeyCount: 0,
      mismatchedDecryptionKeyCount: 0,
      contentTypeValidation: true,
      decentralizedReady: false,
    },
    recordIntegrity: {
      lifecycleStateGuards: true,
      transactionReceiptVerification: true,
      chain: "Base Sepolia",
      activityRegistry: {
        configured: true,
        ready: true,
        expectedEscrowAddress: "0x0000000000000000000000000000000000000001",
      },
      activityIndexer: {
        configured: true,
        healthy: true,
        latestFinalizedBlock: 45_300_000,
        pendingEventCount: 0,
        unmatchedEventCount: 0,
        error: null,
      },
    },
    addressValidation: {
      configured: true,
      provider: "test geocoder",
    },
    complianceSources: {
      configured: true,
      ready: true,
      tracked: 61,
      total: 61,
      manualReviewCurrent: 0,
      blocked: 0,
      lastRunAt: "2026-07-30T18:00:00.000Z",
      monitorHealthy: true,
      monitorLastRunAgeMinutes: 1,
      monitorExpectedIntervalMinutes: 1440,
      maxVerificationAgeDays: 21,
    },
  };
}

async function runReadinessCommand(
  readiness,
  artifactPath,
  { status = 200, rawBody = null } = {},
) {
  const server = createServer((request, response) => {
    if (request.url !== "/api/system/readiness") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(status, { "content-type": "application/json" });
    response.end(rawBody ?? JSON.stringify(readiness));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          baseUrl,
          "--json",
          `--artifact-path=${artifactPath}`,
        ],
        {
          cwd: frontendDir,
          windowsHide: true,
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("pilot readiness command saves a complete passing artifact to an explicit nested path", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "nested", "passing.json");
  try {
    const result = await runReadinessCommand(readyResponse(), artifactPath);

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /READY\s+External pilot services are configured/);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(artifact.ok, true);
    assert.equal(artifact.requiredActionCount, 0);
    assert(artifact.checkedAt);
    assert.equal(
      artifact.artifactSchemaVersion,
      "openescrow-pilot-readiness/v1",
    );
    assert.deepEqual(artifact.release, {
      schemaVersion: "openescrow-release/v1",
      commitSha: "50e3ffcb2a4ce2ef61225f9363a893c2944041e1",
    });
    assert.equal(
      artifact.checks.find(
        (check) => check.label === "Evidence encryption and retained keyring",
      )?.ready,
      true,
    );
    assert.equal(
      artifact.checks.find(
        (check) => check.label === "Official compliance source release gate",
      )?.detail,
      "61/61 automated baselines current",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pilot readiness reports time-limited manual source reviews separately", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "manual-source-review.json");
  const readiness = readyResponse();
  readiness.complianceSources.manualReviewCurrent = 1;
  try {
    const result = await runReadinessCommand(readiness, artifactPath);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(
      artifact.checks.find(
        (check) => check.label === "Official compliance source release gate",
      )?.detail,
      "61/61 source gates current (60 automated baselines; 1 time-limited manual review)",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pilot readiness command fails closed and preserves evidence when release provenance is missing", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "nested", "missing-release.json");
  const readiness = readyResponse();
  delete readiness.release;

  try {
    const result = await runReadinessCommand(readiness, artifactPath);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /ACTION\s+Exact deployed release provenance/);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(artifact.ok, false);
    assert.equal(artifact.requiredActionCount, 1);
    assert.equal(artifact.release, null);
    assert.deepEqual(artifact.required, [
      {
        label: "Exact deployed release provenance",
        detail: "exact packaged source commit is missing or invalid",
      },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pilot readiness command saves fail-closed recovery evidence when a retained key is missing", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "nested", "blocked.json");
  const readiness = readyResponse();
  readiness.evidence = {
    ...readiness.evidence,
    keyringReady: false,
    missingDecryptionKeyCount: 1,
  };

  try {
    const result = await runReadinessCommand(readiness, artifactPath);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /ACTION\s+Evidence encryption and retained keyring/);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(artifact.ok, false);
    assert.equal(artifact.requiredActionCount, 1);
    assert.deepEqual(artifact.required, [
      {
        label: "Evidence encryption and retained keyring",
        detail:
          "1 retained decryption key required by stored evidence is missing",
      },
    ]);
    const failedCheck = artifact.checks.find(
      (check) => check.label === "Evidence encryption and retained keyring",
    );
    assert.equal(failedCheck?.ready, false);
    assert.match(failedCheck?.action, /Restore every approved key ID/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pilot readiness command rejects a retained key backup with mismatched bytes", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "nested", "mismatched-backup.json");
  const readiness = readyResponse();
  readiness.evidence = {
    ...readiness.evidence,
    keyringReady: false,
    mismatchedDecryptionKeyCount: 1,
  };

  try {
    const result = await runReadinessCommand(readiness, artifactPath);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /ACTION\s+Evidence encryption and retained keyring/);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(artifact.ok, false);
    assert.equal(artifact.requiredActionCount, 1);
    assert.deepEqual(artifact.required, [
      {
        label: "Evidence encryption and retained keyring",
        detail:
          "1 configured evidence key backup does not match the key material used for stored ciphertext",
      },
    ]);
    const failedCheck = artifact.checks.find(
      (check) => check.label === "Evidence encryption and retained keyring",
    );
    assert.equal(failedCheck?.ready, false);
    assert.match(failedCheck?.action, /exact approved backup bytes/);
    assert.match(failedCheck?.action, /do not guess, relabel, or replace/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("pilot readiness command preserves actionable evidence when the hosted endpoint fails", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "openescrow-readiness-"));
  const artifactPath = path.join(tempDir, "nested", "endpoint-failure.json");
  try {
    const result = await runReadinessCommand(
      { error: "temporarily unavailable" },
      artifactPath,
      { status: 503 },
    );

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /ACTION\s+Hosted readiness endpoint/);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    assert.equal(artifact.ok, false);
    assert.equal(artifact.requiredActionCount, 1);
    assert.deepEqual(artifact.required, [
      {
        label: "Hosted readiness endpoint",
        detail: "OpenEscrow readiness check failed with HTTP 503.",
      },
    ]);
    assert.match(
      artifact.checks[0]?.action,
      /Verify the deployed \/api\/system\/readiness route/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
