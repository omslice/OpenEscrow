import {
  closeReasonLabel,
  Phase,
  YIELD_USDC_ADDRESS,
  ZERO_ADDRESS,
} from "../contracts/config";
import { claimAmountUnit } from "../lib/agreementAmountDisplay";
import { ARBITER_UI_ENABLED } from "../lib/featureFlags";
import { formatUSDC } from "../lib/format";
import type { NegotiationAccess, NegotiationRecord } from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import { ArbiterReplacementSection } from "./ArbiterReplacementSection";
import { ClaimSection } from "./ClaimSection";
import { DisputeResolutionSection } from "./DisputeResolutionSection";
import { EvidenceList } from "./EvidenceList";
import { ResponseSection } from "./ResponseSection";
import { TimeoutSection } from "./TimeoutSection";

export function AgreementClaimsPanel({
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
  const amountUnit = claimAmountUnit(agreement.token, YIELD_USDC_ADDRESS);
  const responseEvents = (participantRecord?.events || []).filter(
    (event) => event.action === "claim_response_submitted",
  );
  const claimStatus =
    agreement.phase === Phase.Closed
      ? "Claim workflow complete"
      : agreement.phase === Phase.Disputed
        ? "Tenant response recorded"
        : agreement.phase === Phase.ClaimOpen
          ? "Deduction claim awaiting responses"
          : agreement.phase === Phase.Active
            ? "Move-out claim period"
            : "Claims are not open yet";

  return (
    <>
      <div className="agreement-panel-heading">
        <span className="eyebrow">Move-out workflow</span>
        <h3>Claims &amp; resolution</h3>
        <p>Submit or review deductions, respond, resolve disputes, and complete deadlines.</p>
      </div>
      <section className="claim-workflow-summary" aria-label="Current claim status">
        <strong>{claimStatus}</strong>
        {agreement.claimedAmount > 0n ? (
          <p>
            Recorded deduction: {formatUSDC(agreement.claimedAmount)} {amountUnit}.
            {agreement.phase === Phase.Closed && agreement.closeReason
              ? ` Outcome: ${closeReasonLabel[agreement.closeReason] || "Closed"}.`
              : ""}
          </p>
        ) : (
          <p>
            {agreement.phase === Phase.Active
              ? "The landlord can submit a documented deduction after the agreed claim window opens."
              : "No deduction claim is recorded for this agreement."}
          </p>
        )}
        {responseEvents.length > 0 && (
          <ul>
            {responseEvents.map((event) => (
              <li key={event.id}>{event.summary}</li>
            ))}
          </ul>
        )}
        {agreement.phase === Phase.Closed && (
          <p className="hint">
            Review available balances under Funds &amp; withdrawals. The timestamped Record preserves
            the complete claim history.
          </p>
        )}
      </section>
      {agreement.claimedAmount > 0n && (
        <EvidenceList id={id} negotiationAccess={negotiationAccess} />
      )}
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
          negotiationAccess={negotiationAccess}
          participantRecord={participantRecord}
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
