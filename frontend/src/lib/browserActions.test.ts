import assert from "node:assert/strict";
import test from "node:test";
import {
  copyTextToClipboard,
  downloadTextFile,
  type BrowserDownloadAnchor,
  type BrowserDownloadEnvironment,
} from "./browserActions.ts";

function downloadHarness({ failClick = false } = {}) {
  const events: string[] = [];
  const anchor: BrowserDownloadAnchor = {
    href: "",
    download: "",
    hidden: false,
    click() {
      events.push("click");
      if (failClick) throw new Error("downloads blocked");
    },
    remove() {
      events.push("remove");
    },
  };
  const environment: BrowserDownloadEnvironment = {
    createBlob(content, type) {
      events.push(`blob:${type}:${content}`);
      return new Blob([content], { type });
    },
    createObjectUrl() {
      events.push("object-url");
      return "blob:openescrow";
    },
    revokeObjectUrl(url) {
      events.push(`revoke:${url}`);
    },
    createAnchor() {
      events.push("anchor");
      return anchor;
    },
    appendAnchor() {
      events.push("append");
    },
    scheduleCleanup(callback) {
      events.push("schedule");
      callback();
    },
  };
  return { anchor, environment, events };
}

test("browser download starts through a temporary anchor and always cleans up", () => {
  const { anchor, environment, events } = downloadHarness();

  downloadTextFile("record", "application/json", "record.json", environment);

  assert.equal(anchor.href, "blob:openescrow");
  assert.equal(anchor.download, "record.json");
  assert.equal(anchor.hidden, true);
  assert.deepEqual(events, [
    "blob:application/json:record",
    "object-url",
    "anchor",
    "append",
    "click",
    "remove",
    "schedule",
    "revoke:blob:openescrow",
  ]);
});

test("blocked browser download returns retry guidance and revokes its object URL", () => {
  const { environment, events } = downloadHarness({ failClick: true });

  assert.throws(
    () => downloadTextFile("record", "application/json", "record.json", environment),
    /could not start the download/,
  );
  assert.deepEqual(events.slice(-2), ["remove", "revoke:blob:openescrow"]);
});

test("clipboard action prefers the browser clipboard", async () => {
  const copied: string[] = [];
  const method = await copyTextToClipboard("verification key", {
    writeText: async (text) => {
      copied.push(text);
    },
    legacyCopy: () => {
      throw new Error("legacy copy should not run");
    },
  });

  assert.equal(method, "clipboard");
  assert.deepEqual(copied, ["verification key"]);
});

test("clipboard action falls back when browser permission rejects the primary API", async () => {
  const copied: string[] = [];
  const method = await copyTextToClipboard("invite", {
    writeText: async () => {
      throw new Error("permission denied");
    },
    legacyCopy: (text) => {
      copied.push(text);
      return true;
    },
  });

  assert.equal(method, "legacy");
  assert.deepEqual(copied, ["invite"]);
});

test("blocked clipboard action returns consistent retry guidance", async () => {
  await assert.rejects(
    copyTextToClipboard("notice", {
      writeText: async () => {
        throw new Error("permission denied");
      },
      legacyCopy: () => false,
    }),
    /could not copy the text/,
  );
});
