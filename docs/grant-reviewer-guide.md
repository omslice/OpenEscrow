# OpenEscrow grant reviewer guide

Last reviewed: 2026-08-09.

OpenEscrow is a free, open-source Base Sepolia prototype for a shared rental-deposit process.
The canonical public app is <https://openescrow.io> and the one-minute overview is
<https://openescrow.io/demo>.

**Use test data and test tokens only—these are not real funds.**

## Fast review routes

### One minute: understand the project

1. Open the [one-minute overview](https://openescrow.io/demo).
2. Return to [the app](https://openescrow.io) and review the About page.
3. Note the public testnet warning: all tokens and identities used here are demonstrations, not
   real funds or real tenancy records.

### Five minutes: inspect the product shape

1. Sign in with a test Google account or wallet.
2. Choose landlord or tenant after sign-in. Only a specific invitation link preselects a role.
3. Review the Dashboard, Proposals, Deposits, and Record navigation.
4. Open the account panel to see notification preferences and connected identity information.
5. Inspect the source and verification links from the About page.

Both optional notification choices start on for a new verified account. Invitation and claim
messages required by an active workflow are handled separately from those optional updates.

### Full flow: use separate test identities

Use separate browser profiles or private windows for the landlord and each tenant. Do not reuse a
single signed-in identity to simulate multiple parties.

1. As landlord, create a proposal with invented names, an invented property address, short future
   test deadlines, and the standard testUSDC asset.
2. Use **Send invitation email** for each participant and confirm that each separate test inbox
   receives only its own proposal link. The copy-link control remains available if delivery is
   delayed or the reviewer prefers another messaging channel.
3. As every tenant, open only that participant's link, review the identical revision, and approve.
4. As landlord, finalize the approved revision on Base Sepolia.
5. As each tenant, mint free test tokens, approve only that tenant's share, and fund it.
6. Confirm the deposit activates only after every allocated share is funded.
7. Review the Deposit and Record pages, then exercise a claim, response, resolution, and withdrawal
   if the chosen test deadlines make those actions available.
8. Confirm that claim notices go to tenants separately and that the landlord receives the saved
   tenant-response update. Email bodies intentionally omit the property address, deposit amount,
   evidence, and private agreement notes.

The replacement bounded taUSDC demonstration is not part of the reviewer path until its fresh
contract cohort is deployed, verified, and activated. The standard testUSDC path is the stable
public-review path in the meantime.

## What the prototype demonstrates

- Shared revision approval and explicit multi-tenant allocation.
- Onchain custody and lifecycle enforcement on Base Sepolia.
- Claims that cannot automatically pay a landlord merely because a tenant is silent.
- Party-controlled evidence, downloadable records, and independently checkable hash receipts.
- Optional participant email invitations and action/deadline notices without private agreement
  details in email bodies.

## Safety and evaluation boundary

OpenEscrow is not a bank, law firm, licensed escrow provider, production custody service, or legal
advice. It has not received an independent professional smart-contract audit. Use invented
information, disposable test files, and free Base Sepolia tokens only.

The app's compliance profiles are outside this grant-review milestone and must not be treated as a
legal determination. Reviewer readiness means the testnet product can be inspected coherently; it
does not mean the system is approved for a real tenancy or real money.

## Evidence and known limitations

- [Release and grant evidence index](release-evidence-index.md)
- [Security review](security-review.md)
- [Contract threat model](contract-threat-model.md)
- [Privacy threat model](privacy-threat-model.md)
- [Independent audit handoff](independent-audit-handoff.md)
- [Current owner-only actions](owner-actions.md)

Material remaining gates include deployment and verification of the replacement test-token cohort,
promotion of the exact validated candidate to the canonical host, a hosted rehearsal with genuinely
separate participant accounts, and an independent professional audit before any real-money
consideration. The credential-free exact-source candidate itself passed at `7cb1e20`; that result is
not evidence that the candidate has already been deployed.
