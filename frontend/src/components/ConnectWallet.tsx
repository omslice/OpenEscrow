import { lazy, Suspense } from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";

const PrivyConnectWallet = lazy(() =>
  import("./PrivyConnectWallet").then((module) => ({ default: module.PrivyConnectWallet })),
);
const DirectWalletAccess = lazy(() =>
  import("./DirectWalletAccess").then((module) => ({ default: module.DirectWalletAccess })),
);

export function ConnectWallet() {
  if (ACCOUNT_AUTH_ENABLED) {
    return (
      <Suspense fallback={<button className="btn btn-primary" disabled>Loading account...</button>}>
        <PrivyConnectWallet />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<button className="btn btn-primary" disabled>Loading wallet...</button>}>
      <DirectWalletAccess />
    </Suspense>
  );
}
