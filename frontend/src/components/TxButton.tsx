import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { chain } from "../contracts/config";
import { createSubmittedCallbackSlot } from "../lib/submittedCallback";

interface TxButtonProps {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  label: string;
  disabled?: boolean;
  className?: string;
  onSubmit?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onSuccess?: (transactionHash: `0x${string}`) => void;
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
  onSubmit,
  onBusyChange,
  onSuccess,
}: TxButtonProps) {
  const { address: account } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [submitted, setSubmitted] = useState(false);
  const notifiedHash = useRef<`0x${string}` | undefined>(undefined);
  const submittedSuccessCallback = useMemo(
    () => createSubmittedCallbackSlot<`0x${string}`>(),
    [],
  );

  const busy = submitted || isPending || isMining;

  useEffect(() => {
    if (error || isSuccess) setSubmitted(false);
  }, [error, isSuccess]);

  useEffect(() => {
    onBusyChange?.(busy);
    return () => {
      if (busy) onBusyChange?.(false);
    };
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (isSuccess && hash && notifiedHash.current !== hash) {
      notifiedHash.current = hash;
      submittedSuccessCallback.take()?.(hash);
    }
  }, [hash, isSuccess, submittedSuccessCallback]);

  return (
    <div className="tx-button">
      <button
        type="button"
        className={className ?? "btn btn-primary"}
        disabled={disabled || busy || !account}
        onClick={() => {
          if (!account) return;
          notifiedHash.current = undefined;
          submittedSuccessCallback.capture(onSuccess);
          onSubmit?.();
          setSubmitted(true);
          reset();
          writeContract({ address, abi, functionName, args, account, chain });
        }}
      >
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : label}
      </button>
      {error && (
        <p className="tx-error" role="alert">
          {error.message.split("\n")[0]}
        </p>
      )}
      {isSuccess && (
        <p className="tx-success" role="status">
          Confirmed.
        </p>
      )}
    </div>
  );
}
