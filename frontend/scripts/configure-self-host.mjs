import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSelfHostConfig } from "./self-host-config-core.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--force") {
    options.set("force", true);
    continue;
  }
  if (argument === "--help") {
    console.log(`Usage:
  npm run selfhost:configure -- \\
    --worker-name your-openescrow-testnet \\
    --account-id <32-character Cloudflare account ID> \\
    --database-name your-openescrow-db \\
    --database-id <D1 UUID> \\
    --bucket-name your-openescrow-evidence \\
    --public-url https://your-worker.your-subdomain.workers.dev/ \\
    --privy-app-id <your Privy public app ID> \\
    [--notification-from "OpenEscrow <updates@your-domain>"] [--force]`);
    process.exit(0);
  }
  if (!argument.startsWith("--") || index + 1 >= process.argv.length) {
    throw new Error(`Invalid or incomplete option: ${argument}`);
  }
  options.set(argument.slice(2), process.argv[index + 1]);
  index += 1;
}

const required = [
  "worker-name",
  "account-id",
  "database-name",
  "database-id",
  "bucket-name",
  "public-url",
  "privy-app-id",
];
const missing = required.filter((name) => !options.get(name));
if (missing.length) {
  throw new Error(`Missing required option(s): ${missing.map((name) => `--${name}`).join(", ")}`);
}

const configPath = path.join(frontend, "wrangler.selfhost.jsonc");
const envPath = path.join(frontend, ".env.production.local");
if (!options.get("force") && (existsSync(configPath) || existsSync(envPath))) {
  throw new Error(
    "Refusing to overwrite wrangler.selfhost.jsonc or .env.production.local. Review them or rerun with --force.",
  );
}

const config = buildSelfHostConfig({
  workerName: options.get("worker-name"),
  accountId: options.get("account-id"),
  databaseName: options.get("database-name"),
  databaseId: options.get("database-id"),
  bucketName: options.get("bucket-name"),
  publicUrl: options.get("public-url"),
  privyAppId: options.get("privy-app-id"),
  notificationFromEmail: options.get("notification-from"),
});

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "w" });
await writeFile(
  envPath,
  [
    `VITE_PRIVY_APP_ID=${options.get("privy-app-id")}`,
    "VITE_FIAT_ONRAMP_ENABLED=false",
    "VITE_FIAT_ONRAMP_ENVIRONMENT=sandbox",
    "VITE_FIAT_ONRAMP_PRODUCTION_APPROVED=false",
    "",
  ].join("\n"),
  { flag: "w" },
);

console.log("Self-host configuration written without runtime secrets.");
console.log("Next: npm run selfhost:check");
