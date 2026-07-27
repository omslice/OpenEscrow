import { Component, lazy, Suspense, type ReactNode } from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import type { ServiceReadiness } from "../lib/negotiations";

const PrivyAccountCenter = lazy(() =>
  import("./PrivyAccountCenter").then((module) => ({ default: module.PrivyAccountCenter })),
);

class AccountCenterErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="card account-center-recovery" role="alert">
          <div>
            <span className="eyebrow">Account</span>
            <h2>Account settings need a refresh</h2>
            <p>
              The rest of OpenEscrow is still available. Refresh to reconnect the account panel.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Refresh OpenEscrow
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function AccountCenter({
  workspaceRole,
  onChangeWorkspaceRole,
  onReadinessChange,
}: {
  workspaceRole?: string;
  onChangeWorkspaceRole?: () => void;
  onReadinessChange?: (serviceReadiness: ServiceReadiness | null) => void;
}) {
  if (!ACCOUNT_AUTH_ENABLED) return null;
  return (
    <AccountCenterErrorBoundary>
      <Suspense
        fallback={
          <section className="card account-center-recovery" aria-live="polite">
            <p>Loading account settings...</p>
          </section>
        }
      >
        <PrivyAccountCenter
          workspaceRole={workspaceRole}
          onChangeWorkspaceRole={onChangeWorkspaceRole}
          onReadinessChange={onReadinessChange}
        />
      </Suspense>
    </AccountCenterErrorBoundary>
  );
}
