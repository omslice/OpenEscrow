export interface BrowserDownloadAnchor {
  href: string;
  download: string;
  hidden: boolean;
  click(): void;
  remove(): void;
}

export interface BrowserDownloadEnvironment {
  createBlob(content: string, type: string): Blob;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): BrowserDownloadAnchor;
  appendAnchor(anchor: BrowserDownloadAnchor): void;
  scheduleCleanup(callback: () => void): void;
}

export interface BrowserClipboardEnvironment {
  writeText?: (text: string) => Promise<void>;
  legacyCopy?: (text: string) => boolean;
}

function defaultDownloadEnvironment(): BrowserDownloadEnvironment | null {
  if (
    typeof document === "undefined" ||
    !document.body ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return null;
  }
  return {
    createBlob: (content, type) => new Blob([content], { type }),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
    scheduleCleanup: (callback) => {
      globalThis.setTimeout(callback, 1_000);
    },
  };
}

function legacyCopyText(text: string) {
  if (
    typeof document === "undefined" ||
    !document.body ||
    typeof document.execCommand !== "function"
  ) {
    return false;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.inset = "0 auto auto -10000px";
  document.body.appendChild(input);
  try {
    input.select();
    input.setSelectionRange(0, input.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function defaultClipboardEnvironment(): BrowserClipboardEnvironment {
  let writeText: BrowserClipboardEnvironment["writeText"];
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    }
  } catch {
    // The legacy path below may still work when clipboard access is blocked.
  }
  return { writeText, legacyCopy: legacyCopyText };
}

export function downloadTextFile(
  content: string,
  type: string,
  filename: string,
  environment: BrowserDownloadEnvironment | null = defaultDownloadEnvironment(),
) {
  if (!environment) {
    throw new Error(
      "This browser could not start the download. Check its download permissions and try again.",
    );
  }

  let objectUrl: string | null = null;
  let anchor: BrowserDownloadAnchor | null = null;
  let started = false;
  try {
    const blob = environment.createBlob(content, type);
    objectUrl = environment.createObjectUrl(blob);
    anchor = environment.createAnchor();
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    environment.appendAnchor(anchor);
    anchor.click();
    started = true;
  } catch {
    throw new Error(
      "This browser could not start the download. Check its download permissions and try again.",
    );
  } finally {
    try {
      anchor?.remove();
    } catch {
      // The file action is already complete or has a user-facing failure.
    }
    if (objectUrl) {
      const revoke = () => {
        try {
          environment.revokeObjectUrl(objectUrl as string);
        } catch {
          // Object URL cleanup must not turn a successful download into an error.
        }
      };
      if (started) {
        try {
          environment.scheduleCleanup(revoke);
        } catch {
          revoke();
        }
      } else {
        revoke();
      }
    }
  }
}

export async function copyTextToClipboard(
  text: string,
  environment: BrowserClipboardEnvironment = defaultClipboardEnvironment(),
): Promise<"clipboard" | "legacy"> {
  if (environment.writeText) {
    try {
      await environment.writeText(text);
      return "clipboard";
    } catch {
      // A browser permission failure can still be recoverable through selection copy.
    }
  }
  try {
    if (environment.legacyCopy?.(text)) return "legacy";
  } catch {
    // Fall through to the consistent user-facing error below.
  }
  throw new Error(
    "This browser could not copy the text. Check its clipboard permission and try again.",
  );
}
