import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { chain } from "../contracts/config";
import { shortAddr } from "../lib/format";

export function PrivyConnectWallet() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!ready) {
    return <button className="btn btn-primary" disabled>Loading account...</button>;
  }

  if (!authenticated) {
    return (
      <div className="account-entry">
        <button className="btn btn-primary" onClick={() => login({ loginMethods: ["google"] })}>
          Continue with Google
        </button>
        <button className="btn btn-ghost" onClick={() => login({ loginMethods: ["wallet"] })}>
          Use your own wallet
        </button>
      </div>
    );
  }

  const wrongChain = Boolean(address && chainId !== chain.id);
  const identity = user?.google?.email ?? user?.email?.address ?? "Wallet account";

  return (
    <div className="connect-wallet account-summary">
      <span className="account-email" title={identity}>{identity}</span>
      {wrongChain ? (
        <button className="btn btn-warning" onClick={() => switchChain({ chainId: chain.id })}>
          Switch to {chain.name}
        </button>
      ) : address ? (
        <span className="address-badge" title={address}>{shortAddr(address)}</span>
      ) : (
        <span className="chain-badge">Setting up wallet...</span>
      )}
      <button className="btn btn-ghost" onClick={() => logout()}>
        Sign out
      </button>
    </div>
  );
}
