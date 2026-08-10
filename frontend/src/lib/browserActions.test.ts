import assert from "node:assert/strict";
import test from "node:test";
import {
  closeModalDialog,
  confirmBrowserAction,
  copyTextToClipboard,
  downloadTextFile,
  openExternalWindow,
  reloadBrowserPage,
  showModalDialog,
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

test("external window opens only when the browser returns a real popup", () => {
  const opened: string[] = [];
  const popup = {
    opener: {},
    location: {
      replace(url: string) {
        opened.push(`replace:${url}`);
      },
    },
  };
  openExternalWindow("https://mail.example/compose", {
    open(url, target, features) {
      opened.push(url, target, features);
      return popup;
    },
  });

  assert.deepEqual(opened, [
    "",
    "_blank",
    "",
    "replace:https://mail.example/compose",
  ]);
  assert.equal(popup.opener, null);
});

test("blocked external window returns a copy-option fallback", () => {
  assert.throws(
    () =>
      openExternalWindow("https://mail.example/compose", {
        open() {
          return null;
        },
      }),
    /could not open the new window.*copy option/,
  );
});

test("failed external navigation closes its temporary popup", () => {
  let closed = false;
  assert.throws(
    () =>
      openExternalWindow("https://mail.example/compose", {
        open() {
          return {
            opener: {},
            location: {
              replace() {
                throw new Error("navigation blocked");
              },
            },
            close() {
              closed = true;
            },
          };
        },
      }),
    /could not open the new window/,
  );
  assert.equal(closed, true);
});

test("browser confirmation distinguishes approval from cancellation", () => {
  const messages: string[] = [];
  const environment = {
    confirm(message: string) {
      messages.push(message);
      return messages.length === 1;
    },
  };

  assert.equal(confirmBrowserAction("Reset this link?", environment), true);
  assert.equal(confirmBrowserAction("Cancel this proposal?", environment), false);
  assert.deepEqual(messages, ["Reset this link?", "Cancel this proposal?"]);
});

test("blocked browser confirmation fails closed with retry guidance", () => {
  assert.throws(
    () => confirmBrowserAction("Remove tenant?", null),
    /could not show the confirmation prompt.*try again/,
  );
  assert.throws(
    () =>
      confirmBrowserAction("End sessions?", {
        confirm() {
          throw new Error("dialog blocked");
        },
      }),
    /could not show the confirmation prompt.*try again/,
  );
});

test("browser reload uses the supplied page environment", () => {
  let reloaded = 0;
  reloadBrowserPage({
    reload() {
      reloaded += 1;
    },
  });
  assert.equal(reloaded, 1);
});

test("blocked browser reload returns manual recovery guidance", () => {
  assert.throws(
    () => reloadBrowserPage(null),
    /could not reload OpenEscrow.*browser refresh control.*transaction status/,
  );
  assert.throws(
    () =>
      reloadBrowserPage({
        reload() {
          throw new Error("navigation blocked");
        },
      }),
    /could not reload OpenEscrow.*browser refresh control.*transaction status/,
  );
});

test("modal helpers tolerate missing and rejected browser dialog capabilities", () => {
  assert.equal(showModalDialog(null), false);
  assert.equal(
    showModalDialog({
      open: false,
      showModal() {
        throw new Error("dialog blocked");
      },
    }),
    false,
  );
  assert.equal(
    closeModalDialog({
      open: true,
      close() {
        throw new Error("dialog blocked");
      },
    }),
    false,
  );
});

test("modal helpers report successful browser-managed open and close states", () => {
  const state = { open: false };
  const dialog = {
    get open() {
      return state.open;
    },
    showModal() {
      state.open = true;
    },
    close() {
      state.open = false;
    },
  };

  assert.equal(showModalDialog(dialog), true);
  assert.equal(closeModalDialog(dialog), true);
});
