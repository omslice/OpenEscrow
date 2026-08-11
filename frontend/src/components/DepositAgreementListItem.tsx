import type { ReactNode } from "react";
import { agreementReference } from "../lib/displayIds";

export function DepositAgreementListItem({
  id,
  propertyAddress,
  needsFunding = false,
  expanded,
  onToggle,
  children,
}: {
  id: bigint;
  propertyAddress?: string | null;
  needsFunding?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const agreementKey = id.toString();
  const reference = agreementReference(id);
  const detailsId = `deposit-${agreementKey}-details`;

  return (
    <article
      className={`deposit-list-item${needsFunding ? " needs-funding" : ""}${expanded ? " is-expanded" : ""}`}
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
          <span className="deposit-list-main">
            <span className="deposit-list-icon" aria-hidden="true">
              {needsFunding ? "!" : "✓"}
            </span>
            <span className="record-list-identity">
              <span className="eyebrow">
                {needsFunding ? "Needs funding" : "Active deposit"}
              </span>
              <strong>{propertyAddress?.trim() || reference}</strong>
              <small>
                {propertyAddress?.trim()
                  ? `${reference} · ${needsFunding ? "Your approved share is ready to fund" : "Finalized security deposit"}`
                  : needsFunding
                    ? "Finalized security deposit · your approved share is ready to fund"
                    : "Finalized security deposit · open to view its current status"}
              </small>
            </span>
          </span>
          <span className="deposit-list-actions" aria-hidden="true">
            <span className="deposit-status-badge">
              {needsFunding ? "Funding needed" : "Finalized"}
            </span>
            <span className="record-expand-label">
              {expanded ? "Hide details" : "Show details"}
              <span className="record-expand-chevron">⌄</span>
            </span>
          </span>
        </button>
      </header>
      <div className="deposit-list-body" id={detailsId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </article>
  );
}
