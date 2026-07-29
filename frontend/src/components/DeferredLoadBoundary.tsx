import {
  Component,
  Suspense,
  createRef,
  type ErrorInfo,
  type ReactNode,
} from "react";

type LoadFailureArea = "app" | "workspace";

class LoadFailureBoundary extends Component<
  { area: LoadFailureArea; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  private readonly reloadButtonRef = createRef<HTMLButtonElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    window.requestAnimationFrame(() => this.reloadButtonRef.current?.focus());
  }

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
        <button
          ref={this.reloadButtonRef}
          className="load-failure-action"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload OpenEscrow
        </button>
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
