export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID?.trim() ?? "";
export const ACCOUNT_AUTH_ENABLED = PRIVY_APP_ID.length > 0;
