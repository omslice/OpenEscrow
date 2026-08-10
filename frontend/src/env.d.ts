/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string;
  readonly VITE_FIAT_ONRAMP_ENABLED?: string;
  readonly VITE_FIAT_ONRAMP_ENVIRONMENT?: "sandbox" | "production";
  readonly VITE_FIAT_ONRAMP_CHAIN?: string;
  readonly VITE_FIAT_ONRAMP_ASSET?: string;
  readonly VITE_FIAT_ONRAMP_PRODUCTION_APPROVED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
