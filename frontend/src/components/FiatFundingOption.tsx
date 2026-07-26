import { useState } from "react";
import { useFiatOnramp } from "@privy-io/react-auth";
import { FIAT_ONRAMP_CONFIG } from "../lib/accountConfig";

function microsToDecimal(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function FiatFundingOption({
  walletAddress,
  amount,
  onComplete,
}: {
  walletAddress: string;
  amount: bigint;
  onComplete?: () => void | Promise<void>;
}) {
  const { fund } = useFiatOnramp();
  const [status, setStatus] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  if (!FIAT_ONRAMP_CONFIG) {
    return (
      <details className="fiat-funding-option">
        <summary>Pay with debit card or bank</summary>
        <p>
          The checkout is prepared for a future Base mainnet pilot. This Base Sepolia
          agreement uses free test tokens because real card and bank payments cannot purchase
          testnet assets.
        </p>
      </details>
    );
  }

  return (
    <div className="fiat-funding-option enabled">
      <div>
        <strong>Pay with card or bank</strong>
        <span>
          Your embedded OpenEscrow wallet receives the stablecoin automatically. The regulated
          provider handles payment details and any identity check.
        </span>
      </div>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={isOpening}
        onClick={async () => {
          setIsOpening(true);
          setStatus("Opening secure checkout...");
          try {
            const result = await fund({
              source: { assets: ["usd"], defaultAsset: "usd" },
              destination: {
                asset: FIAT_ONRAMP_CONFIG.asset,
                chain: FIAT_ONRAMP_CONFIG.chain,
                address: walletAddress,
              },
              environment: FIAT_ONRAMP_CONFIG.environment,
              defaultAmount: microsToDecimal(amount),
            });
            setStatus(
              result.status === "confirmed"
                ? "Funds received. Refreshing your available balance..."
                : "Payment submitted. Your balance will update after provider confirmation.",
            );
            await onComplete?.();
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message.split("\n")[0]
                : "The payment checkout did not complete.",
            );
          } finally {
            setIsOpening(false);
          }
        }}
      >
        {isOpening ? "Opening checkout..." : "Continue to card or bank"}
      </button>
      <small>
        Provider processing fees are shown separately at checkout. ACH is usually better suited
        to a full security deposit than a debit card.
      </small>
      {status && <p className={/did not|error/i.test(status) ? "tx-error" : "field-help"}>{status}</p>}
    </div>
  );
}
