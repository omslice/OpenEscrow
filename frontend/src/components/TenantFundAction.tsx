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

function fundingDetails(agreement: Agreement) {
  const needed = agreement.agreedAmount;
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
  reservePaid,
  sponsored = false,
}: {
  agreement: Agreement;
  needed: bigint;
  tokenLabel: string;
  reserveRequired: boolean;
  reservePaid: boolean;
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
        . Approve the token spend, then fund; acceptance and funding happen in the same
        transaction.
      </p>
      {reserveRequired && (
        <div className="funding-reserve-summary">
          <span>Refundable deposit</span>
          <strong>{formatUSDC(needed)} {tokenLabel}</strong>
          <span>Network &amp; storage reserve</span>
          <strong>{formatUSDC(OPERATIONS_RESERVE_AMOUNT)} testUSDC</strong>
          <small>
            {reservePaid
              ? "Reserve payment confirmed onchain. It is separate from the deposit."
              : "Pay this separate, non-refundable pilot charge before funding the deposit."}
          </small>
        </div>
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
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  const { needed, tokenLabel } = fundingDetails(agreement);
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
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
    reserveRequired && reserveUsesDepositToken ? needed + OPERATIONS_RESERVE_AMOUNT : needed;
  const hasBalance = currentBalance >= depositBalanceNeeded;
  const currentReserveBalance =
    reserveUsesDepositToken
      ? currentBalance
      : typeof reserveBalance === "bigint"
        ? reserveBalance
        : 0n;
  const hasReserveBalance =
    !reserveRequired || currentReserveBalance >= OPERATIONS_RESERVE_AMOUNT;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;
  const hasReserveAllowance =
    !reserveRequired ||
    (typeof reserveAllowance === "bigint" &&
      reserveAllowance >= OPERATIONS_RESERVE_AMOUNT);
  const reserveIsPaid = !reserveRequired || reservePaid === true;

  async function recordReservePayment(transactionHash: `0x${string}`) {
    if (negotiationAccess?.role !== "tenant") return;
    await negotiationAction(negotiationAccess, {
      type: "operations_reserve_paid",
      transactionHash,
    });
  }

  return (
    <div className="action-section">
      <FundingIntroduction
        agreement={agreement}
        needed={needed}
        tokenLabel={tokenLabel}
        reserveRequired={reserveRequired}
        reservePaid={reserveIsPaid}
      />
      {!hasBalance ? (
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
          args={[address, OPERATIONS_RESERVE_AMOUNT - currentReserveBalance]}
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
          args={[OPERATIONS_RESERVE_ADDRESS, OPERATIONS_RESERVE_AMOUNT]}
          label="Approve $5 operations reserve"
          className="btn btn-primary"
          onSuccess={() => void refetchReserveAllowance()}
        />
      ) : !reserveIsPaid ? (
        <TxButton
          address={OPERATIONS_RESERVE_ADDRESS}
          abi={OperationsReserveABI}
          functionName="payReserve"
          args={[OPEN_ESCROW_ADDRESS, id]}
          label="Pay $5 operations reserve"
          className="btn btn-primary"
          onSuccess={(transactionHash) => {
            void refetchReservePaid();
            void recordReservePayment(transactionHash);
          }}
        />
      ) : (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="tenantAcceptAndFund"
          args={[id]}
          label="Accept and fund"
          onSuccess={onRefetch}
        />
      )}
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
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  const { needed, tokenLabel } = fundingDetails(agreement);
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
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
    reserveRequired && reserveUsesDepositToken ? needed + OPERATIONS_RESERVE_AMOUNT : needed;
  const hasBalance = currentBalance >= depositBalanceNeeded;
  const currentReserveBalance =
    reserveUsesDepositToken
      ? currentBalance
      : typeof reserveBalance === "bigint"
        ? reserveBalance
        : 0n;
  const hasReserveBalance =
    !reserveRequired || currentReserveBalance >= OPERATIONS_RESERVE_AMOUNT;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;
  const hasReserveAllowance =
    !reserveRequired ||
    (typeof reserveAllowance === "bigint" &&
      reserveAllowance >= OPERATIONS_RESERVE_AMOUNT);
  const reserveIsPaid = !reserveRequired || reservePaid === true;

  async function recordReservePayment(transactionHash: `0x${string}`) {
    if (negotiationAccess?.role !== "tenant") return;
    await negotiationAction(negotiationAccess, {
      type: "operations_reserve_paid",
      transactionHash,
    });
  }

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
        OPERATIONS_RESERVE_AMOUNT > latestBalance
          ? OPERATIONS_RESERVE_AMOUNT - latestBalance
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
          args: [OPERATIONS_RESERVE_ADDRESS, OPERATIONS_RESERVE_AMOUNT],
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
          functionName: "payReserve",
          args: [OPEN_ESCROW_ADDRESS, id],
        }),
        200_000n,
      );
      await refetchReservePaid();
      await recordReservePayment(transactionHash);
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
      await sendSponsored(
        OPEN_ESCROW_ADDRESS,
        encodeFunctionData({
          abi: OpenEscrowABI,
          functionName: "tenantAcceptAndFund",
          args: [id],
        }),
        750_000n,
      );
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
        reservePaid={reserveIsPaid}
        sponsored
      />
      {!hasBalance ? (
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
            : "Approve $5 operations reserve"}
        </button>
      ) : !reserveIsPaid ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void payReserve()}
        >
          {step === "reservePaying"
            ? "Paying reserve with gas covered..."
            : "Pay $5 operations reserve"}
        </button>
      ) : (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void fundDeposit()}
        >
          {step === "funding" ? "Funding with gas covered..." : "Accept and fund"}
        </button>
      )}
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
