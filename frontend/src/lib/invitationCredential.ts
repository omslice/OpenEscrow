const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export type InvitationCredential = {
  token: string | null;
  present: boolean;
  conflicted: boolean;
  source: "fragment" | "query" | null;
};

function fragmentParameters(url: URL) {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

function validToken(value: string | null) {
  return value && INVITATION_TOKEN_PATTERN.test(value) ? value : null;
}

export function readInvitationCredential(url: URL): InvitationCredential {
  const fragment = fragmentParameters(url);
  const fragmentValues = fragment.getAll("token");
  const queryValues = url.searchParams.getAll("token");
  const fragmentPresent = fragmentValues.length > 0;
  const queryPresent = queryValues.length > 0;
  const fragmentToken =
    fragmentValues.length === 1 ? validToken(fragmentValues[0]) : null;
  const queryToken = queryValues.length === 1 ? validToken(queryValues[0]) : null;
  const conflicted = Boolean(
    fragmentValues.length > 1 ||
    queryValues.length > 1 ||
    (fragmentPresent && !fragmentToken) ||
    (queryPresent && !queryToken) ||
    (fragmentPresent && queryPresent),
  );
  const token = conflicted ? null : fragmentToken || queryToken;
  return {
    token,
    present: fragmentPresent || queryPresent,
    conflicted,
    source: token ? (fragmentToken ? "fragment" : "query") : null,
  };
}

export function clearInvitationCredential(url: URL) {
  let changed = false;
  if (url.searchParams.has("token")) {
    url.searchParams.delete("token");
    changed = true;
  }
  const fragment = fragmentParameters(url);
  if (fragment.has("token")) {
    fragment.delete("token");
    url.hash = fragment.toString();
    changed = true;
  }
  return changed;
}

export function setInvitationCredential(url: URL, token: string) {
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    throw new Error("The invitation credential is invalid.");
  }
  url.searchParams.delete("token");
  const fragment = fragmentParameters(url);
  fragment.set("token", token);
  url.hash = fragment.toString();
}
