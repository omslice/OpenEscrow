const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const VERSIONED_ASSET = /^\/assets\/.+-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/;

function withSecurityHeaders(response, requestUrl) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  if (new URL(requestUrl).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  headers.set(
    "cache-control",
    VERSIONED_ASSET.test(new URL(requestUrl).pathname)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

class CanonicalMetaRewriter {
  constructor(origin) {
    this.origin = origin;
  }

  element(element) {
    const kind = element.getAttribute("data-openescrow-meta");
    const absoluteUrl = kind === "social-image" ? `${this.origin}/og.png` : `${this.origin}/`;
    if (element.tagName === "link") {
      element.setAttribute("href", absoluteUrl);
    } else {
      element.setAttribute("content", absoluteUrl);
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(
        new Response("Method not allowed.", {
          status: 405,
          headers: { allow: "GET, HEAD" },
        }),
        request.url,
      );
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("content-type") || "";
    if (request.method === "HEAD" || !contentType.includes("text/html")) {
      return withSecurityHeaders(assetResponse, request.url);
    }

    const origin = new URL(request.url).origin;
    const rewritten = new HTMLRewriter()
      .on("[data-openescrow-meta]", new CanonicalMetaRewriter(origin))
      .transform(assetResponse);
    return withSecurityHeaders(rewritten, request.url);
  },
};
