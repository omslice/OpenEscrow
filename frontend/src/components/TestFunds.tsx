import { useSendTransaction } from "@privy-io/react-auth";
import { useState } from "react";
import { encodeFunctionData } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ACCOUNT_AUTH_ENABLED } from "../lib/accountConfig";
import { MockUSDCABI, USDC_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import { TxButton } from "./TxButton";

const TEST_FUNDS = 1_000_000_000n;

function TestFundsBalance({
  action,
}: {
  action: (refetch: () => Promise<unknown>) => React.ReactNode;
}) {
  const { address } = useAccount();
  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: MockUSDCABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  if (!address) return null;

  return (
    <section className="test-funds">
      <div>
        <span className="eyebrow">Demo balance</span>
        <strong>{formatUSDC((balance.data as bigint | undefined) ?? 0n)} test USDC</strong>
        <small>Demo tokens only. They have no monetary value.</small>
      </div>
      {action(() => balance.refetch())}
    </section>
  );
}

function SponsoredTestFunds() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<"idle" | "submitting" | "confirming" | "success">("idle");
  const [claimError, setClaimError] = useState<string | null>(null);

  return (
    <TestFundsBalance
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
                    to: USDC_ADDRESS,
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
                : "Get 1,000 test USDC — gas covered"}
          </button>
          {status === "success" && <p className="tx-success">Test funds received.</p>}
          {claimError && <p className="tx-error">{claimError}</p>}
        </div>
      )}
    />
  );
}

function StandardTestFunds() {
  const { address } = useAccount();

  return (
    <TestFundsBalance
      action={(refetch) => (
        <TxButton
          address={USDC_ADDRESS}
          abi={MockUSDCABI}
          functionName="mint"
          args={[address, TEST_FUNDS]}
          label="Get 1,000 test USDC"
          className="btn btn-ghost"
          onSuccess={() => void refetch()}
        />
      )}
    />
  );
}

export function TestFunds() {
  return ACCOUNT_AUTH_ENABLED ? <SponsoredTestFunds /> : <StandardTestFunds />;
}
