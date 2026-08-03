export type RequestedDepositId = string | null | undefined;

export function resolveExpandedDepositId(
  requestedId: RequestedDepositId,
  availableIds: readonly string[],
): string | null {
  const uniqueIds = Array.from(new Set(availableIds));
  if (requestedId === undefined) {
    return uniqueIds.length === 1 ? uniqueIds[0] : null;
  }
  return requestedId !== null && uniqueIds.includes(requestedId)
    ? requestedId
    : null;
}

export function toggleExpandedDepositId(
  currentId: string | null,
  requestedId: string,
): string | null {
  return currentId === requestedId ? null : requestedId;
}
