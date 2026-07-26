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

After the tenant funds onchain, the app also appends the funding transaction receipt to this
timeline. If the chain transaction succeeds while the D1 write is unavailable, the browser keeps a
wallet-scoped pending receipt and offers a retry; repeated submissions are idempotent.

Every role-specific link can open a printable report containing the parties, current terms,
revision snapshots, approval state, itemized deduction tables, and event timeline. The record is
also exportable as browser-encrypted canonical JSON: object keys are deterministically ordered and
the server returns the SHA-256 hash of the exact canonical bytes. The browser encrypts those bytes
with a fresh AES-256-GCM key and downloads the key separately. After onchain finalization, the
landlord, tenant, or current arbiter can submit the plaintext record hash to the separate
`AgreementActivityRegistry`. Until a party submits that anchor, the off-chain event stream is not
itself immutable or independently notarized.

The printable report groups every recorded transaction hash into a receipt table with a direct
BaseScan link. This makes funding, claim, response, ruling, reserve, finalization, and registry
transactions easier to audit without treating a client-submitted hash as independently verified;
the explorer receipt remains the source to check.

Encrypted full-record exports have a local verifier. The user selects the encrypted JSON and
provides its separately saved verification key. The browser decrypts the file, validates the
snapshot schema and proposal identity, recomputes the SHA-256 hash, reads the current agreement
parties directly from Base Sepolia, and checks the registry's `anchoredBy` mapping for each party.
The encrypted file, key, and plaintext are not uploaded during verification. A valid but
unanchored record is clearly distinguished from one whose hash was attested by an agreement-party
wallet.

Printable reports include a dedicated onchain evidence table for recorded snapshot anchors,
including direct BaseScan receipt links. This table does not claim that plaintext is public or
independently stored; a hash must be checked against the relevant encrypted record and key.

## External services

- `PINATA_JWT` enables server-side public-IPFS uploads through Pinata. Manual privacy-safe IPFS
  URIs remain available without it.
- `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` enable direct claim-notification delivery.
  Prefilled Gmail and copy-email fallbacks remain available without them.

Public IPFS content is public and persistent. Documents containing personal or confidential
information must be redacted or encrypted before upload.
