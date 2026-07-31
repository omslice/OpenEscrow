import { useEffect, useRef, useState } from "react";
import { agreementReference } from "../lib/displayIds";

export function AgreementLoadFailure({
  id,
  retrying,
  onRetry,
}: {
  id: bigint;
  retrying: boolean;
  onRetry: () => Promise<void>;
}) {
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const titleId = `agreement-${id.toString()}-load-error-title`;
  const guidanceId = `agreement-${id.toString()}-load-error-guidance`;
  const retryErrorId = `agreement-${id.toString()}-load-retry-error`;

  useEffect(() => {
    if (retrying || !retryError) return;
    const frame = window.requestAnimationFrame(() => {
      retryButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [retryError, retrying]);

  async function retry() {
    setRetryError(null);
    try {
      await onRetry();
    } catch {
      setRetryError(
        "OpenEscrow still could not reconnect to this deposit. Check your connection and try again. Before repeating any payment, claim, or withdrawal, check your wallet and the Record tab.",
      );
    }
  }

  return (
    <section
      className="card agreement-load-failure"
      role="alert"
      aria-labelledby={titleId}
      aria-describedby={`${guidanceId}${retryError ? ` ${retryErrorId}` : ""}`}
      aria-busy={retrying}
    >
      <div>
        <span className="eyebrow">Temporary connection problem</span>
        <h2 id={titleId}>{agreementReference(id)} could not be loaded</h2>
        <p id={guidanceId}>
          Your deposit has not been removed. Check your connection and try again. Before repeating
          any payment, claim, or withdrawal, check your wallet and the Record tab.
        </p>
      </div>
      <div className="agreement-load-recovery">
        <button
          ref={retryButtonRef}
          className="btn btn-secondary"
          type="button"
          disabled={retrying}
          aria-describedby={`${guidanceId}${retryError ? ` ${retryErrorId}` : ""}`}
          onClick={() => void retry()}
        >
          {retrying ? "Checking deposit..." : "Try loading deposit again"}
        </button>
        {retryError && (
          <p id={retryErrorId} className="tx-error" aria-live="assertive">
            {retryError}
          </p>
        )}
      </div>
    </section>
  );
}
