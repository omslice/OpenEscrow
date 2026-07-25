import { useEffect, useRef } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { chain } from "../contracts/config";

interface TxButtonProps {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  label: string;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
}

/** One button = one contract write, with pending/mining/error surfaced inline. */
export function TxButton({
  address,
  abi,
  functionName,
  args,
  label,
  disabled,
  className,
  onSuccess,
}: TxButtonProps) {
  const { address: account } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const notifiedHash = useRef<`0x${string}` | undefined>(undefined);

  useEffect(() => {
    if (isSuccess && hash && notifiedHash.current !== hash) {
      notifiedHash.current = hash;
      onSuccess?.();
    }
  }, [hash, isSuccess, onSuccess]);

  const busy = isPending || isMining;

  return (
    <div className="tx-button">
      <button
        className={className ?? "btn btn-primary"}
        disabled={disabled || busy || !account}
        onClick={() => {
          if (!account) return;
          notifiedHash.current = undefined;
          reset();
          writeContract({ address, abi, functionName, args, account, chain });
        }}
      >
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : label}
      </button>
      {error && <p className="tx-error">{error.message.split("\n")[0]}</p>}
      {isSuccess && <p className="tx-success">Confirmed.</p>}
    </div>
  );
}
