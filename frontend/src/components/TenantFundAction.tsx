import {
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
} from "wagmi";
import {
  MockUSDCABI,
  OpenEscrowABI,
  OPEN_ESCROW_ADDRESS,
  OPERATIONS_RESERVE_ADDRESS,
  OPERATIONS_RESERVE_AMOUNT,
  OperationsReserveABI,
  Phase,
  YIELD_USDC_ADDRESS,
  chain,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import {
  clearRecoveryValueIfMatches,
  readRecoveryTransaction,
  writeRecoveryValue,
} from "../lib/browserRecovery";
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import { formatUSDC } from "../lib/format";
import { waitForSuccessfulTransactionReceipt } from "../lib/successfulTransactionReceipt";
import {
  negotiationAction,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { getDepositAssetForTerms } from "../../shared/deposit-assets.js";
import { FiatFundingOption } from "./FiatFundingOption";
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
  const recordScopeKey = storageKey ?? `inactive:${kind}`;
  const recordScope = useMemo(
    () => createAsyncOperationScope(recordScopeKey),
    [recordScopeKey],
  );

  useLayoutEffect(() => {
    recordScope.open();
    setPendingTransaction(
      storageKey ? readRecoveryTransaction(storageKey) : null,
    );
    setRecordError(null);
    return () => recordScope.close();
  }, [recordScope, storageKey]);

  async function record(transactionHash: `0x${string}`, amount?: bigint) {
    if (!access) return;
    const operationId = recordScope.start();
    setPendingTransaction(transactionHash);
    setRecordError(null);
    if (storageKey) writeRecoveryValue(storageKey, transactionHash);
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
      if (storageKey) {
        clearRecoveryValueIfMatches(storageKey, transactionHash);
      }
      if (!recordScope.isCurrent(operationId)) return;
      setPendingTransaction((current) =>
        current === transactionHash ? null : current,
      );
    } catch (cause) {
      if (!recordScope.isCurrent(operationId)) return;
      setRecordError(
        cause instanceof Error
          ? `The ${label} succeeded, but its activity record still needs to be saved: ${cause.message}`
          : `The ${label} succeeded, but its activity record still needs to be saved.`,
      );
    }
  }

  const recovery = pendingTransaction && (
    <div className="receipt-recovery">
      {recordError && (
        <p className="tx-error" role="alert">
          {recordError}
        </p>
      )}
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

function fundingDetails(
  agreement: Agreement,
  needed: bigint,
  participantRecord?: NegotiationRecord | null,
) {
  const isYieldToken =
    agreement.token.toLowerCase() === YIELD_USDC_ADDRESS.toLowerCase();
  const depositAsset = getDepositAssetForTerms(
    participantRecord?.terms || { tokenChoice: isYieldToken ? "yield" : "plain" },
  );
  const tokenLabel =
    depositAsset?.testnetSymbol || (isYieldToken ? "ytUSDC" : "testUSDC");
  return { needed, tokenLabel, depositAsset };
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
        .{" "}
        {reserveRequired && !reservePaid
          ? "Approve your full assigned total once, then fund the deposit and reserve together in one atomic transaction."
          : "Approve the token spend, then submit this tenant's share."}
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
          <strong>{formatUSDC(reserveAmount)} {tokenLabel}</strong>
          <span>Total assigned to you</span>
          <strong>{formatUSDC(needed + reserveAmount)} {tokenLabel}</strong>
          <small>
            {reservePaid
              ? "Reserve payment confirmed onchain. It uses the agreement token and is separate from refundable principal."
              : "Your displayed total includes this evenly split, non-refundable pilot charge in the agreement token."}
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
  const [fundedLocally, setFundedLocally] = useState(false);
  const reserveRecord = useTenantReceiptRecovery(negotiationAccess, "reserve");
  const fundingRecord = useTenantReceiptRecovery(negotiationAccess, "funding");
  const { data: requiredContribution } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "requiredTenantContribution",
    args: address ? [id, address] : undefined,
    query: { enabled: !!address && agreement.phase === Phase.ReadyToFund },
  });
  const {
    data: existingContribution,
    refetch: refetchContribution,
  } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantContribution",
    args: address ? [id, address] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4_000,
    },
  });
  const needed = typeof requiredContribution === "bigint" ? requiredContribution : 0n;
  const shareFunded =
    fundedLocally ||
    (typeof existingContribution === "bigint" && existingContribution > 0n);
  const isTenant = needed > 0n;
  const { tokenLabel } = fundingDetails(agreement, needed, participantRecord);
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
  const reserveAmount = reserveShareFor(participantRecord, address);
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
  if (agreement.phase !== Phase.ReadyToFund || !isTenant) return null;
  const currentBalance = typeof balance === "bigint" ? balance : 0n;
  const reserveIsPaid = !reserveRequired || reservePaid === true;
  const tokenBalanceNeeded = needed + (reserveIsPaid ? 0n : reserveAmount);
  const hasBalance = currentBalance >= tokenBalanceNeeded;
  const hasAllowance =
    typeof allowance === "bigint" && allowance >= tokenBalanceNeeded;

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
          args={[address, tokenBalanceNeeded - currentBalance]}
          label={`Get required ${tokenLabel}`}
          className="btn btn-primary"
          onSuccess={() => void refetchBalance()}
        />
      ) : !hasAllowance ? (
        <TxButton
          address={agreement.token}
          abi={MockUSDCABI}
          functionName="approve"
          args={[OPEN_ESCROW_ADDRESS, tokenBalanceNeeded]}
          label={`Approve total ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel}`}
          onSuccess={() => void refetchAllowance()}
        />
      ) : !reserveIsPaid ? (
        <TxButton
          address={OPEN_ESCROW_ADDRESS}
          abi={OpenEscrowABI}
          functionName="fundTenantShareWithReserve"
          args={[id]}
          label={`Fund total ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel}`}
          className="btn btn-primary"
          onSuccess={(transactionHash) => {
            setFundedLocally(true);
            void refetchContribution();
            void refetchReservePaid();
            void reserveRecord.record(transactionHash, reserveAmount);
            void fundingRecord.record(transactionHash, needed);
            onRefetch?.();
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
            setFundedLocally(true);
            void refetchContribution();
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
  const [fundedLocally, setFundedLocally] = useState(false);
  const reserveRecord = useTenantReceiptRecovery(negotiationAccess, "reserve");
  const fundingRecord = useTenantReceiptRecovery(negotiationAccess, "funding");
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [step, setStep] = useState<
    | "idle"
    | "minting"
    | "approving"
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
  const {
    data: existingContribution,
    refetch: refetchContribution,
  } = useReadContract({
    address: OPEN_ESCROW_ADDRESS,
    abi: OpenEscrowABI,
    functionName: "tenantContribution",
    args: address ? [id, address] : undefined,
    query: {
      enabled: !!address && agreement.phase === Phase.ReadyToFund,
      refetchInterval: 4_000,
    },
  });
  const needed = typeof requiredContribution === "bigint" ? requiredContribution : 0n;
  const shareFunded =
    fundedLocally ||
    (typeof existingContribution === "bigint" && existingContribution > 0n);
  const isTenant = needed > 0n;
  const { tokenLabel, depositAsset } = fundingDetails(
    agreement,
    needed,
    participantRecord,
  );
  const reserveRequired = participantRecord?.terms.operationsReserve === "5";
  const reserveAmount = reserveShareFor(participantRecord, address);
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
  const reserveIsPaid = !reserveRequired || reservePaid === true;
  const tokenBalanceNeeded = needed + (reserveIsPaid ? 0n : reserveAmount);
  const hasBalance = currentBalance >= tokenBalanceNeeded;
  const hasAllowance =
    typeof allowance === "bigint" && allowance >= tokenBalanceNeeded;

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
    await waitForSuccessfulTransactionReceipt(
      () => publicClient.waitForTransactionReceipt({ hash: result.hash }),
      "The sponsored transaction reached the test network but did not complete. No approval, tokens, or deposit funding was recorded. Refresh the agreement and try again.",
    );
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
          args: [OPEN_ESCROW_ADDRESS, tokenBalanceNeeded],
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
        tokenBalanceNeeded > latestBalance ? tokenBalanceNeeded - latestBalance : 0n;
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

  async function fundDeposit() {
    setTransactionError(null);
    setStep("funding");
    try {
      const [latestBalance, latestAllowance, latestContribution] = await Promise.all([
        refetchBalance(),
        refetchAllowance(),
        refetchContribution(),
      ]);
      if (
        typeof latestContribution.data === "bigint" &&
        latestContribution.data > 0n
      ) {
        setFundedLocally(true);
        return;
      }
      if (typeof latestBalance.data !== "bigint" || latestBalance.data < tokenBalanceNeeded) {
        throw new Error(
          `This wallet needs ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel} before it can fund the agreement.`,
        );
      }
      if (typeof latestAllowance.data !== "bigint" || latestAllowance.data < tokenBalanceNeeded) {
        throw new Error(
          `Approve ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel} before funding the agreement.`,
        );
      }
      const transactionHash = await sendSponsored(
        OPEN_ESCROW_ADDRESS,
        encodeFunctionData({
          abi: OpenEscrowABI,
          functionName: reserveIsPaid
            ? "fundTenantShare"
            : "fundTenantShareWithReserve",
          args: [id],
        }),
        reserveIsPaid ? 750_000n : 900_000n,
      );
      setFundedLocally(true);
      await refetchContribution();
      if (!reserveIsPaid) {
        await refetchReservePaid();
        await reserveRecord.record(transactionHash, reserveAmount);
      }
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
        <div className="funding-methods">
          <FiatFundingOption
            walletAddress={address}
            amount={tokenBalanceNeeded}
            depositAsset={depositAsset}
            negotiationAccess={negotiationAccess}
            tenantId={participantRecord?.viewerTenantId}
            onComplete={() => void refetchBalance()}
          />
          <div className="testnet-funding-fallback">
            <span>Base Sepolia demo</span>
            <button
              className="btn btn-primary"
              disabled={step !== "idle"}
              onClick={() => void mintMissingDeposit()}
            >
              {step === "minting"
                ? "Claiming required test tokens..."
                : `Get required ${tokenLabel}—gas covered`}
            </button>
          </div>
        </div>
      ) : !hasAllowance ? (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void approveDeposit()}
        >
          {step === "approving"
            ? "Approving with gas covered..."
            : `Approve total ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel}`}
        </button>
      ) : (
        <button
          className="btn btn-primary"
          disabled={step !== "idle"}
          onClick={() => void fundDeposit()}
        >
          {step === "funding"
            ? "Funding with gas covered..."
            : reserveIsPaid
              ? `Fund my ${formatUSDC(needed)} share`
              : `Fund total ${formatUSDC(tokenBalanceNeeded)} ${tokenLabel}`}
        </button>
      )}
      {reserveRecord.recovery}
      {fundingRecord.recovery}
      {transactionError && (
        <p className="tx-error" role="alert">
          {transactionError}
        </p>
      )}
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
