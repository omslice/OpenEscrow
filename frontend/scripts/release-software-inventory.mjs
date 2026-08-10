import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const RELEASE_SOFTWARE_INVENTORY_SCHEMA =
  "openescrow.software-inventory/v1";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  return markerIndex >= 0 ? packagePath.slice(markerIndex + marker.length) : "";
}

function boundedString(value, maximum = 1000) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function dependencyComponent(packagePath, value) {
  const name = packageNameFromPath(packagePath);
  if (
    !boundedString(name, 300) ||
    !boundedString(value?.version, 200) ||
    !boundedString(value?.integrity, 2000)
  ) {
    throw new Error(`Production dependency ${packagePath} has incomplete lock evidence.`);
  }
  return {
    type: "npm",
    name,
    version: value.version,
    packagePath,
    integrity: value.integrity,
    license: boundedString(value.license, 500) ? value.license : null,
    optional: value.optional === true,
    peer: value.peer === true,
    nodeRange: boundedString(value.engines?.node, 500)
      ? value.engines.node
      : null,
  };
}

function sortedEntries(value) {
  return Object.entries(value || {}).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

export function buildReleaseSoftwareInventory({
  frontendRoot,
  commitSha,
  nodeVersion = process.version,
}) {
  if (!/^[0-9a-f]{40}$/.test(commitSha || "")) {
    throw new Error("A full source commit is required for software inventory.");
  }
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+/.test(nodeVersion || "")) {
    throw new Error("A valid Node.js runtime version is required for software inventory.");
  }
  const manifestPath = path.join(frontendRoot, "package.json");
  const lockfilePath = path.join(frontendRoot, "package-lock.json");
  const manifestBytes = readFileSync(manifestPath);
  const lockfileBytes = readFileSync(lockfilePath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const lockfile = JSON.parse(lockfileBytes.toString("utf8"));
  if (
    lockfile.lockfileVersion !== 3 ||
    lockfile.name !== manifest.name ||
    lockfile.version !== manifest.version ||
    !lockfile.packages ||
    typeof lockfile.packages !== "object" ||
    Array.isArray(lockfile.packages)
  ) {
    throw new Error("The npm lockfile is not an exact v3 manifest for this application.");
  }

  const components = sortedEntries(lockfile.packages)
    .filter(([packagePath, value]) => packagePath && value?.dev !== true)
    .map(([packagePath, value]) => dependencyComponent(packagePath, value))
    .sort((left, right) =>
      left.packagePath < right.packagePath
        ? -1
        : left.packagePath > right.packagePath
          ? 1
          : 0,
    );
  if (components.length === 0) {
    throw new Error("The production software inventory is empty.");
  }
  if (new Set(components.map((component) => component.packagePath)).size !== components.length) {
    throw new Error("The production software inventory contains duplicate package paths.");
  }

  const componentByPath = new Map(
    components.map((component) => [component.packagePath, component]),
  );
  const directRuntimeDependencies = sortedEntries(manifest.dependencies).map(
    ([name, declared]) => {
      const component = componentByPath.get(`node_modules/${name}`);
      if (!component || !boundedString(declared, 500)) {
        throw new Error(`Direct runtime dependency ${name} is not exactly resolved.`);
      }
      return {
        name,
        declared,
        resolvedVersion: component.version,
        packagePath: component.packagePath,
      };
    },
  );
  if (directRuntimeDependencies.length === 0) {
    throw new Error("The application has no inventoried direct runtime dependencies.");
  }

  const licenseCounts = Object.fromEntries(
    [...components.reduce((counts, component) => {
      const license = component.license || "UNSPECIFIED";
      counts.set(license, (counts.get(license) || 0) + 1);
      return counts;
    }, new Map())]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  const evidence = {
    schema: RELEASE_SOFTWARE_INVENTORY_SCHEMA,
    sourceCommit: commitSha,
    runtime: { node: nodeVersion },
    application: {
      name: manifest.name,
      version: manifest.version,
      manifestSha256: sha256(manifestBytes),
      lockfileVersion: lockfile.lockfileVersion,
      lockfileSha256: sha256(lockfileBytes),
    },
    directRuntimeDependencies,
    componentCount: components.length,
    licenseCounts,
    components,
  };
  return Object.freeze({
    ...evidence,
    sha256: sha256(Buffer.from(JSON.stringify(evidence), "utf8")),
  });
}
