# OpenEscrow privacy and hosted-workflow threat model

This document describes the implemented Base Sepolia testnet system. It is an internal engineering
review, not an independent security assessment, privacy impact assessment, legal opinion, or
authorization to collect real tenancy data.

## System boundary and data inventory

| Location | Data | Visibility and persistence |
| --- | --- | --- |
| Base Sepolia contracts | Wallets, amounts, deadlines, state transitions, hashes, opaque evidence pointers | Public and effectively permanent |
| Hosted D1 | Names, emails, proposal terms, address/compliance snapshot, participant sessions, lifecycle events, evidence metadata, notification preferences | Private application data; durable until an approved deletion process acts |
| Hosted R2 | Uploaded PDF/image evidence | Private bucket; optionally AES-256-GCM encrypted with a per-file HKDF key |
| Optional encrypted IPFS | Ciphertext only | Publicly retrievable ciphertext; permanent availability is not guaranteed |
| Privy and wallet providers | Authentication, linked account, embedded/external wallet information | Provider-controlled under separate policies |
| Email provider | Recipient address and privacy-minimal notification text | Provider-controlled delivery records |
| Browser | Short-lived invitation/account session tokens and temporary form state | Exposed to the signed-in browser profile and extensions |

Raw evidence, physical addresses, names, email addresses, invoices, photographs, and private notes
must never be written to the public contract. A hash proves byte integrity, not the truth,
completeness, legality, or authorship of the underlying content.

## Actors and trust boundaries

- Landlord, each tenant, and an optional arbiter are mutually distrusting participants.
- Invitation URLs are bearer credentials until replaced by a verified account-discovery session.
- OpenEscrow's Worker authorizes every D1/R2 request; frontend role labels are not security controls.
- Sites owns the real D1/R2 bindings. Application code must not infer ownership from object names.
- Privy identity signatures, Base Sepolia receipts, RPC responses, email delivery, geocoding, and
  official-source pages cross external trust boundaries.
- Project operators can configure hosted secrets but must not learn or transmit user wallet keys.

## Implemented controls and regression evidence

| Threat | Implemented control | Automated evidence |
| --- | --- | --- |
| Forged, expired, or wrong-application identity token | ES256 signature, issuer, audience, expiry, subject, and linked-email verification | Server tests reject each token without creating an account session |
| Cross-site browser mutation | Mutating API routes require a matching `Origin` when present and reject Fetch Metadata requests marked `Sec-Fetch-Site: cross-site`, including requests with no `Origin` header | Session-containment rehearsal proves a cross-site request cannot revoke sessions or alter stored account access |
| Cross-site authenticated read | Agreement records, reports, snapshots, private evidence, and account preferences reject Fetch Metadata requests marked `Sec-Fetch-Site: cross-site`, including requests with no `Origin` header; public readiness and signed unsubscribe links are explicit exceptions | Incident rehearsal rejects each sensitive route, preserves same-origin record/evidence reads, and confirms both public exceptions remain reachable |
| Cross-account proposal or archive access | Server-side email/role matching and account-scoped archive rows | Separate landlord/tenant discovery and archive-isolation rehearsal |
| Lost or untrusted signed-in browser | Verified-user session revocation deletes only that user's derived record sessions; the client clears account-derived browser access and signs out | Containment rehearsal checks every prior user session fails while other parties and invitation links remain authorized |
| Privacy inventory leaks shared or access data | Verified-email role lookup returns only proposal reference, role, status, archive/preference metadata, and aggregate session count; no report content or tokens | A realistic multi-agreement rehearsal stores encrypted evidence, archive and notification state, then checks role isolation, unrelated-account emptiness, cross-site denial, exclusion of evidence/address/wallet/participant/token data, session containment, preference preservation, and clean rediscovery |
| Stolen tenant invitation after reset | Random token rotation, old-link invalidation, and tenant-context session invalidation | Reset test checks the old link and active account session fail |
| Invitation opened with blocked browser storage | The bearer token is removed from the URL before persistence is attempted; authorized access continues in session or memory without weakening Worker authorization | Client regression blocks both storage APIs, captures the invitation without throwing, verifies the URL is scrubbed, and retains only the current-page access |
| Unauthorized evidence download | Agreement-token authorization before R2/IPFS access | Invalid and unrelated-agreement tokens receive an access error |
| Spoofed upload type | File-signature inspection for PDF/JPEG/PNG/WebP | MIME-spoof test rejects before storage |
| R2 plaintext disclosure | Optional AES-256-GCM with per-file HKDF derivation | Stored bytes do not contain plaintext |
| Altered ciphertext or wrong encryption key | AES-GCM authentication fails closed | Tamper regression returns an alteration error and no file |
| Altered plaintext or metadata digest | SHA-256 verified after decryption | Digest-tamper regression fails closed |
| Key rotation makes historical evidence unreadable | Versioned active key ID plus retained decryption keyring | Pre- and post-rotation files decrypt with their recorded key IDs |
| Private evidence storage outage | R2 upload/download failures return privacy-safe retry guidance before metadata or success events are recorded | Upload outage leaves no phantom evidence row/event; retry succeeds; download outage fails closed |
| Notification provider outage | Provider network failures return a retryable delivery error and do not record a sent event | Failed claim notice can be retried once and remains idempotent after recovery |
| Misleading lifecycle record | Role/state guards, idempotency, and version-matched receipt verification | Credential-free lifecycle rehearsals and receipt-verification tests |
| Sensitive email content | Notifications omit addresses, amounts, evidence, and notes | Notification-copy and idempotency tests |
| Browser embedding or referral leakage | No-store, no-referrer, no-sniff, anti-framing, and report CSP headers | Evidence/report/static-response header tests |

## Recovery boundaries

Implemented:

- A landlord can rotate a tenant invitation without revising approved terms.
- Rotation invalidates the prior tenant link and account sessions scoped to that tenant.
- Landlord-authorized optional-arbiter rotation invalidates the prior arbiter link and every
  active arbiter account session without changing approved terms. The arbiter UI remains disabled
  by default.
- A verified landlord, tenant, or appointed-arbiter email can discover only its matching role and
  agreement through a capped, expiring account session.
- A verified account can revoke all of its derived OpenEscrow record sessions without changing
  agreements, archive preferences, other participants' sessions, or bearer invitation links.
- Evidence key rotation can retain historical decryption keys by non-secret key ID.

Not implemented and therefore pilot-limiting:

- recovery when a landlord loses both the original link and access to the matching verified email;
- supervised arbiter recovery operations while the arbiter workspace remains disabled;
- participant-controlled evidence-key recovery;
- operator recovery after loss of every copy of an evidence master key;
- wallet succession for death, incapacity, sanctions, court orders, or abandoned accounts.

Support must not bypass role authorization by manually copying a different participant's bearer
token. Any future recovery workflow needs identity proofing, an immutable recovery event, notice to
the other parties, a delay/challenge period where appropriate, and explicit limits on what support
staff can change.

## Privacy request, deletion, and legal-hold design gate

No automated privacy deletion endpoint is approved yet. Deleting R2 bytes while leaving D1 events,
or deleting D1 metadata while leaving R2/IPFS bytes, would create an incomplete and misleading
record. Public blockchain events cannot be erased.

A verified account can download a privacy-safe metadata inventory as an intake aid. It is not the
complete shared record, a formal access-request response, a legal-hold decision, or a deletion
workflow. Complete agreement exports remain separately authorized through each Record tab.

Before implementation, the owner and counsel must decide:

1. the controller/processor roles and a verified intake method;
2. retention periods for proposals, finalized agreements, evidence, email delivery records, and
   account sessions;
3. when a dispute, litigation, statutory requirement, or fraud investigation creates a legal hold;
4. whether deletion means immediate purge, scheduled purge, or cryptographic erasure;
5. which minimal tombstone remains to prove that a request was completed;
6. how every party is notified when shared evidence is exported, restricted, or deleted; and
7. how backups and retained encryption keys age out consistently.

The eventual workflow should inventory the request, verify identity and role, freeze conflicting
automations, export authorized data, apply any legal hold, delete eligible R2 bytes, remove or
minimize eligible D1 fields, revoke sessions, record a privacy-safe completion event, and verify
that no searchable copy remains. Encrypted IPFS must not be the sole evidence copy unless the
retention and key-destruction consequences are explicitly approved.

## Incident exercises still required

The exact-source credential-free incident rehearsal packages twelve controls covering invalid
identity tokens, cross-account access, cross-site read isolation, participant-scoped session
containment, a realistic multi-agreement privacy inventory with encrypted-evidence exclusion and
clean rediscovery, corrupted ciphertext/key/digest data, retained-key rotation, R2
upload/download outages, notification-provider recovery, spoofed receipts, and RPC fallback. It
produces local JSON and JUnit evidence without touching hosted systems.

A supervised pilot must still additionally exercise:

- lost invitation and lost verified-email escalation without sharing secrets;
- evidence-key backup restoration in a separate operator environment;
- email/RPC/R2 outage and retry behavior;
- suspected cross-account disclosure, including containment and participant notice;
- privacy export plus deletion/legal-hold decision; and
- stopping the pilot while preserving an authorized incident record.

Any cross-account disclosure, plaintext evidence publication, unrecoverable key loss, accepted
spoofed receipt, or unauthorized withdrawal is an immediate stop condition.

The operational sequence, containment limits, privacy-request drill, incident-log template, and
resumption criteria are in
[`testnet-incident-response-runbook.md`](./testnet-incident-response-runbook.md).
