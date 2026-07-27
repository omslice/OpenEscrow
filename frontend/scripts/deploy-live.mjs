import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = dirname(fileURLToPath(import.meta.url));
const repository = resolve(frontendDir, "..", "..");
const distDir = join(repository, "dist");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);

function getArg(name, fallback) {
  const arg = args.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}

function runNpm(scriptName, scriptArgs = []) {
  const commandArgs = ["run", scriptName, "--", ...scriptArgs];
  const result = spawnSync(npm, commandArgs, {
    cwd: frontendDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function runCommand(commandLine) {
  const shell = process.platform === "win32" ? "cmd.exe" : "sh";
  const args = process.platform === "win32" ? ["/c", commandLine] : ["-c", commandLine];
  const result = spawnSync(shell, args, {
    cwd: repository,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function parseProjectId() {
  const hostingFile = join(repository, ".openai", "hosting.json");
  if (!existsSync(hostingFile)) {
    throw new Error(
      "Cannot find .openai/hosting.json. Preserve existing hosting metadata before publishing.",
    );
  }
  const hosting = JSON.parse(readFileSync(hostingFile, "utf8"));
  if (typeof hosting.project_id !== "string" || hosting.project_id.length === 0) {
    throw new Error("hosting.json is missing a valid project_id.");
  }
  return { projectId: hosting.project_id, hosting };
}

const baseUrl = getArg("base-url", process.env.OPENESCROW_BASE_URL);
const publishCommand =
  getArg("publish-command", process.env.OPENESCROW_SITE_PUBLISH_COMMAND) ||
  process.env.OPENESCROW_SITE_PUBLISH_COMMAND_FALLBACK;

const readinessArg = baseUrl
  ? `--base-url=${baseUrl}`
  : null;

console.log("OpenEscrow live-deploy candidate prep");
if (baseUrl) {
  console.log(`Readiness verification target: ${baseUrl}`);
}

const hostingInfo = parseProjectId();
console.log(`Using existing Sites project binding: ${hostingInfo.projectId}`);

const candidateStatus = runNpm("deploy:pilot-candidate");
if (candidateStatus !== 0) {
  process.exit(candidateStatus);
}

if (!existsSync(distDir)) {
  console.error(`Expected build output at ${distDir} was not found.`);
  process.exit(1);
}

console.log(`Prepared deployable artifact at ${distDir}`);

const artifactCommand = ["pilot:check:artifact"];
if (readinessArg) {
  artifactCommand.push(readinessArg);
}
const artifactStatus = runNpm(...artifactCommand);
if (artifactStatus !== 0) {
  process.exit(artifactStatus);
}

if (!publishCommand) {
  console.log("No publish command is configured.");
  console.log(
    "Set OPENESCROW_SITE_PUBLISH_COMMAND (for example: `OPENESCROW_SITE_PUBLISH_COMMAND=\"<your-sites-cli> <args>\" npm run deploy:pilot-live`)",
  );
  console.log(
    "Then rerun this script to attempt a one-command publish from this repository.",
  );
  process.exit(0);
}

const command = publishCommand
  .replace("{project_id}", hostingInfo.projectId)
  .replace("{dist}", distDir)
  .replace("{hosting_json}", join(repository, ".openai", "hosting.json"));

console.log(`Running publish command for project ${hostingInfo.projectId}...`);
const publishStatus = runCommand(command);
if (publishStatus !== 0) {
  console.error(`Publish command exited with status ${publishStatus}.`);
}
process.exit(publishStatus);
