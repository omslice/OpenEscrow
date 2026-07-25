import {
  MockUSDCABI,
  Phase,
  YIELD_USDC_ADDRESS,
  ZERO_ADDRESS,
  closeReasonLabel,
  phaseLabel,
} from "../contracts/config";
import { countdown, formatTimestamp, formatUSDC, shortAddr } from "../lib/format";
import { useNow } from "../lib/useNow";
import type { Agreement } from "../lib/useAgreement";
import { useAccount, useReadContract } from "wagmi";
import { jurisdictionLabel, readJurisdiction } from "../lib/jurisdictions";

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
  const { address } = useAccount();
  const normalized = address?.toLowerCase();
  const availableToYou =
    normalized === agreement.tenant.toLowerCase()
      ? agreement.tenantWithdrawable
      : normalized === agreement.landlord.toLowerCase()
        ? agreement.landlordWithdrawable
        : 0n;
  const jurisdiction = readJurisdiction(id);
  const currentValue = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "convertToAssets",
    args: [agreement.depositAmount],
    query: {
      enabled:
        agreement.depositAmount > 0n &&
        agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase(),
      refetchInterval: 5000,
    },
  });
  const fundedValue = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "convertToAssetsAt",
    args: [agreement.depositAmount, agreement.fundedAt],
    query: {
      enabled:
        agreement.depositAmount > 0n &&
        agreement.fundedAt > 0n &&
        agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase(),
    },
  });
  const isYieldToken = agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const tokenLabel = isYieldToken ? "ytUSDC" : "testUSDC";
  const testValue = (currentValue.data as bigint | undefined) ?? agreement.depositAmount;
  const startingValue = (fundedValue.data as bigint | undefined) ?? agreement.depositAmount;
  const testYield = testValue > startingValue ? testValue - startingValue : 0n;

  return (
    <div className="dashboard">
      <div className="agreement-heading">
        <div>
          <span className="eyebrow">Agreement #{id.toString()}</span>
          <h2>Security deposit</h2>
        </div>
        <span className={`phase-badge phase-${agreement.phase}`}>{phaseLabel[agreement.phase]}</span>
      </div>
      <div className="amount-grid">
        <div className="amount-tile">
          <span>Deposit shares in escrow</span>
          <strong>
            {agreement.depositAmount > 0n
              ? `${formatUSDC(agreement.depositAmount)} ${tokenLabel}`
              : `${formatUSDC(agreement.agreedAmount)} ${tokenLabel} proposed`}
          </strong>
        </div>
        <div className="amount-tile">
          <span>{isYieldToken ? "Current testUSDC value" : "Token value"}</span>
          <strong>{agreement.depositAmount > 0n ? formatUSDC(testValue) : "Not funded"}</strong>
        </div>
        <div className="amount-tile">
          <span>Demo yield accrued</span>
          <strong>{isYieldToken && agreement.depositAmount > 0n ? `+${formatUSDC(testYield)}` : "Not enabled"}</strong>
        </div>
      </div>
      {isYieldToken && (
        <p className="yield-disclaimer">
          Test-only projection at 20% per day. The escrow holds fixed ytUSDC shares; there is no
          underlying asset, redemption, or real yield.
        </p>
      )}
      <div className="amount-grid secondary">
        <div className="amount-tile">
          <span>Custody status</span>
          <strong>{agreement.depositAmount > 0n ? "Confirmed onchain" : "Awaiting deposit"}</strong>
        </div>
        <div className="amount-tile">
          <span>Available to you</span>
          <strong>{formatUSDC(availableToYou)} shares</strong>
        </div>
        <div className="amount-tile">
          <span>Still unresolved</span>
          <strong>{formatUSDC(agreement.locked)} shares</strong>
        </div>
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
        {agreement.arbiter === ZERO_ADDRESS ? (
          <span>No arbiter selected</span>
        ) : (
          <span title={agreement.arbiter}>
            {shortAddr(agreement.arbiter)} {agreement.arbiterAccepted ? "(accepted)" : "(pending acceptance)"}
            {agreement.arbiterDeclined && " - declined"}
            {agreement.arbiterResigned && " - resigned"}
          </span>
        )}
      </div>
      <div className="dashboard-row">
        <span className="label">Jurisdiction context</span>
        <span>
          {jurisdictionLabel(jurisdiction)} <small className="offchain-label">off-chain</small>
        </span>
      </div>
      {agreement.claimedAmount > 0n && (
        <div className="dashboard-row">
          <span className="label">Claimed amount</span>
          <span>{formatUSDC(agreement.claimedAmount)} shares</span>
        </div>
      )}
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
      <details className="technical-details">
        <summary>Accounting details</summary>
        <div className="dashboard-row">
          <span className="label">Tenant withdrawable</span>
          <span>{formatUSDC(agreement.tenantWithdrawable)} ytUSDC shares</span>
        </div>
        <div className="dashboard-row">
          <span className="label">Landlord withdrawable</span>
          <span>{formatUSDC(agreement.landlordWithdrawable)} ytUSDC shares</span>
        </div>
        <div className="dashboard-row">
          <span className="label">Already withdrawn</span>
          <span>{formatUSDC(agreement.withdrawn)} ytUSDC shares</span>
        </div>
      </details>
    </div>
  );
}
