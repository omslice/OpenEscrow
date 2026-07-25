import { useSendTransaction } from "@privy-io/react-auth";
import { useState } from "react";
import { encodeFunctionData, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { MockUSDCABI, USDC_ADDRESS, YIELD_USDC_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import { TxButton } from "./TxButton";

const TEST_FUNDS = 1_000_000_000n;

function TestFundsBalance({
  action,
  tokenAddress,
  label,
  yieldBearing,
}: {
  action: (refetch: () => Promise<unknown>) => React.ReactNode;
  tokenAddress: Address;
  label: string;
  yieldBearing: boolean;
}) {
  const { address } = useAccount();
  const balance = useReadContract({
    address: tokenAddress,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const currentValue = useReadContract({
    address: tokenAddress,
    abi: MockUSDCABI,
    functionName: "convertToAssets",
    args: [((balance.data as bigint | undefined) ?? 0n)],
    query: { enabled: !!address && yieldBearing, refetchInterval: 5000 },
  });

  if (!address) return null;

  return (
    <section className="test-funds">
      <div>
        <span className="eyebrow">Demo balance</span>
        <strong>{formatUSDC((balance.data as bigint | undefined) ?? 0n)} {label}</strong>
        {yieldBearing ? (
          <small title="The token holds fixed shares. Only its displayed testUSDC index grows; there is no real asset or redemption.">
            Current demo value: {formatUSDC((currentValue.data as bigint | undefined) ?? 0n)} testUSDC
            · 20%/day test index ⓘ
          </small>
        ) : (
          <small title="A freely mintable, fixed-value test token with no monetary value.">
            Plain test token · fixed demo value ⓘ
          </small>
        )}
      </div>
      {action(() => balance.refetch())}
    </section>
  );
}

function SponsoredTestFunds({
  tokenAddress,
  label,
  yieldBearing,
}: {
  tokenAddress: Address;
  label: string;
  yieldBearing: boolean;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<"idle" | "submitting" | "confirming" | "success">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);

  return (
    <TestFundsBalance
      tokenAddress={tokenAddress}
      label={label}
      yieldBearing={yieldBearing}
      action={(refetch) => (
        <div className="tx-button">
          <button
            className="btn btn-ghost"
            disabled={!address || status === "submitting" || status === "confirming"}
            onClick={async () => {
              if (!address) return;
              setClaimError(null);
              setStatus("submitting");
              try {
                const data = encodeFunctionData({
                  abi: MockUSDCABI,
                  functionName: "mint",
                  args: [address, TEST_FUNDS],
                });
                const result = await sendTransaction(
                  {
                    to: tokenAddress,
                    data,
                    chainId: 84532,
                  },
                  {
                    address,
                    sponsor: true,
                  },
                );
                setStatus("confirming");
                await publicClient?.waitForTransactionReceipt({ hash: result.hash });
                await refetch();
                setStatus("success");
              } catch (caught) {
                setStatus("idle");
                setClaimError(
                  caught instanceof Error
                    ? caught.message.split("\n")[0]
                    : "The sponsored test-funds request failed.",
                );
              }
            }}
          >
            {status === "submitting"
              ? "Preparing sponsored claim..."
              : status === "confirming"
                ? "Confirming..."
                : `Get 1,000 ${label}—gas covered`}
          </button>
          {status === "success" && <p className="tx-success">{label} received.</p>}
          {claimError && <p className="tx-error">{claimError}</p>}
        </div>
      )}
    />
  );
}

function StandardTestFunds({
  tokenAddress,
  label,
  yieldBearing,
}: {
  tokenAddress: Address;
  label: string;
  yieldBearing: boolean;
}) {
  const { address } = useAccount();

  return (
    <TestFundsBalance
      tokenAddress={tokenAddress}
      label={label}
      yieldBearing={yieldBearing}
      action={(refetch) => (
        <TxButton
          address={tokenAddress}
          abi={MockUSDCABI}
          functionName="mint"
          args={[address, TEST_FUNDS]}
          label={`Get 1,000 ${label}`}
          className="btn btn-ghost"
          onSuccess={() => void refetch()}
        />
      )}
    />
  );
}

export function TestFunds() {
  const Faucet = ACCOUNT_AUTH_ENABLED ? SponsoredTestFunds : StandardTestFunds;
  return (
    <div className="test-funds-stack">
      <Faucet tokenAddress={USDC_ADDRESS} label="testUSDC" yieldBearing={false} />
      <Faucet tokenAddress={YIELD_USDC_ADDRESS} label="ytUSDC shares" yieldBearing />
    </div>
  );
}
