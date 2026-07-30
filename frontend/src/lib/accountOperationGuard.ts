export type AccountIdentity = string | null;

export function createAccountOperationGuard(
  getCurrentIdentity: () => AccountIdentity,
  requestedIdentity: AccountIdentity,
  isActive: () => boolean = () => true,
) {
  return () => {
    try {
      return isActive() && getCurrentIdentity() === requestedIdentity;
    } catch {
      return false;
    }
  };
}
