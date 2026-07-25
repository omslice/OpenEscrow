import { useAgreement } from "../lib/useAgreement";
import { AgreementDashboard } from "./AgreementDashboard";
import { ArbiterActions } from "./ArbiterActions";
import { TenantFundAction } from "./TenantFundAction";
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

export function AgreementCard({
  id,
  onRemove,
  negotiationAccess,
  participantRecord,
}: {
  id: bigint;
  onRemove?: () => void;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
}) {
  const { agreement, exists, isLoading, error, refetch } = useAgreement(id);

  if (isLoading) return <div className="card">Loading agreement #{id.toString()}...</div>;
  if (error || !exists || !agreement) {
    return (
      <div className="card">
        <p>Agreement #{id.toString()} not found on this contract.</p>
        {onRemove && (
          <button className="btn btn-ghost" onClick={onRemove}>
            Remove from tracked list
          </button>
        )}
      </div>
    );
  }

  // Every action component calls this on success so the dashboard reflects the
  // new state immediately, instead of waiting up to 5s for the next poll.
  const onRefetch = () => void refetch();

  return (
    <div className="card agreement-card" id={`agreement-${id.toString()}`} tabIndex={-1}>
      <AgreementDashboard
        id={id}
        agreement={agreement}
        negotiationAccess={negotiationAccess}
        participantRecord={participantRecord}
      />
      <AgreementNoticeCenter agreement={agreement} />
      <NextAction agreement={agreement} />
      <ArbiterActions id={id} agreement={agreement} onRefetch={onRefetch} />
      <ProposalActions id={id} agreement={agreement} onRefetch={onRefetch} />
      <TenantFundAction
        id={id}
        agreement={agreement}
        negotiationAccess={negotiationAccess}
        participantRecord={participantRecord}
        onRefetch={onRefetch}
      />
      <ClaimSection id={id} agreement={agreement} onRefetch={onRefetch} negotiationAccess={negotiationAccess} />
      <ResponseSection id={id} agreement={agreement} onRefetch={onRefetch} negotiationAccess={negotiationAccess} />
      <DisputeResolutionSection id={id} agreement={agreement} onRefetch={onRefetch} negotiationAccess={negotiationAccess} />
      <ArbiterReplacementSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <TimeoutSection
        id={id}
        agreement={agreement}
        negotiationAccess={negotiationAccess}
        onRefetch={onRefetch}
      />
      <WithdrawSection
        id={id}
        agreement={agreement}
        negotiationAccess={negotiationAccess}
        onRefetch={onRefetch}
      />
      {participantRecord && (
        <details className="agreement-activity">
          <summary>Recent agreement activity</summary>
          <ol className="activity-timeline">
            {[...participantRecord.events]
              .reverse()
              .slice(0, 8)
              .map((event) => (
                <li key={event.id}>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                  <strong>{event.actorRole}</strong>
                  <span>{event.summary}</span>
                </li>
              ))}
          </ol>
        </details>
      )}
      {onRemove && (
        <button className="btn btn-ghost small" onClick={onRemove}>
          Stop tracking this agreement
        </button>
      )}
    </div>
  );
}
