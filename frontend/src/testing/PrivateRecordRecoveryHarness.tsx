/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { createRoot } from "react-dom/client";
import { ClaimSection } from "../components/ClaimSection";
import { ResponseSection } from "../components/ResponseSection";
import { Phase, ZERO_ADDRESS } from "../contracts/config";
import {
  rememberLandlordBundle,
  type CreatedNegotiation,
  type NegotiationAccess,
} from "../lib/negotiations";
import type { Agreement } from "../lib/useAgreement";
import "../index.css";
import "../App.css";

const LANDLORD = "0x1111111111111111111111111111111111111111" as const;
const TENANT = "0x2222222222222222222222222222222222222222" as const;

const agreement: Agreement = {
  landlord: LANDLORD,
  arbiterAccepted: false,
  arbiterDeclined: false,
  arbiterResigned: false,
  claimAmended: false,
  pendingArbiterConfirmed: false,
  tenant: TENANT,
  phase: Phase.ClaimOpen,
  closeReason: 0,
  arbiter: ZERO_ADDRESS,
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
  tenantWithdrawable: 0n,
  landlordWithdrawable: 0n,
  locked: 1_000_000n,
  withdrawn: 0n,
};

const role = new URLSearchParams(window.location.search).get("role");
const access: NegotiationAccess = {
  proposalId: "OE-P-RECOVERY",
  role: role === "tenant" ? "tenant" : "landlord",
  token: "synthetic-private-record-recovery-token",
  source: "invite",
};

if (role !== "tenant") {
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
      {role === "tenant" ? (
        <ResponseSection
          id={43n}
          agreement={agreement}
          negotiationAccess={access}
        />
      ) : (
        <ClaimSection
          id={43n}
          agreement={agreement}
          negotiationAccess={access}
        />
      )}
    </section>
  </main>,
);
