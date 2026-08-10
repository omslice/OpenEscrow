import type { ReactNode } from "react";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { privyWagmiConfig } from "./privyWagmiConfig";

const queryClient = new QueryClient();

export default function WalletProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivyWagmiProvider config={privyWagmiConfig}>
        {children}
      </PrivyWagmiProvider>
    </QueryClientProvider>
  );
}
