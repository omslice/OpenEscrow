import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSelfHostConfig } from "./self-host-config-core.mjs";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configArgument = process.argv.find((argument) => argument.startsWith("--config="));
const configPath = path.resolve(
  frontend,
  configArgument ? configArgument.slice("--config=".length) : "wrangler.selfhost.jsonc",
);
if (path.dirname(configPath) !== frontend) {
  throw new Error("Self-host configuration must remain in the frontend directory.");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const errors = validateSelfHostConfig(config);
const envText = await readFile(path.join(frontend, ".env.production.local"), "utf8").catch(
  () => "",
);
const clientPrivy = envText.match(/^VITE_PRIVY_APP_ID=(.+)$/m)?.[1]?.trim();
if (!clientPrivy || clientPrivy !== config.vars?.PRIVY_APP_ID) {
  errors.push(".env.production.local VITE_PRIVY_APP_ID must match wrangler.selfhost.jsonc PRIVY_APP_ID.");
}
if (!/^VITE_FIAT_ONRAMP_ENABLED=false$/m.test(envText)) {
  errors.push(".env.production.local must keep VITE_FIAT_ONRAMP_ENABLED=false.");
}
await access(path.resolve(frontend, config.d1_databases?.[0]?.migrations_dir || "missing")).catch(
  () => errors.push("The reviewed D1 migration directory is missing."),
);
if (process.argv.includes("--require-build")) {
  await access(path.resolve(frontend, config.main || "missing")).catch(() =>
    errors.push("The prepared Worker build is missing; run npm run build:selfhost."),
  );
  await access(path.resolve(frontend, config.assets?.directory || "missing")).catch(() =>
    errors.push("The prepared client build is missing; run npm run build:selfhost."),
  );
}

if (errors.length) {
  throw new Error(`Self-host setup is not ready:\n- ${errors.join("\n- ")}`);
}
console.log(
  `Self-host configuration is safe for Base Sepolia: ${config.name} -> ${config.vars.PUBLIC_APP_URL}`,
);
