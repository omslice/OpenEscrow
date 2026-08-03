import type { ReactNode } from "react";

export function RecordListItem({
  id,
  detailsId,
  expanded,
  eyebrow,
  reference,
  meta,
  className,
  dataRecordKey,
  actions,
  error,
  onToggle,
  children,
}: {
  id: string;
  detailsId: string;
  expanded: boolean;
  eyebrow: string;
  reference: string;
  meta: string;
  className?: string;
  dataRecordKey?: string;
  actions?: ReactNode;
  error?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <article
      className={`card record-workspace-card record-list-item${
        className ? ` ${className}` : ""
      }`}
      id={id}
      role="listitem"
      data-record-key={dataRecordKey}
      tabIndex={-1}
    >
      <header className="record-workspace-header record-list-row">
        <button
          className="record-expand-button"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${eyebrow} ${reference}`}
          onClick={onToggle}
        >
          <span className="record-list-identity">
            <span className="eyebrow">{eyebrow}</span>
            <strong>{reference}</strong>
            <small>{meta}</small>
          </span>
          <span className="record-expand-label" aria-hidden="true">
            {expanded ? "Hide details" : "Show details"}
            <span className="record-expand-chevron">⌄</span>
          </span>
        </button>
        {actions ? <div className="record-workspace-actions">{actions}</div> : null}
      </header>
      {error}
      <div className="record-workspace-body" id={detailsId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </article>
  );
}
