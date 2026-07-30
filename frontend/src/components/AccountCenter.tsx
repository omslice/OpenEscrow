import {
  Component,
  createRef,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { reloadBrowserPage } from "../lib/browserActions";
import type { ServiceReadiness } from "../lib/negotiations";

const PrivyAccountCenter = lazy(() =>
  import("./PrivyAccountCenter").then((module) => ({ default: module.PrivyAccountCenter })),
);

class AccountCenterErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; reloadError: string | null }
> {
  state = { failed: false, reloadError: null };
  private readonly reloadButtonRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError() {
    return { failed: true, reloadError: null };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    window.requestAnimationFrame(() => this.reloadButtonRef.current?.focus());
  }

  private reload = () => {
    this.setState({ reloadError: null });
    try {
      reloadBrowserPage();
    } catch (error) {
      this.setState({
        reloadError:
          error instanceof Error
            ? error.message
            : "OpenEscrow could not reload. Use the browser refresh control and check transaction status before retrying.",
      });
      window.requestAnimationFrame(() => this.reloadButtonRef.current?.focus());
    }
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
          <div className="account-center-recovery-action">
            <button
              ref={this.reloadButtonRef}
              className="btn btn-secondary"
              type="button"
              onClick={this.reload}
            >
              Refresh OpenEscrow
            </button>
            {this.state.reloadError && (
              <p className="tx-error" aria-live="assertive">
                {this.state.reloadError}
              </p>
            )}
          </div>
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
