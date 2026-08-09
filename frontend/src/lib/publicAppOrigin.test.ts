import assert from "node:assert/strict";
import test from "node:test";
import { publicAppOrigin } from "./publicAppOrigin.ts";

test("public app links use openescrow.io on operational mirrors", () => {
  assert.equal(
    publicAppOrigin("https://openescrow-demo.omrigross.chatgpt.site"),
    "https://openescrow.io",
  );
  assert.equal(
    publicAppOrigin("https://openescrow.omslice.workers.dev"),
    "https://openescrow.io",
  );
  assert.equal(
    publicAppOrigin("https://www.openescrow-demo.omrigross.chatgpt.site"),
    "https://openescrow.io",
  );
});

test("self-hosted and local installations keep their own origin", () => {
  assert.equal(publicAppOrigin("https://escrow.example.org/app"), "https://escrow.example.org");
  assert.equal(publicAppOrigin("http://localhost:5173"), "http://localhost:5173");
});

test("malformed public origins fail closed to the canonical app", () => {
  assert.equal(publicAppOrigin("not a URL"), "https://openescrow.io");
});
