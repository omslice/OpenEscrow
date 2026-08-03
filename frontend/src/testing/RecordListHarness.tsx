/* oxlint-disable react/only-export-components -- This test-only entry mounts one deterministic browser harness. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RecordListItem } from "../components/RecordListItem";
import "../index.css";
import "../App.css";

const RECORDS = [
  {
    key: "agreement-one",
    reference: "OE-A-000002",
    proposal: "OE-P-1111111 · onchain ID 1",
  },
  {
    key: "agreement-two",
    reference: "OE-A-000003",
    proposal: "OE-P-2222222 · onchain ID 2",
  },
];

function RecordListHarness() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [archiveCount, setArchiveCount] = useState(0);

  return (
    <main className="app-shell">
      <section className="record-workspace" aria-labelledby="record-list-title">
        <div className="workspace-section-heading">
          <span className="eyebrow">Rendered regression</span>
          <h1 id="record-list-title">Proposal and agreement record</h1>
        </div>
        <div className="record-list" role="list" aria-label="Current records">
          {RECORDS.map((record) => {
            const isExpanded = Boolean(expanded[record.key]);
            return (
              <RecordListItem
                key={record.key}
                id={`record-${record.key}`}
                detailsId={`details-${record.key}`}
                expanded={isExpanded}
                eyebrow="Finalized agreement record"
                reference={record.reference}
                meta={record.proposal}
                dataRecordKey={record.key}
                onToggle={() =>
                  setExpanded((current) => ({
                    ...current,
                    [record.key]: !current[record.key],
                  }))
                }
                actions={
                  <>
                    <span className="negotiation-status status-finalized">
                      finalized · revision 1
                    </span>
                    <button
                      className="btn btn-ghost small"
                      type="button"
                      onClick={() => setArchiveCount((current) => current + 1)}
                    >
                      Archive
                    </button>
                  </>
                }
              >
                <section
                  className="card"
                  data-testid="mounted-record-tools"
                  aria-label={`Loaded tools for ${record.reference}`}
                >
                  {record.reference} record tools are mounted.
                </section>
              </RecordListItem>
            );
          })}
        </div>
        <output data-testid="archive-count" hidden>
          {archiveCount}
        </output>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<RecordListHarness />);
