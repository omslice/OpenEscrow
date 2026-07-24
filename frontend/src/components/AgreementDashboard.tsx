import { Phase, closeReasonLabel, phaseLabel } from "../contracts/config";
import { countdown, formatTimestamp, formatUSDC, shortAddr } from "../lib/format";
import { useNow } from "../lib/useNow";
import type { Agreement } from "../lib/useAgreement";

function nextDeadline(agreement: Agreement): { label: string; ts: bigint } | null {
  switch (agreement.phase) {
    case Phase.Active:
      return { label: "Claim submission deadline (tenant can withdraw in full after)", ts: agreement.claimSubmissionDeadline };
    case Phase.ClaimOpen:
      return { label: "Tenant response deadline (becomes a dispute after, never auto-approved)", ts: agreement.responseDeadline };
    case Phase.Disputed:
      return { label: "Arbiter ruling deadline (disputed funds default to tenant after)", ts: agreement.arbiterRulingDeadline };
    default:
      return null;
  }
}

export function AgreementDashboard({ id, agreement }: { id: bigint; agreement: Agreement }) {
  const now = useNow();
  const deadline = nextDeadline(agreement);

  return (
    <div className="dashboard">
      <div className="dashboard-row">
        <span className="label">Agreement</span>
        <span>#{id.toString()}</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Phase</span>
        <span className={`phase-badge phase-${agreement.phase}`}>{phaseLabel[agreement.phase]}</span>
      </div>
      {agreement.phase === Phase.Closed && (
        <div className="dashboard-row">
          <span className="label">Closed as</span>
          <span>{closeReasonLabel[agreement.closeReason]}</span>
        </div>
      )}
      <div className="dashboard-row">
        <span className="label">Landlord</span>
        <span title={agreement.landlord}>{shortAddr(agreement.landlord)}</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Tenant</span>
        <span title={agreement.tenant}>{shortAddr(agreement.tenant)}</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Arbiter</span>
        <span title={agreement.arbiter}>
          {shortAddr(agreement.arbiter)} {agreement.arbiterAccepted ? "(accepted)" : "(pending acceptance)"}
          {agreement.arbiterResigned && " - resigned"}
        </span>
      </div>
      <div className="dashboard-row">
        <span className="label">Deposit</span>
        <span>{agreement.depositAmount > 0n ? `${formatUSDC(agreement.depositAmount)} USDC` : `(agreed ${formatUSDC(agreement.agreedAmount)}, not funded yet)`}</span>
      </div>
      {agreement.claimedAmount > 0n && (
        <div className="dashboard-row">
          <span className="label">Claimed amount</span>
          <span>{formatUSDC(agreement.claimedAmount)} USDC</span>
        </div>
      )}
      <div className="dashboard-row">
        <span className="label">Tenant withdrawable</span>
        <span>{formatUSDC(agreement.tenantWithdrawable)} USDC</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Landlord withdrawable</span>
        <span>{formatUSDC(agreement.landlordWithdrawable)} USDC</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Locked (unresolved)</span>
        <span>{formatUSDC(agreement.locked)} USDC</span>
      </div>
      <div className="dashboard-row">
        <span className="label">Already withdrawn</span>
        <span>{formatUSDC(agreement.withdrawn)} USDC</span>
      </div>
      {agreement.claimWindowStart > 0n && (
        <div className="dashboard-row">
          <span className="label">Claim window opens</span>
          <span>{formatTimestamp(agreement.claimWindowStart)}</span>
        </div>
      )}
      {deadline && (
        <div className="dashboard-row highlight">
          <span className="label">{deadline.label}</span>
          <span>
            {formatTimestamp(deadline.ts)} - {countdown(deadline.ts, now)}
          </span>
        </div>
      )}
    </div>
  );
}
