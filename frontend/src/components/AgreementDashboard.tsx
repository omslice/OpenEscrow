import {
  TestAaveUSDCABI,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  OPERATIONS_RESERVE_ADDRESS,
  OperationsReserveABI,
  Phase,
  USDC_ADDRESS,
  YIELD_USDC_ADDRESS,
  ZERO_ADDRESS,
  closeReasonLabel,
  phaseLabel,
} from "../contracts/config";
import { countdown, formatTimestamp, formatUSDC, shortAddr } from "../lib/format";
import { agreementReference } from "../lib/displayIds";
import { useNow } from "../lib/useNow";
import type { Agreement } from "../lib/useAgreement";
import { useAccount, useReadContract } from "wagmi";
import {
  GENERIC_TEST_POLICY,
  isJurisdictionCode,
  jurisdictionLabel,
} from "../lib/jurisdictions";
import { roleLabel, useInviteRole } from "../lib/inviteContext";
import type { NegotiationRecord } from "../lib/negotiations";
import {
  calculateDepositAccounting,
  getDepositAssetForTerms,
} from "../../shared/deposit-assets.js";
import {
  agreementAmountUnit,
  claimAmountUnit,
  payoutAmountUnit,
} from "../lib/agreementAmountDisplay";
import { participantDepositTokenBalance } from "../lib/participantBalances";

function nextDeadline(agreement: Agreement): { label: string; ts: bigint } | null {
  switch (agreement.phase) {
    case Phase.Active:
      return { label: "Claim submission deadline (tenant can withdraw in full after)", ts: agreement.claimSubmissionDeadline };
    case Phase.ClaimOpen:
      return {
        label:
          agreement.arbiter === ZERO_ADDRESS
            ? "Tenant response deadline (no response is recorded after)"
            : "Tenant response deadline (unanswered amount moves to dispute after)",
        ts: agreement.responseDeadline,
      };
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
  const isYieldToken = agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const tenantShare = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantShareBps",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address },
  });
  const tenantCredit = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantWithdrawableByAddress",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const tenantContribution = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const yieldSettlement = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "yieldSettled",
    args: [id],
    query: { enabled: isYieldToken, refetchInterval: 5000 },
  });
  const settledValue = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "settledValue",
    args: [id],
    query: { enabled: isYieldToken, refetchInterval: 5000 },
  });
  const payoutToken = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "payoutToken",
    args: [id],
    query: { refetchInterval: 5000 },
  });
  const isYieldSettled = isYieldToken && yieldSettlement.data === true;
  const payoutTokenAddress =
    (payoutToken.data as `0x${string}` | undefined) ||
    (isYieldSettled ? USDC_ADDRESS : agreement.token);
  const walletBalance = useReadContract({
    address: payoutTokenAddress,
    abi: TestAaveUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const isTenant =
    (typeof tenantShare.data === "bigint" && tenantShare.data > 0n) ||
    (typeof tenantShare.data === "number" && tenantShare.data > 0);
  const actualRole =
    normalized === agreement.landlord.toLowerCase()
      ? "landlord"
      : isTenant
        ? "tenant"
        : normalized === agreement.arbiter.toLowerCase()
          ? "arbiter"
          : null;
  const availableToYou =
    isTenant
      ? typeof tenantCredit.data === "bigint"
        ? tenantCredit.data
        : 0n
      : normalized === agreement.landlord.toLowerCase()
        ? agreement.landlordWithdrawable
        : 0n;
  const participantDepositBalance = participantDepositTokenBalance({
    agreement,
    role: actualRole,
    tenantContribution:
      typeof tenantContribution.data === "bigint" ? tenantContribution.data : 0n,
    tenantCredit: typeof tenantCredit.data === "bigint" ? tenantCredit.data : 0n,
  });
  const jurisdiction =
    participantRecord && isJurisdictionCode(participantRecord.terms.jurisdiction)
      ? participantRecord.terms.jurisdiction
      : GENERIC_TEST_POLICY.jurisdiction;
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
  const reservePayment = useReadContract({
    address: OPERATIONS_RESERVE_ADDRESS,
    abi: OperationsReserveABI,
    functionName: "paid",
    args: [OPEN_ESCROW_ADDRESS, id, address || agreement.tenant],
    query: {
      enabled: reserveRequired,
      refetchInterval: 5000,
    },
  });
  const currentValue = useReadContract({
    address: agreement.token,
    abi: TestAaveUSDCABI,
    functionName: "previewAssetsSince",
    args: [agreement.depositAmount, agreement.fundedAt],
    query: {
      enabled:
        agreement.depositAmount > 0n &&
        isYieldToken && !isYieldSettled,
      refetchInterval: 5000,
    },
  });
  const walletModeledValue = useReadContract({
    address: agreement.token,
    abi: TestAaveUSDCABI,
    functionName: "previewAssetsSince",
    args: [
      typeof walletBalance.data === "bigint" ? walletBalance.data : 0n,
      agreement.fundedAt,
    ],
    query: {
      enabled:
        typeof walletBalance.data === "bigint" &&
        agreement.fundedAt > 0n &&
        isYieldToken && !isYieldSettled,
      refetchInterval: 5000,
    },
  });
  const participantDepositModeledValue = useReadContract({
    address: agreement.token,
    abi: TestAaveUSDCABI,
    functionName: "previewAssetsSince",
    args: [participantDepositBalance, agreement.fundedAt],
    query: {
      enabled:
        participantDepositBalance > 0n &&
        agreement.fundedAt > 0n &&
        isYieldToken && !isYieldSettled,
      refetchInterval: 5000,
    },
  });
  const depositAsset = getDepositAssetForTerms(
    participantRecord?.terms || { tokenChoice: isYieldToken ? "yield" : "plain" },
  );
  const tokenLabel = depositAsset?.testnetSymbol || (isYieldToken ? "taUSDC" : "testUSDC");
  const amountUnit = agreementAmountUnit(agreement.token, YIELD_USDC_ADDRESS);
  const payoutUnit = payoutAmountUnit({
    tokenAddress: agreement.token,
    yieldTokenAddress: YIELD_USDC_ADDRESS,
    yieldSettled: isYieldSettled,
  });
  const claimUnit = claimAmountUnit(agreement.token, YIELD_USDC_ADDRESS);
  const payoutTokenLabel = isYieldSettled ? "testUSDC" : tokenLabel;
  const testValue = isYieldSettled
    ? ((settledValue.data as bigint | undefined) ?? agreement.depositAmount)
    : ((currentValue.data as bigint | undefined) ?? agreement.depositAmount);
  const accounting = calculateDepositAccounting({
    originalPrincipal: agreement.depositAmount,
    currentRedeemableValue: testValue,
    feesAndSlippage: 0n,
    finalDistributed: agreement.withdrawn,
  });
  const walletTokens =
    typeof walletBalance.data === "bigint" ? walletBalance.data : 0n;
  const walletTestUsd = isYieldToken && !isYieldSettled
    ? ((walletModeledValue.data as bigint | undefined) ?? walletTokens)
    : walletTokens;
  const participantDepositTestUsd = isYieldToken && !isYieldSettled
    ? ((participantDepositModeledValue.data as bigint | undefined) ??
      participantDepositBalance)
    : participantDepositBalance;

  return (
    <div className="dashboard">
      <div className="agreement-heading">
        <div>
          <span className="eyebrow">
            {agreementReference(id)} · onchain ID {id.toString()}
          </span>
          <h2>Security deposit</h2>
        </div>
        <span className={`phase-badge phase-${agreement.phase}`}>{phaseLabel[agreement.phase]}</span>
      </div>
      {address && actualRole && (
        <section className="participant-balance-summary" aria-label="Your balances">
          <div className="participant-balance-tile">
            <span>In your wallet</span>
            <strong>${formatUSDC(walletTestUsd)} <small>test USD</small></strong>
            <small>{formatUSDC(walletTokens)} {payoutTokenLabel}</small>
          </div>
          <div className="participant-balance-tile">
            <span>{actualRole === "tenant" ? "Your balance in this deposit" : "Remaining in this funded deposit"}</span>
            <strong>${formatUSDC(participantDepositTestUsd)} <small>test USD</small></strong>
            <small>{formatUSDC(participantDepositBalance)} {payoutTokenLabel}</small>
          </div>
          {isYieldToken && (
            <p>
              Test-USD values use this agreement&apos;s bounded demo-yield clock. Tokens and test
              dollars have no real monetary value.
            </p>
          )}
        </section>
      )}
      <div className="amount-grid">
        <div className="amount-tile">
          <span>Original principal</span>
          <strong>
            {agreement.depositAmount > 0n
              ? `${formatUSDC(accounting.originalPrincipal)} ${isYieldToken ? "testUSDC value" : tokenLabel}`
              : `${formatUSDC(agreement.agreedAmount)} ${tokenLabel} proposed`}
          </strong>
        </div>
        <div className="amount-tile">
          <span>
            {isYieldToken
              ? isYieldSettled
                ? "Settled deposit value"
                : "Current modeled value"
              : "Current deposit value"}
          </span>
          <strong>
            {agreement.depositAmount > 0n
              ? `${formatUSDC(accounting.currentRedeemableValue)} ${
                  isYieldToken
                    ? isYieldSettled
                      ? "testUSDC"
                      : "testUSDC (modeled)"
                    : tokenLabel
                }`
              : "Not funded"}
          </strong>
        </div>
        <div className="amount-tile">
          <span>Accrued yield</span>
          <strong>
            {isYieldToken && agreement.depositAmount > 0n
              ? `+${formatUSDC(accounting.accruedYield)} testUSDC`
              : "Not selected"}
          </strong>
        </div>
      </div>
      <div className="amount-grid secondary">
        <div className="amount-tile">
          <span>Fees &amp; slippage</span>
          <strong>{formatUSDC(accounting.feesAndSlippage)} · not modeled in testnet</strong>
        </div>
        <div className="amount-tile">
          <span>Final distributed</span>
          <strong>
            {accounting.finalDistributed > 0n
              ? `${formatUSDC(accounting.finalDistributed)} ${payoutUnit}`
              : "Not distributed yet"}
          </strong>
        </div>
        <div className="amount-tile">
          <span>{isYieldToken ? "Settlement asset" : "Deposit asset"}</span>
          <strong>{isYieldToken ? (isYieldSettled ? "testUSDC (settled)" : "testUSDC (modeled)") : tokenLabel}</strong>
        </div>
      </div>
      {isYieldToken && (
        <p className="yield-disclaimer">
          Demonstration-only Aave-style path: value grows from the agreement funding time at 1%
          per hour and stops at 5%. At settlement, fixed taUSDC shares are redeemed into valueless
          testUSDC so the landlord receives no more than the documented principal deduction and all
          simulated yield stays with the tenants. There is no real aUSDC, USDC, APY, or yield.
        </p>
      )}
      <div className="amount-grid secondary">
        <div className="amount-tile">
          <span>Custody status</span>
          <strong>{agreement.depositAmount > 0n ? "Deposit confirmed onchain" : "Awaiting deposit"}</strong>
        </div>
        <div className="amount-tile">
          <span>Available to you</span>
          <strong>{formatUSDC(availableToYou)} {payoutUnit}</strong>
        </div>
        <div className="amount-tile">
          <span>Still unresolved</span>
          <strong>{formatUSDC(agreement.locked)} {amountUnit}</strong>
        </div>
      </div>
      {reserveRequired && (
        <div className="dashboard-row">
          <span className="label">Network &amp; storage reserve</span>
          <strong>
            {reservePayment.data === true
              ? `$5 ${tokenLabel} reserve paid separately`
              : `$5 ${tokenLabel} reserve due before funding`}
          </strong>
        </div>
      )}
      <div className="dashboard-row">
        <span className="label">Your role for this agreement</span>
        <strong>{actualRole ? roleLabel[actualRole] : "Not a party with this wallet"}</strong>
      </div>
      {inviteRole && actualRole && inviteRole !== actualRole && (
        <p className="tx-error role-mismatch" role="alert">
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
        name={
          participantRecord?.tenants.find((tenant) => tenant.isFundingTenant)?.name ||
          participantRecord?.tenantName
        }
        email={
          participantRecord?.tenants.find((tenant) => tenant.isFundingTenant)?.email ||
          participantRecord?.tenantEmail
        }
        address={agreement.tenant}
        suffix={
          participantRecord?.tenants.find((tenant) => tenant.isFundingTenant)
            ? ` (${(
                participantRecord.tenants.find((tenant) => tenant.isFundingTenant)!
                  .depositShareBps / 100
              )
                .toFixed(2)
                .replace(/\.?0+$/, "")}% share)`
            : ""
        }
      />
      {participantRecord?.tenants
        .filter((tenant) => !tenant.isFundingTenant)
        .map((tenant) => (
          <PartyIdentity
            key={tenant.id}
            label="Tenant"
            name={tenant.name}
            email={tenant.email}
            address={tenant.wallet}
            fallback="Approval wallet not recorded"
            suffix={` (${(tenant.depositShareBps / 100)
              .toFixed(2)
              .replace(/\.?0+$/, "")}% share)`}
          />
        ))}
      {(agreement.arbiter !== ZERO_ADDRESS || participantRecord?.arbiterEmail) && (
        <PartyIdentity
          label="Arbiter"
          name={participantRecord?.arbiterName}
          email={participantRecord?.arbiterEmail}
          address={agreement.arbiter === ZERO_ADDRESS ? null : agreement.arbiter}
          fallback="Arbiter wallet not recorded"
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
      )}
      {participantRecord?.terms.propertyAddress && (
        <div className="dashboard-row">
          <span className="label">Rental property</span>
          <span>{participantRecord.terms.propertyAddress}</span>
        </div>
      )}
      <div className="dashboard-row">
        <span className="label">Jurisdiction policy</span>
        <span>
          {jurisdictionLabel(jurisdiction)}{" "}
          <small className="offchain-label">
            {jurisdiction === GENERIC_TEST_POLICY.jurisdiction
              ? "test profile"
              : "address-applied rules"}
          </small>
        </span>
      </div>
      {agreement.claimedAmount > 0n && (
        <div className="dashboard-row">
          <span className="label">Claimed amount</span>
          <span>{formatUSDC(agreement.claimedAmount)} {claimUnit}</span>
        </div>
      )}
      {agreement.claimWindowStart > 0n && (
        <div className="dashboard-row">
          <span className="label">Expected tenant vacates / claim window opens</span>
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
          <span>{formatUSDC(agreement.tenantWithdrawable)} {payoutTokenLabel}</span>
        </div>
        <div className="dashboard-row">
          <span className="label">Landlord withdrawable</span>
          <span>{formatUSDC(agreement.landlordWithdrawable)} {payoutTokenLabel}</span>
        </div>
        <div className="dashboard-row">
          <span className="label">Already withdrawn</span>
          <span>{formatUSDC(agreement.withdrawn)} {payoutTokenLabel}</span>
        </div>
      </details>
    </div>
  );
}
