import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStagingSecretPayload,
  validateStagingSecretPayload,
} from "./cloudflare-staging-secrets-core.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const config = JSON.parse(await readFile(path.join(frontend, "wrangler.jsonc"), "utf8"));
const accountId = config.account_id;
const workerName = config.env?.staging?.name;
const wrangler = path.join(frontend, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerEnvironment = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: accountId,
};

function runWrangler(args, options = {}) {
  return spawnSync(process.execPath, [wrangler, ...args], {
    cwd: frontend,
    encoding: "utf8",
    env: wranglerEnvironment,
    ...options,
  });
}

if (process.platform !== "win32") {
  throw new Error("This bootstrap currently requires Windows DPAPI for the encrypted recovery copy.");
}

const existing = runWrangler(["deployments", "list", "--env", "staging", "--json"]);
const existingOutput = `${existing.stdout || ""}${existing.stderr || ""}`;
if (existing.status === 0) {
  throw new Error(
    `Cloudflare Worker ${workerName} already exists. Refusing to replace its secrets with bootstrap keys.`,
  );
}
if (!/Worker does not exist.*code:\s*10007/is.test(existingOutput)) {
  throw new Error(`Could not prove that ${workerName} is new.\n${existingOutput.trim()}`);
}

const payload = createStagingSecretPayload({ accountId, workerName });
const secrets = validateStagingSecretPayload(payload, { accountId, workerName });
const recoveryDirectory = path.join(
  process.env.USERPROFILE || os.homedir(),
  ".openescrow",
  "recovery",
);
await mkdir(recoveryDirectory, { recursive: true });
const safeTimestamp = payload.createdAt.replaceAll(":", "-");
const recoveryPath = path.join(
  recoveryDirectory,
  `cloudflare-staging-${safeTimestamp}.dpapi`,
);

const dpapiScript = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$plain = [Console]::In.ReadToEnd()
$bytes = [Text.Encoding]::UTF8.GetBytes($plain)
$protected = [Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[IO.File]::WriteAllBytes($env:OPENESCROW_RECOVERY_PATH, $protected)
$roundTrip = [Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($roundTrip))
`;
const protectedBackup = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", dpapiScript],
  {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: {
      ...process.env,
      OPENESCROW_RECOVERY_PATH: recoveryPath,
    },
    windowsHide: true,
  },
);
if (protectedBackup.status !== 0) {
  const diagnostic = `${protectedBackup.stderr || ""}`.trim();
  throw new Error(
    `Windows could not create the DPAPI-protected staging secret backup.${diagnostic ? `\n${diagnostic}` : ""}`,
  );
}
const recovered = JSON.parse(protectedBackup.stdout);
validateStagingSecretPayload(recovered, { accountId, workerName });

const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "openescrow-cloudflare-secrets-"),
);
const temporarySecrets = path.join(temporaryDirectory, "staging-secrets.json");
const secretJson = JSON.stringify(secrets);
try {
  await writeFile(temporarySecrets, secretJson, { encoding: "utf8", mode: 0o600 });
  const deployment = runWrangler(
    [
      "deploy",
      "--env",
      "staging",
      "--config",
      "wrangler.jsonc",
      "--secrets-file",
      temporarySecrets,
      "--message",
      "Bootstrap private OpenEscrow staging bindings",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (deployment.status !== 0) {
    throw new Error(`Cloudflare staging bootstrap failed with status ${deployment.status}.`);
  }
} finally {
  try {
    await writeFile(temporarySecrets, Buffer.alloc(Buffer.byteLength(secretJson)), {
      mode: 0o600,
    });
  } catch {
    // The temporary file may not have been created; cleanup still proceeds.
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Cloudflare staging security keys provisioned for ${workerName}.`);
console.log(`Windows-encrypted recovery copy: ${recoveryPath}`);
console.log(`Evidence key ID: ${secrets.EVIDENCE_ENCRYPTION_KEY_ID}`);
