import type {
  NegotiationAccess,
  NegotiationRecord,
} from "./negotiations";

export type SavedRecord = {
  access: NegotiationAccess;
  record: NegotiationRecord;
};

function accessKey(access: NegotiationAccess) {
  return `${access.proposalId}:${access.role}`;
}

export function mergeSavedRecordRefresh(
  requestedAccesses: readonly NegotiationAccess[],
  settled: readonly PromiseSettledResult<SavedRecord>[],
  previous: readonly SavedRecord[],
): SavedRecord[] {
  const previousByAccess = new Map(
    previous.map((item) => [accessKey(item.access), item]),
  );
  return requestedAccesses.flatMap((access, index) => {
    const key = accessKey(access);
    const result = settled[index];
    if (
      result?.status === "fulfilled" &&
      accessKey(result.value.access) === key
    ) {
      return [result.value];
    }
    const prior = previousByAccess.get(key);
    return prior ? [prior] : [];
  });
}

export function refreshOpenProposalAccess(
  current: NegotiationAccess | null,
  records: readonly SavedRecord[],
): NegotiationAccess | null {
  if (!current) return null;
  return (
    records.find(
      (item) =>
        item.access.proposalId === current.proposalId &&
        item.access.role === current.role,
    )?.access || current
  );
}

export function shouldClearDetachedInviteAccess(
  access: NegotiationAccess | null,
  inviteRole: string | null,
  hasInviteParameter: boolean,
): boolean {
  return Boolean(
    access?.source === "invite" &&
      access.role !== "landlord" &&
      !inviteRole &&
      !hasInviteParameter,
  );
}
