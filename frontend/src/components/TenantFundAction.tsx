import { useEffect, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  MockUSDCABI,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  OPERATIONS_RESERVE_ADDRESS,
  OPERATIONS_RESERVE_AMOUNT,
  OperationsReserveABI,
  Phase,
  USDC_ADDRESS,
  YIELD_USDC_ADDRESS,
  chain,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { formatUSDC } from "../lib/format";
import {
  negotiationAction,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

type TenantFundActionProps = {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  onRefetch?: () => void;
};

function useTenantReceiptRecovery(
  negotiationAccess: NegotiationAccess | null | undefined,
  kind: "reserve" | "funding",
) {
  const { address } = useAccount();
  const access =
    negotiationAccess?.role === "tenant" ? negotiationAccess : null;
  const storageKey = access && address
    ? `openescrow:pending-${kind}-receipt:${access.proposalId}:${address.toLowerCase()}`
    : null;
  const label = kind === "reserve" ? "reserve payment" : "deposit funding";
  const [pendingTransaction, setPendingTransaction] = useState<`0x${string}` | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setPendingTransaction(null);
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    setPendingTransaction(
      stored && /^0x[a-fA-F0-9]{64}$/.test(stored) ? (stored as `0x${string}`) : null,
    );
  }, [storageKey]);

  async function record(transactionHash: `0x${string}`, amount?: bigint) {
    if (!access) return;
    setPendingTransaction(transactionHash);
    setRecordError(null);
    if (storageKey) window.localStorage.setItem(storageKey, transactionHash);
    try {
      await negotiationAction(
        access,
        kind === "reserve"
          ? {
              type: "operations_reserve_paid",
              ...(amount === undefined ? {} : { amount: microsToDecimal(amount) }),
              transactionHash,
            }
          : {
              type: "tenant_share_funded",
              ...(amount === undefined ? {} : { amount: microsToDecimal(amount) }),
              transactionHash,
            },
      );
      setPendingTransaction(null);
      if (storageKey) window.localStorage.removeItem(storageKey);
    } catch (cause) {
      setRecordError(
        cause instanceof Error
          ? `The ${label} succeeded, but its activity record still needs to be saved: ${cause.message}`
          : `The ${label} succeeded, but its activity record still needs to be saved.`,
      );
    }
  }

  const recovery = pendingTransaction && (
    <div className="receipt-recovery">
      {recordError && <p className="tx-error">{recordError}</p>}
      <button
        className="btn btn-ghost small"
        type="button"
        onClick={() => void record(pendingTransaction)}
      >
        Retry saving {kind === "reserve" ? "reserve" : "funding"} receipt
      </button>
    </div>
  );

  return { record, recovery };
}

function microsToDecimal(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function reserveShareFor(
  participantRecord: NegotiationRecord | null | undefined,
  address: string | undefined,
) {
  const tenants = participantRecord?.tenants ?? [];
  if (!tenants.length || !address) return OPERATIONS_RESERVE_AMOUNT;
  const index = tenants.findIndex(
    (tenant) => tenant.wallet?.toLowerCase() === address.toLowerCase(),
  );
  if (index < 0) return OPERATIONS_RESERVE_AMOUNT;
  const base = OPERATIONS_RESERVE_AMOUNT / BigInt(tenants.length);
  return index === tenants.length - 1
    ? OPERATIONS_RESERVE_AMOUNT - base * BigInt(tenants.length - 1)
    : base;
}

function fundingDetails(agreement: Agreement, needed: bigint) {
  const tokenLabel =
    agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase()
      ? "ytUSDC"
      : "testUSDC";
  return { needed, tokenLabel };
}

function FundingIntroduction({
  agreement,
  needed,
  tokenLabel,
  reserveRequired,
  reserveAmount,
  reservePaid,
  shareFunded,
  sponsored = false,
}: {
  agreement: Agreement;
  needed: bigint;
  tokenLabel: string;
  reserveRequired: boolean;
  reserveAmount: bigint;
  reservePaid: boolean;
  shareFunded: boolean;
  sponsored?: boolean;
}) {
  return (
    <>
      <h3>Fund this agreement</h3>
      <p className="hint">
        Depositing {formatUSDC(needed)} {tokenLabel}
        {tokenLabel === "ytUSDC"
          ? " shares. The dashboard will show their growing testUSDC value"
          : ""}
        . Approve the token spend, then submit this tenant's share.
      </p>
      <div className="funding-reserve-summary">
        <span>Agreement funding progress</span>
        <strong>
          {formatUSDC(agreement.depositAmount)} / {formatUSDC(agreement.agreedAmount)} {tokenLabel}
        </strong>
      </div>
      {reserveRequired && (
        <div className="funding-reserve-summary">
          <span>Refundable deposit</span>
          <strong>{formatUSDC(needed)} {tokenLabel}</strong>
          <span>Network &amp; storage reserve</span>
           <strong>{formatUSDC(reserveAmount)} testUSDC</strong>
          <small>
            {reservePaid
              ? "Reserve payment confirmed onchain. It is separate from the deposit."
              : "Pay this separate, non-refundable pilot charge before funding the deposit."}
          </small>
        </div>
      )}
      {shareFunded && (
        <p className="success">
          Your deposit share is confirmed onchain. The agreement will activate after every
          tenant's approved share is funded.
        </p>
      )}
      {sponsored && agreement.phase === Phase.ReadyToFund && (
        <p className="field-help">Network fees for the embedded test wallet are sponsored.</p>
      )}
    </>
  );
}

function StandardTenantFundAction({
  id,
  agreement,
  negotiationAccess,
  participantRecord,
  onRefetch,
}: TenantFundActionProps) {
  const { address } = useAccount();
  const reserveRecord = useTenantReceiptRecovery(negotiationAccess, "reserve");
  const fundingRecord = useTenantReceiptRecovery(negotiationAccess, "funding");
  const { data: requiredContribution } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "requiredTenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund },
  });
  const { data: existingContribution } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund },
  });
  const needed = typeof requiredContribution === "bigint" ? requiredContribution : 0n;
  const shareFunded = typeof existingContribution === "bigint" && existingContribution > 0n;
  const isTenant = needed > 0n;
  const { tokenLabel } = fundingDetails(agreement, needed);
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
  const reserveAmount = reserveShareFor(participantRecord, address);
  const reserveUsesDepositToken =
    agreement.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPEN_ESCROW_ADDRESS] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reserveBalance, refetch: refetchReserveBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled:
        !!address &&
        reserveRequired &&
        !reserveUsesDepositToken &&
        agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reserveAllowance, refetch: refetchReserveAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPERATIONS_RESERVE_ADDRESS] : undefined,
    query: {
      enabled: !!address && reserveRequired && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reservePaid, refetch: refetchReservePaid } = useReadContract({
    address: OPERATIONS_RESERVE_ADDRESS,
    abi: OperationsReserveABI,
    functionName: "paid",
    args: address ? [OPEN_ESCROW_ADDRESS, id, address] : undefined,
    query: {
      enabled: !!address && reserveRequired && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { writeContract: approve, data: approveHash, isPending: approving } =
    useWriteContract();
  const { isLoading: approveMining, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    if (approveConfirmed) void refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);

  if (agreement.phase !== Phase.ReadyToFund || !isTenant) return null;
  const currentBalance = typeof balance === "bigint" ? balance : 0n;
  const depositBalanceNeeded =
    reserveRequired && reserveUsesDepositToken ? needed + reserveAmount : needed;
  const hasBalance = currentBalance >= depositBalanceNeeded;
  const currentReserveBalance =
    reserveUsesDepositToken
      ? currentBalance
      : typeof reserveBalance === "bigint"
        ? reserveBalance
        : 0n;
  const hasReserveBalance =
    !reserveRequired || currentReserveBalance >= reserveAmount;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;
  const hasReserveAllowance =
    !reserveRequired ||
    (typeof reserveAllowance === "bigint" &&
      reserveAllowance >= reserveAmount);
  const reserveIsPaid = !reserveRequired || reservePaid === true;

  return (
    <div className="action-section">
      <FundingIntroduction
        agreement={agreement}
        needed={needed}
        tokenLabel={tokenLabel}
        reserveRequired={reserveRequired}
        reserveAmount={reserveAmount}
        reservePaid={reserveIsPaid}
        shareFunded={shareFunded}
      />
      {shareFunded ? null : !hasBalance ? (
        <TxButton
          address={agreement.token}
          abi={MockUSDCABI}
          functionName="mint"
          args={[address, depositBalanceNeeded - currentBalance]}
          label={`Get required ${tokenLabel}`}
          className="btn btn-primary"
          onSuccess={() => void refetchBalance()}
        />
      ) : !hasReserveBalance ? (
        <TxButton
          address={USDC_ADDRESS}
          abi={MockUSDCABI}
          functionName="mint"
          args={[address, reserveAmount - currentReserveBalance]}
          label="Get reserve testUSDC"
          className="btn btn-primary"
          onSuccess={() => void refetchReserveBalance()}
        />
      ) : !hasAllowance ? (
        <button
          className="btn btn-primary"
          disabled={approving || approveMining}
          onClick={() =>
            approve({
              address: agreement.token,
              abi: MockUSDCABI,
              functionName: "approve",
              account: address,
              chain,
              args: [OPEN_ESCROW_ADDRESS, needed],
            })
          }
        >
          {approving
            ? "Confirm in wallet..."
            : approveMining
              ? "Mining..."
              : `Approve ${formatUSDC(needed)} ${tokenLabel}`}
        </button>
      ) : !hasReserveAllowance ? (
        <TxButton
          address={USDC_ADDRESS}
          abi={MockUSDCABI}
          functionName="approve"
          args={[OPERATIONS_RESERVE_ADDRESS, reserveAmount]}
          label={`Approve ${formatUSDC(reserveAmount)} reserve share`}
          className="btn btn-primary"
          onSuccess={() => void refetchReserveAllowance()}
        />
      ) : !reserveIsPaid ? (
        <TxButton
          address={OPERATIONS_RESERVE_ADDRESS}
          abi={OperationsReserveABI}
          functionName="payReserveShare"
          args={[OPEN_ESCROW_ADDRESS, id, reserveAmount]}
          label={`Pay ${formatUSDC(reserveAmount)} reserve share`}
          className="btn btn-primary"
          onSuccess={(transactionHash) => {
            void refetchReservePaid();
            void reserveRecord.record(transactionHash, reserveAmount);
          }}
        />
      ) : (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="fundTenantShare"
          args={[id]}
          label={`Fund my ${formatUSDC(needed)} share`}
          onSuccess={(transactionHash) => {
            void fundingRecord.record(transactionHash, needed);
            onRefetch?.();
          }}
        />
      )}
      {reserveRecord.recovery}
      {fundingRecord.recovery}
    </div>
  );
}

function sponsoredErrorMessage(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  if (/0xe450d38c|insufficient balance/i.test(message)) {
    return "This wallet does not have enough of the agreement's selected test token. Claim the required balance, then try again.";
  }
  if (
    /intrinsic gas too low/i.test(message) ||
    /JSON is not a valid request object/i.test(message)
  ) {
    return "The sponsored wallet could not prepare the transaction. Refresh the agreement and try again.";
  }
  return message.split("\n")[0] || "The sponsored transaction did not complete.";
}

function SponsoredTenantFundAction({
  id,
  agreement,
  negotiationAccess,
  participantRecord,
  onRefetch,
}: TenantFundActionProps) {
  const { address } = useAccount();
  const reserveRecord = useTenantReceiptRecovery(negotiationAccess, "reserve");
  const fundingRecord = useTenantReceiptRecovery(negotiationAccess, "funding");
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [step, setStep] = useState<
    | "idle"
    | "minting"
    | "reserveMinting"
    | "approving"
    | "reserveApproving"
    | "reservePaying"
    | "funding"
  >("idle");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const { data: requiredContribution } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "requiredTenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund },
  });
  const { data: existingContribution } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund },
  });
  const needed = typeof requiredContribution === "bigint" ? requiredContribution : 0n;
  const shareFunded = typeof existingContribution === "bigint" && existingContribution > 0n;
  const isTenant = needed > 0n;
  const { tokenLabel } = fundingDetails(agreement, needed);
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
  const reserveAmount = reserveShareFor(participantRecord, address);
  const reserveUsesDepositToken =
    agreement.token.toLowerCase() === USDC_ADDRESS.toLowerCase();
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPEN_ESCROW_ADDRESS] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: agreement.token,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reserveBalance, refetch: refetchReserveBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled:
        !!address &&
        reserveRequired &&
        !reserveUsesDepositToken &&
        agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reserveAllowance, refetch: refetchReserveAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "allowance",
    args: address ? [address, OPERATIONS_RESERVE_ADDRESS] : undefined,
    query: {
      enabled: !!address && reserveRequired && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });
  const { data: reservePaid, refetch: refetchReservePaid } = useReadContract({
    address: OPERATIONS_RESERVE_ADDRESS,
    abi: OperationsReserveABI,
    functionName: "paid",
    args: address ? [OPEN_ESCROW_ADDRESS, id, address] : undefined,
    query: {
      enabled: !!address && reserveRequired && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4000,
    },
  });

  if (agreement.phase !== Phase.ReadyToFund || !isTenant || !address) return null;
  const currentBalance = typeof balance === "bigint" ? balance : 0n;
  const depositBalanceNeeded =
    reserveRequired && reserveUsesDepositToken ? needed + reserveAmount : needed;
  const hasBalance = currentBalance >= depositBalanceNeeded;
  const currentReserveBalance =
    reserveUsesDepositToken
      ? currentBalance
      : typeof reserveBalance === "bigint"
        ? reserveBalance
        : 0n;
  const hasReserveBalance =
    !reserveRequired || currentReserveBalance >= reserveAmount;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;
  const hasReserveAllowance =
    !reserveRequired ||
    (typeof reserveAllowance === "bigint" &&
      reserveAllowance >= reserveAmount);
  const reserveIsPaid = !reserveRequired || reservePaid === true;

  async function sendSponsored(
    to: `0x${string}`,
    data: `0x${string}`,
    gasLimit: bigint,
  ) {
    const result = await sendTransaction(
      { to, data, chainId: chain.id, gasLimit },
      { address, sponsor: true },
    );
    if (!publicClient) throw new Error("The network connection is not ready.");
    await publicClient.waitForTransactionReceipt({ hash: result.hash });
    return result.hash;
  }

  async function approveDeposit() {
    setTransactionError(null);
    setStep("approving");
    try {
      await sendSponsored(
        agreement.token,
        encodeFunctionData({
          abi: MockUSDCABI,
          functionName: "approve",
          args: [OPEN_ESCROW_ADDRESS, needed],
        }),
        150_000n,
      );
      await refetchAllowance();
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  async function mintMissingDeposit() {
    setTransactionError(null);
    setStep("minting");
    try {
      const latest = await refetchBalance();
      const latestBalance = typeof latest.data === "bigint" ? latest.data : 0n;
      const missing =
        depositBalanceNeeded > latestBalance ? depositBalanceNeeded - latestBalance : 0n;
      if (missing === 0n) return;
      await sendSponsored(
        agreement.token,
        encodeFunctionData({
          abi: MockUSDCABI,
          functionName: "mint",
          args: [address, missing],
        }),
        150_000n,
      );
      await refetchBalance();
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  async function mintMissingReserve() {
    setTransactionError(null);
    setStep("reserveMinting");
    try {
      const latest = await refetchReserveBalance();
      const latestBalance = typeof latest.data === "bigint" ? latest.data : 0n;
      const missing =
        reserveAmount > latestBalance
          ? reserveAmount - latestBalance
          : 0n;
      if (missing === 0n) return;
      await sendSponsored(
        USDC_ADDRESS,
        encodeFunctionData({
          abi: MockUSDCABI,
          functionName: "mint",
          args: [address, missing],
        }),
        150_000n,
      );
      await refetchReserveBalance();
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  async function approveReserve() {
    setTransactionError(null);
    setStep("reserveApproving");
    try {
      await sendSponsored(
        USDC_ADDRESS,
        encodeFunctionData({
          abi: MockUSDCABI,
          functionName: "approve",
          args: [OPERATIONS_RESERVE_ADDRESS, reserveAmount],
        }),
        150_000n,
      );
      await refetchReserveAllowance();
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  async function payReserve() {
    setTransactionError(null);
    setStep("reservePaying");
    try {
      const transactionHash = await sendSponsored(
        OPERATIONS_RESERVE_ADDRESS,
        encodeFunctionData({
          abi: OperationsReserveABI,
          functionName: "payReserveShare",
          args: [OPEN_ESCROW_ADDRESS, id, reserveAmount],
        }),
        200_000n,
      );
      await refetchReservePaid();
      await reserveRecord.record(transactionHash, reserveAmount);
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  async function fundDeposit() {
    setTransactionError(null);
    setStep("funding");
    try {
      const [latestBalance, latestAllowance] = await Promise.all([
        refetchBalance(),
        refetchAllowance(),
      ]);
      if (typeof latestBalance.data !== "bigint" || latestBalance.data < needed) {
        throw new Error(
          `This wallet needs ${formatUSDC(needed)} ${tokenLabel} before it can fund the agreement.`,
        );
      }
      if (typeof latestAllowance.data !== "bigint" || latestAllowance.data < needed) {
        throw new Error(
          `Approve ${formatUSDC(needed)} ${tokenLabel} before funding the agreement.`,
        );
      }
      const transactionHash = await sendSponsored(
        OPEN_ESCROW_ADDRESS,
        encodeFunctionData({
          abi: OpenEscrowABI,
          functionName: "fundTenantShare",
          args: [id],
        }),
        750_000n,
      );
      await fundingRecord.record(transactionHash, needed);
      onRefetch?.();
    } catch (caught) {
      setTransactionError(sponsoredErrorMessage(caught));
    } finally {
      setStep("idle");
    }
  }

  return (
    <div className="action-section">
      <FundingIntroduction
        agreement={agreement}
        needed={needed}
        tokenLabel={tokenLabel}
        reserveRequired={reserveRequired}
        reserveAmount={reserveAmount}
        reservePaid={reserveIsPaid}
        shareFunded={shareFunded}
        sponsored
      />
      {shareFunded ? null : !hasBalance ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void mintMissingDeposit()}
        >
          {step === "minting"
            ? "Claiming required test tokens..."
            : `Get required ${tokenLabel}—gas covered`}
        </button>
      ) : !hasReserveBalance ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void mintMissingReserve()}
        >
          {step === "reserveMinting"
            ? "Claiming reserve testUSDC..."
            : "Get reserve testUSDC—gas covered"}
        </button>
      ) : !hasAllowance ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void approveDeposit()}
        >
          {step === "approving"
            ? "Approving with gas covered..."
            : `Approve ${formatUSDC(needed)} ${tokenLabel}`}
        </button>
      ) : !hasReserveAllowance ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void approveReserve()}
        >
          {step === "reserveApproving"
            ? "Approving reserve with gas covered..."
            : `Approve ${formatUSDC(reserveAmount)} reserve share`}
        </button>
      ) : !reserveIsPaid ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void payReserve()}
        >
          {step === "reservePaying"
            ? "Paying reserve with gas covered..."
            : `Pay ${formatUSDC(reserveAmount)} reserve share`}
        </button>
      ) : (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void fundDeposit()}
        >
          {step === "funding"
            ? "Funding with gas covered..."
            : `Fund my ${formatUSDC(needed)} share`}
        </button>
      )}
      {reserveRecord.recovery}
      {fundingRecord.recovery}
      {transactionError && <p className="tx-error">{transactionError}</p>}
    </div>
  );
}

function PrivyTenantFundAction(props: TenantFundActionProps) {
  const { address } = useAccount();
  const { ready, wallets } = useWallets();
  if (!ready) return null;
  const activeWallet = wallets.find(
    (wallet) => wallet.address.toLowerCase() === address?.toLowerCase(),
  );
  return activeWallet?.walletClientType === "privy" ? (
    <SponsoredTenantFundAction {...props} />
  ) : (
    <StandardTenantFundAction {...props} />
  );
}

export function TenantFundAction(props: TenantFundActionProps) {
  return ACCOUNT_AUTH_ENABLED ? (
    <PrivyTenantFundAction {...props} />
  ) : (
    <StandardTenantFundAction {...props} />
  );
}
