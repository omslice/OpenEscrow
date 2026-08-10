import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  migrationsAreCurrent,
  parseJsonOutput,
  remoteResourceExpectations,
  validateRemoteResources,
} from "./cloudflare-remote-preflight-core.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const args = process.argv.slice(2);
const environment = args.includes("--production") ? "production" : "staging";
const requireCurrentMigrations = args.includes("--require-current-migrations");
const configPath = path.join(frontend, "wrangler.jsonc");
const config = JSON.parse(await readFile(configPath, "utf8"));
const expectations = remoteResourceExpectations(config, environment);
const wranglerExecutable = process.execPath;
const wranglerEntrypoint = path.join(
  frontend,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

function runWrangler(commandArgs, label) {
  const result = spawnSync(wranglerExecutable, [wranglerEntrypoint, ...commandArgs], {
    cwd: frontend,
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: expectations.accountId,
    },
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    if (/enable R2 through the Cloudflare Dashboard/i.test(output)) {
      throw new Error(
        "Cloudflare R2 is not activated for the pinned owner account. No migration or deployment was attempted.",
      );
    }
    throw new Error(`${label} failed without changing the deployment.\n${output.trim()}`);
  }
  return output;
}

const environmentArgs = environment === "production" ? [] : ["--env", environment];
const databaseOutput = runWrangler(
  [
    "d1",
    "info",
    "DB",
    ...environmentArgs,
    "--json",
    "--config",
    "wrangler.jsonc",
  ],
  "Remote D1 lookup",
);
const bucketOutput = runWrangler(
  [
    "r2",
    "bucket",
    "info",
    expectations.evidence.bucket_name,
    "--json",
    "--config",
    "wrangler.jsonc",
  ],
  "Private R2 lookup",
);
const migrationOutput = runWrangler(
  [
    "d1",
    "migrations",
    "list",
    "DB",
    "--remote",
    ...environmentArgs,
    "--config",
    "wrangler.jsonc",
  ],
  "Remote D1 migration lookup",
);

const failures = validateRemoteResources({
  expectations,
  databaseInfo: parseJsonOutput(databaseOutput, "Remote D1 lookup"),
  bucketInfo: parseJsonOutput(bucketOutput, "Private R2 lookup"),
});
if (requireCurrentMigrations && !migrationsAreCurrent(migrationOutput)) {
  failures.push("Remote D1 still has unapplied migrations.");
}
if (failures.length) {
  throw new Error(`Cloudflare remote preflight failed:\n- ${failures.join("\n- ")}`);
}

console.log(
  `Cloudflare ${environment} remote preflight passed for ${expectations.workerName}: DB=${expectations.database.database_name}, EVIDENCE=${expectations.evidence.bucket_name}, migrations=${migrationsAreCurrent(migrationOutput) ? "current" : "pending"}.`,
);
