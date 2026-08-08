const OPERATIONAL_FALLBACK_HOSTS = new Set([
  "openescrow-demo.omrigross.chatgpt.site",
  "openescrow.omslice.workers.dev",
]);

export function publicAppOrigin(origin = window.location.origin) {
  try {
    const parsed = new URL(origin);
    return OPERATIONAL_FALLBACK_HOSTS.has(parsed.hostname.toLowerCase())
      ? "https://openescrow.io"
      : parsed.origin;
  } catch {
    return "https://openescrow.io";
  }
}
