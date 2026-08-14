import {
  lazy,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useAgreement } from "../lib/useAgreement";
import { Phase, phaseLabel } from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { preferredScrollBehavior } from "../lib/accessibility";
import {
  AGREEMENT_PANELS,
  rememberAgreementPanel,
  shouldLoadAgreementPanel,
  type AgreementPanel,
} from "../lib/agreementPanelLoading";
import { AgreementDashboard } from "./AgreementDashboard";
import { AgreementLoadFailure } from "./AgreementLoadFailure";
import { NextAction } from "./NextAction";
import { AgreementNoticeCenter } from "./AgreementNoticeCenter";
import { DeferredLoadBoundary } from "./DeferredLoadBoundary";
import type { NegotiationAccess, NegotiationRecord } from "../lib/negotiations";
import "./AgreementCard.css";

export type { AgreementPanel } from "../lib/agreementPanelLoading";
export type AgreementFocusRequest = {
  targetId: string;
  nonce: number;
};

const PANEL_LABELS: Record<AgreementPanel, string> = {
  summary: "Summary",
  funds: "Funds & withdrawals",
  claims: "Claims & resolution",
};

const AgreementFundsPanel = lazy(() =>
  import("./AgreementFundsPanel").then((module) => ({
    default: module.AgreementFundsPanel,
  })),
);
const AgreementClaimsPanel = lazy(() =>
  import("./AgreementClaimsPanel").then((module) => ({
    default: module.AgreementClaimsPanel,
  })),
);

function defaultPanelForAgreement(
  agreement: NonNullable<ReturnType<typeof useAgreement>["agreement"]>,
): AgreementPanel {
  if (agreement.phase === Phase.Proposed || agreement.phase === Phase.ReadyToFund) {
    return "funds";
  }
  if (
    agreement.phase === Phase.ClaimOpen ||
    agreement.phase === Phase.Disputed ||
    (agreement.phase === Phase.Active &&
      agreement.claimWindowStart > 0n &&
      BigInt(Math.floor(Date.now() / 1_000)) >= agreement.claimWindowStart)
  ) {
    return "claims";
  }
  if (
    agreement.phase === Phase.Closed &&
    (agreement.tenantWithdrawable > 0n || agreement.landlordWithdrawable > 0n)
  ) {
    return "funds";
  }
  return "summary";
}

export function AgreementCard({
  id,
  onRemove,
  onUnavailable,
  negotiationAccess,
  participantRecord,
  onParticipantRecordUpdated,
  activePanel,
  onPanelChange,
  focusRequest,
}: {
  id: bigint;
  onRemove?: () => void;
  onUnavailable?: () => void;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  onParticipantRecordUpdated?: (record: NegotiationRecord) => void;
  activePanel?: AgreementPanel;
  onPanelChange?: (panel: AgreementPanel) => void;
  focusRequest?: AgreementFocusRequest;
}) {
  const { agreement, exists, isLoading, isFetching, error, refetch } = useAgreement(id);
  const [localPanel, setLocalPanel] = useState<AgreementPanel | null>(null);
  const [visitedPanels, setVisitedPanels] = useState<readonly AgreementPanel[]>([
    "summary",
  ]);
  const tabRefs = useRef<Partial<Record<AgreementPanel, HTMLButtonElement | null>>>({});
  const handledFocusNonce = useRef<number | null>(null);
  const selectedPanel = agreement
    ? activePanel || localPanel || defaultPanelForAgreement(agreement)
    : activePanel || localPanel || "summary";

  useEffect(() => {
    if (!agreement) return;
    setVisitedPanels((current) =>
      rememberAgreementPanel(current, selectedPanel),
    );
  }, [agreement, selectedPanel]);

  useEffect(() => {
    if (!focusRequest || isLoading || error || !exists || !agreement) return;
    if (handledFocusNonce.current === focusRequest.nonce) return;
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const focusTarget = () => {
      if (cancelled) return;
      const target = document.getElementById(focusRequest.targetId);
      if (!target && attempts < 12) {
        attempts += 1;
        timer = window.setTimeout(focusTarget, 75);
        return;
      }
      const resolvedTarget =
        target || document.getElementById(`agreement-${id.toString()}`);
      if (!resolvedTarget) return;
      handledFocusNonce.current = focusRequest.nonce;
      resolvedTarget.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: "start",
      });
      resolvedTarget.focus({ preventScroll: true });
    };
    focusTarget();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    agreement,
    error,
    exists,
    focusRequest,
    id,
    isLoading,
  ]);

  useEffect(() => {
    if (isLoading || error || exists || agreement) return;
    onUnavailable?.();
  }, [agreement, error, exists, isLoading, onUnavailable]);

  if (isLoading) {
    return null;
  }
  if (!error && (!exists || !agreement)) {
    return null;
  }
  if (error) {
    return (
      <AgreementLoadFailure
        id={id}
        retrying={isFetching}
        onRetry={async () => {
          const result = await refetch();
          if (result.error) throw result.error;
        }}
      />
    );
  }

  const agreementKey = id.toString();

  // Every action component calls this on success so the dashboard reflects the
  // new state immediately, instead of waiting up to 5s for the next poll.
  const onRefetch = () => void refetch();

  function selectPanel(panel: AgreementPanel, focusTab = false) {
    setVisitedPanels((current) => rememberAgreementPanel(current, panel));
    setLocalPanel(panel);
    onPanelChange?.(panel);
    if (focusTab) {
      window.requestAnimationFrame(() => tabRefs.current[panel]?.focus());
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = AGREEMENT_PANELS.indexOf(selectedPanel);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % AGREEMENT_PANELS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + AGREEMENT_PANELS.length) %
        AGREEMENT_PANELS.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = AGREEMENT_PANELS.length - 1;
    else return;
    event.preventDefault();
    selectPanel(AGREEMENT_PANELS[nextIndex], true);
  }

  return (
    <article
      className="card agreement-card"
      id={`agreement-${agreementKey}`}
      tabIndex={-1}
      aria-labelledby={`agreement-${agreementKey}-title`}
    >
      <header className="agreement-card-header">
        <div>
          <span className="eyebrow">Finalized agreement</span>
          <h2 id={`agreement-${agreementKey}-title`}>
            {agreementReference(id)}
          </h2>
          <small className="technical-id">Onchain agreement ID {agreementKey}</small>
        </div>
        <span className={`phase-badge phase-${agreement.phase}`}>
          {phaseLabel[agreement.phase]}
        </span>
      </header>

      <div
        className="agreement-panel-tabs"
        role="tablist"
        aria-label={`${agreementReference(id)} sections`}
      >
        {AGREEMENT_PANELS.map((panel) => {
          const isSelected = selectedPanel === panel;
          return (
            <button
              key={panel}
              ref={(element) => {
                tabRefs.current[panel] = element;
              }}
              type="button"
              role="tab"
              id={`agreement-${agreementKey}-tab-${panel}`}
              aria-selected={isSelected}
              aria-controls={`agreement-${agreementKey}-panel-${panel}`}
              tabIndex={isSelected ? 0 : -1}
              className={isSelected ? "active" : ""}
              onClick={() => selectPanel(panel)}
              onKeyDown={handleTabKeyDown}
            >
              {PANEL_LABELS[panel]}
            </button>
          );
        })}
      </div>

      <section
        className="agreement-panel agreement-summary-panel"
        id={`agreement-${agreementKey}-panel-summary`}
        role="tabpanel"
        aria-labelledby={`agreement-${agreementKey}-tab-summary`}
        tabIndex={0}
        hidden={selectedPanel !== "summary"}
      >
          <AgreementDashboard
            id={id}
            agreement={agreement}
            participantRecord={participantRecord}
          />
          <AgreementNoticeCenter id={id} agreement={agreement} />
          <NextAction
            id={id}
            agreement={agreement}
            onOpenClaims={() => selectPanel("claims", true)}
          />
      </section>

      <section
        className="agreement-panel"
        id={`agreement-${agreementKey}-panel-funds`}
        role="tabpanel"
        aria-labelledby={`agreement-${agreementKey}-tab-funds`}
        tabIndex={0}
        hidden={selectedPanel !== "funds"}
      >
          {shouldLoadAgreementPanel("funds", selectedPanel, visitedPanels) && (
            <DeferredLoadBoundary
              area="workspace"
              fallback={
                <p className="field-help workspace-tool-loading" role="status">
                  Loading funding tools...
                </p>
              }
            >
              <AgreementFundsPanel
                id={id}
                agreement={agreement}
                negotiationAccess={negotiationAccess}
                participantRecord={participantRecord}
                onParticipantRecordUpdated={onParticipantRecordUpdated}
                onRefetch={onRefetch}
              />
            </DeferredLoadBoundary>
          )}
      </section>

      <section
        className="agreement-panel"
        id={`agreement-${agreementKey}-panel-claims`}
        role="tabpanel"
        aria-labelledby={`agreement-${agreementKey}-tab-claims`}
        tabIndex={0}
        hidden={selectedPanel !== "claims"}
      >
          {shouldLoadAgreementPanel("claims", selectedPanel, visitedPanels) && (
            <DeferredLoadBoundary
              area="workspace"
              fallback={
                <p className="field-help workspace-tool-loading" role="status">
                  Loading claims tools...
                </p>
              }
            >
              <AgreementClaimsPanel
                id={id}
                agreement={agreement}
                negotiationAccess={negotiationAccess}
                participantRecord={participantRecord}
                onRefetch={onRefetch}
              />
            </DeferredLoadBoundary>
          )}
      </section>

      {onRemove && (
        <button className="btn btn-ghost small stop-tracking" onClick={onRemove}>
          Stop tracking this agreement
        </button>
      )}
    </article>
  );
}
