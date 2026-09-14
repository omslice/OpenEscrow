import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia } from "wagmi/chains";
import { PRIVY_APP_ID } from "./lib/accountConfig";

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
            // Privy's supported first-login path provisions only accounts that do not
            // already have a wallet. The account center retains explicit retry controls.
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
