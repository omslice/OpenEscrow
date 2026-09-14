// Deliberately separate from account, negotiation, storage, and contract models.
// These IDs are display-only and must never be used as live agreement IDs.
export type SampleRole = "landlord" | "tenant";
export type SampleStage = "proposal" | "awaiting-funding" | "funded" | "claim-review" | "disputed" | "resolved" | "complete";
export type SampleAction = "approve-proposal" | "finalize" | "fund" | "approve-claim" | "dispute-claim" | "withdraw";
export type SampleActivity = { date: string; actor: string; summary: string };
export type SampleTransaction = { date: string; label: string; amount: number; reference: string };
export type SampleDocument = { id: string; title: string; date: string; paragraphs: string[] };
export type SampleAgreement = {
  id: string;
  property: string;
  tenant: string;
  email: string;
  period: string;
  moveOut: string;
  deposit: number;
  claim: number;
  stage: SampleStage;
  approved: boolean;
  tenantWithdrawn: number;
  landlordWithdrawn: number;
  activity: SampleActivity[];
  transactions: SampleTransaction[];
  documents: SampleDocument[];
};

export const SAMPLE_DATE = "September 13, 2026";
export const SAMPLE_LANDLORD = "Morgan Reed";
export const SAMPLE_TENANT = "Avery Chen";
export const SAMPLE_LABELS: Record<SampleStage, string> = {
  proposal: "Proposal in review",
  "awaiting-funding": "Awaiting funding",
  funded: "Deposit funded",
  "claim-review": "Claim awaiting response",
  disputed: "Claim disputed",
  resolved: "Ready for withdrawal",
  complete: "Completed refund",
};

const seeds = [
  { id: "SAMPLE-101", property: "12 Willow Court · Unit 2", tenant: SAMPLE_TENANT, email: "avery@example.test", period: "Oct 1, 2026 – Sep 30, 2027", moveOut: "September 30, 2027", deposit: 180000, claim: 0, stage: "proposal", date: "Sep 12, 2026" },
  { id: "SAMPLE-102", property: "48 Maple House · Unit 4", tenant: "Jordan Lee", email: "jordan@example.test", period: "Jan 1 – Dec 31, 2026", moveOut: "December 31, 2026", deposit: 240000, claim: 0, stage: "funded", date: "Jan 1, 2026" },
  { id: "SAMPLE-103", property: "7 Cedar Studio · Unit 1", tenant: SAMPLE_TENANT, email: "avery@example.test", period: "Sep 1, 2025 – Aug 31, 2026", moveOut: "August 31, 2026", deposit: 165000, claim: 18000, stage: "claim-review", date: "Sep 1, 2025" },
  { id: "SAMPLE-104", property: "26 Birch Place · Unit 3", tenant: "Riley Brooks", email: "riley@example.test", period: "Aug 1, 2025 – Jul 31, 2026", moveOut: "July 31, 2026", deposit: 200000, claim: 0, stage: "complete", date: "Aug 1, 2025" },
] as const;

export function sampleMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100);
}

export function createSampleAgreements(): SampleAgreement[] {
  return seeds.map((seed) => {
    const finalized = seed.stage !== "proposal";
    const complete = seed.stage === "complete";
    const activity: SampleActivity[] = [
      { date: seed.date, actor: SAMPLE_LANDLORD, summary: "Shared the fictional deposit terms for review." },
    ];
    const transactions: SampleTransaction[] = [];
    if (finalized) {
      activity.push({ date: seed.date, actor: seed.tenant, summary: "Approved the terms. The sample agreement was finalized and funded." });
      transactions.push({ date: seed.date, label: "Tenant deposit funded", amount: seed.deposit, reference: `${seed.id}-FUND` });
    }
    if (seed.claim) {
      activity.push({ date: "Sep 10, 2026", actor: SAMPLE_LANDLORD, summary: "Submitted a $180 cleaning deduction with an itemized sample invoice." });
    }
    if (complete) {
      activity.push({ date: "Aug 31, 2026", actor: seed.tenant, summary: "Withdrew the full $2,000 refund. No deductions were claimed." });
      transactions.push({ date: "Aug 31, 2026", label: "Tenant refund withdrawn", amount: -seed.deposit, reference: `${seed.id}-REFUND` });
    }
    const documents: SampleDocument[] = [{
      id: `${seed.id}-TERMS`, title: "Deposit terms", date: seed.date,
      paragraphs: [
        `Fictional property: ${seed.property}. Landlord: ${SAMPLE_LANDLORD}. Tenant: ${seed.tenant}.`,
        `Rental period: ${seed.period}. Security deposit: ${sampleMoney(seed.deposit)} in a plain test token. Optional yield is off; operations reserve is $0.`,
        `The sample move-out date is ${seed.moveOut}. The example uses a 30-day claim window and a 14-day response window. Real agreements use the supported jurisdiction profile and agreed terms.`,
        "This is an illustrative summary, not a signed agreement or legal template.",
      ],
    }];
    if (finalized) documents.push({
      id: `${seed.id}-CONDITION`, title: "Move-in condition note", date: seed.date,
      paragraphs: [`Sample inspection for ${seed.property}.`, "Walls and flooring are clean. A small paint scuff beside the entrance is recorded as pre-existing. Two keys were provided.", "Fictional note acknowledged by the landlord and tenant. No photograph or private document has been uploaded."],
    });
    if (seed.claim) documents.push({
      id: `${seed.id}-INVOICE`, title: "Itemized cleaning invoice", date: "Sep 9, 2026",
      paragraphs: ["FICTIONAL INVOICE · Example Cleaning Co. · SAMPLE-INV-103", "Property: 7 Cedar Studio · Unit 1. Service: September 8, 2026.", "Kitchen cleaning: 2 hours × $60 = $120. Bathroom cleaning: 1 hour × $60 = $60. Total: $180.", "Attached to the sample deduction for review. This example does not establish that a deduction is legally allowable."],
    });
    if (complete) documents.push({
      id: `${seed.id}-REFUND-NOTE`, title: "Final refund summary", date: "Aug 31, 2026",
      paragraphs: ["Original deposit: $2,000. Deductions: $0. Tenant refund: $2,000. Remaining sample balance: $0.", "Fictional completion record. The displayed transaction references are examples, not blockchain receipts."],
    });
    return { ...seed, approved: finalized, tenantWithdrawn: complete ? seed.deposit : 0, landlordWithdrawn: 0, activity, transactions, documents };
  });
}

export function visibleSampleAgreements(agreements: SampleAgreement[], role: SampleRole) {
  return role === "landlord" ? agreements : agreements.filter((agreement) => agreement.tenant === SAMPLE_TENANT);
}

export function sampleBalance(agreement: SampleAgreement) {
  return agreement.stage === "proposal" || agreement.stage === "awaiting-funding"
    ? 0
    : agreement.deposit - agreement.tenantWithdrawn - agreement.landlordWithdrawn;
}

export function sampleActions(agreement: SampleAgreement, role: SampleRole): { action: SampleAction; label: string }[] {
  if (role === "tenant" && agreement.tenant !== SAMPLE_TENANT) return [];
  if (agreement.stage === "proposal") {
    if (role === "tenant" && !agreement.approved) return [{ action: "approve-proposal", label: "Simulate approving terms" }];
    if (role === "landlord" && agreement.approved) return [{ action: "finalize", label: "Simulate finalizing agreement" }];
  }
  if (agreement.stage === "awaiting-funding" && role === "tenant") return [{ action: "fund", label: "Simulate funding deposit" }];
  if (agreement.stage === "claim-review" && role === "tenant") return [
    { action: "approve-claim", label: "Simulate accepting deduction" },
    { action: "dispute-claim", label: "Simulate disputing deduction" },
  ];
  if (agreement.stage === "resolved") {
    const amount = role === "tenant" ? agreement.deposit - agreement.claim - agreement.tenantWithdrawn : agreement.claim - agreement.landlordWithdrawn;
    if (amount > 0) return [{ action: "withdraw", label: role === "tenant" ? "Simulate withdrawing refund" : "Simulate withdrawing deduction" }];
  }
  return [];
}

export function applySampleAction(agreements: SampleAgreement[], id: string, role: SampleRole, action: SampleAction): SampleAgreement[] {
  return agreements.map((agreement) => {
    if (agreement.id !== id || !sampleActions(agreement, role).some((allowed) => allowed.action === action)) return agreement;
    const next = { ...agreement, activity: [...agreement.activity], transactions: [...agreement.transactions] };
    let summary = "";
    const date = "Sep 13, 2026 · simulated";
    switch (action) {
      case "approve-proposal": next.approved = true; summary = "Approved the sample terms. The landlord can now finalize the agreement."; break;
      case "finalize": next.stage = "awaiting-funding"; summary = "Finalized the sample agreement. The tenant can now fund the deposit."; break;
      case "fund":
        next.stage = "funded";
        next.transactions.push({ date, label: "Simulated tenant deposit", amount: next.deposit, reference: `${id}-SIM-FUND` });
        summary = "Funded the sample deposit. No funds moved.";
        break;
      case "approve-claim": next.stage = "resolved"; summary = "Accepted the sample deduction. Each party can withdraw their allocated amount."; break;
      case "dispute-claim": next.stage = "disputed"; summary = "Disputed the sample deduction. Resolution is required before the disputed funds can be released."; break;
      case "withdraw": {
        const amount = role === "tenant" ? next.deposit - next.claim - next.tenantWithdrawn : next.claim - next.landlordWithdrawn;
        if (role === "tenant") next.tenantWithdrawn += amount;
        else next.landlordWithdrawn += amount;
        next.transactions.push({ date, label: `Simulated ${role} withdrawal`, amount: -amount, reference: `${id}-SIM-${role.toUpperCase()}` });
        if (next.tenantWithdrawn + next.landlordWithdrawn === next.deposit) next.stage = "complete";
        summary = `Withdrew ${sampleMoney(amount)} in the simulation. No funds moved.`;
      }
    }
    next.activity.push({ date, actor: role === "tenant" ? SAMPLE_TENANT : SAMPLE_LANDLORD, summary });
    return next;
  });
}
