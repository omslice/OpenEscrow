import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { fallbackWagmiConfig } from "./wagmiConfig";

const queryClient = new QueryClient();

export default function FallbackRoot() {
  return (
    <WagmiProvider config={fallbackWagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
