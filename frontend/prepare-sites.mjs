import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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

const worker = `const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;

    const fallback = new URL(request.url);
    fallback.pathname = "/index.html";
    fallback.search = "";
    return env.ASSETS.fetch(new Request(fallback, request));
  },
};

export default worker;
`;

await writeFile(join(target, "server", "index.js"), worker, "utf8");
