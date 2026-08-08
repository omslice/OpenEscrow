import assert from "node:assert/strict";
import test from "node:test";
import {
  migrationsAreCurrent,
  parseJsonOutput,
  remoteResourceExpectations,
  validateRemoteResources,
} from "./cloudflare-remote-preflight-core.mjs";

const config = {
  account_id: "owner-account",
  name: "openescrow-mvp-testnet",
  d1_databases: [
    { binding: "DB", database_id: "prod-id", database_name: "prod-db" },
  ],
  r2_buckets: [{ binding: "EVIDENCE", bucket_name: "prod-evidence" }],
  env: {
    staging: {
      name: "openescrow",
      d1_databases: [
        { binding: "DB", database_id: "stage-id", database_name: "stage-db" },
      ],
      r2_buckets: [{ binding: "EVIDENCE", bucket_name: "stage-evidence" }],
    },
  },
};

test("remote preflight resolves the exact staging account and bindings", () => {
  assert.deepEqual(remoteResourceExpectations(config), {
    schemaVersion: "openescrow-cloudflare-preflight/v1",
    environment: "staging",
    accountId: "owner-account",
    workerName: "openescrow",
    database: {
      binding: "DB",
      database_id: "stage-id",
      database_name: "stage-db",
    },
    evidence: { binding: "EVIDENCE", bucket_name: "stage-evidence" },
  });
});

test("remote preflight rejects mismatched D1 and R2 resources", () => {
  const expectations = remoteResourceExpectations(config);
  assert.deepEqual(
    validateRemoteResources({
      expectations,
      databaseInfo: { uuid: "wrong-id", name: "wrong-db" },
      bucketInfo: { name: "wrong-bucket" },
    }),
    [
      "Remote D1 ID does not match the pinned DB binding.",
      "Remote D1 name does not match the pinned DB binding.",
      "Remote R2 bucket does not match the pinned EVIDENCE binding.",
    ],
  );
});

test("remote preflight parses Wrangler JSON after a non-secret banner", () => {
  assert.deepEqual(parseJsonOutput("Wrangler 4\n{\"name\":\"bucket\"}\n", "R2"), {
    name: "bucket",
  });
});

test("migration verification recognizes only Wrangler's current state", () => {
  assert.equal(migrationsAreCurrent("No migrations to apply!"), true);
  assert.equal(migrationsAreCurrent("Migrations to be applied:\n0022_next.sql"), false);
});
