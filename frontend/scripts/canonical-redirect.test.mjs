import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const redirectSource = await readFile(
  new URL("../public/canonical-redirect.js", import.meta.url),
  "utf8",
);

function executeAt(href) {
  const current = new URL(href);
  const replacements = [];
  const window = {
    location: {
      hostname: current.hostname,
      pathname: current.pathname,
      search: current.search,
      hash: current.hash,
      replace(value) {
        replacements.push(value);
      },
    },
  };
  vm.runInNewContext(redirectSource, { URL, Set, window });
  return replacements;
}

test("historical Sites visits preserve their path, query, and fragment on openescrow.io", () => {
  assert.deepEqual(
    executeAt(
      "https://openescrow-demo.omrigross.chatgpt.site/proposals?id=42#yield-stablecoins",
    ),
    ["https://openescrow.io/proposals?id=42#yield-stablecoins"],
  );
});

test("canonical and self-hosted installations remain on their own host", () => {
  assert.deepEqual(executeAt("https://openescrow.io/"), []);
  assert.deepEqual(executeAt("http://localhost:5173/"), []);
  assert.deepEqual(executeAt("https://escrow.example.org/"), []);
});
