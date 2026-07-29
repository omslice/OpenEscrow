import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAgreement } from "../lib/useAgreement";
import {
  Phase,
  ZERO_ADDRESS,
  phaseLabel,
} from "../contracts/config";
import { agreementReference } from "../lib/displayIds";
import { preferredScrollBehavior } from "../lib/accessibility";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import { AgreementDashboard } from "./AgreementDashboard";
import { ArbiterActions } from "./ArbiterActions";
import { TenantFundAction } from "./TenantFundAction";
import { FundingLedger } from "./FundingLedger";
import { ClaimSection } from "./ClaimSection";
import { ResponseSection } from "./ResponseSection";
import { DisputeResolutionSection } from "./DisputeResolutionSection";
import { TimeoutSection } from "./TimeoutSection";
import { WithdrawSection } from "./WithdrawSection";
import { ArbiterReplacementSection } from "./ArbiterReplacementSection";
import { NextAction } from "./NextAction";
import { ProposalActions } from "./ProposalActions";
import { AgreementNoticeCenter } from "./AgreementNoticeCenter";
import type { NegotiationAccess, NegotiationRecord } from "../lib/negotiations";
import "./AgreementCard.css";

export type AgreementPanel = "summary" | "funds" | "claims";
export type AgreementFocusRequest = {
  targetId: string;
  nonce: number;
};

const PANELS: AgreementPanel[] = ["summary", "funds", "claims"];
const PANEL_LABELS: Record<AgreementPanel, string> = {
  summary: "Summary",
  funds: "Funds & withdrawals",
  claims: "Claims & resolution",
};

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
  activePanel,
  onPanelChange,
  focusRequest,
}: {
  id: bigint;
  onRemove?: () => void;
  onUnavailable?: () => void;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  activePanel?: AgreementPanel;
  onPanelChange?: (panel: AgreementPanel) => void;
  focusRequest?: AgreementFocusRequest;
}) {
  const { agreement, exists, isLoading, error, refetch } = useAgreement(id);
  const [localPanel, setLocalPanel] = useState<AgreementPanel | null>(null);
  const tabRefs = useRef<Partial<Record<AgreementPanel, HTMLButtonElement | null>>>({});
  const handledFocusNonce = useRef<number | null>(null);

  useEffect(() => {
    if (!focusRequest || isLoading || error || !exists || !agreement) return;
    if (handledFocusNonce.current === focusRequest.nonce) return;
    const target =
      document.getElementById(focusRequest.targetId) ||
      document.getElementById(`agreement-${id.toString()}`);
    if (!target) return;
    handledFocusNonce.current = focusRequest.nonce;
    target?.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: "start",
    });
    target?.focus({ preventScroll: true });
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
      <div className="card">
        <p>{agreementReference(id)} could not be loaded right now.</p>
        <button className="btn btn-ghost" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const selectedPanel =
    activePanel || localPanel || defaultPanelForAgreement(agreement);
  const agreementKey = id.toString();

  // Every action component calls this on success so the dashboard reflects the
  // new state immediately, instead of waiting up to 5s for the next poll.
  const onRefetch = () => void refetch();

  function selectPanel(panel: AgreementPanel, focusTab = false) {
    setLocalPanel(panel);
    onPanelChange?.(panel);
    if (focusTab) {
      window.requestAnimationFrame(() => tabRefs.current[panel]?.focus());
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = PANELS.indexOf(selectedPanel);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % PANELS.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + PANELS.length) % PANELS.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = PANELS.length - 1;
    else return;
    event.preventDefault();
    selectPanel(PANELS[nextIndex], true);
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
        {PANELS.map((panel) => {
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
          <div className="agreement-panel-heading">
            <span className="eyebrow">Funding and payouts</span>
            <h3>Funds &amp; withdrawals</h3>
            <p>
              Contributions and ownership are read directly from the agreement. Withdrawable
              amounts update after a claim or refund is resolved
            </p>
          </div>
          {(ARBITER_UI_ENABLED || agreement.arbiter !== ZERO_ADDRESS) && (
            <ArbiterActions id={id} agreement={agreement} onRefetch={onRefetch} />
          )}
          <ProposalActions id={id} agreement={agreement} onRefetch={onRefetch} />
          <FundingLedger
            id={id}
            agreement={agreement}
            participantRecord={participantRecord}
          />
          <TenantFundAction
            id={id}
            agreement={agreement}
            negotiationAccess={negotiationAccess}
            participantRecord={participantRecord}
            onRefetch={onRefetch}
          />
          <WithdrawSection
            id={id}
            agreement={agreement}
            negotiationAccess={negotiationAccess}
            onRefetch={onRefetch}
          />
      </section>

      <section
        className="agreement-panel"
        id={`agreement-${agreementKey}-panel-claims`}
        role="tabpanel"
        aria-labelledby={`agreement-${agreementKey}-tab-claims`}
        tabIndex={0}
        hidden={selectedPanel !== "claims"}
      >
          <div className="agreement-panel-heading">
            <span className="eyebrow">Move-out workflow</span>
            <h3>Claims &amp; resolution</h3>
            <p>Submit or review deductions, respond, resolve disputes, and complete deadlines.</p>
          </div>
          <ClaimSection
            id={id}
            agreement={agreement}
            onRefetch={onRefetch}
            negotiationAccess={negotiationAccess}
          />
          <ResponseSection
            id={id}
            agreement={agreement}
            onRefetch={onRefetch}
            negotiationAccess={negotiationAccess}
          />
          <DisputeResolutionSection
            id={id}
            agreement={agreement}
            onRefetch={onRefetch}
            negotiationAccess={negotiationAccess}
          />
          {(ARBITER_UI_ENABLED || agreement.arbiter !== ZERO_ADDRESS) && (
            <ArbiterReplacementSection
              id={id}
              agreement={agreement}
              onRefetch={onRefetch}
            />
          )}
          <TimeoutSection
            id={id}
            agreement={agreement}
            negotiationAccess={negotiationAccess}
            onRefetch={onRefetch}
          />
      </section>

      {onRemove && (
        <button className="btn btn-ghost small stop-tracking" onClick={onRemove}>
          Stop tracking this agreement
        </button>
      )}
    </article>
  );
}
