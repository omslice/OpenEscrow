/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { createRoot } from "react-dom/client";
import { ActivityProofVerifier } from "../components/ActivityProofVerifier";
import { ArbiterReplacementSection } from "../components/ArbiterReplacementSection";
import { ClaimSection } from "../components/ClaimSection";
import { DisputeResolutionSection } from "../components/DisputeResolutionSection";
import { PrivateActivityPublisher } from "../components/PrivateActivityPublisher";
import { ProposalActions } from "../components/ProposalActions";
import { ResponseSection } from "../components/ResponseSection";
import { TimeoutSection } from "../components/TimeoutSection";
import { WithdrawSection } from "../components/WithdrawSection";
import { Phase, ZERO_ADDRESS } from "../contracts/config";
import {
  rememberLandlordBundle,
  type CreatedNegotiation,
  type NegotiationAccess,
  type NegotiationRecord,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import "../index.css";
import "../App.css";

const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;
const ARBITER = "0x4444444444444444444444444444444444444444" as const;
const REPLACEMENT_ARBITER = "0x5555555555555555555555555555555555555555" as const;
const search = new URLSearchParams(window.location.search);
const role = search.get("role");
const flow = search.get("flow");
const agreementId = BigInt(search.get("agreement") || "43");
const claimTransactionWrites = Number(
  window.sessionStorage.getItem("openescrow:test:claim-transaction-writes") ||
    "0",
);
const responseTransactionWrites = Number(
  window.sessionStorage.getItem(
    "openescrow:test:response-transaction-writes",
  ) || "0",
);
const rulingTransactionWrites = Number(
  window.sessionStorage.getItem("openescrow:test:ruling-transaction-writes") ||
    "0",
);
const withdrawalTransactionWrites = Number(
  window.sessionStorage.getItem(
    "openescrow:test:withdrawal-transaction-writes",
  ) || "0",
);
const timeoutTransactionWrites = Number(
  window.sessionStorage.getItem(
    `openescrow:test:${flow || "unknown"}-transaction-writes`,
  ) || "0",
);
const proposalCancellationTransactionWrites = Number(
  window.sessionStorage.getItem(
    "openescrow:test:proposal-cancellation-transaction-writes",
  ) || "0",
);

function agreementPhase() {
  if (flow === "claim-receipt") {
    return claimTransactionWrites === 0 ? Phase.Active : Phase.ClaimOpen;
  }
  if (flow === "response-receipt") {
    return responseTransactionWrites === 0 ? Phase.ClaimOpen : Phase.Disputed;
  }
  if (flow === "ruling-receipt") {
    return rulingTransactionWrites === 0 ? Phase.Disputed : Phase.Closed;
  }
  if (flow === "withdrawal-receipt") return Phase.Closed;
  if (flow === "no-claim-timeout-receipt") {
    return timeoutTransactionWrites === 0 ? Phase.Active : Phase.Closed;
  }
  if (flow === "no-response-timeout-receipt") {
    return timeoutTransactionWrites === 0 ? Phase.ClaimOpen : Phase.Disputed;
  }
  if (flow === "arbiter-timeout-receipt") {
    return timeoutTransactionWrites === 0 ? Phase.Disputed : Phase.Closed;
  }
  if (flow === "proposal-cancellation-receipt") {
    return proposalCancellationTransactionWrites === 0
      ? Phase.Proposed
      : Phase.Cancelled;
  }
  return Phase.ClaimOpen;
}

const agreement: Agreement = {
  landlord: LANDLORD,
  arbiterAccepted: false,
  arbiterDeclined: false,
  arbiterResigned: false,
  claimAmended: false,
  pendingArbiterConfirmed: false,
  tenant: TENANT,
  phase: agreementPhase(),
  closeReason: 0,
  arbiter:
    flow === "arbiter-replacement-recovery"
      ? REPLACEMENT_ARBITER
      : role === "arbiter"
        ? ARBITER
        : ZERO_ADDRESS,
  pendingArbiter: ZERO_ADDRESS,
  pendingArbiterProposer: ZERO_ADDRESS,
  token: "0x3333333333333333333333333333333333333333",
  agreedAmount: 1_000_000n,
  depositAmount: 1_000_000n,
  fundedAt: 1n,
  claimWindowStart: 1n,
  claimPeriod: 86_400n,
  responsePeriod: 86_400n,
  arbiterRulingPeriod: 86_400n,
  claimSubmissionDeadline: 2n,
  responseDeadline: 3n,
  disputeCreatedAt: 0n,
  arbiterRulingDeadline: 0n,
  claimedAmount: 500_000n,
  tenantWithdrawable:
    flow === "withdrawal-receipt" && withdrawalTransactionWrites === 0
      ? 500_000n
      : 0n,
  landlordWithdrawable: 0n,
  locked: 1_000_000n,
  withdrawn: 0n,
};

const access: NegotiationAccess = {
  proposalId: "OE-P-RECOVERY",
  role: role === "tenant" ? "tenant" : role === "arbiter" ? "arbiter" : "landlord",
  token: "synthetic-private-record-recovery-token",
  source: "invite",
};

const arbiterReplacementParticipantRecord = {
  id: access.proposalId,
  status: "finalized",
  revision: 1,
  arbiterReplacement: {
    email: "replacement-arbiter@example.test",
    wallet: REPLACEMENT_ARBITER,
    status: "confirmed",
    proposedByRole: "landlord",
    proposedAt: "2026-07-31T00:00:00.000Z",
    confirmedAt: "2026-07-31T00:05:00.000Z",
  },
} as unknown as NegotiationRecord;
const finalizedParticipantRecord = {
  id: access.proposalId,
  status: "finalized",
  revision: 1,
} as unknown as NegotiationRecord;

if (role !== "tenant" && role !== "arbiter") {
  rememberLandlordBundle({
    record: { id: access.proposalId },
    access: {
      landlord: access.token,
      tenant: "synthetic-tenant-invitation-token",
      tenants: [],
      arbiter: null,
    },
  } as CreatedNegotiation);
}

createRoot(document.getElementById("root")!).render(
  <main className="app-shell">
    <section className="card">
      {flow === "withdrawal-receipt" ? (
        <WithdrawSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
        />
      ) : flow?.endsWith("timeout-receipt") ? (
        <TimeoutSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
        />
      ) : flow === "proposal-cancellation-receipt" ? (
        <ProposalActions
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
          participantRecord={finalizedParticipantRecord}
        />
      ) : flow === "activity-receipt" ? (
        <>
          <PrivateActivityPublisher
            agreementId={agreementId}
            negotiationAccess={access}
            onPublished={() => undefined}
          />
          <ActivityProofVerifier agreementId={agreementId} />
        </>
      ) : flow === "arbiter-replacement-recovery" ? (
        <ArbiterReplacementSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
          participantRecord={arbiterReplacementParticipantRecord}
        />
      ) : role === "tenant" ? (
        <ResponseSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
        />
      ) : role === "arbiter" ? (
        <DisputeResolutionSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
        />
      ) : (
        <ClaimSection
          id={agreementId}
          agreement={agreement}
          negotiationAccess={access}
        />
      )}
    </section>
  </main>,
);
