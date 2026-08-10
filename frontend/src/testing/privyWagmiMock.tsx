/* oxlint-disable react/only-export-components -- This test-only module intentionally mirrors Privy's component-and-hook API. */
import type { ReactNode } from "react";
import { WagmiProvider as BaseWagmiProvider } from "wagmi";
import { fallbackWagmiConfig } from "../wagmiConfig";

export function createConfig() {
  return fallbackWagmiConfig;
}

export function WagmiProvider({ children }: { children: ReactNode }) {
  return (
    <BaseWagmiProvider config={fallbackWagmiConfig}>
      {children}
    </BaseWagmiProvider>
  );
}

export function useSetActiveWallet() {
  return {
    setActiveWallet: async () => undefined,
  };
}
