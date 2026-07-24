import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";
import { fallbackWagmiConfig } from "./wagmiConfig";

const PrivyAppProviders = lazy(() =>
  import("./AppProviders").then((module) => ({ default: module.AppProviders })),
);
const fallbackQueryClient = new QueryClient();

export function Root() {
  if (ACCOUNT_AUTH_ENABLED) {
    return (
      <Suspense fallback={<div className="app-loading">Loading secure account access...</div>}>
        <PrivyAppProviders>
          <App />
        </PrivyAppProviders>
      </Suspense>
    );
  }

  return (
    <WagmiProvider config={fallbackWagmiConfig}>
      <QueryClientProvider client={fallbackQueryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
