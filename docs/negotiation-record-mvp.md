# Negotiation and claim record MVP

## Workflow

1. A landlord saves an off-chain agreement proposal. No onchain agreement exists yet.
2. Saving creates role-specific capability links. Tenant and optional-arbiter email controls are not
   available before this step.
3. Tenant and optional arbiter may request changes or approve the current revision. A landlord
   revision resets every approval.
4. Once the tenant and, when appointed, the arbiter approve, their approval wallets are mapped to
   the proposal and onchain finalization unlocks.
5. The landlord remains the only party that can initiate or amend a deduction claim. Each claim is
   itemized by category, description, and amount, with the line-item total required to match the
   onchain claim. The claim UI also requires an evidence description and document URI.
6. The tenant may approve, partially approve, or dispute the claim and add a note. An appointed
   arbiter may review the onchain evidence pointers, rule on a dispute, and add a ruling note.

## Record model

The Sites D1 database stores the current proposal, participant approvals, wallet mappings, and an
append-only event stream. Proposal creation, full revision snapshots, requested changes,
approvals, invitations, onchain finalization, evidence uploads, deduction claims, notifications,
tenant responses, and arbiter rulings are timestamped by the server.

Every role-specific link can open a printable report containing the parties, current terms,
revision snapshots, approval state, itemized deduction tables, and event timeline. The record is
also exportable as canonical JSON: object keys are deterministically ordered and the server returns
the SHA-256 hash of the exact canonical bytes. After onchain finalization, the landlord, tenant, or
current arbiter can submit that hash to the separate `AgreementActivityRegistry`; the app shows the
party address, timestamp, and Base Sepolia transaction receipt. Until a party submits that anchor,
the off-chain event stream is not itself immutable or independently notarized.

## External services

- `PINATA_JWT` enables server-side public-IPFS uploads through Pinata. Manual privacy-safe IPFS
  URIs remain available without it.
- `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` enable direct claim-notification delivery.
  Prefilled Gmail and copy-email fallbacks remain available without them.

Public IPFS content is public and persistent. Documents containing personal or confidential
information must be redacted or encrypted before upload.
