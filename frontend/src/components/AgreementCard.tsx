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

export function AgreementCard({ id, onRemove }: { id: bigint; onRemove?: () => void }) {
  const { agreement, exists, isLoading, error } = useAgreement(id);

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

  return (
    <div className="card agreement-card">
      <AgreementDashboard id={id} agreement={agreement} />
      <ArbiterActions id={id} agreement={agreement} />
      <TenantFundAction id={id} agreement={agreement} />
      <ClaimSection id={id} agreement={agreement} />
      <ResponseSection id={id} agreement={agreement} />
      <DisputeResolutionSection id={id} agreement={agreement} />
      <ArbiterReplacementSection id={id} agreement={agreement} />
      <TimeoutSection id={id} agreement={agreement} />
      <WithdrawSection id={id} agreement={agreement} />
      {onRemove && (
        <button className="btn btn-ghost small" onClick={onRemove}>
          Stop tracking this agreement
        </button>
      )}
    </div>
  );
}
