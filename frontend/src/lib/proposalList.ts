export type ProposalListItem = {
  access: { proposalId: string; role: string };
  record: { id: string; status: string; updatedAt: string };
};

export function compactActiveProposals<T extends ProposalListItem>(items: T[]): T[] {
  const active = items
    .filter(
      (item) =>
        item.record.status !== "cancelled" && item.record.status !== "superseded",
    )
    .sort(
      (a, b) =>
        new Date(b.record.updatedAt).getTime() -
        new Date(a.record.updatedAt).getTime(),
    );
  const seen = new Set<string>();
  return active.filter((item) => {
    const key = `${item.access.role}:${item.access.proposalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
