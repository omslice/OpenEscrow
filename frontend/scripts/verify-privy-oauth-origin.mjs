import { randomBytes, randomUUID } from "node:crypto";

const DEFAULT_PRIVY_OAUTH_INIT_URL = "https://auth.privy.io/api/v1/oauth/init";

function requireHttpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`Privy hosted origins must use HTTPS: ${url.origin}.`);
  }
  return url.origin;
}

async function readError(response) {
  try {
    const body = await response.json();
    return {
      code: typeof body?.code === "string" ? body.code : null,
      message: typeof body?.error === "string" ? body.error : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

export async function verifyPrivyGoogleOrigin({
  appId,
  origin,
  fetchImpl = globalThis.fetch,
  endpoint = DEFAULT_PRIVY_OAUTH_INIT_URL,
}) {
  if (typeof appId !== "string" || !appId.trim()) {
    throw new Error("A public Privy app ID is required for the hosted-origin check.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for the hosted-origin check.");
  }

  const allowedOrigin = requireHttpsOrigin(origin);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: allowedOrigin,
      "privy-app-id": appId.trim(),
      "privy-client": "openescrow-deployment-check",
    },
    body: JSON.stringify({
      redirect_to: `${allowedOrigin}/`,
      provider: "google",
      code_challenge: randomBytes(32).toString("base64url"),
      state_code: randomUUID().replaceAll("-", ""),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await readError(response);
    const reason = [detail.message, detail.code].filter(Boolean).join(" · ");
    throw new Error(
      `Privy rejected ${allowedOrigin} with HTTP ${response.status}${reason ? `: ${reason}` : "."}`,
    );
  }

  const body = await response.json();
  const authorizationUrl = new URL(body?.url);
  if (
    authorizationUrl.protocol !== "https:" ||
    authorizationUrl.hostname !== "accounts.google.com"
  ) {
    throw new Error("Privy did not return the expected Google authorization URL.");
  }

  return {
    origin: allowedOrigin,
    provider: authorizationUrl.origin,
  };
}
