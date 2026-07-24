import { useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";

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
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [notified, setNotified] = useState(false);

  if (isSuccess && !notified) {
    setNotified(true);
    onSuccess?.();
  }

  const busy = isPending || isMining;

  return (
    <div className="tx-button">
      <button
        className={className ?? "btn btn-primary"}
        disabled={disabled || busy}
        onClick={() => {
          reset();
          setNotified(false);
          writeContract({ address, abi, functionName, args });
        }}
      >
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : label}
      </button>
      {error && <p className="tx-error">{error.message.split("\n")[0]}</p>}
      {isSuccess && <p className="tx-success">Confirmed.</p>}
    </div>
  );
}
