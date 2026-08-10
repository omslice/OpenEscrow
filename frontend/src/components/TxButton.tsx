import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { chain } from "../contracts/config";
import { createSubmittedCallbackSlot } from "../lib/submittedCallback";
import { transactionTerminalState } from "../lib/transactionTerminalState";

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
  const {
    isLoading: isMining,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });
  const [submitted, setSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const notifiedHash = useRef<`0x${string}` | undefined>(undefined);
  const submittedSuccessCallback = useMemo(
    () => createSubmittedCallbackSlot<`0x${string}`>(),
    [],
  );

  const busy = submitted || isPending || isMining;
  const transactionError =
    submissionError || error?.message.split("\n")[0] ||
    receiptError?.message.split("\n")[0] || null;
  const terminalState = transactionTerminalState(
    error,
    receiptError,
    isSuccess,
  );

  useEffect(() => {
    if (terminalState === "pending") return;
    setSubmitted(false);
    if (terminalState === "failed") submittedSuccessCallback.clear();
  }, [submittedSuccessCallback, terminalState]);

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
          setSubmissionError(null);
          notifiedHash.current = undefined;
          submittedSuccessCallback.capture(onSuccess);
          try {
            onSubmit?.();
            setSubmitted(true);
            reset();
            writeContract({ address, abi, functionName, args, account, chain });
          } catch (cause) {
            submittedSuccessCallback.clear();
            setSubmitted(false);
            setSubmissionError(
              cause instanceof Error
                ? cause.message.split("\n")[0]
                : "The transaction could not be submitted. Check your wallet and try again.",
            );
          }
        }}
      >
        {isPending ? "Confirm in wallet..." : isMining ? "Mining..." : label}
      </button>
      {transactionError && (
        <p className="tx-error" role="alert">
          {transactionError}
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
