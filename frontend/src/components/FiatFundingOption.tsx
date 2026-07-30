import { useEffect, useState } from "react";
import { useFiatOnramp } from "@privy-io/react-auth";
import {
  FIAT_ONRAMP_CONFIG,
  FIAT_ONRAMP_READINESS,
} from "../lib/accountConfig";
import type { DepositAssetConfig } from "../../shared/deposit-assets.js";
import {
  applyFundingCheckoutEvent,
  createFundingCheckoutAttempt,
  createFundingIntent,
  createFundingPlan,
  isFundingCheckoutLifecycle,
  reconcileFundingCheckoutError,
  reconcileFundingCheckoutResult,
} from "../../shared/funding-routes.js";
import type {
  FundingCheckoutLifecycle,
  FundingCheckoutOutcome,
} from "../../shared/funding-routes.js";
import {
  clearRecoveryValue,
  readRecoveryJson,
  writeRecoveryJson,
} from "../lib/browserRecovery";

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
  const [status, setStatus] = useState<FundingCheckoutOutcome | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const fundingPlan = createFundingPlan(depositAsset?.id, {
    onrampEnabled: FIAT_ONRAMP_READINESS.enabled,
    environment: FIAT_ONRAMP_READINESS.environment,
    productionApproved: FIAT_ONRAMP_CONFIG?.environment === "production",
  });
  const checkoutStorageKey = FIAT_ONRAMP_CONFIG
    ? [
        "openescrow:funding-checkout",
        FIAT_ONRAMP_CONFIG.environment,
        depositAsset?.id || "usdc",
        walletAddress.toLowerCase(),
        amount.toString(),
      ].join(":")
    : null;

  useEffect(() => {
    setStatus(null);
    setRefreshError(null);
    if (!checkoutStorageKey || !FIAT_ONRAMP_CONFIG) return;
    const saved = readRecoveryJson(
      checkoutStorageKey,
      isFundingCheckoutLifecycle,
    );
    if (!saved) return;
    if (
      saved.environment !== FIAT_ONRAMP_CONFIG.environment ||
      saved.assetId !== (depositAsset?.id || "usdc") ||
      saved.walletAddress !== walletAddress.toLowerCase() ||
      saved.amountMicros !== amount.toString()
    ) {
      clearRecoveryValue(checkoutStorageKey);
      return;
    }
    let recovered = saved;
    if (saved.status === "opening") {
      try {
        recovered = applyFundingCheckoutEvent(saved, {
          eventId: `recovery:${saved.attemptId}`,
          status: "unknown",
          providerStatus: "interrupted",
        });
        writeRecoveryJson(checkoutStorageKey, recovered);
      } catch {
        setStatus(reconcileFundingCheckoutError());
        return;
      }
    }
    setStatus(
      reconcileFundingCheckoutResult(
        { status: recovered.providerStatus },
        FIAT_ONRAMP_CONFIG.environment,
      ),
    );
  }, [
    amount,
    checkoutStorageKey,
    depositAsset?.id,
    walletAddress,
  ]);

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
  const checkoutLocked = status?.retryAllowed === false;
  const checkoutLabel =
    status?.state === "confirmed"
      ? "Checkout complete"
      : status?.state === "refund_pending"
        ? "Refund pending"
        : status?.state === "unknown" && status.retryAllowed === false
          ? "Check provider before retrying"
          : status?.retryAllowed === true
            ? "Start a new checkout"
            : status?.state === "submitted" && status.providerStatus !== "opening"
              ? "Purchase submitted"
              : isOpening
                ? "Opening checkout..."
                : isSandbox
                  ? "Preview sandbox checkout"
                  : "Continue to card or bank";

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
        disabled={isOpening || checkoutLocked}
        onClick={async () => {
          setIsOpening(true);
          setRefreshError(null);
          let attempt: FundingCheckoutLifecycle | null = null;
          try {
            const intent = createFundingIntent({
              assetId: depositAsset?.id || "usdc",
              walletAddress,
              amountMicros: amount,
              environment: FIAT_ONRAMP_CONFIG.environment,
              onrampEnabled: true,
              productionApproved: FIAT_ONRAMP_CONFIG.environment === "production",
            });
            attempt = createFundingCheckoutAttempt(intent, {
              attemptId: globalThis.crypto.randomUUID(),
            });
            if (
              !checkoutStorageKey ||
              !writeRecoveryJson(checkoutStorageKey, attempt)
            ) {
              setStatus({
                state: "failed",
                providerStatus: "recovery_unavailable",
                severity: "error",
                shouldRefreshBalance: false,
                retryAllowed: true,
                message:
                  "Secure checkout recovery is unavailable in this browser. No checkout was opened. Restore browser storage access before trying again.",
              });
              return;
            }
            setStatus(
              reconcileFundingCheckoutResult(
                { status: "opening" },
                FIAT_ONRAMP_CONFIG.environment,
              ),
            );
            const result = await fund({
              source: {
                assets: [...intent.source.assets],
                defaultAsset: intent.source.defaultAsset,
              },
              destination: intent.destination,
              environment: intent.environment,
              defaultAmount: microsToDecimal(amount),
            });
            const resultStatus =
              result &&
              typeof result === "object" &&
              "status" in result &&
              typeof result.status === "string"
                ? result.status
                : "unknown";
            attempt = applyFundingCheckoutEvent(attempt, {
              eventId: `provider-result:${attempt.attemptId}`,
              status: resultStatus,
              providerStatus: resultStatus,
            });
            if (checkoutStorageKey) {
              writeRecoveryJson(checkoutStorageKey, attempt);
            }
            const outcome = reconcileFundingCheckoutResult(
              result,
              FIAT_ONRAMP_CONFIG.environment,
            );
            setStatus(outcome);
            if (outcome.shouldRefreshBalance) {
              try {
                await onComplete?.();
              } catch {
                setRefreshError(
                  "The provider result was saved, but the wallet balance could not be refreshed. Check your connection and try the refresh again.",
                );
              }
            }
          } catch {
            if (
              attempt &&
              checkoutStorageKey &&
              ["opening", "submitted", "unknown"].includes(attempt.status)
            ) {
              try {
                const uncertainAttempt = applyFundingCheckoutEvent(attempt, {
                  eventId: `client-error:${attempt.attemptId}`,
                  status: "unknown",
                  providerStatus: "error",
                });
                writeRecoveryJson(checkoutStorageKey, uncertainAttempt);
              } catch {
                // Keep the existing locked attempt if recovery state cannot advance safely.
              }
            }
            setStatus(reconcileFundingCheckoutError());
          } finally {
            setIsOpening(false);
          }
        }}
      >
        {checkoutLabel}
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
      {status && (
        <p
          className={status.severity === "error" ? "tx-error" : "field-help"}
          role={status.severity === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      )}
      {status &&
        (status.shouldRefreshBalance || !status.retryAllowed) &&
        !isOpening &&
        onComplete && (
        <button
          className="btn btn-secondary"
          type="button"
          disabled={isRefreshing}
          onClick={async () => {
            setIsRefreshing(true);
            setRefreshError(null);
            try {
              await onComplete();
            } catch {
              setRefreshError(
                "The wallet balance could not be refreshed. Check your connection and try the refresh again; do not start another purchase yet.",
              );
            } finally {
              setIsRefreshing(false);
            }
          }}
        >
          {isRefreshing ? "Refreshing wallet..." : "Refresh wallet balance"}
        </button>
      )}
      {refreshError && (
        <p className="tx-error" role="alert">
          {refreshError}
        </p>
      )}
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
