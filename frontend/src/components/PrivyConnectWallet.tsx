import { lazy, Suspense } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useInviteRole } from "../lib/inviteContext";

const PrivyConnectedWallet = lazy(() =>
  import("./PrivyConnectedWallet").then((module) => ({
    default: module.PrivyConnectedWallet,
  })),
);

export function PrivyConnectWallet() {
  const { ready, authenticated, login } = usePrivy();
  const inviteRole = useInviteRole();

  if (!ready) {
    return <button className="btn btn-primary" disabled>Loading account...</button>;
  }

  if (!authenticated) {
    return (
      <div className="account-entry">
        <button className="btn btn-primary" onClick={() => login({ loginMethods: ["google"] })}>
          {inviteRole ? `Continue as ${inviteRole} with Google` : "Continue with Google"}
        </button>
        <button className="btn btn-ghost" onClick={() => login({ loginMethods: ["wallet"] })}>
          {inviteRole ? `Use a ${inviteRole} wallet` : "Continue with a wallet"}
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<button className="btn btn-primary" disabled>Loading wallet...</button>}>
      <PrivyConnectedWallet />
    </Suspense>
  );
}
