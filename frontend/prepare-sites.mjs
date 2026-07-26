import { cp, mkdir, rm } from "node:fs/promises";
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
await mkdir(join(target, "server"), { recursive: true });
await cp(join(frontend, "server", "index.js"), join(target, "server", "index.js"));
await cp(join(frontend, "shared"), join(target, "shared"), { recursive: true });
await mkdir(join(target, ".openai"), { recursive: true });
await cp(
  join(repository, ".openai", "hosting.json"),
  join(target, ".openai", "hosting.json"),
);
await cp(join(repository, "drizzle"), join(target, ".openai", "drizzle"), {
  recursive: true,
});
