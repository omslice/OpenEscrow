import { ZERO_ADDRESS } from "../contracts/config";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import type {
  NegotiationAccess,
  NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { ArbiterActions } from "./ArbiterActions";
import { FundingLedger } from "./FundingLedger";
import { ProposalActions } from "./ProposalActions";
import { TenantFundAction } from "./TenantFundAction";
import { WithdrawSection } from "./WithdrawSection";

export function AgreementFundsPanel({
  id,
  agreement,
  negotiationAccess,
  participantRecord,
  onRefetch,
}: {
  id: bigint;
  agreement: Agreement;
  negotiationAccess?: NegotiationAccess | null;
  participantRecord?: NegotiationRecord | null;
  onRefetch: () => void;
}) {
  return (
    <>
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
    </>
  );
}
