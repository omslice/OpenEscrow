// openescrow-canonical-redirect/v1
(() => {
  const fallbackHosts = new Set([
    "openescrow-demo.omrigross.chatgpt.site",
    "www.openescrow-demo.omrigross.chatgpt.site",
    "openescrow.omslice.workers.dev",
  ]);
  if (!fallbackHosts.has(window.location.hostname.toLowerCase())) return;

  const canonical = new URL("https://openescrow.io/");
  canonical.pathname = window.location.pathname;
  canonical.search = window.location.search;
  canonical.hash = window.location.hash;
  window.location.replace(canonical.href);
})();
