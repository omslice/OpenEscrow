import { ZERO_ADDRESS } from "../contracts/config";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import type { NegotiationAccess } from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { ArbiterReplacementSection } from "./ArbiterReplacementSection";
import { ClaimSection } from "./ClaimSection";
import { DisputeResolutionSection } from "./DisputeResolutionSection";
import { ResponseSection } from "./ResponseSection";
import { TimeoutSection } from "./TimeoutSection";

export function AgreementClaimsPanel({
  id,
  agreement,
  negotiationAccess,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  onRefetch: () => void;
}) {
  return (
    <>
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
    </>
  );
}
