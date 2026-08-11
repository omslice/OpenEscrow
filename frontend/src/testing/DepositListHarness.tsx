/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DepositAgreementListItem } from "../components/DepositAgreementListItem";
import {
  resolveExpandedDepositId,
  toggleExpandedDepositId,
  type RequestedDepositId,
} from "../lib/depositListSelection";
import "../index.css";
import "../App.css";

const DEPOSITS = [
  { id: 1n, propertyAddress: "101 Test Street, Austin, TX", needsFunding: true },
  { id: 2n, propertyAddress: "202 Pilot Avenue, Seattle, WA", needsFunding: false },
];

function DepositListHarness() {
  const [requestedId, setRequestedId] = useState<RequestedDepositId>(null);
  const expandedId = resolveExpandedDepositId(
    requestedId,
    DEPOSITS.map((deposit) => deposit.id.toString()),
  );

  return (
    <main className="app-shell">
      <section className="card" aria-labelledby="deposit-list-title">
        <span className="eyebrow">Rendered regression</span>
        <h1 id="deposit-list-title">Active security deposits</h1>
        <div className="deposit-list" role="list" aria-label="Active security deposits">
          {DEPOSITS.map((deposit) => {
            const key = deposit.id.toString();
            const expanded = expandedId === key;
            return (
              <DepositAgreementListItem
                key={key}
                id={deposit.id}
                propertyAddress={deposit.propertyAddress}
                needsFunding={deposit.needsFunding}
                expanded={expanded}
                onToggle={() =>
                  setRequestedId(toggleExpandedDepositId(expandedId, key))
                }
              >
                <section
                  className="card"
                  data-testid="live-deposit-detail"
                  aria-label={`Loaded details for deposit ${key}`}
                >
                  Deposit {key} live details are mounted.
                </section>
              </DepositAgreementListItem>
            );
          })}
        </div>
        <output data-testid="expanded-deposit" hidden>
          {expandedId || "none"}
        </output>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<DepositListHarness />);
