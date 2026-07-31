import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(frontendRoot, "..");
const defaultDistDir = join(repositoryRoot, "dist");
const defaultHostingPath = join(repositoryRoot, ".openai", "hosting.json");

function npmInvocation(scriptName, scriptArgs) {
  const npmArgs = ["run", scriptName, "--", ...scriptArgs];
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...npmArgs],
    };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd ${npmArgs.join(" ")}`],
    };
  }
  return { command: "npm", args: npmArgs };
}

function runNpm(scriptName, scriptArgs = []) {
  const invocation = npmInvocation(scriptName, scriptArgs);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: frontendRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runCommand(commandLine) {
  const shell = process.platform === "win32" ? "cmd.exe" : "sh";
  const shellArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", commandLine]
      : ["-c", commandLine];
  const result = spawnSync(shell, shellArgs, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function applyPublishPlaceholders(
  command,
  { projectId, distDir, hostingPath },
) {
  return command
    .replaceAll("{project_id}", projectId)
    .replaceAll("{dist}", distDir)
    .replaceAll("{hosting_json}", hostingPath);
}

export function executeLiveDeploy({
  baseUrl,
  publishCommand,
  projectId,
  distDir = defaultDistDir,
  hostingPath = defaultHostingPath,
  runNpmCommand = runNpm,
  runPublishCommand = runCommand,
  distExists = existsSync,
  logger = console,
}) {
  logger.log("OpenEscrow live-deploy candidate prep");
  logger.log(`Using existing Sites project binding: ${projectId}`);

  if (publishCommand && !baseUrl) {
    logger.error(
      "A deployment base URL is required so the newly published version can be verified.",
    );
    return 1;
  }

  const candidateStatus = runNpmCommand("deploy:pilot-candidate");
  if (candidateStatus !== 0) return candidateStatus;

  if (!distExists(distDir)) {
    logger.error(`Expected build output at ${distDir} was not found.`);
    return 1;
  }
  logger.log(`Prepared deployable artifact at ${distDir}`);

  if (!publishCommand) {
    logger.log(
      "Candidate verification is complete; no publish command was configured, so no live site was changed.",
    );
    logger.log(
      "Set OPENESCROW_SITE_PUBLISH_COMMAND and OPENESCROW_BASE_URL only when an approved candidate is ready to publish.",
    );
    return 0;
  }

  const command = applyPublishPlaceholders(publishCommand, {
    projectId,
    distDir,
    hostingPath,
  });
  logger.log(`Publishing approved candidate to project ${projectId}...`);
  const publishStatus = runPublishCommand(command);
  if (publishStatus !== 0) {
    logger.error(`Publish command exited with status ${publishStatus}.`);
    return publishStatus;
  }

  logger.log(`Verifying the newly published site at ${baseUrl}...`);
  return runNpmCommand("pilot:check:artifact", [baseUrl]);
}

function getArg(args, name, fallback) {
  const arg = args.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}

function readHosting(hostingPath) {
  if (!existsSync(hostingPath)) {
    throw new Error(
      "Cannot find .openai/hosting.json. Preserve existing hosting metadata before publishing.",
    );
  }
  const hosting = JSON.parse(readFileSync(hostingPath, "utf8"));
  if (
    typeof hosting.project_id !== "string" ||
    hosting.project_id.length === 0
  ) {
    throw new Error("hosting.json is missing a valid project_id.");
  }
  return hosting;
}

function runCli() {
  const args = process.argv.slice(2);
  const baseUrl = getArg(
    args,
    "base-url",
    process.env.OPENESCROW_BASE_URL,
  );
  const publishCommand =
    getArg(
      args,
      "publish-command",
      process.env.OPENESCROW_SITE_PUBLISH_COMMAND,
    ) || process.env.OPENESCROW_SITE_PUBLISH_COMMAND_FALLBACK;

  try {
    const hosting = readHosting(defaultHostingPath);
    process.exitCode = executeLiveDeploy({
      baseUrl,
      publishCommand,
      projectId: hosting.project_id,
    });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Live deployment failed.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
