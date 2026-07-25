import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseSepolia } from "wagmi/chains";
import { PRIVY_APP_ID } from "./lib/accountConfig";
import { privyWagmiConfig } from "./privyWagmiConfig";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#275D38",
          showWalletLoginFirst: false,
          walletChainType: "ethereum-only",
          walletList: [
            "detected_ethereum_wallets",
            "metamask",
            "coinbase_wallet",
            "wallet_connect",
          ],
        },
        embeddedWallets: {
          ethereum: {
            // Provision explicitly after authentication so a slow Privy request cannot
            // trap the entire app inside its blocking "Creating your wallet" modal.
            createOnLogin: "off",
          },
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>{children}</PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
