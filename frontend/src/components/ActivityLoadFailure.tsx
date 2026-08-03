import { useId, useLayoutEffect, useRef, useState } from "react";

export function ActivityLoadFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => Promise<boolean>;
}) {
  const headingId = useId();
  const retryRef = useRef<HTMLButtonElement>(null);
  const retryInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  useLayoutEffect(() => {
    if (focusRequest > 0) {
      retryRef.current?.focus({ preventScroll: true });
    }
  }, [focusRequest]);

  async function retry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    setRetryFailed(false);
    let recovered = false;
    try {
      recovered = await onRetry();
    } catch {
      recovered = false;
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
    if (!recovered) {
      setRetryFailed(true);
      setFocusRequest((request) => request + 1);
    }
  }

  return (
    <section
      className="activity-load-failure"
      role="alert"
      aria-labelledby={headingId}
      aria-busy={retrying}
    >
      <strong id={headingId}>Public record receipts could not be loaded</strong>
      <p>
        Your agreement and saved activity have not been removed. Previously loaded receipts may
        be out of date, so check again before repeating an action.
      </p>
      <details className="technical-details">
        <summary>Connection details</summary>
        <code>{error.slice(0, 500)}</code>
      </details>
      {retryFailed && (
        <p className="field-help" role="status">
          Still couldn&apos;t connect. Your saved record remains available; check your connection
          and try again.
        </p>
      )}
      <button
        ref={retryRef}
        className="btn btn-secondary small"
        type="button"
        disabled={retrying}
        onClick={() => void retry()}
      >
        {retrying ? "Retrying public receipts..." : "Try loading public receipts again"}
      </button>
    </section>
  );
}
