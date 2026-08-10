export type FundingEntryType =
  | "application"
  | "grant"
  | "donation"
  | "sponsorship"
  | "reward"
  | "investment"
  | "returned_funds"
  | "expense"
  | "in_kind";

export type FundingEntryStatus =
  | "pending"
  | "committed"
  | "received"
  | "partially_received"
  | "spent"
  | "returned"
  | "cancelled";

export type PublicFundingEntry = {
  id: string;
  date: string;
  type: FundingEntryType;
  source: string;
  program?: string;
  status: FundingEntryStatus;
  currency?: string;
  amountCommitted?: number;
  amountReceived?: number;
  usdCommitted?: number;
  usdReceived?: number;
  usdSpent?: number;
  usdInKindUsed?: number;
  restriction?: string;
  purpose?: string;
  evidenceUrl?: string;
  publicNotes?: string;
  publicationApproved: boolean;
  lastVerified: string;
};

export type FundingDisclosure = {
  lastReviewed: string;
  openingBalanceConfirmed: boolean;
  confirmedThrough: string | null;
  recipientDescription: string | null;
  fundingContact: string | null;
  entries: PublicFundingEntry[];
};

export type FundingSummary = {
  committedUsd: number;
  receivedUsd: number;
  spentUsd: number;
  inKindUsedUsd: number;
};

export const FUNDING_DISCLOSURE: FundingDisclosure = {
  lastReviewed: "2026-08-09",
  openingBalanceConfirmed: false,
  confirmedThrough: null,
  recipientDescription: null,
  fundingContact: null,
  entries: [],
};

export function hasConfirmedFundingDisclosure(
  disclosure: FundingDisclosure = FUNDING_DISCLOSURE,
): disclosure is FundingDisclosure & {
  confirmedThrough: string;
  recipientDescription: string;
  fundingContact: string;
} {
  return Boolean(
    disclosure.openingBalanceConfirmed &&
      disclosure.confirmedThrough?.trim() &&
      disclosure.recipientDescription?.trim() &&
      disclosure.fundingContact?.trim(),
  );
}

export function publishedFundingEntries(
  disclosure: FundingDisclosure = FUNDING_DISCLOSURE,
): PublicFundingEntry[] {
  if (!hasConfirmedFundingDisclosure(disclosure)) return [];
  return disclosure.entries.filter(
    (entry) => entry.publicationApproved && entry.type !== "application",
  );
}

export function summarizePublishedFunding(
  disclosure: FundingDisclosure = FUNDING_DISCLOSURE,
): FundingSummary {
  return publishedFundingEntries(disclosure).reduce<FundingSummary>(
    (summary, entry) => ({
      committedUsd: summary.committedUsd + (entry.usdCommitted || 0),
      receivedUsd: summary.receivedUsd + (entry.usdReceived || 0),
      spentUsd: summary.spentUsd + (entry.usdSpent || 0),
      inKindUsedUsd: summary.inKindUsedUsd + (entry.usdInKindUsed || 0),
    }),
    {
      committedUsd: 0,
      receivedUsd: 0,
      spentUsd: 0,
      inKindUsedUsd: 0,
    },
  );
}
