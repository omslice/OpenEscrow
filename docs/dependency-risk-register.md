# Production dependency risk register

Updated 2026-07-30. This register supplements automated dependency scanning; it does not approve
production or real-money use.

## Audit policy

The release check fails on:

- every high or critical production dependency vulnerability;
- every moderate advisory not named in `frontend/security-audit-policy.json`;
- an exception with the wrong package, an unreviewed installed version, missing rationale/scope,
  or expired review date; and
- an exception that no longer appears in the registry report.

Exceptions are allowed only for an exact moderate advisory and expire automatically. They cannot
waive high or critical findings.

## Active time-bounded exception

### `GHSA-w5hq-g745-h8pq` — `uuid` buffer bounds

- Severity: moderate in the npm registry.
- Review deadline: 2026-08-30.
- Scope: Base Sepolia testnet candidate only.
- Path: transitive wallet-provider dependencies used by Privy/Wagmi; `uuid` is not a direct
  OpenEscrow dependency.
- Reviewed installed versions: `8.3.2` and `9.0.1`. A changed affected version invalidates the
  exception even when the advisory ID remains the same.
- Exposure review: the advisory affects the v3/v5/v6 API when a caller supplies an output buffer.
  OpenEscrow does not call those APIs, and a search of the installed wallet-provider source paths
  found no such invocation.
- Current registry remediation: the offered automatic fix is a breaking downgrade from the
  current Privy release. Applying it would weaken a critical authentication integration without
  demonstrating that the downgrade is safe.
- Required follow-up: re-run the release check on every candidate. Upgrade the wallet-provider
  chain when a compatible fix is available, or remove the affected connector path if upstream
  remediation does not arrive before expiry.

This exception is not valid for a production/mainnet release. That release requires a fresh
dependency review and the independent application-security review already listed in
[`owner-actions.md`](./owner-actions.md).
