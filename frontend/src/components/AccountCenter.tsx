import { lazy, Suspense } from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";

const PrivyAccountCenter = lazy(() =>
  import("./PrivyAccountCenter").then((module) => ({ default: module.PrivyAccountCenter })),
);

export function AccountCenter({ embedded = false }: { embedded?: boolean }) {
  if (!ACCOUNT_AUTH_ENABLED) return null;
  return (
    <Suspense fallback={null}>
      <PrivyAccountCenter embedded={embedded} />
    </Suspense>
  );
}
