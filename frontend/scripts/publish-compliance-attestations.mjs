import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repository = process.env.GITHUB_REPOSITORY || "";
const token = process.env.GITHUB_TOKEN || "";
const sourceCommit = process.env.GITHUB_SHA || "";
const branch = process.env.COMPLIANCE_ATTESTATION_BRANCH || "compliance-attestations";
const outputDirectory = path.resolve(process.argv[2] || ".compliance-attestations");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
  throw new Error("GitHub repository, token, and source commit are required.");
}
async function github(pathname, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${pathname}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "OpenEscrow compliance source monitor/1.0",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    const error = new Error(`GitHub API returned HTTP ${response.status}: ${details}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

try {
  await github(`/git/ref/heads/${encodeURIComponent(branch)}`);
} catch (error) {
  if (error?.status !== 404) throw error;
  await github("/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: sourceCommit }),
  });
}

const files = (await readdir(outputDirectory)).filter((name) => name.endsWith(".json")).sort();
if (files.length === 0) throw new Error("No compliance-source attestations were generated.");
for (const name of files) {
  const content = await readFile(path.join(outputDirectory, name));
  let existingSha;
  try {
    const existing = await github(`/contents/${encodeURIComponent(name)}?ref=${encodeURIComponent(branch)}`);
    existingSha = existing?.sha;
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  await github(`/contents/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Update compliance source attestation for ${name}`,
      content: content.toString("base64"),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  process.stdout.write(`Published ${name} to ${repository}@${branch}.\n`);
}
