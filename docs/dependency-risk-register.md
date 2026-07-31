# Production dependency risk register

Updated 2026-07-31. This register supplements automated dependency scanning; it does not approve
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

## Current status

There are no active dependency-audit exceptions. The release check requires the production
dependency audit to report zero high, critical, and unapproved moderate findings.

### Resolved 2026-07-31: `GHSA-w5hq-g745-h8pq` — `uuid` buffer bounds

- The affected transitive `uuid` 8.3.2 and 9.0.1 releases were replaced throughout the locked
  Privy/Wagmi wallet-provider tree with `uuid` 11.1.1.
- The lockfile override is exact rather than a floating range. A release regression rejects any
  other locked UUID version, imports the affected MetaMask SDK and communication-layer paths,
  exercises UUID generation and validation, and confirms an undersized v5 output buffer fails
  closed.
- A clean install and `npm audit --omit=dev` report zero vulnerabilities. The temporary
  2026-08-30 exception was removed rather than extended.

Production/mainnet still requires a fresh dependency review and the independent
application-security review listed in [`owner-actions.md`](./owner-actions.md).
