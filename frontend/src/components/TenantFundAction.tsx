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
  Phase,
  YIELD_USDC_ADDRESS,
  chain,
} from "../contracts/config";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import { TxButton } from "./TxButton";

type TenantFundActionProps = {
  id: bigint;
  agreement: Agreement;
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
  sponsored = false,
}: {
  agreement: Agreement;
  needed: bigint;
  tokenLabel: string;
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
      {sponsored && agreement.phase === Phase.ReadyToFund && (
        <p className="field-help">Network fees for the embedded test wallet are sponsored.</p>
      )}
    </>
  );
}

function StandardTenantFundAction({
  id,
  agreement,
  onRefetch,
}: TenantFundActionProps) {
  const { address } = useAccount();
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  const { needed, tokenLabel } = fundingDetails(agreement);
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
  const { writeContract: approve, data: approveHash, isPending: approving } =
    useWriteContract();
  const { isLoading: approveMining, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    if (approveConfirmed) void refetchAllowance();
  }, [approveConfirmed, refetchAllowance]);

  if (agreement.phase !== Phase.ReadyToFund || !isTenant) return null;
  const currentBalance = typeof balance === "bigint" ? balance : 0n;
  const hasBalance = currentBalance >= needed;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;

  return (
    <div className="action-section">
      <FundingIntroduction
        agreement={agreement}
        needed={needed}
        tokenLabel={tokenLabel}
      />
      {!hasBalance ? (
        <TxButton
          address={agreement.token}
          abi={MockUSDCABI}
          functionName="mint"
          args={[address, needed - currentBalance]}
          label={`Get required ${tokenLabel}`}
          className="btn btn-primary"
          onSuccess={() => void refetchBalance()}
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
  onRefetch,
}: TenantFundActionProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [step, setStep] = useState<"idle" | "minting" | "approving" | "funding">("idle");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const isTenant = address?.toLowerCase() === agreement.tenant.toLowerCase();
  const { needed, tokenLabel } = fundingDetails(agreement);
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

  if (agreement.phase !== Phase.ReadyToFund || !isTenant || !address) return null;
  const currentBalance = typeof balance === "bigint" ? balance : 0n;
  const hasBalance = currentBalance >= needed;
  const hasAllowance = typeof allowance === "bigint" && allowance >= needed;

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
      const missing = needed > latestBalance ? needed - latestBalance : 0n;
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
