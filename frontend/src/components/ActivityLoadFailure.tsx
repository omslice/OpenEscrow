import { useId, useRef, useState } from "react";

export function ActivityLoadFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => Promise<boolean>;
}) {
  const headingId = useId();
  const retryRef = useRef<HTMLButtonElement>(null);
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    let recovered = false;
    try {
      recovered = await onRetry();
    } finally {
      setRetrying(false);
    }
    if (!recovered) {
      window.requestAnimationFrame(() => retryRef.current?.focus());
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
