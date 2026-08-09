import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { COMPLIANCE_SOURCE_REGISTRY } from "../shared/compliance-sources.js";
import {
  EXTERNAL_COMPLIANCE_ATTESTATION_SCHEMA,
  validateExternalComplianceMonitor,
} from "../shared/external-compliance-monitor.js";

const maximumSourceBytes = 1024 * 1024;

function option(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function safeOutputName(sourceKey) {
  return `${sourceKey.replaceAll(":", "-").replaceAll(/[^a-z0-9-]/gi, "-").toLowerCase()}.json`;
}

async function inspectSource(sourceItem, checkedAt) {
  const monitor = validateExternalComplianceMonitor(sourceItem);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(sourceItem.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "user-agent": "OpenEscrow external compliance source monitor/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maximumSourceBytes) {
      throw new Error("Official source exceeds the monitoring size limit.");
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maximumSourceBytes) {
      throw new Error("Official source exceeds the monitoring size limit.");
    }
    const finalUrl = response.url || sourceItem.url;
    const text = body.toString("utf8");
    const markerChecks = monitor.requiredMarkers.map((marker) => ({
      marker,
      present: text.includes(marker),
    }));
    const bodySha256 = createHash("sha256").update(body).digest("hex");
    const structurallyValid =
      response.status === 200 &&
      finalUrl === sourceItem.url &&
      markerChecks.every((entry) => entry.present);
    return {
      schemaVersion: EXTERNAL_COMPLIANCE_ATTESTATION_SCHEMA,
      sourceKey: sourceItem.key,
      profileVersion: sourceItem.version,
      sourceUrl: sourceItem.url,
      checkedAt,
      status: structurallyValid
        ? bodySha256 === monitor.expectedBodySha256
          ? "unchanged"
          : "changed"
        : "invalid",
      httpStatus: response.status,
      finalUrl,
      bodySha256,
      contentLength: body.byteLength,
      contentType: response.headers.get("content-type") || "",
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      markerChecks,
      ...(structurallyValid ? {} : { error: "The official source response did not match the expected document structure." }),
    };
  } catch (error) {
    return {
      schemaVersion: EXTERNAL_COMPLIANCE_ATTESTATION_SCHEMA,
      sourceKey: sourceItem.key,
      profileVersion: sourceItem.version,
      sourceUrl: sourceItem.url,
      checkedAt,
      status: "unreachable",
      httpStatus: 0,
      finalUrl: sourceItem.url,
      bodySha256: "",
      contentLength: 0,
      contentType: "",
      etag: "",
      lastModified: "",
      markerChecks: monitor.requiredMarkers.map((marker) => ({ marker, present: false })),
      error: error instanceof Error ? error.message.slice(0, 300) : "Official source check failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const outputDirectory = path.resolve(option("output-dir", ".compliance-attestations"));
const requestedKey = option("source-key");
const checkedAt = option("checked-at", new Date().toISOString());
if (!Number.isFinite(Date.parse(checkedAt))) {
  throw new Error("--checked-at must be an ISO-8601 instant.");
}
const sources = COMPLIANCE_SOURCE_REGISTRY.filter(
  (item) => item.externalMonitor && (!requestedKey || item.key === requestedKey),
);
if (sources.length === 0) throw new Error("No matching externally monitored compliance source was found.");
await mkdir(outputDirectory, { recursive: true });
const results = [];
for (const sourceItem of sources) {
  const attestation = await inspectSource(sourceItem, checkedAt);
  const outputPath = path.join(outputDirectory, safeOutputName(sourceItem.key));
  await writeFile(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  results.push({ sourceKey: sourceItem.key, status: attestation.status, outputPath });
}
process.stdout.write(`${JSON.stringify({ checkedAt, results }, null, 2)}\n`);
