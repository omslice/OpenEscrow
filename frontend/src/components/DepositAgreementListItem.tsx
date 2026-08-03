import type { ReactNode } from "react";
import { agreementReference } from "../lib/displayIds";

export function DepositAgreementListItem({
  id,
  propertyAddress,
  expanded,
  onToggle,
  children,
}: {
  id: bigint;
  propertyAddress?: string | null;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const agreementKey = id.toString();
  const reference = agreementReference(id);
  const detailsId = `deposit-${agreementKey}-details`;

  return (
    <article
      className={`deposit-list-item${expanded ? " is-expanded" : ""}`}
      role="listitem"
      data-deposit-id={agreementKey}
    >
      <header className="deposit-list-row">
        <button
          className="record-expand-button deposit-list-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${reference}`}
          onClick={onToggle}
        >
          <span className="record-list-identity">
            <span className="eyebrow">Finalized security deposit</span>
            <strong>{reference}</strong>
            <small>
              {propertyAddress?.trim() ||
                "Open to view the current status and available actions."}
            </small>
          </span>
          <span className="record-expand-label" aria-hidden="true">
            {expanded ? "Hide details" : "Show details"}
            <span className="record-expand-chevron">⌄</span>
          </span>
        </button>
      </header>
      <div className="deposit-list-body" id={detailsId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </article>
  );
}
