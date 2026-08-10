import { createConfig } from "@privy-io/wagmi";
import { baseSepolia } from "wagmi/chains";
import { baseSepoliaTransport } from "./lib/baseSepoliaRpc";

export const privyWagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: baseSepoliaTransport(),
  },
});
