import { createHash } from "node:crypto";

const UUID_V5_DNS_NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

function cycloneDxSerialNumber(sourceCommit) {
  const digest = createHash("sha1")
    .update(UUID_V5_DNS_NAMESPACE)
    .update(`openescrow-self-host:${sourceCommit}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function packageNameFromPath(packagePath, entry) {
  if (entry.name) return entry.name;
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  if (index < 0) return "";
  return packagePath.slice(index + marker.length);
}

function packageUrl(name, version) {
  const encodedVersion = encodeURIComponent(version);
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    return `pkg:npm/${encodeURIComponent(name.slice(0, slash))}/${encodeURIComponent(name.slice(slash + 1))}@${encodedVersion}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodedVersion}`;
}

function integrityHash(integrity) {
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity || "");
  if (!match) return undefined;
  return { alg: "SHA-512", content: Buffer.from(match[1], "base64").toString("hex") };
}

function licenseChoice(license) {
  if (!license || typeof license !== "string") return undefined;
  if (/^[A-Za-z0-9-.+]+$/.test(license)) return { license: { id: license } };
  return { license: { name: license } };
}

export function buildCycloneDxSbom(packageLock, { commitDate, sourceCommit }) {
  const root = packageLock.packages?.[""] || {};
  const grouped = new Map();
  for (const [packagePath, entry] of Object.entries(packageLock.packages || {})) {
    if (!packagePath || !entry?.version) continue;
    const name = packageNameFromPath(packagePath, entry);
    if (!name) continue;
    const purl = packageUrl(name, entry.version);
    const existing = grouped.get(purl) || { name, version: entry.version, purl, entries: [] };
    existing.entries.push({ packagePath, entry });
    grouped.set(purl, existing);
  }

  const components = [...grouped.values()]
    .sort((left, right) => left.purl.localeCompare(right.purl))
    .map(({ name, version, purl, entries }) => {
      const representative = entries[0].entry;
      const component = {
        type: "library",
        "bom-ref": purl,
        name,
        version,
        purl,
        properties: [
          {
            name: "openescrow:package-lock-paths",
            value: entries.map(({ packagePath }) => packagePath).sort().join("\n"),
          },
        ],
      };
      const hash = integrityHash(representative.integrity);
      if (hash) component.hashes = [hash];
      const license = licenseChoice(representative.license);
      if (license) component.licenses = [license];
      if (representative.resolved) {
        component.externalReferences = [
          { type: "distribution", url: representative.resolved },
        ];
      }
      return component;
    });

  const rootName = root.name || packageLock.name || "openescrow-cloudflare-self-host";
  const rootVersion = root.version || packageLock.version || `0.0.0-${sourceCommit.slice(0, 12)}`;
  return {
    bomFormat: "CycloneDX",
    serialNumber: cycloneDxSerialNumber(sourceCommit),
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: commitDate,
      tools: {
        components: [
          {
            type: "application",
            author: "OpenEscrow contributors",
            name: "OpenEscrow package-lock SBOM generator",
            version: "1",
          },
        ],
      },
      component: {
        type: "application",
        "bom-ref": `pkg:npm/${encodeURIComponent(rootName)}@${encodeURIComponent(rootVersion)}`,
        name: rootName,
        version: rootVersion,
        properties: [
          { name: "openescrow:source-commit", value: sourceCommit },
          { name: "openescrow:inventory-source", value: "package-lock.json" },
        ],
      },
    },
    components,
  };
}

export function sbomDigest(sbom) {
  return createHash("sha256").update(`${JSON.stringify(sbom)}\n`).digest("hex");
}
