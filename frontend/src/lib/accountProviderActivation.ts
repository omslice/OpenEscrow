const ACCOUNT_PROVIDER_ACTIVATED_KEY =
  "openescrow:account-provider-activated";

export function hasActivatedAccountProvider() {
  try {
    return window.localStorage.getItem(ACCOUNT_PROVIDER_ACTIVATED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberAccountProviderActivation() {
  try {
    window.localStorage.setItem(ACCOUNT_PROVIDER_ACTIVATED_KEY, "1");
  } catch {
    // This non-sensitive performance hint is optional when storage is blocked.
  }
}
