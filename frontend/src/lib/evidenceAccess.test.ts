import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPrivateEvidenceDocument,
  privateEvidencePath,
  publicEvidenceUrl,
} from "./evidenceAccess.ts";

test("private evidence paths never contain agreement bearer tokens", () => {
  const evidenceId = "018f4f6a-3f9d-7a21-a48d-123456789abc";
  const r2Path = privateEvidencePath(`openescrow://evidence/${evidenceId}`);
  const ipfsPath = privateEvidencePath(
    `openescrow+ipfs://bafy-private/${evidenceId}`,
  );

  assert.equal(r2Path, `/api/evidence/${evidenceId}`);
  assert.equal(ipfsPath, `/api/evidence/${evidenceId}`);
  assert.equal(r2Path.includes("?"), false);
  assert.equal(ipfsPath.includes("token"), false);
});

test("public evidence URLs allow only HTTPS and encoded IPFS paths", () => {
  assert.equal(
    publicEvidenceUrl("https://evidence.example/document.pdf"),
    "https://evidence.example/document.pdf",
  );
  assert.equal(
    publicEvidenceUrl("ipfs://bafy-test/folder/invoice 1.pdf"),
    null,
  );
  assert.equal(
    publicEvidenceUrl("ipfs://bafy-test/folder/invoice-1.pdf"),
    "https://ipfs.io/ipfs/bafy-test/folder/invoice-1.pdf",
  );
  assert.equal(publicEvidenceUrl("javascript:alert(1)"), null);
  assert.equal(publicEvidenceUrl("http://evidence.example/document.pdf"), null);
});

test("private evidence is fetched same-origin without putting the token in the URL", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response("private document", {
      headers: { "content-type": "application/pdf" },
    });
  };
  try {
    const blob = await loadPrivateEvidenceDocument(
      "/api/evidence/evidence-1",
      "private-token",
    );
    assert.equal(capturedUrl, "/api/evidence/evidence-1");
    assert.equal(capturedUrl.includes("private-token"), false);
    assert.equal(capturedInit?.method, "POST");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.ok(capturedInit);
    assert.equal((capturedInit.body as FormData).get("token"), "private-token");
    assert.equal(await blob.text(), "private document");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
