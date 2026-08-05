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
