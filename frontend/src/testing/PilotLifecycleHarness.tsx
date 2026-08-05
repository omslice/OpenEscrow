/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { createRoot } from "react-dom/client";
import { ClaimSection } from "../components/ClaimSection";
import { DisputeResolutionSection } from "../components/DisputeResolutionSection";
import { RecordSnapshotControls } from "../components/RecordSnapshotControls";
import { ResponseSection } from "../components/ResponseSection";
import { WithdrawSection } from "../components/WithdrawSection";
import { Phase, ZERO_ADDRESS } from "../contracts/config";
import { formatUSDC } from "../lib/format";
import type { Agreement } from "../lib/useAgreement";
import type { PilotLifecycleRole } from "./pilotLifecycleTypes";
import "../index.css";
import "../App.css";

const ADDRESSES: Record<PilotLifecycleRole, `0x${string}`> = {
  landlord: "0x1111111111111111111111111111111111111111",
  "tenant-one": "0x2222222222222222222222222222222222222222",
  "tenant-two": "0x3333333333333333333333333333333333333333",
  arbiter: "0x4444444444444444444444444444444444444444",
};

const state = window.__OPENESCROW_PILOT_LIFECYCLE__;
if (!state) throw new Error("The rendered pilot lifecycle did not receive state.");

const phase =
  state.stage === "funded"
    ? Phase.Active
    : state.stage === "claim-open"
      ? Phase.ClaimOpen
      : state.stage === "disputed"
        ? Phase.Disputed
        : Phase.Closed;

const agreement: Agreement = {
  landlord: ADDRESSES.landlord,
  tenant: ADDRESSES["tenant-one"],
  arbiter: ADDRESSES.arbiter,
  pendingArbiter: ZERO_ADDRESS,
  pendingArbiterProposer: ZERO_ADDRESS,
  token: "0x5555555555555555555555555555555555555555",
  phase,
  closeReason: state.stage === "closed" ? 2 : 0,
  arbiterAccepted: true,
  arbiterDeclined: false,
  arbiterResigned: false,
  claimAmended: false,
  pendingArbiterConfirmed: false,
  agreedAmount: 1_000_000_000n,
  depositAmount: 1_000_000_000n,
  fundedAt: 1n,
  claimWindowStart: 1n,
  claimPeriod: 86_400n,
  responsePeriod: 86_400n,
  arbiterRulingPeriod: 86_400n,
  claimSubmissionDeadline: 2n,
  responseDeadline: 3n,
  disputeCreatedAt: state.stage === "disputed" ? 4n : 0n,
  arbiterRulingDeadline: state.stage === "disputed" ? 5n : 0n,
  claimedAmount: BigInt(state.claimAmountMicros),
  tenantWithdrawable: BigInt(state.tenantWithdrawableMicros),
  landlordWithdrawable: BigInt(state.landlordWithdrawableMicros),
  locked:
    state.stage === "disputed"
      ? BigInt(state.disputedMicros)
      : state.stage === "closed"
        ? 0n
        : 1_000_000_000n,
  withdrawn: 0n,
};

const roleLabels: Record<PilotLifecycleRole, string> = {
  landlord: "Landlord",
  "tenant-one": "Tenant one",
  "tenant-two": "Tenant two",
  arbiter: "Arbiter",
};

function reloadCurrentState() {
  window.location.reload();
}

function PilotLifecycleHarness() {
  const isLandlord = state.role === "landlord";
  const isTenant = state.role === "tenant-one" || state.role === "tenant-two";
  const isArbiter = state.role === "arbiter";

  return (
    <main className="app-shell">
      <section className="card" aria-labelledby="pilot-lifecycle-title">
        <span className="eyebrow">Credential-free rendered rehearsal</span>
        <h1 id="pilot-lifecycle-title">Multi-party deposit resolution</h1>
        <p>
          Viewing as <strong>{roleLabels[state.role]}</strong>. This fixture uses
          synthetic identities and no-money transactions.
        </p>
        <p data-testid="pilot-stage" aria-live="polite">
          Lifecycle status: <strong>{state.stage}</strong>
        </p>
        {state.stage === "closed" && (
          <div className="status-grid" aria-label="Resolved allocation summary">
            <p>Landlord allocation: 225 USDC</p>
            <p>Tenant one allocation: 465 USDC</p>
            <p>Tenant two allocation: 310 USDC</p>
          </div>
        )}
        {isLandlord && (
          <ClaimSection
            id={43n}
            agreement={agreement}
            negotiationAccess={state.access}
            onRefetch={reloadCurrentState}
          />
        )}
        {isTenant && (
          <ResponseSection
            id={43n}
            agreement={agreement}
            negotiationAccess={state.access}
            onRefetch={reloadCurrentState}
          />
        )}
        {isArbiter && (
          <DisputeResolutionSection
            id={43n}
            agreement={agreement}
            negotiationAccess={state.access}
            onRefetch={reloadCurrentState}
          />
        )}
        {(isLandlord || isTenant) && (
          <WithdrawSection
            id={43n}
            agreement={agreement}
            negotiationAccess={state.access}
            onRefetch={reloadCurrentState}
          />
        )}
      </section>
      {isLandlord && state.stage === "closed" && (
        <section className="card" aria-labelledby="pilot-record-title">
          <span className="eyebrow">Complete private record</span>
          <h2 id="pilot-record-title">Download and verify the lifecycle</h2>
          <p>
            The report must include the claim, both tenant decisions, the ruling,
            and all completed withdrawals recorded so far.
          </p>
          <RecordSnapshotControls access={state.access} agreementId={43n} />
        </section>
      )}
      <output className="sr-only" data-testid="viewer-withdrawable">
        {formatUSDC(
          state.role === "landlord"
            ? BigInt(state.landlordWithdrawableMicros)
            : BigInt(state.tenantWithdrawableMicros),
        )}
      </output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PilotLifecycleHarness />);
