# Smart-contract threat model

Last internal review: 2026-08-05

This document defines the security boundary for the immutable OpenEscrow testnet
cohort. It is an engineering threat model, not an independent audit, legal opinion,
or authorization to hold production funds.

## Scope and protected assets

The reviewed deployment unit is one mutually bound `OpenEscrow` and
`OperationsReserve` pair plus one `AgreementActivityRegistry` constructed with that
exact escrow address.

The principal asset is each agreement's refundable deposit held by `OpenEscrow`.
The separately disclosed operations reserve is held by `OperationsReserve` and is
not refundable principal. The registry holds no funds; it records only hashes,
callers, agreement identifiers, activity types, and timestamps.

Raw evidence, private notes, invitation links, account sessions, compliance
snapshots, and human-readable records are hosted assets outside these contracts.
Their confidentiality and availability depend on the application, D1, R2, secrets,
and operational controls described in the hosted-system threat model.

## Actors and authority

| Actor | Contract authority | Must not be able to do |
| --- | --- | --- |
| Landlord | Propose/cancel before funding, submit or reduce a claim, retract a claim, participate in arbiter replacement, withdraw a finalized award | Spend tenant principal outside the agreed claim process or increase an amended claim |
| Tenant or co-tenant | Fund only their exact share, answer a claim once, participate in arbiter replacement, withdraw their finalized share | Fund or answer for another tenant, allocate more than their approved share, or block another tenant's withdrawal |
| Accepted current arbiter | Rule only on the locked disputed amount before the fixed ruling deadline; publish registry hashes | Act before acceptance, after decline/resignation/replacement, rewrite terms, or withdraw funds directly |
| Reserve treasury | Configure its matching escrow once and withdraw only recorded operations-reserve balances | Withdraw refundable principal from `OpenEscrow`, change the bound escrow, or record a tenant payment |
| Token contract | Execute balance and transfer calls required by funding/withdrawal | Reenter another lifecycle mutation, silently short-transfer, or cause recorded balances to exceed received balances |
| Any address | Read public chain state and call public entry points | Mutate an agreement without satisfying its role, phase, amount, and deadline checks |

`OpenEscrow` has no administrator, proxy, upgrade path, owner withdrawal, or pause
authority. A deployed cohort therefore cannot be patched in place. Operational
recovery means stopping new use of that address, deploying and validating a new
cohort, changing the application configuration, and leaving existing agreements on
their original immutable contracts until they complete.

## Trust boundaries and assumptions

- The configured chain is Base Sepolia for the MVP. Production money is out of
  scope.
- Constructor token addresses must be reviewed contracts. The escrow and reserve
  support exactly their immutable plain and yield-token addresses. The current
  testnet token-selection surface is not a production asset allowlist.
- ERC-20 transfers are wrapped with `SafeERC20`. Funding and standalone reserve
  payment use balance deltas so fee-on-transfer or short-transfer behavior cannot
  be recorded as a full payment. Reentrancy guards cover every external escrow
  lifecycle mutation and all reserve payment/withdrawal paths.
- Agreement deadlines depend on `block.timestamp`. Normal validator timestamp
  latitude is accepted; precise wall-clock execution is not guaranteed.
- An arbiter is a human trust choice. The contract limits the arbiter's award to the
  locked disputed amount and supplies a tenant-favoring timeout, but cannot prove
  the arbiter's competence, neutrality, identity, or legal authority.
- A registry hash proves that a particular wallet published or anchored that hash.
  It does not prove the underlying content is true, private, complete, authored by
  that human, or legally sufficient.
- Lost keys, compromised wallets, malicious browser extensions, RPC censorship,
  chain reorganization, stablecoin depegging, issuer freezes, bridge failures, and
  hosted-service compromise remain external risks.

## Security invariants

For every agreement, refundable principal must satisfy:

`depositAmount = tenantWithdrawable + landlordWithdrawable + locked + withdrawn`

The contract's token balance must cover aggregate unwithdrawn liabilities. A
landlord allocation must never exceed the submitted claim, each tenant's funding
and response authority must remain isolated, and a finalized allocation must not be
finalized again.

For the operations reserve, each tenant can pay only the exact deterministic share
once, agreement-level recorded payment cannot exceed the fixed reserve amount, the
payment token must equal the agreement token, and token balances must equal recorded
payments less treasury withdrawals when no unsolicited transfer occurs.

Deployment invariants are equally important: the escrow and reserve must point to
each other, share both token addresses, and the registry must point to that exact
escrow. Agreement identifiers are local to a deployment. Equal numeric identifiers
on retired and candidate cohorts must never share balances, roles, registry access,
or reserve receipts.

## Primary attack paths and controls

| Threat | Current control | Residual risk |
| --- | --- | --- |
| Unauthorized or replayed lifecycle action | Role, phase, one-time, amount, and fixed-deadline checks; effects before interactions; shared reentrancy guard | Compromised authorized wallet remains authorized onchain |
| Reentrant or nonstandard token | `SafeERC20`, balance-delta checks, state-first atomic funding, reentrancy regression tests | A production token still requires independent code/issuer review |
| Principal insolvency | Per-agreement and aggregate accounting invariants; pull withdrawals | Stablecoin issuer freeze or chain failure is outside contract control |
| Claim/award inflation | Claim bounded by deposit; one downward amendment; award bounded by locked dispute; tenant-favoring timeouts | Contract cannot judge evidence quality or local-law compliance |
| Reserve confusion with deposit | Separate contract/balance, reciprocal immutable binding, exact share and phase validation, treasury-only reserve withdrawal | The direct standalone reserve path is testnet compatibility surface and should be removed or given a reviewed refund policy before production |
| Registry impersonation or stale arbiter | Escrow-derived landlord/tenant ownership; accepted current arbiter only | Hash publication can still be misleading and costs the caller gas |
| Misconfigured release | Forced offline compile, ABI/selector/storage/bytecode evidence, dependency hashes, cohort tests, manifest/runbook gates | Human signer, explorer verification, RPC, and frontend switch remain operational controls |
| Vulnerability after deployment | No hidden admin or upgrade path; explicit retire-and-redeploy procedure | Active agreements cannot be migrated or patched; incident response may require waiting for their existing timeout paths |

## Explicit exclusions before production

The following are not approved by this threat model: real tenant money; mainnet;
automatic yield routing; unrestricted or provider-selected assets; bridges; fiat
on-ramp or swap execution; contract upgrades; legal-compliance guarantees; and an
assumption that internal tests replace an independent audit.

Before production, obtain an independent audit against the exact candidate commit,
review the selected token and any yield adapter separately, complete the deployment
and rollback rehearsal, run a bounded testnet pilot, establish key-loss and incident
procedures, and obtain jurisdiction-appropriate legal and operational review.
