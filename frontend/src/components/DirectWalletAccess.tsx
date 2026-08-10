import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "../contracts/config";
import { shortAddr } from "../lib/format";

export function DirectWalletAccess() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isPending}
        className="btn btn-primary"
      >
        {isPending ? "Connecting..." : "Connect own wallet"}
      </button>
    );
  }

  const wrongChain = chainId !== chain.id;

  return (
    <div className="connect-wallet">
      {wrongChain ? (
        <button
          className="btn btn-warning"
          onClick={() => switchChain({ chainId: chain.id })}
        >
          Switch to {chain.name}
        </button>
      ) : (
        <span className="chain-badge">{chain.name}</span>
      )}
      <span className="address-badge" title={address}>
        {shortAddr(address)}
      </span>
      <button className="btn btn-ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
