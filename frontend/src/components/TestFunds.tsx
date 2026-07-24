import { useAccount, useReadContract } from "wagmi";
import { MockUSDCABI, USDC_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import { TxButton } from "./TxButton";

const TEST_FUNDS = 1_000_000_000n;

export function TestFunds() {
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
      </div>
      <TxButton
        address={USDC_ADDRESS}
        abi={MockUSDCABI}
        functionName="mint"
        args={[address, TEST_FUNDS]}
        label="Get 1,000 test USDC"
        className="btn btn-ghost"
        onSuccess={() => void balance.refetch()}
      />
    </section>
  );
}
