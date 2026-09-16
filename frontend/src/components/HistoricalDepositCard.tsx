import { agreementContractAddress } from "../lib/agreementDeployment";
import { agreementReference, proposalReference } from "../lib/displayIds";
import { formatUSDC } from "../lib/format";
import type { NegotiationRecord } from "../lib/negotiations";
import { useAgreement } from "../lib/useAgreement";
import { phaseLabel } from "../contracts/config";

function OriginalAgreementDetails({ id, address }: { id: bigint; address: `0x${string}` }) {
  const { agreement, isLoading, isFetching, isMissing, error, refetch } = useAgreement(id, address);
  if (isLoading) return <p role="status">Loading original deposit status...</p>;
  if (isMissing) return <p role="status">The saved agreement was not found at its recorded contract. Its private record remains available.</p>;
  if (error || !agreement) return (
    <div role="alert">
      <p>The original testnet status is temporarily unavailable. Your saved record is still available.</p>
      <button className="btn btn-secondary" disabled={isFetching} onClick={() => void refetch()}>
        {isFetching ? "Checking original deposit..." : "Retry original deposit status"}
      </button>
    </div>
  );
  return (
    <dl className="proposal-summary-grid">
      <div><dt>Original contract status</dt><dd>{phaseLabel[agreement.phase] || "Unknown"}</dd></div>
      <div><dt>Recorded deposit</dt><dd>{formatUSDC(agreement.depositAmount)} test tokens</dd></div>
      <div><dt>Tenant allocation remaining</dt><dd>{formatUSDC(agreement.tenantWithdrawable)} test tokens</dd></div>
      <div><dt>Landlord allocation remaining</dt><dd>{formatUSDC(agreement.landlordWithdrawable)} test tokens</dd></div>
    </dl>
  );
}

export function HistoricalDepositCard({
  record, recordKey, expanded, onToggle, onOpenRecord,
}: {
  record: NegotiationRecord;
  recordKey: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenRecord: () => void;
}) {
  const address = agreementContractAddress(record);
  const detailsId = `historical-deposit-${recordKey}`;
  const reference = agreementReference(record.onchainAgreementId!);
  return (
    <article className={`deposit-list-item${expanded ? " is-expanded" : ""}`} role="listitem">
      <header className="deposit-list-row">
        <button className="record-expand-button deposit-list-toggle" type="button"
          aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}
          aria-label={`${expanded ? "Hide" : "Show"} earlier deposit ${reference}, ${proposalReference(record.id)}`}>
          <span className="deposit-list-main"><span className="record-list-identity">
            <span className="eyebrow">{address ? "Earlier testnet deposit" : "Saved deposit · deployment unverified"}</span>
            <strong>{record.terms.propertyAddress || reference}</strong>
            <small>{reference} · {proposalReference(record.id)}</small>
          </span></span>
          <span className="deposit-list-actions" aria-hidden="true"><span className="deposit-status-badge">Read only</span>
            <span className="record-expand-label">{expanded ? "Hide details" : "Show details"}<span className="record-expand-chevron">⌄</span></span>
          </span>
        </button>
      </header>
      <div className="deposit-list-body" id={detailsId} hidden={!expanded}>
        {expanded && <section className="card">
          <p>{address
            ? "This deposit belongs to an earlier testnet release. Its original status and saved record remain available here. Transactions for this release are not enabled in this view."
            : "This saved deposit does not yet have a verified contract address. Its record remains available; it will not be matched to another deposit just because they share a number."}</p>
          {address && <OriginalAgreementDetails key={`${address}:${record.onchainAgreementId}`}
            id={BigInt(record.onchainAgreementId!)} address={address} />}
          <div className="button-row">
            <button className="btn btn-secondary" type="button" onClick={onOpenRecord}>Open saved record</button>
            {address && <a className="btn btn-ghost" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer">View original contract</a>}
          </div>
        </section>}
      </div>
    </article>
  );
}
