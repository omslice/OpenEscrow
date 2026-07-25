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

export function AgreementCard({ id, onRemove }: { id: bigint; onRemove?: () => void }) {
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
    <div className="card agreement-card">
      <AgreementDashboard id={id} agreement={agreement} />
      <AgreementNoticeCenter agreement={agreement} />
      <NextAction agreement={agreement} />
      <ArbiterActions id={id} agreement={agreement} onRefetch={onRefetch} />
      <ProposalActions id={id} agreement={agreement} onRefetch={onRefetch} />
      <TenantFundAction id={id} agreement={agreement} onRefetch={onRefetch} />
      <ClaimSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <ResponseSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <DisputeResolutionSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <ArbiterReplacementSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <TimeoutSection id={id} agreement={agreement} onRefetch={onRefetch} />
      <WithdrawSection id={id} agreement={agreement} onRefetch={onRefetch} />
      {onRemove && (
        <button className="btn btn-ghost small" onClick={onRemove}>
          Stop tracking this agreement
        </button>
      )}
    </div>
  );
}
