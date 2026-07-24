import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const fallbackWagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
});
