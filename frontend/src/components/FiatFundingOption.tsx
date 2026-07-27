import { useState } from "react";
import { useFiatOnramp } from "@privy-io/react-auth";
import {
  FIAT_ONRAMP_CONFIG,
  FIAT_ONRAMP_READINESS,
} from "../lib/accountConfig";
import type { DepositAssetConfig } from "../../shared/deposit-assets.js";
import {
  createFundingIntent,
  createFundingPlan,
} from "../../shared/funding-routes.js";

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
  depositAsset,
  onComplete,
}: {
  walletAddress: string;
  amount: bigint;
  depositAsset?: DepositAssetConfig | null;
  onComplete?: () => void | Promise<void>;
}) {
  const { fund } = useFiatOnramp();
  const [status, setStatus] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const fundingPlan = createFundingPlan(depositAsset?.id, {
    onrampEnabled: FIAT_ONRAMP_READINESS.enabled,
    environment: FIAT_ONRAMP_READINESS.environment,
    productionApproved: FIAT_ONRAMP_CONFIG?.environment === "production",
  });

  if (!FIAT_ONRAMP_CONFIG || !fundingPlan.checkoutAvailable) {
    return (
      <details className="fiat-funding-option">
        <summary>Pay with debit card or bank</summary>
        <p>
          The checkout is prepared for a future Base mainnet pilot. This Base Sepolia
          agreement uses free test tokens because real card and bank payments cannot purchase
          testnet assets.
        </p>
        <FundingRouteSummary
          depositAsset={depositAsset}
          fundingPlan={fundingPlan}
          readinessReason={FIAT_ONRAMP_READINESS.reason}
        />
      </details>
    );
  }

  const isSandbox = FIAT_ONRAMP_CONFIG.environment === "sandbox";

  return (
    <div className="fiat-funding-option enabled">
      <div>
        <strong>{isSandbox ? "Preview card or bank checkout" : "Pay with card or bank"}</strong>
        <span>
          {isSandbox
            ? "This provider sandbox moves no real money and cannot fund a Base Sepolia agreement. Use it to test the checkout experience, then claim free test tokens below."
            : "Your embedded OpenEscrow wallet receives the stablecoin automatically. The regulated provider handles payment details and any identity check."}
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
            const intent = createFundingIntent({
              assetId: depositAsset?.id || "usdc",
              walletAddress,
              amountMicros: amount,
              environment: FIAT_ONRAMP_CONFIG.environment,
              onrampEnabled: true,
              productionApproved: FIAT_ONRAMP_CONFIG.environment === "production",
            });
            const result = await fund({
              source: {
                assets: [...intent.source.assets],
                defaultAsset: intent.source.defaultAsset,
              },
              destination: intent.destination,
              environment: intent.environment,
              defaultAmount: microsToDecimal(amount),
            });
            setStatus(
              isSandbox
                ? result.status === "confirmed"
                  ? "Sandbox checkout completed. No real funds moved; claim free test tokens below to fund this agreement."
                  : "Sandbox checkout submitted. No real funds will move."
                : result.status === "confirmed"
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
        {isOpening
          ? "Opening checkout..."
          : isSandbox
            ? "Preview sandbox checkout"
            : "Continue to card or bank"}
      </button>
      <small>
        {isSandbox
          ? "Sandbox mode has no charge. In production, provider fees would appear separately and would not be taken from the operations reserve."
          : "Provider processing fees are shown separately at checkout. ACH is usually better suited to a full security deposit than a debit card."}
      </small>
      <FundingRouteSummary
        depositAsset={depositAsset}
        fundingPlan={fundingPlan}
      />
      {status && <p className={/did not|error/i.test(status) ? "tx-error" : "field-help"}>{status}</p>}
    </div>
  );
}

function FundingRouteSummary({
  depositAsset,
  fundingPlan,
  readinessReason,
}: {
  depositAsset?: DepositAssetConfig | null;
  fundingPlan: ReturnType<typeof createFundingPlan>;
  readinessReason?: string | null;
}) {
  if (!depositAsset) return null;
  const routeText = fundingPlan.routeSteps.length
    ? fundingPlan.routeSteps.join(" → ")
    : "No active production funding route is enabled for this option.";
  const onramp = fundingPlan.onramp;
  const conversion = fundingPlan.conversion;

  return (
    <div className="funding-route-summary">
      <strong>Planned production route</strong>
      <span>
        {routeText}
      </span>
      <small>
        On-ramp: {onramp.name} ({onramp.id}) — {onramp.status}
      </small>
      {conversion && (
        <small>
          Conversion: {conversion.label} ({conversion.id}) — {conversion.status}
        </small>
      )}
      <small>
        Privy chooses an available regulated on-ramp provider by region. OpenEscrow does not take
        custody of payment credentials or pool gas funds. Asset conversion remains disabled in
        this testnet build.
      </small>
      {fundingPlan.conversion?.kind !== "none" && (
        <small>
          {fundingPlan.conversion?.description} This conversion remains disabled in the current
          application.
        </small>
      )}
      {(readinessReason || fundingPlan.reason) && (
        <small>{readinessReason || fundingPlan.reason}</small>
      )}
    </div>
  );
}
