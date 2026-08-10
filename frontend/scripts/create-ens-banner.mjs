import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(scripts, "..");
const wordmarkPath = path.join(frontend, "public", "openescrow-wordmark.svg");
const outputPath = path.join(frontend, "public", "openescrow-ens-banner.png");

const sourceWordmark = await readFile(wordmarkPath, "utf8");
const darkWordmark = sourceWordmark.replace(
  /<style>[\s\S]*?<\/style>/,
  `<style>
    .oe-neutral-start { stop-color: #ffffff; }
    .oe-neutral-mid { stop-color: #f4f4f6; }
    .oe-neutral-end { stop-color: #e6e6ea; }
  </style>`,
);

const wordmark = await sharp(Buffer.from(darkWordmark))
  .resize({ width: 780 })
  .png()
  .toBuffer();

const background = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#08060D"/>
        <stop offset="0.56" stop-color="#100A18"/>
        <stop offset="1" stop-color="#08060D"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#8522CC" stop-opacity="0.34"/>
        <stop offset="0.5" stop-color="#8522CC" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#8522CC" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M64 0H0V64" fill="none" stroke="#B96CF2" stroke-opacity="0.035"/>
      </pattern>
    </defs>
    <rect width="1600" height="600" fill="url(#background)"/>
    <ellipse cx="180" cy="300" rx="560" ry="520" fill="url(#glow)"/>
    <ellipse cx="1420" cy="300" rx="560" ry="520" fill="url(#glow)"/>
    <rect width="1600" height="600" fill="url(#grid)"/>
    <rect x="22" y="22" width="1556" height="556" rx="26" fill="none" stroke="#B96CF2" stroke-opacity="0.22" stroke-width="2"/>
    <text x="800" y="530" text-anchor="middle" fill="#D0C9D9" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600" letter-spacing="2.2">FREE, OPEN SOURCE SOFTWARE FOR LANDLORDS AND TENANTS</text>
  </svg>
`);

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(background)
  .composite([{ input: wordmark, left: 410, top: 60 }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
if (metadata.width !== 1600 || metadata.height !== 600) {
  throw new Error("ENS banner dimensions are invalid.");
}

console.log(`Created ${outputPath} (${metadata.width}x${metadata.height}).`);
