/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { getDepositAsset } from "../../shared/deposit-assets.js";
import { FiatFundingOption } from "../components/FiatFundingOption";
import type { NegotiationAccess } from "../lib/negotiations";
import "../index.css";
import "../App.css";

type ScopeId = "agreement-a-tenant-1" | "agreement-b-tenant-1" | "agreement-a-tenant-2";

type FundingScope = {
  label: string;
  tenantId: string;
  access: NegotiationAccess;
};

const FUNDING_SCOPES: Record<ScopeId, FundingScope> = {
  "agreement-a-tenant-1": {
    label: "Agreement A · tenant 1",
    tenantId: "tenant-a-1",
    access: {
      proposalId: "proposal-a",
      role: "tenant",
      token: "access-a-1",
    },
  },
  "agreement-b-tenant-1": {
    label: "Agreement B · tenant 1",
    tenantId: "tenant-b-1",
    access: {
      proposalId: "proposal-b",
      role: "tenant",
      token: "access-b-1",
    },
  },
  "agreement-a-tenant-2": {
    label: "Agreement A · tenant 2",
    tenantId: "tenant-a-2",
    access: {
      proposalId: "proposal-a",
      role: "tenant",
      token: "access-a-2",
    },
  },
};

const walletAddress = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const originalAmount = 1_250_000n;
const updatedAmount = 2_000_000n;
const depositAsset = getDepositAsset("usdc");

function FundingRecoveryHarness() {
  const [scopeId, setScopeId] = useState<ScopeId>("agreement-a-tenant-1");
  const [amount, setAmount] = useState(originalAmount);
  const scope = FUNDING_SCOPES[scopeId];

  return (
    <main className="app-shell">
      <section className="card" aria-labelledby="funding-recovery-title">
        <span className="eyebrow">Rendered regression</span>
        <h1 id="funding-recovery-title">Funding recovery isolation</h1>
        <p>
          Every scope intentionally uses the same wallet, asset, and amount.
        </p>
        <div className="action-row" aria-label="Funding recovery scopes">
          {(Object.entries(FUNDING_SCOPES) as Array<[ScopeId, FundingScope]>).map(
            ([id, candidate]) => (
              <button
                className="btn btn-ghost"
                type="button"
                key={id}
                aria-pressed={id === scopeId}
                onClick={() => setScopeId(id)}
              >
                Show {candidate.label}
              </button>
            ),
          )}
        </div>
        <p aria-live="polite">
          Current scope: <strong>{scope.label}</strong>
        </p>
        <p aria-live="polite">
          Preview amount: <strong>{amount.toString()} micros</strong>
        </p>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setAmount((current) =>
            current === originalAmount ? updatedAmount : originalAmount
          )}
        >
          {amount === originalAmount ? "Use updated amount" : "Restore original amount"}
        </button>
        <FiatFundingOption
          walletAddress={walletAddress}
          amount={amount}
          depositAsset={depositAsset}
          negotiationAccess={scope.access}
          tenantId={scope.tenantId}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<FundingRecoveryHarness />);
