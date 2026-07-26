export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID?.trim() ?? "";
export const ACCOUNT_AUTH_ENABLED = PRIVY_APP_ID.length > 0;

const fiatOnrampAsset = import.meta.env.VITE_FIAT_ONRAMP_ASSET?.trim() ?? "";
const fiatOnrampChain = import.meta.env.VITE_FIAT_ONRAMP_CHAIN?.trim() ?? "";

export const FIAT_ONRAMP_CONFIG =
  import.meta.env.VITE_FIAT_ONRAMP_ENABLED === "true" &&
  fiatOnrampAsset.length > 0 &&
  fiatOnrampChain.includes(":")
    ? {
        asset: fiatOnrampAsset,
        chain: fiatOnrampChain as `${string}:${string}`,
        environment:
          import.meta.env.VITE_FIAT_ONRAMP_ENVIRONMENT === "production"
            ? ("production" as const)
            : ("sandbox" as const),
      }
    : null;
