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
import { roleLabel, useInviteRole } from "../lib/inviteContext";
import type { NegotiationRecord } from "../lib/negotiations";

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

function PartyIdentity({
  label,
  name,
  email,
  address,
  fallback,
  suffix,
}: {
  label: string;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  fallback?: string;
  suffix?: string;
}) {
  return (
    <div className="dashboard-row party-identity">
      <span className="label">{label}</span>
      <span>
        {name && <strong>{name}</strong>}
        {email && <small>{email}</small>}
        {address ? <small title={address}>{shortAddr(address)}{suffix || ""}</small> : fallback}
      </span>
    </div>
  );
}

export function AgreementDashboard({
  id,
  agreement,
  participantRecord,
}: {
  id: bigint;
  agreement: Agreement;
  participantRecord?: NegotiationRecord | null;
}) {
  const now = useNow();
  const deadline = nextDeadline(agreement);
  const { address } = useAccount();
  const normalized = address?.toLowerCase();
  const inviteRole = useInviteRole();
  const actualRole =
    normalized === agreement.landlord.toLowerCase()
      ? "landlord"
      : normalized === agreement.tenant.toLowerCase()
        ? "tenant"
        : normalized === agreement.arbiter.toLowerCase()
          ? "arbiter"
          : null;
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
      <div className="dashboard-row">
        <span className="label">Your role for this agreement</span>
        <strong>{actualRole ? roleLabel[actualRole] : "Not a party with this wallet"}</strong>
      </div>
      {inviteRole && actualRole && inviteRole !== actualRole && (
        <p className="tx-error role-mismatch">
          This link invited you as the {inviteRole}, but the connected wallet is registered as the{" "}
          {actualRole}. Sign out and use the {inviteRole}'s Google account or connected wallet.
        </p>
      )}
      {inviteRole && !actualRole && (
        <p className="role-pending">
          This is a {roleLabel[inviteRole].toLowerCase()} invite, but the connected wallet is
          not assigned to this agreement. Send the wallet shown in your account panel to the
          landlord, or ask the landlord for the agreement link created after your wallet was added.
        </p>
      )}
      {agreement.phase === Phase.Closed && (
        <div className="dashboard-row">
          <span className="label">Closed as</span>
          <span>{closeReasonLabel[agreement.closeReason]}</span>
        </div>
      )}
      <PartyIdentity
        label="Landlord"
        name={participantRecord?.landlordName}
        email={participantRecord?.landlordEmail}
        address={agreement.landlord}
      />
      <PartyIdentity
        label="Tenant"
        name={participantRecord?.tenantName}
        email={participantRecord?.tenantEmail}
        address={agreement.tenant}
      />
      <PartyIdentity
        label="Arbiter"
        name={participantRecord?.arbiterName}
        email={participantRecord?.arbiterEmail}
        address={agreement.arbiter === ZERO_ADDRESS ? null : agreement.arbiter}
        fallback="No arbiter selected"
        suffix={
          agreement.arbiter === ZERO_ADDRESS
            ? ""
            : agreement.arbiterAccepted
              ? " (accepted)"
              : agreement.arbiterDeclined
                ? " (declined)"
                : agreement.arbiterResigned
                  ? " (resigned)"
                  : " (pending acceptance)"
        }
      />
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
