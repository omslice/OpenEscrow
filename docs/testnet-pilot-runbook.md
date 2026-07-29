# OpenEscrow controlled testnet pilot runbook

Use this runbook only after every required row from `npm.cmd run pilot:check` reports `PASS`.
Use invented names, addresses, invoices, and photographs. Do not use a real lease, rental address,
deposit, debit card, bank account, or dispute.

## Credential-free rehearsal

Before configuring hosted services or using funded test wallets, run:

```powershell
Set-Location frontend
npm.cmd run pilot:rehearse
```

This local rehearsal uses an in-memory D1 database, deterministic fake transaction receipts, and
ephemeral signed test identities. It independently exercises:

- a no-claim refund and one-time withdrawal;
- a fully accepted claim and both final withdrawals;
- a two-tenant partial dispute, arbiter ruling, and all final withdrawals;
- account-isolated archive and restore preferences; and
- the complete report, canonical JSON snapshot, snapshot hash, and recorded receipt trail.

The command writes a machine-readable summary and JUnit report under
`frontend/.pilot-rehearsal/`. These ignored local artifacts contain no invitation tokens, private
keys, evidence keys, or real transaction hashes.

A passing local rehearsal proves that the hosted workflow state machine still behaves consistently.
It does not prove Google/Privy login, live wallet signing, Base Sepolia contracts, hosted D1/R2,
email delivery, Cron, or provider dashboards. Complete the separate-account steps below before any
supervised pilot.

## Test identities

Prepare four separate browser profiles and email accounts:

| Profile | Role | Purpose |
| --- | --- | --- |
| L | Landlord | Creates and finalizes the proposal, submits a claim |
| T1 | Tenant 1 | Owns and funds the first deposit share |
| T2 | Tenant 2 | Owns and funds the second deposit share |
| A | Arbiter | Reserved for the currently hidden optional-arbiter UI |

Never share wallet private keys. Each person signs in through their own Google account and uses
the embedded test wallet created for that identity.

## Release smoke test

1. Open the public site in a signed-out private window.
2. Confirm the hero says **A better way to handle rental deposits.**
3. Confirm the site is labelled as a Base Sepolia testnet demonstration.
4. Choose the landlord workspace and verify that no proposal or notification belonging to another
   email account appears.
5. Expand **Account and workspace**, send a test email, and confirm it arrives with an unsubscribe
   link.

Stop if any account can see another account's unrelated proposal, notification, document, or
email address.

## Landlord-to-two-tenant agreement

1. In profile L, create a generic test proposal with:
   - an invented rental address;
   - two tenant names and their separate test email addresses;
   - a 60/40 deposit ownership split;
   - the plain test token;
   - a short but valid testnet claim schedule.
2. Save the proposal. Confirm one active proposal appears at the top of the Proposals tab.
3. Send both tenant invitations. Confirm each email contains only that proposal's role-locked
   review link.
4. In profile T1, open the invitation, propose a change, and do not approve yet.
5. In profile L, publish a revised proposal. Confirm every prior approval is reset and the running
   record retains the earlier revision as history without showing a duplicate active proposal.
6. In profiles T1 and T2, approve the current revision.
7. In profile L, confirm one clear finalization action appears. Finalize onchain once and confirm
   the proposal becomes a finalized agreement.

Expected result: neither tenant can create a landlord proposal from the role-locked invitation,
and the landlord cannot edit finalized terms without starting a new approval cycle.

## Funding and duplicate prevention

1. In T1, claim the required test tokens. Confirm the displayed total includes 60% of the deposit
   plus half of the 5-token operations reserve.
2. Approve the displayed total once, then fund it once.
3. Confirm the same tenant cannot fund again after the receipt is confirmed.
4. Repeat in T2. Confirm the displayed total includes 40% of the deposit plus the other half of
   the reserve.
5. Confirm the agreement does not become fully funded until both contributions arrive.
6. In the funding ledger, confirm both names, tenant role badges, funded amounts, ownership
   percentages, and current withdrawable amounts are correct.

## Claim, evidence, and response

1. Move the test chain to the claim window using only the project's intended test schedule.
2. Confirm both tenants and the landlord receive the claim-window notification once.
3. In L, upload an invented PDF and submit an itemized deduction claim.
4. Confirm T1 and T2 can each open the same authorized evidence link.
5. Confirm a signed-out browser and an invalid invitation token cannot retrieve the evidence.
6. In T1, approve the deduction in full.
7. In T2, accept part of it, add a short explanation, and email the response to the landlord.
8. Confirm neither party can withdraw while the disputed amount is unresolved.

Expected result: the running record identifies which tenant made each response, and duplicate
responses are rejected.

## Resolution and report

The arbiter workspace remains intentionally hidden in the current public UI. The automated suite
tests the optional-arbiter ruling path. For the visible pilot, use either unanimous tenant
acceptance, a landlord claim retraction, or a no-claim refund path.

1. Complete one supported terminal path.
2. Confirm each party sees only their own nonzero withdrawal allocation.
3. Withdraw each allocation once and confirm a second withdrawal is unavailable.
4. Open the Record tab and export the report.
5. Confirm the report includes the proposal revision, approvals, funding receipts, evidence
   receipt, claim, every tenant response, resolution, and withdrawals.
6. Confirm transaction records labelled as verified link to successful Base Sepolia receipts.

## Email scheduler check

1. Keep agreement-activity and deadline notifications enabled for the test identities.
2. Wait for two scheduler intervals.
3. Confirm each logical deadline notice arrives only once per recipient.
4. Use one test account's unsubscribe link.
5. Confirm its optional reminders stop without changing the other accounts' preferences.

## Stop conditions

Stop the pilot and preserve screenshots plus the exported record if any of these occur:

- one identity sees another agreement's private data;
- a role-locked invitation opens the wrong role;
- a tenant can fund or withdraw twice;
- a withdrawal is offered before the claim is resolved;
- an unrelated or reverted transaction hash is accepted;
- an unauthorized evidence request succeeds;
- a scheduler sends the same logical notice more than once; or
- the deployed build differs from the validated commit.

Record the exact time, role, agreement reference, visible message, and transaction hash. Never
include invitation tokens, private keys, evidence-encryption keys, or email-provider credentials in
the issue report.
