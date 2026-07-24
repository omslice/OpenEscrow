// Quick visual smoke-check for the running dev server (npm run dev, port 5173).
// Usage: node drive.mjs [dark]
// Screenshots land in frontend/.screenshots/ (gitignored) and the script prints
// any browser console errors it saw. Requires Microsoft Edge at the default
// Windows install path - swap EDGE_PATH if running elsewhere.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dark = process.argv.includes("dark");
const outDir = ".screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  colorScheme: dark ? "dark" : "light",
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

const suffix = dark ? "-dark" : "";

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForSelector("text=OpenEscrow", { timeout: 15000 });
await page.screenshot({ path: `${outDir}/1-initial${suffix}.png`, fullPage: true });

await page.click("text=Propose new agreement");
await page.waitForSelector("text=Propose a new agreement");
await page.screenshot({ path: `${outDir}/2-create-form${suffix}.png`, fullPage: true });

await page.click("text=My agreements");
await page.waitForSelector("text=Find agreements involving you");
await page.screenshot({ path: `${outDir}/3-track-tab${suffix}.png`, fullPage: true });

console.log(`Screenshots saved to ${outDir}/ (suffix: "${suffix}").`);
console.log("Console errors:", consoleErrors.length ? consoleErrors : "none");

await browser.close();
