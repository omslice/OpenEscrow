import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const POLICY_SCHEMA_VERSION = "openescrow-npm-audit-policy/v1";
const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i;

function advisoryFromVia(via) {
  if (!via || typeof via !== "object") return null;
  const match = `${via.url || ""} ${via.title || ""}`.match(GHSA_PATTERN);
  if (!match) return null;
  return {
    advisory: match[0].toUpperCase(),
    package: via.name || via.dependency || null,
  };
}

function rootAdvisories(vulnerabilities, packageName, trail = new Set()) {
  if (trail.has(packageName)) return [];
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via)) return [];

  const nextTrail = new Set(trail);
  nextTrail.add(packageName);
  const roots = [];
  for (const via of vulnerability.via) {
    if (typeof via === "string") {
      roots.push(...rootAdvisories(vulnerabilities, via, nextTrail));
      continue;
    }
    const root = advisoryFromVia(via);
    if (root) roots.push(root);
  }
  return roots;
}

export function evaluateProductionAudit(
  report,
  policy,
  now = new Date(),
  installedVersions = {},
) {
  const errors = [];
  const observedExceptions = new Set();
  if (
    !report ||
    report.auditReportVersion !== 2 ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object"
  ) {
    return { errors: ["npm audit returned an unsupported report."], summary: null };
  }
  if (
    !policy ||
    policy.schemaVersion !== POLICY_SCHEMA_VERSION ||
    !Array.isArray(policy.exceptions)
  ) {
    return { errors: ["Dependency audit policy is missing or invalid."], summary: null };
  }

  const exceptions = new Map();
  for (const exception of policy.exceptions) {
    const advisory =
      typeof exception?.advisory === "string"
        ? exception.advisory.toUpperCase()
        : "";
    if (!GHSA_PATTERN.test(advisory) || exceptions.has(advisory)) {
      errors.push(`Audit policy has an invalid or duplicate advisory: ${advisory || "missing"}.`);
      continue;
    }
    const expiresAt = Date.parse(`${exception.expiresOn}T23:59:59.999Z`);
    if (!Number.isFinite(expiresAt)) {
      errors.push(`${advisory} has an invalid expiry date.`);
    } else if (now.getTime() > expiresAt) {
      errors.push(`${advisory} expired on ${exception.expiresOn}.`);
    }
    if (exception.severity !== "moderate") {
      errors.push(`${advisory} may allow only a moderate advisory.`);
    }
    if (
      !exception.package ||
      !exception.rationale ||
      !exception.scope ||
      !Array.isArray(exception.reviewedVersions) ||
      exception.reviewedVersions.length === 0
    ) {
      errors.push(
        `${advisory} is missing package, reviewed versions, scope, or rationale.`,
      );
    } else {
      const reviewed = new Set(exception.reviewedVersions);
      const observed = new Set(installedVersions[exception.package] || []);
      for (const version of observed) {
        if (!reviewed.has(version)) {
          errors.push(
            `${advisory} has unreviewed ${exception.package} version ${version}.`,
          );
        }
      }
      for (const version of reviewed) {
        if (!observed.has(version)) {
          errors.push(
            `${advisory} policy version ${version} is no longer installed and must be reviewed.`,
          );
        }
      }
    }
    exceptions.set(advisory, exception);
  }

  const vulnerabilities = report.vulnerabilities;
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (["high", "critical"].includes(vulnerability.severity)) {
      errors.push(
        `${packageName} has an unallowable ${vulnerability.severity} vulnerability.`,
      );
      continue;
    }
    if (vulnerability.severity !== "moderate") continue;

    const roots = rootAdvisories(vulnerabilities, packageName);
    if (roots.length === 0) {
      errors.push(`${packageName} has a moderate vulnerability with no traceable advisory.`);
      continue;
    }
    for (const root of roots) {
      const exception = exceptions.get(root.advisory);
      if (!exception) {
        errors.push(
          `${packageName} reaches unapproved moderate advisory ${root.advisory}.`,
        );
        continue;
      }
      if (root.package !== exception.package) {
        errors.push(
          `${root.advisory} applies to ${root.package || "an unknown package"}, not the policy package ${exception.package}.`,
        );
        continue;
      }
      observedExceptions.add(root.advisory);
    }
  }

  for (const advisory of exceptions.keys()) {
    if (!observedExceptions.has(advisory)) {
      errors.push(`${advisory} is no longer present and must be removed from the policy.`);
    }
  }

  const counts = report.metadata?.vulnerabilities || {};
  return {
    errors: [...new Set(errors)],
    summary: {
      total: counts.total ?? Object.keys(vulnerabilities).length,
      moderate: counts.moderate ?? 0,
      high: counts.high ?? 0,
      critical: counts.critical ?? 0,
      exceptions: observedExceptions.size,
    },
  };
}

function runCli() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDir, "..");
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : "npm";
  const commandArgs = npmExecPath
    ? [npmExecPath, "audit", "--omit=dev", "--json"]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd audit --omit=dev --json"]
      : ["audit", "--omit=dev", "--json"];
  const audit = spawnSync(command, commandArgs, {
    cwd: frontendRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (audit.error || !audit.stdout || ![0, 1].includes(audit.status)) {
    console.error(
      `Production dependency audit could not run${audit.error ? `: ${audit.error.message}` : "."}`,
    );
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error("Production dependency audit returned invalid JSON.");
    process.exitCode = 1;
    return;
  }
  const policy = JSON.parse(
    readFileSync(path.join(frontendRoot, "security-audit-policy.json"), "utf8"),
  );
  const installedVersions = {};
  for (const [packageName, vulnerability] of Object.entries(
    report.vulnerabilities || {},
  )) {
    const versions = new Set();
    for (const nodePath of vulnerability.nodes || []) {
      const packagePath = path.resolve(frontendRoot, nodePath, "package.json");
      if (!packagePath.startsWith(`${frontendRoot}${path.sep}`)) continue;
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
        if (typeof packageJson.version === "string") {
          versions.add(packageJson.version);
        }
      } catch {
        // A reviewed exception fails below when its installed version cannot be established.
      }
    }
    installedVersions[packageName] = [...versions].sort();
  }
  const result = evaluateProductionAudit(
    report,
    policy,
    new Date(),
    installedVersions,
  );
  if (result.errors.length > 0) {
    console.error("Production dependency audit policy failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production dependency audit verified: ${result.summary.high} high, ` +
      `${result.summary.critical} critical; ${result.summary.moderate} moderate package finding(s) ` +
      `covered by ${result.summary.exceptions} active time-bounded exception(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
