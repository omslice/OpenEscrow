import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Layout } from "./Layout";
import { RecordListItem } from "./RecordListItem";
import { PublicIntro } from "./PublicIntro";
import {
  applySampleAction, createSampleAgreements, sampleActions, sampleBalance, sampleMoney,
  visibleSampleAgreements, SAMPLE_DATE, SAMPLE_LABELS, SAMPLE_LANDLORD, SAMPLE_TENANT,
  type SampleAgreement, type SampleDocument, type SampleRole, type SampleAction,
} from "../lib/sampleData";
import "./SampleWorkspace.css";

const tabs = [
  { id: "about", label: "About" }, { id: "overview", label: "Dashboard" },
  { id: "proposals", label: "Proposals" }, { id: "agreements", label: "Deposits" },
  { id: "record", label: "Record" },
];
const detailTabs = [
  { id: "summary", label: "Summary" }, { id: "funds", label: "Funds & withdrawals" },
  { id: "claims", label: "Claims & resolution" }, { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
];

function SampleTabs({ items, selected, onSelect, prefix, label }: {
  items: { id: string; label: string }[]; selected: string; onSelect: (id: string) => void; prefix: string; label: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onSelect(items[next].id);
    document.getElementById(`${prefix}-tab-${items[next].id}`)?.focus();
  }
  return <nav className="tabs sample-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.id} id={`${prefix}-tab-${item.id}`}
      className={`tab${selected === item.id ? " active" : ""}`} type="button" role="tab"
      aria-selected={selected === item.id} aria-controls={`${prefix}-panel-${item.id}`}
      tabIndex={selected === item.id ? 0 : -1} onClick={() => onSelect(item.id)} onKeyDown={(event) => onKeyDown(event, index)}>
      {item.label}
    </button>)}
  </nav>;
}

function SampleDocumentPreview({ document: sampleDocument, onClose }: { document: SampleDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="sample-document-dialog" aria-labelledby="sample-document-title" onCancel={onClose}>
    <div className="sample-document-heading">
      <div><span className="sample-badge">Sample document · Fictional</span><h2 id="sample-document-title">{sampleDocument.title}</h2></div>
      <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>Close document</button>
    </div>
    <p className="hint">{sampleDocument.date} · {sampleDocument.id}</p>
    {sampleDocument.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <p className="sample-document-footer">For product exploration only. No real file, signature, or account data is used.</p>
  </dialog>;
}

function AgreementDetails({ agreement, role, initialPanel, onAction, onDocument }: {
  agreement: SampleAgreement; role: SampleRole; initialPanel: string;
  onAction: (id: string, action: SampleAction) => void; onDocument: (document: SampleDocument) => void;
}) {
  const [panel, setPanel] = useState(initialPanel);
  const availableActions = sampleActions(agreement, role);
  const balance = sampleBalance(agreement);
  const finalized = agreement.stage !== "proposal";
  const funded = finalized && agreement.stage !== "awaiting-funding";
  const claimReviewed = ["resolved", "complete", "disputed"].includes(agreement.stage);
  const prefix = `sample-detail-${agreement.id}`;
  return <div className="sample-agreement-detail">
    <div className="sample-detail-heading"><div><span className="eyebrow">{agreement.id} · Sample data</span><h3>{agreement.property}</h3></div>
      <span className={`sample-status sample-status-${agreement.stage}`}>{agreement.stage === "proposal" && agreement.approved ? "Approved · ready to finalize" : SAMPLE_LABELS[agreement.stage]}</span>
    </div>
    <SampleTabs items={detailTabs} selected={panel} onSelect={setPanel} prefix={prefix} label={`Details for ${agreement.id}`} />
    {detailTabs.map((item) => <section key={item.id} role="tabpanel" id={`${prefix}-panel-${item.id}`} aria-labelledby={`${prefix}-tab-${item.id}`} hidden={panel !== item.id} tabIndex={0}>
      {panel === item.id && item.id === "summary" && <>
        <dl className="sample-facts">
          <div><dt>Landlord</dt><dd>{SAMPLE_LANDLORD}</dd></div><div><dt>Tenant</dt><dd>{agreement.tenant}</dd></div>
          <div><dt>Fictional contact</dt><dd>{agreement.email}</dd></div><div><dt>Rental period</dt><dd>{agreement.period}</dd></div>
          <div><dt>Security deposit</dt><dd>{sampleMoney(agreement.deposit)}</dd></div><div><dt>Asset</dt><dd>Plain test token · no yield</dd></div>
        </dl>
        <h4>Agreement milestones</h4>
        <ol className="sample-milestones">
          <li><span aria-hidden="true">{agreement.approved ? "✓" : "○"}</span><div><strong>Review and approve terms</strong><p>{agreement.approved ? "The fictional tenant approved the terms." : "Revision 2 is waiting for Avery’s approval."}</p></div></li>
          <li><span aria-hidden="true">{finalized ? "✓" : "○"}</span><div><strong>Finalize agreement</strong><p>{finalized ? "The sample agreement has been finalized." : "The landlord finalizes after the tenant approves."}</p></div></li>
          <li><span aria-hidden="true">{funded ? "✓" : "○"}</span><div><strong>Fund the deposit</strong><p>{funded ? `${sampleMoney(agreement.deposit)} recorded as sample funding.` : "The tenant funds after finalization."}</p></div></li>
          <li><span aria-hidden="true">{agreement.claim || agreement.stage === "complete" ? "✓" : "○"}</span><div><strong>Review move-out and deductions</strong><p>{agreement.claim ? "A $180 cleaning deduction is documented for review." : `Sample move-out: ${agreement.moveOut}.`}</p></div></li>
          <li><span aria-hidden="true">{agreement.stage === "complete" ? "✓" : "○"}</span><div><strong>Withdraw allocated funds</strong><p>{agreement.stage === "complete" ? "All sample funds have been withdrawn." : "Withdrawals follow the agreed outcome and applicable process."}</p></div></li>
        </ol>
      </>}
      {panel === item.id && item.id === "funds" && <>
        <div className="sample-balance-grid">
          <div><span>Original deposit</span><strong>{sampleMoney(agreement.deposit)}</strong></div>
          <div><span>Remaining sample balance</span><strong>{sampleMoney(balance)}</strong></div>
          <div><span>Tenant withdrawals</span><strong>{sampleMoney(agreement.tenantWithdrawn)}</strong></div>
        </div>
        {agreement.stage === "resolved" && <p>Allocated to tenant: {sampleMoney(agreement.deposit - agreement.claim)}. Allocated to landlord: {sampleMoney(agreement.claim)}. Each party withdraws their own share.</p>}
        <h4>Sample transaction history</h4>
        {agreement.transactions.length ? <ul className="sample-transactions">{agreement.transactions.map((transaction) => <li key={transaction.reference}>
          <div><strong>{transaction.label}</strong><small>{transaction.date} · {transaction.reference}</small></div><strong>{sampleMoney(transaction.amount)}</strong>
        </li>)}</ul> : <p className="hint">No funding yet. The deposit amount is a proposed term, not an account balance.</p>}
        <p className="hint">All amounts and transaction references are fictional. There are no blockchain receipts in this demo.</p>
      </>}
      {panel === item.id && item.id === "claims" && <>
        <h4>{agreement.claim ? "Cleaning deduction" : "No deduction claim"}</h4>
        {agreement.claim ? <>
          <p><strong>{sampleMoney(agreement.claim)}</strong> requested by {SAMPLE_LANDLORD} on September 10, 2026 for kitchen and bathroom cleaning. Review the sample invoice and move-in condition note before responding.</p>
          <p>Sample response due: September 24, 2026. These illustrative dates are frozen for the demo.</p>
          <button className="btn btn-ghost" type="button" onClick={() => onDocument(agreement.documents.find((document) => document.id.endsWith("INVOICE"))!)}>View sample invoice</button>
          {agreement.stage === "disputed" ? <p className="sample-callout">The sample claim is disputed. This example pauses at resolution: real disputes follow the applicable process, and the disputed funds are not released here.</p>
            : claimReviewed ? <p className="sample-callout">The sample deduction was accepted. Open Funds &amp; withdrawals to inspect the allocation.</p>
              : <p className="sample-callout">{role === "tenant" ? "You are viewing this as Avery. You can simulate accepting or disputing the deduction below." : "Awaiting Avery’s response. Switch to Tenant view to explore that response."}</p>}
        </> : <p>{agreement.stage === "complete" ? "No deductions were submitted. The full deposit was refunded in the sample record." : "No deduction has been submitted for this sample agreement. Deductions are reviewed during the move-out process."}</p>}
      </>}
      {panel === item.id && item.id === "documents" && <>
        <h4>Shared sample documents</h4><p className="hint">Open a fictional document to see what participants might review. No uploads or real files are involved.</p>
        <div className="sample-document-list">{agreement.documents.map((document) => <button key={document.id} className="sample-document-button" type="button" onClick={() => onDocument(document)}>
          <span><strong>{document.title}</strong><small>{document.date} · Sample</small></span><span aria-hidden="true">Open →</span>
        </button>)}</div>
      </>}
      {panel === item.id && item.id === "activity" && <>
        <h4>Shared sample activity</h4><ol className="sample-activity">{[...agreement.activity].reverse().map((activity, index) => <li key={`${activity.date}-${index}`}>
          <strong>{activity.actor}</strong><p>{activity.summary}</p><small>{activity.date}</small>
        </li>)}</ol>
      </>}
    </section>)}
    {availableActions.length > 0 && <div className="sample-action-area"><p><strong>Try a simulated action.</strong> Only this sample workspace changes.</p>
      <div className="sample-actions">{availableActions.map(({ action, label }) => <button key={action} className="btn btn-secondary" type="button" onClick={() => onAction(agreement.id, action)}>{label}</button>)}</div>
    </div>}
    {agreement.stage === "proposal" && !availableActions.length && <p className="sample-callout">{role === "landlord" ? "Switch to Tenant view to approve Avery’s sample proposal." : "Terms approved. Switch to Landlord view to finalize the sample agreement."}</p>}
    {agreement.stage === "awaiting-funding" && role === "landlord" && <p className="sample-callout">Switch to Tenant view to simulate funding the finalized deposit.</p>}
  </div>;
}

export function SampleWorkspace() {
  const [agreements, setAgreements] = useState(createSampleAgreements);
  const [role, setRole] = useState<SampleRole>("landlord");
  const [tab, setTab] = useState("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialPanel, setInitialPanel] = useState("summary");
  const [sampleDocument, setSampleDocument] = useState<SampleDocument | null>(null);
  const documentTrigger = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState("");
  const visible = visibleSampleAgreements(agreements, role);
  const proposals = visible.filter((agreement) => agreement.stage === "proposal");
  const deposits = visible.filter((agreement) => agreement.stage !== "proposal");
  const attention = visible.filter((agreement) => sampleActions(agreement, role).length > 0);
  const name = role === "landlord" ? SAMPLE_LANDLORD : SAMPLE_TENANT;

  function selectTab(next: string) {
    setTab(next); setSelectedId(null); setInitialPanel(next === "record" ? "documents" : "summary");
  }
  function openAgreement(agreement: SampleAgreement, nextTab = agreement.stage === "proposal" ? "proposals" : "agreements", panel = "summary") {
    setTab(nextTab); setSelectedId(agreement.id); setInitialPanel(panel);
    window.requestAnimationFrame(() => document.getElementById(`sample-item-${agreement.id}`)?.focus());
  }
  function changeRole(next: SampleRole) {
    setRole(next); setSelectedId(null); setSampleDocument(null);
    setNotice(`Sample ${next} view opened. ${next === "tenant" ? "Only Avery’s two sample agreements are shown." : "Morgan’s four-property sample portfolio is shown."}`);
  }
  function reset() {
    setAgreements(createSampleAgreements()); setRole("landlord"); setTab("overview");
    setSelectedId(null); setInitialPanel("summary"); setSampleDocument(null);
    setNotice("Demo reset. All original sample data has been restored.");
  }
  function simulate(id: string, action: SampleAction) {
    setAgreements((current) => applySampleAction(current, id, role, action));
    setNotice("Sample action completed. No real account, message, wallet, or funds were changed.");
  }
  function openDocument(next: SampleDocument) {
    documentTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSampleDocument(next);
  }
  function closeDocument() {
    setSampleDocument(null);
    window.requestAnimationFrame(() => documentTrigger.current?.focus());
  }
  function renderList(items: SampleAgreement[]) {
    if (!items.length) return <div className="card sample-empty"><h3>{tab === "proposals" ? "All sample proposals are finalized" : "No sample deposits in this view"}</h3>
      <p>{tab === "proposals" ? "Your finalized sample agreement is now in Deposits and Record." : "Review and finalize a proposal to see its deposit here."}</p>
      <button className="btn btn-secondary" onClick={() => selectTab(tab === "proposals" ? "agreements" : "proposals")}>Open {tab === "proposals" ? "Deposits" : "Proposals"}</button></div>;
    return <div className="record-list sample-record-list" role="list">{items.map((agreement) => <RecordListItem key={agreement.id}
      id={`sample-item-${agreement.id}`} detailsId={`sample-body-${agreement.id}`} expanded={selectedId === agreement.id}
      eyebrow={agreement.id} reference={agreement.property} meta={`${agreement.tenant} · ${sampleMoney(agreement.deposit)} · ${agreement.stage === "proposal" && agreement.approved ? "Approved · ready to finalize" : SAMPLE_LABELS[agreement.stage]}`}
      onToggle={() => { setSelectedId(selectedId === agreement.id ? null : agreement.id); }}>
      <AgreementDetails key={`${agreement.id}-${tab}-${initialPanel}`} agreement={agreement} role={role} initialPanel={initialPanel} onAction={simulate} onDocument={openDocument} />
    </RecordListItem>)}</div>;
  }

  return <Layout showNotifications={false} accountEntry={<div className="sample-actions"><span className="sample-badge">Demo / Sample data</span><a className="btn btn-primary" href="/">Sign in / connect</a></div>}
    notice={<><strong>Demo / Sample data.</strong> Fictional people, properties, documents, and funds. Everything you do here is simulated.</>}>
    <div className="sample-workspace">
      <section className="sample-mode-banner" aria-label="Sample workspace controls">
        <div><span className="eyebrow">Explore without an account</span><h2>Your sample workspace</h2><p>Follow a deposit from proposal to refund. Reset whenever you like.</p></div>
        <div className="sample-actions"><button className="btn btn-secondary" type="button" onClick={reset}>Reset demo</button><a className="btn btn-ghost" href="/">Exit demo</a></div>
      </section>
      <section className="sample-account" aria-label="Fictional demo account">
        <div className="sample-avatar" aria-hidden="true">{role === "landlord" ? "MR" : "AC"}</div>
        <div><strong>{name}</strong><p>Fictional {role} account · {visible.length} sample agreements</p></div>
        <div className="sample-role-control" role="group" aria-label="Sample account perspective">
          <button type="button" aria-pressed={role === "landlord"} onClick={() => changeRole("landlord")}>Landlord view</button>
          <button type="button" aria-pressed={role === "tenant"} onClick={() => changeRole("tenant")}>Tenant view</button>
        </div>
      </section>
      <p className="sample-session-note">Sample snapshot: {SAMPLE_DATE}. Changes last only until you reset, reload, or leave the demo.</p>
      <div className="sample-feedback" role="status" aria-live="polite" aria-atomic="true">{notice}</div>
      <SampleTabs items={tabs} selected={tab} onSelect={selectTab} prefix="sample-workspace" label="Sample workspace" />
      {tabs.map((item) => <section key={item.id} id={`sample-workspace-panel-${item.id}`} role="tabpanel" aria-labelledby={`sample-workspace-tab-${item.id}`} hidden={tab !== item.id} tabIndex={0}>
        {tab === item.id && item.id === "overview" && <>
          <div className="workspace-welcome"><div><span className="eyebrow">{role} view · Sample data</span><h2>{role === "landlord" ? "A clear view of every deposit" : "See where your deposit stands"}</h2><p>Open a sample agreement or switch tabs to explore its shared record.</p></div></div>
          <div className="workspace-stat-grid sample-stats">
            <button className={`workspace-stat${attention.length ? " has-action" : ""}`} onClick={() => attention[0] ? openAgreement(attention[0]) : openAgreement(visible.find((agreement) => agreement.stage === "claim-review") || visible[0])}><span>Needs attention</span><strong>{attention.length}</strong><small>{attention.length ? "sample actions you can try" : "waiting for counterparty responses"}</small></button>
            <button className="workspace-stat" onClick={() => selectTab("proposals")}><span>Active proposals</span><strong>{proposals.length}</strong><small>terms awaiting finalization</small></button>
            <button className="workspace-stat" onClick={() => selectTab("agreements")}><span>Finalized agreements</span><strong>{deposits.length}</strong><small>funded, in review, or completed</small></button>
          </div>
          <div className="sample-dashboard-grid">
            <section className="card overview-quick-access"><span className="eyebrow">Sample portfolio</span><h3>Recent workspace items</h3>
              <div className="overview-quick-list">{visible.map((agreement) => <button key={agreement.id} className="overview-quick-item" onClick={() => openAgreement(agreement)}>
                <div><strong>{agreement.property}</strong><small>{agreement.tenant} · {SAMPLE_LABELS[agreement.stage]}</small></div><span>{sampleMoney(agreement.deposit)} <span aria-hidden="true">↗</span></span>
              </button>)}</div>
            </section>
            <section className="card overview-quick-access"><span className="eyebrow">Sample activity</span><h3>What happens next</h3>
              <div className="overview-quick-list">{visible.filter((agreement) => agreement.stage !== "funded").map((agreement) => <button key={agreement.id} className="overview-quick-item" onClick={() => openAgreement(agreement, "record", "activity")}>
                <div><strong>{agreement.activity.at(-1)?.actor}</strong><small>{agreement.activity.at(-1)?.summary}</small></div><span aria-hidden="true">→</span>
              </button>)}</div>
              <p className="hint">Switch perspectives to try each party’s next step.</p>
            </section>
          </div>
        </>}
        {tab === item.id && ["proposals", "agreements", "record"].includes(item.id) && <>
          <div className="workspace-welcome"><div><span className="eyebrow">{name} · Sample data</span><h2>{item.id === "proposals" ? "Review sample proposals" : item.id === "agreements" ? "Explore sample deposits" : "One shared sample record"}</h2>
            <p>{item.id === "proposals" ? "Review the terms, switch to Tenant view to approve, then return as the landlord to finalize." : item.id === "agreements" ? "Inspect balances, funding, claims, and withdrawals at different stages." : "Open documents, milestones, and activity for any sample agreement."}</p></div></div>
          {renderList(item.id === "proposals" ? proposals : item.id === "agreements" ? deposits : visible)}
        </>}
        {tab === item.id && item.id === "about" && <PublicIntro onStart={() => selectTab("overview")} showAboutDetails />}
      </section>)}
      <p className="sample-boundary-note">Ready for your own workspace? <a href="/">Sign in or connect a wallet</a>. Sample records and simulated actions never carry over.</p>
      {sampleDocument && <SampleDocumentPreview key={sampleDocument.id} document={sampleDocument} onClose={closeDocument} />}
    </div>
  </Layout>;
}
