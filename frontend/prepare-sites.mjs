import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = dirname(fileURLToPath(import.meta.url));
const repository = resolve(frontend, "..");
const source = join(frontend, "dist");
const target = join(repository, "dist");

if (dirname(target) !== repository || target !== join(repository, "dist")) {
  throw new Error("Refusing to prepare a Sites build outside the repository dist directory.");
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, join(target, "client"), { recursive: true });
await cp(join(frontend, "server"), join(target, "server"), { recursive: true });
const serverTarget = join(target, "server");
const serverEntries = await readdir(serverTarget, { recursive: true, withFileTypes: true });
for (const entry of serverEntries) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const sourcePath = join(entry.parentPath || serverTarget, entry.name);
  let serverSource = await readFile(sourcePath, "utf8");
  const packagedServerSource = serverSource.replaceAll("../shared/", "./shared/");
  if (sourcePath.endsWith("index.js") && packagedServerSource === serverSource) {
    throw new Error("The Sites server entrypoint did not contain the expected shared imports.");
  }
  if (packagedServerSource !== serverSource) {
    await writeFile(sourcePath, packagedServerSource);
  }
}
await rm(join(serverTarget, "index.test.mjs"), { force: true });
await cp(join(frontend, "shared"), join(target, "server", "shared"), {
  recursive: true,
});
await mkdir(join(target, ".openai"), { recursive: true });
await cp(
  join(repository, ".openai", "hosting.json"),
  join(target, ".openai", "hosting.json"),
);
await cp(join(repository, "drizzle"), join(target, ".openai", "drizzle"), {
  recursive: true,
});
