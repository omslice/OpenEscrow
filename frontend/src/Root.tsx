import { lazy } from "react";
import { DeferredLoadBoundary } from "./components/DeferredLoadBoundary";
import { ACCOUNT_AUTH_ENABLED } from "./lib/accountConfig";

const AuthenticatedRoot = lazy(() => import("./AuthenticatedRoot"));
const FallbackRoot = lazy(() => import("./FallbackRoot"));

export function Root() {
  return (
    <DeferredLoadBoundary
      area="app"
      fallback={
        <div className="app-loading" role="status">
          Loading secure OpenEscrow access...
        </div>
      }
    >
      {ACCOUNT_AUTH_ENABLED ? <AuthenticatedRoot /> : <FallbackRoot />}
    </DeferredLoadBoundary>
  );
}
