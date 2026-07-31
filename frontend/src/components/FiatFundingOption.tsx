import { useEffect, useLayoutEffect, useMemo, useState } from "react";
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
  sandboxCheckoutClosureStatus,
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
import { createAsyncOperationScope } from "../lib/asyncOperationScope";
import {
  fundingCheckoutRecoveryKey,
  fundingOperationScopeKey,
} from "../lib/fundingOperationScope";
import {
  appendDurableFundingCheckoutEvent,
  createDurableFundingCheckout,
  recoverDurableFundingCheckout,
} from "../lib/negotiations";
import type { NegotiationAccess } from "../lib/negotiations";

function microsToDecimal(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function durableRecoveryUnavailable(): FundingCheckoutOutcome {
  return {
    state: "unknown",
    providerStatus: "durable_recovery_unavailable",
    severity: "error",
    shouldRefreshBalance: false,
    retryAllowed: false,
    message:
      "Secure sandbox checkout recovery is temporarily unavailable. No new checkout was opened. Reconnect this agreement record before trying again.",
  };
}

function checkoutOutcomeInput(checkout: FundingCheckoutLifecycle) {
  const event = checkout.events.at(-1);
  return {
    status: checkout.providerStatus,
    source: event?.source,
    verification: event?.verification,
    reconciliationKey: event?.reconciliationKey,
    payloadDigest: event?.payloadDigest,
  };
}

export function FiatFundingOption({
  walletAddress,
  amount,
  depositAsset,
  negotiationAccess,
  tenantId,
  onComplete,
}: {
  walletAddress: string;
  amount: bigint;
  depositAsset?: DepositAssetConfig | null;
  negotiationAccess?: NegotiationAccess | null;
  tenantId?: string | null;
  onComplete?: () => void | Promise<void>;
}) {
  const { fund } = useFiatOnramp();
  const [status, setStatus] = useState<FundingCheckoutOutcome | null>(null);
  const [checkout, setCheckout] = useState<FundingCheckoutLifecycle | null>(null);
  const [isRecovering, setIsRecovering] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const fundingPlan = createFundingPlan(depositAsset?.id, {
    onrampEnabled: FIAT_ONRAMP_READINESS.enabled,
    environment: FIAT_ONRAMP_READINESS.environment,
    productionApproved: FIAT_ONRAMP_CONFIG?.environment === "production",
  });
  const checkoutStorageKey = FIAT_ONRAMP_CONFIG
    ? fundingCheckoutRecoveryKey({
        proposalId: negotiationAccess?.proposalId,
        role: negotiationAccess?.role,
        tenantId,
        walletAddress,
        assetId: depositAsset?.id,
        amountMicros: amount,
        environment: FIAT_ONRAMP_CONFIG.environment,
      })
    : null;
  const durableAccess = useMemo(
    () =>
      FIAT_ONRAMP_CONFIG?.environment === "sandbox" &&
      negotiationAccess?.role === "tenant"
        ? negotiationAccess
        : null,
    [negotiationAccess],
  );
  const operationScopeKey = fundingOperationScopeKey({
    proposalId: negotiationAccess?.proposalId,
    role: negotiationAccess?.role,
    tenantId,
    walletAddress,
    assetId: depositAsset?.id,
    amountMicros: amount,
    environment: FIAT_ONRAMP_CONFIG?.environment,
  });
  const accessSessionToken = negotiationAccess?.token;
  const operationScope = useMemo(
    () =>
      createAsyncOperationScope(
        `${operationScopeKey}:${accessSessionToken ? "tenant-access" : "no-access"}`,
      ),
    [accessSessionToken, operationScopeKey],
  );

  useLayoutEffect(() => {
    operationScope.open();
    setIsOpening(false);
    setIsResolving(false);
    setIsRefreshing(false);
    return () => operationScope.close();
  }, [operationScope]);

  useEffect(() => {
    let cancelled = false;
    const operationId = operationScope.start();
    const isCurrent = () =>
      !cancelled && operationScope.isCurrent(operationId);
    setStatus(null);
    setCheckout(null);
    setRefreshError(null);
    setIsRecovering(true);
    if (!FIAT_ONRAMP_CONFIG) {
      if (isCurrent()) setIsRecovering(false);
      return;
    }
    const saved = checkoutStorageKey
      ? readRecoveryJson(
          checkoutStorageKey,
          isFundingCheckoutLifecycle,
        )
      : null;
    if (
      saved &&
      (saved.environment !== FIAT_ONRAMP_CONFIG.environment ||
        saved.assetId !== (depositAsset?.id || "usdc") ||
        saved.walletAddress !== walletAddress.toLowerCase() ||
        saved.amountMicros !== amount.toString())
    ) {
      if (checkoutStorageKey) clearRecoveryValue(checkoutStorageKey);
      if (isCurrent()) setIsRecovering(false);
      return;
    }

    const recover = async () => {
      if (durableAccess) {
        try {
          const intent = createFundingIntent({
            assetId: depositAsset?.id || "usdc",
            walletAddress,
            amountMicros: amount,
            environment: "sandbox",
            onrampEnabled: true,
            productionApproved: false,
          });
          let recovered = (
            await recoverDurableFundingCheckout(durableAccess, intent)
          ).checkout;
          if (!recovered && saved) {
            recovered = (
              await createDurableFundingCheckout(
                durableAccess,
                intent,
                saved.attemptId,
              )
            ).checkout;
          }
          if (recovered && saved?.attemptId === recovered.attemptId) {
            const recoveredEvents = new Map(
              recovered.events.map((event) => [event.id, event]),
            );
            for (const localEvent of saved.events) {
              const durableEvent = recoveredEvents.get(localEvent.id);
              if (
                durableEvent &&
                (durableEvent.status !== localEvent.status ||
                  durableEvent.providerStatus !== localEvent.providerStatus ||
                  durableEvent.source !== localEvent.source ||
                  durableEvent.verification !== localEvent.verification ||
                  durableEvent.reconciliationKey !== localEvent.reconciliationKey ||
                  durableEvent.payloadDigest !== localEvent.payloadDigest)
              ) {
                throw new Error("The saved checkout histories conflict.");
              }
              if (!durableEvent) {
                recovered = (
                  await appendDurableFundingCheckoutEvent(
                    durableAccess,
                    recovered.attemptId,
                    {
                      eventId: localEvent.id,
                      status: localEvent.status,
                      providerStatus: localEvent.providerStatus,
                    },
                  )
                ).checkout;
              }
            }
          }
          if (recovered?.status === "opening") {
            recovered = (
              await appendDurableFundingCheckoutEvent(
                durableAccess,
                recovered.attemptId,
                {
                  eventId: `recovery:${recovered.attemptId}`,
                  status: "unknown",
                  providerStatus: "interrupted",
                },
              )
            ).checkout;
          }
          if (!isCurrent()) return;
          if (!recovered) {
            setCheckout(null);
            setStatus(null);
            return;
          }
          if (checkoutStorageKey) {
            writeRecoveryJson(checkoutStorageKey, recovered);
          }
          setCheckout(recovered);
          setStatus(
            reconcileFundingCheckoutResult(
              checkoutOutcomeInput(recovered),
              FIAT_ONRAMP_CONFIG.environment,
            ),
          );
        } catch {
          if (isCurrent()) setStatus(durableRecoveryUnavailable());
        }
        return;
      }

      if (!saved) return;
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
          if (isCurrent()) setStatus(reconcileFundingCheckoutError());
          return;
        }
      }
      if (isCurrent()) {
        setCheckout(recovered);
        setStatus(
          reconcileFundingCheckoutResult(
            checkoutOutcomeInput(recovered),
            FIAT_ONRAMP_CONFIG.environment,
          ),
        );
      }
    };
    void recover().finally(() => {
      if (isCurrent()) setIsRecovering(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    amount,
    checkoutStorageKey,
    depositAsset?.id,
    durableAccess,
    operationScope,
    tenantId,
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
  const sandboxClosureStatus = sandboxCheckoutClosureStatus(checkout);
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
              : isRecovering
                ? "Checking prior checkout..."
                : isOpening
                  ? "Opening checkout..."
                  : isSandbox
                    ? "Preview sandbox checkout"
                    : "Continue to card or bank";
  const resetSandboxPreview = async () => {
    if (!checkout || !sandboxClosureStatus) return;
    const operationId = operationScope.start();
    setIsResolving(true);
    setRefreshError(null);
    try {
      const eventId = `sandbox-close:${checkout.attemptId}:${sandboxClosureStatus}`;
      let closedCheckout: FundingCheckoutLifecycle;
      if (durableAccess) {
        closedCheckout = (
          await appendDurableFundingCheckoutEvent(
            durableAccess,
            checkout.attemptId,
            {
              eventId,
              status: sandboxClosureStatus,
              providerStatus: sandboxClosureStatus,
            },
          )
        ).checkout;
      } else {
        closedCheckout = applyFundingCheckoutEvent(checkout, {
          eventId,
          status: sandboxClosureStatus,
          providerStatus: sandboxClosureStatus,
        });
      }
      if (
        checkoutStorageKey &&
        !writeRecoveryJson(checkoutStorageKey, closedCheckout) &&
        !durableAccess
      ) {
        throw new Error("The closed sandbox preview could not be saved.");
      }
      if (operationScope.isCurrent(operationId)) {
        setCheckout(closedCheckout);
        setStatus(
          reconcileFundingCheckoutResult(
            checkoutOutcomeInput(closedCheckout),
            FIAT_ONRAMP_CONFIG.environment,
          ),
        );
      }
    } catch {
      if (operationScope.isCurrent(operationId)) {
        setStatus({
          state: "unknown",
          providerStatus: "sandbox_reset_failed",
          severity: "error",
          shouldRefreshBalance: false,
          retryAllowed: false,
          message:
            "The no-money sandbox preview could not be reset safely. Refresh this agreement before trying again.",
        });
      }
    } finally {
      if (operationScope.isCurrent(operationId)) setIsResolving(false);
    }
  };

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
        disabled={
          isRecovering ||
          isOpening ||
          isResolving ||
          isRefreshing ||
          checkoutLocked
        }
        onClick={async () => {
          const operationId = operationScope.start();
          setIsOpening(true);
          setRefreshError(null);
          let attempt: FundingCheckoutLifecycle | null = null;
          let providerOpened = false;
          try {
            const intent = createFundingIntent({
              assetId: depositAsset?.id || "usdc",
              walletAddress,
              amountMicros: amount,
              environment: FIAT_ONRAMP_CONFIG.environment,
              onrampEnabled: true,
              productionApproved: FIAT_ONRAMP_CONFIG.environment === "production",
            });
            const attemptId = globalThis.crypto.randomUUID();
            if (durableAccess) {
              const durableAttempt = await createDurableFundingCheckout(
                durableAccess,
                intent,
                attemptId,
              );
              attempt = durableAttempt.checkout;
              if (checkoutStorageKey) {
                writeRecoveryJson(checkoutStorageKey, attempt);
              }
              if (operationScope.isCurrent(operationId)) {
                setCheckout(attempt);
                setStatus(
                  reconcileFundingCheckoutResult(
                    checkoutOutcomeInput(attempt),
                    FIAT_ONRAMP_CONFIG.environment,
                  ),
                );
              }
              if (!durableAttempt.created) return;
            } else {
              attempt = createFundingCheckoutAttempt(intent, { attemptId });
              if (
                !checkoutStorageKey ||
                !writeRecoveryJson(checkoutStorageKey, attempt)
              ) {
                if (operationScope.isCurrent(operationId)) {
                  setStatus({
                    state: "failed",
                    providerStatus: "recovery_unavailable",
                    severity: "error",
                    shouldRefreshBalance: false,
                    retryAllowed: true,
                    message:
                      "Secure checkout recovery is unavailable in this browser. No checkout was opened. Restore browser storage access before trying again.",
                  });
                }
                return;
              }
              if (operationScope.isCurrent(operationId)) setCheckout(attempt);
            }
            if (operationScope.isCurrent(operationId)) {
              setStatus(
                reconcileFundingCheckoutResult(
                  { status: "opening" },
                  FIAT_ONRAMP_CONFIG.environment,
                ),
              );
            }
            providerOpened = true;
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
            const eventId = `browser-result:${attempt.attemptId}`;
            attempt = applyFundingCheckoutEvent(attempt, {
              eventId,
              status: resultStatus,
              providerStatus: resultStatus,
            });
            if (checkoutStorageKey) {
              writeRecoveryJson(checkoutStorageKey, attempt);
            }
            if (operationScope.isCurrent(operationId)) setCheckout(attempt);
            if (durableAccess) {
              try {
                attempt = (
                  await appendDurableFundingCheckoutEvent(
                    durableAccess,
                    attempt.attemptId,
                    {
                      eventId,
                      status: resultStatus,
                      providerStatus: resultStatus,
                    },
                  )
                ).checkout;
                if (checkoutStorageKey) {
                  writeRecoveryJson(checkoutStorageKey, attempt);
                }
                if (operationScope.isCurrent(operationId)) setCheckout(attempt);
              } catch {
                if (operationScope.isCurrent(operationId)) {
                  setStatus({
                    state: "unknown",
                    providerStatus: "durable_result_save_failed",
                    severity: "error",
                    shouldRefreshBalance: false,
                    retryAllowed: false,
                    message:
                      "The provider returned a result, but OpenEscrow could not durably save it. No agreement funding was recorded. Reconnect and refresh this page before any retry.",
                  });
                }
                return;
              }
            }
            const outcome = reconcileFundingCheckoutResult(
              checkoutOutcomeInput(attempt),
              FIAT_ONRAMP_CONFIG.environment,
            );
            if (operationScope.isCurrent(operationId)) setStatus(outcome);
            if (
              outcome.shouldRefreshBalance &&
              operationScope.isCurrent(operationId)
            ) {
              try {
                await onComplete?.();
              } catch {
                if (operationScope.isCurrent(operationId)) {
                  setRefreshError(
                    "The provider result was saved, but the wallet balance could not be refreshed. Check your connection and try the refresh again.",
                  );
                }
              }
            }
          } catch {
            if (
              attempt &&
              ["opening", "submitted", "unknown"].includes(attempt.status)
            ) {
              const eventId = `client-error:${attempt.attemptId}`;
              try {
                if (durableAccess) {
                  attempt = (
                    await appendDurableFundingCheckoutEvent(
                      durableAccess,
                      attempt.attemptId,
                      {
                        eventId,
                        status: "unknown",
                        providerStatus: "error",
                      },
                    )
                  ).checkout;
                } else {
                  attempt = applyFundingCheckoutEvent(attempt, {
                    eventId,
                    status: "unknown",
                    providerStatus: "error",
                  });
                }
                if (checkoutStorageKey) {
                  writeRecoveryJson(checkoutStorageKey, attempt);
                }
                if (operationScope.isCurrent(operationId)) setCheckout(attempt);
              } catch {
                try {
                  attempt = applyFundingCheckoutEvent(attempt, {
                    eventId,
                    status: "unknown",
                    providerStatus: "error",
                  });
                  if (checkoutStorageKey) {
                    writeRecoveryJson(checkoutStorageKey, attempt);
                  }
                  if (operationScope.isCurrent(operationId)) setCheckout(attempt);
                } catch {
                  // Keep the existing locked attempt if recovery state cannot advance safely.
                }
              }
            }
            if (operationScope.isCurrent(operationId)) {
              setStatus(
                providerOpened
                  ? reconcileFundingCheckoutError()
                  : durableAccess
                    ? durableRecoveryUnavailable()
                    : {
                        state: "failed",
                        providerStatus: "recovery_unavailable",
                        severity: "error",
                        shouldRefreshBalance: false,
                        retryAllowed: true,
                        message:
                          "Secure checkout recovery could not be prepared. No checkout was opened. Try again after reconnecting this page.",
                      },
              );
            }
          } finally {
            if (operationScope.isCurrent(operationId)) setIsOpening(false);
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
      {isSandbox && sandboxClosureStatus && (
        <>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={isOpening || isRecovering || isResolving || isRefreshing}
            onClick={() => void resetSandboxPreview()}
          >
            {isResolving
              ? "Resetting sandbox preview..."
              : sandboxClosureStatus === "refunded"
                ? "Reset no-money sandbox preview"
                : "Close no-money sandbox preview"}
          </button>
          <small>
            No real money moved. This ends only the sandbox rehearsal record so you can
            retry it. Production results stay locked until the provider or an authorized
            operator verifies them.
          </small>
        </>
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
            const operationId = operationScope.start();
            setIsRefreshing(true);
            setRefreshError(null);
            try {
              await onComplete();
            } catch {
              if (operationScope.isCurrent(operationId)) {
                setRefreshError(
                  "The wallet balance could not be refreshed. Check your connection and try the refresh again; do not start another purchase yet.",
                );
              }
            } finally {
              if (operationScope.isCurrent(operationId)) {
                setIsRefreshing(false);
              }
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
