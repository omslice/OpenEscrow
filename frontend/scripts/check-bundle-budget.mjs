import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "..", "dist");
const assets = join(dist, "assets");
const indexHtml = await readFile(join(dist, "index.html"), "utf8");
const initialAssetNames = Array.from(
  new Set(
    Array.from(
      indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g),
      (match) => match[1],
    ),
  ),
);
const jsAssetNames = (await readdir(assets)).filter((name) => name.endsWith(".js"));

async function totalBytes(names) {
  const sizes = await Promise.all(
    names.map(async (name) => (await stat(join(assets, name))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

const initialBytes = await totalBytes(initialAssetNames);
const totalJsBytes = await totalBytes(jsAssetNames);
const largestChunks = await Promise.all(
  jsAssetNames.map(async (name) => ({
    name,
    size: (await stat(join(assets, name))).size,
  })),
);
largestChunks.sort((left, right) => right.size - left.size);
const largestChunk = largestChunks[0] || { name: "none", size: 0 };
const appChunk =
  largestChunks.find((chunk) => /^App-[^.]+\.js$/.test(chunk.name)) ||
  { name: "none", size: 0 };
const agreementCardChunk =
  largestChunks.find((chunk) => /^AgreementCard-[^.]+\.js$/.test(chunk.name)) ||
  { name: "none", size: 0 };

const budgets = {
  initialBytes: 350 * 1_024,
  totalJsBytes: 6_500 * 1_024,
  largestChunkBytes: 750 * 1_024,
  appChunkBytes: 250 * 1_024,
  agreementCardChunkBytes: 40 * 1_024,
};
const failures = [];
if (initialBytes > budgets.initialBytes) {
  failures.push(
    `initial JavaScript ${initialBytes} bytes exceeds ${budgets.initialBytes}`,
  );
}
if (totalJsBytes > budgets.totalJsBytes) {
  failures.push(
    `total JavaScript ${totalJsBytes} bytes exceeds ${budgets.totalJsBytes}`,
  );
}
if (largestChunk.size > budgets.largestChunkBytes) {
  failures.push(
    `largest chunk ${largestChunk.name} (${largestChunk.size} bytes) exceeds ${budgets.largestChunkBytes}`,
  );
}
if (appChunk.size > budgets.appChunkBytes) {
  failures.push(
    `workspace chunk ${appChunk.name} (${appChunk.size} bytes) exceeds ${budgets.appChunkBytes}`,
  );
}
if (agreementCardChunk.name === "none") {
  failures.push("agreement card chunk was not emitted");
} else if (agreementCardChunk.size > budgets.agreementCardChunkBytes) {
  failures.push(
    `agreement card chunk ${agreementCardChunk.name} (${agreementCardChunk.size} bytes) exceeds ${budgets.agreementCardChunkBytes}`,
  );
}

console.log(
  [
    `Bundle budget: ${initialAssetNames.length} initial JS file(s), ${initialBytes} bytes`,
    `${jsAssetNames.length} total JS file(s), ${totalJsBytes} bytes`,
    `largest ${largestChunk.name}, ${largestChunk.size} bytes`,
    `workspace ${appChunk.name}, ${appChunk.size} bytes`,
    `agreement card ${agreementCardChunk.name}, ${agreementCardChunk.size} bytes`,
  ].join("; "),
);

if (failures.length > 0) {
  throw new Error(`Browser bundle budget failed: ${failures.join("; ")}`);
}
