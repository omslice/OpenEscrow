import { createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { baseSepoliaTransport } from "./lib/baseSepoliaRpc";

export const fallbackWagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: baseSepoliaTransport(),
  },
});
