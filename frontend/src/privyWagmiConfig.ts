import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { baseSepolia } from "wagmi/chains";

export const privyWagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
});
