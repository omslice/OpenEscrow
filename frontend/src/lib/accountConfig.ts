import { validateFiatOnrampConfig } from "../../shared/funding-routes.js";

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID?.trim() ?? "";
export const ACCOUNT_AUTH_ENABLED = PRIVY_APP_ID.length > 0;

const fiatOnrampAsset = import.meta.env.VITE_FIAT_ONRAMP_ASSET?.trim() ?? "";
const fiatOnrampChain = import.meta.env.VITE_FIAT_ONRAMP_CHAIN?.trim() ?? "";

export const FIAT_ONRAMP_READINESS = validateFiatOnrampConfig({
  enabled: import.meta.env.VITE_FIAT_ONRAMP_ENABLED === "true",
  asset: fiatOnrampAsset,
  chain: fiatOnrampChain,
  environment: import.meta.env.VITE_FIAT_ONRAMP_ENVIRONMENT,
  productionApproved:
    import.meta.env.VITE_FIAT_ONRAMP_PRODUCTION_APPROVED === "true",
});

export const FIAT_ONRAMP_CONFIG = FIAT_ONRAMP_READINESS.config;
