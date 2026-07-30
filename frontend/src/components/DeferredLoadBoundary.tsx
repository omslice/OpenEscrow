import {
  Component,
  Suspense,
  createRef,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { reloadBrowserPage } from "../lib/browserActions";

type LoadFailureArea = "app" | "workspace";

class LoadFailureBoundary extends Component<
  { area: LoadFailureArea; children: ReactNode },
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
  };

  render() {
    if (!this.state.failed) return this.props.children;

    const appFailure = this.props.area === "app";
    const content = (
      <>
        <div>
          <span className="load-failure-eyebrow">Temporary loading problem</span>
          {appFailure ? (
            <h1>OpenEscrow couldn&apos;t finish loading</h1>
          ) : (
            <h2>This section couldn&apos;t load</h2>
          )}
          <p>
            {appFailure
              ? "The secure workspace did not start correctly. Before repeating any transaction, reload and check its status."
              : "The rest of your workspace is still available. Before repeating any transaction, reload and check its status."}
          </p>
        </div>
        <div className="load-failure-recovery">
          <button
            ref={this.reloadButtonRef}
            className="load-failure-action"
            type="button"
            onClick={this.reload}
          >
            Reload OpenEscrow
          </button>
          {this.state.reloadError && (
            <p className="tx-error" aria-live="assertive">
              {this.state.reloadError}
            </p>
          )}
        </div>
      </>
    );

    return appFailure ? (
      <main
        className="load-failure load-failure-app"
        role="alert"
        aria-label="OpenEscrow loading error"
      >
        {content}
      </main>
    ) : (
      <section
        className="load-failure load-failure-workspace"
        role="alert"
        aria-label="OpenEscrow section loading error"
      >
        {content}
      </section>
    );
  }
}

export function DeferredLoadBoundary({
  area,
  fallback,
  children,
}: {
  area: LoadFailureArea;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <LoadFailureBoundary area={area}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LoadFailureBoundary>
  );
}
