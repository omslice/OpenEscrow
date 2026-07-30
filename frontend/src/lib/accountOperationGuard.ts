export type AccountIdentity = string | null;

export function createAccountOperationGuard(
  getCurrentIdentity: () => AccountIdentity,
  requestedIdentity: AccountIdentity,
) {
  return () => {
    try {
      return getCurrentIdentity() === requestedIdentity;
    } catch {
      return false;
    }
  };
}
