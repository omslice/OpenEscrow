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
| Agreement bearer leaks through a routine private-read URL | The current client sends agreement access in an `Authorization: Bearer` header for record, report, and snapshot reads. Report download uses an authenticated fetch followed by a local browser download, so its URL contains only the non-secret download flag. A present but malformed or wrong authorization header fails closed instead of falling back to a valid query credential; legacy query access remains temporarily supported for older clients. | Server regressions cover all three header-authorized reads, legacy compatibility, and downgrade rejection. Client and rendered-browser regressions assert the bearer never appears in the request URL and the complete report still downloads. |
| Cross-account proposal, archive, device-local tracked-id, or account-center state | Server-side email/role matching, account-scoped archive rows, a workspace remount on stable Privy-account changes, account-scoped tracked-id storage owned by the workspace even when a proposal finalizes, and stale completion guards for discovery, archive, inventory, wallet-copy, embedded-wallet setup, notification preference, and test-email operations | Separate landlord/tenant discovery and archive-isolation rehearsal; client regression rejects legacy device-wide tracking from the proposal form; and a rendered two-identity switch regression holds archive, inventory, wallet, notification, and test-email operations in flight and proves no old data, download, preference, pending state, or completion feedback reaches the new account |
| Lost or untrusted signed-in browser | Verified-user session revocation deletes only that user's derived record sessions; the client clears account-derived browser access and signs out only if the requesting account is still active | Containment rehearsal checks every prior user session fails while other parties and invitation links remain authorized; the rendered switch regression completes the old account's server revocation after switching and proves zero provider-logout calls against the newly selected identity |
| Privacy inventory leaks shared or access data | Verified-email role lookup returns only proposal reference, role, status, archive/preference metadata, and aggregate session count; no report content or tokens | A realistic multi-agreement rehearsal stores encrypted evidence, archive and notification state, then checks role isolation, unrelated-account emptiness, cross-site denial, exclusion of evidence/address/wallet/participant/token data, session containment, preference preservation, and clean rediscovery |
| Browser blocks the privacy-inventory download | The already-authorized JSON remains only in current-page memory and exposes an explicit copy fallback; identity-token changes discard the fallback and ignore a stale response | Client regressions preserve exact prepared bytes after a blocked download, use a timestamp-safe filename, and guard the described status and mobile recovery controls |
| Stolen tenant invitation after reset | Random token rotation, old-link invalidation, and tenant-context session invalidation | Reset test checks the old link and active account session fail |
| Invitation opened with blocked browser storage or an interrupted workspace download | The bearer token is removed from the URL before persistence is attempted; when session storage works, a same-tab recovery copy is written before the deferred workspace request and no invitee bearer is promoted into persistent local storage. A legacy local invitation is migrated to session storage and removed locally; blocked storage keeps authorized access in current-page memory without weakening Worker authorization. Proposal-only remount recovery requires exactly one matching invitation role and rejects ambiguity. | Client regressions prove session-only capture, legacy migration, account-session non-migration, unique-role recovery, ambiguous-role rejection, and blocked-storage current-page access; a production-build browser regression aborts the first workspace request, verifies the URL and local storage stay clear, reloads, and resumes only the exact stored proposal and role |
| Official-source recheck is abused or silently changes legal requirements | Same-origin POST, an exact versioned server registry lookup, a five-minute D1-backed refresh floor, and status-only results; a source change cannot mutate the profile or a finalized snapshot | Server regression baselines the registered source, reuses a recent check, detects a later content change, rejects an unknown version, and asserts the immutable-snapshot notice |
| Unauthorized evidence download or bearer copied from a document link | Agreement-token authorization before R2/IPFS access; new private-document controls use a token-free action path and send the bearer only in a same-origin POST body | Invalid and unrelated-agreement tokens receive an access error; cross-site form posts fail; generated paths contain no token; legacy GET access remains covered during migration |
| Spoofed upload type | File-signature inspection for PDF/JPEG/PNG/WebP | MIME-spoof test rejects before storage |
| R2 plaintext disclosure | Optional AES-256-GCM with per-file HKDF derivation | Stored bytes do not contain plaintext |
| Altered ciphertext or wrong encryption key | AES-GCM authentication fails closed | Tamper regression returns an alteration error and no file |
| Altered plaintext or metadata digest | SHA-256 verified after decryption | Digest-tamper regression fails closed |
| Key rotation makes historical evidence unreadable | Versioned active key ID plus retained decryption keyring; the pilot readiness gate requires every referenced key ID | Pre- and post-rotation files decrypt with their recorded key IDs, and the pilot checker fails closed when a retained key or keyring status is missing |
| Wrong backup bytes are labeled with an expected key ID | Each new encrypted row records a SHA-256 master-key fingerprint; readiness compares stored fingerprints with configured key bytes without exposing those bytes | The isolated recovery rehearsal rejects missing and mismatched backups, restores copied D1/R2 state, and proves exact plaintext recovery only with the approved key bytes |
| A replaced arbiter keeps private-record access, or a nominee gains it before mutual consent | Replacement proposal, confirmation, cancellation, and acceptance are bound to exact Base Sepolia receipts; nominee access is disabled until confirmation; acceptance rotates the saved arbiter bearer and revokes every former-arbiter session; nominee discovery sessions carry separate provenance for exact reset/cancellation revocation; a verified closing action expires an unaccepted nominee | Hosted lifecycle regressions reject wrong nominees, parties, senders, and old/new arbiter fields; prove pre-confirmation denial, post-confirmation nominee access, isolated link/session reset, cancellation and terminal-action revocation, acceptance rotation, and former-arbiter denial |
| Legacy encrypted evidence has no key fingerprint | An authorized download may backfill the fingerprint only after AES-GCM decryption and the stored plaintext SHA-256 receipt both verify | The rehearsal proves a wrong backup cannot decrypt or write metadata, while the approved backup verifies the exact bytes and makes readiness pass |
| Private evidence storage outage | R2 upload/download failures return privacy-safe retry guidance before metadata or success events are recorded | Upload outage leaves no phantom evidence row/event; retry succeeds; download outage fails closed |
| Evidence storage succeeds but its D1 record fails | The metadata and event use one atomic D1 batch; failure triggers a best-effort compensating R2 delete or encrypted-IPFS unpin before the request returns retry guidance | Separate R2 and encrypted-IPFS rehearsals prove cleanup, zero phantom metadata/events, token-safe errors, and a successful retry; cleanup is not claimed if the storage provider also rejects the delete/unpin |
| Delayed evidence upload completes after the user changes agreements or access | Browser upload state is bound to the active proposal, role, and access-token scope; stale completion state is discarded | A rendered regression holds an upload open, switches agreements, and proves the late result cannot populate the newly selected agreement |
| Notification provider outage | Provider network failures return a retryable delivery error and do not record a sent event | Failed claim notice can be retried once and remains idempotent after recovery |
| A secondary tenant is authorized offchain but rejected by the onchain activity registry | The candidate registry authorizes any address with a nonzero immutable tenant share on the exact bound escrow, while still rejecting outsiders | Foundry regression proves a secondary tenant can anchor and publish; the full contract suite preserves the non-party rejection, and hosted readiness still requires the version-matched registry before pilot use |
| Misleading lifecycle record or a real receipt relabeled as another party/value | Role/state guards, idempotency, and one-log receipt matching across deployment, event, agreement, exact participant, amount/hash/type fields; finalization additionally proves every tenant/share, terms, and selected token at the confirmed block | Credential-free lifecycle rehearsals plus spoofing regressions for wrong/missing/split finalization fields, reserve contract/escrow/tenant/token/share fields, another tenant's funding, aggregate-event substitution, claim/amendment values, tenant-response counts, ruling allocations, withdrawal parties/amounts, timeout outcomes, and altered registry hashes/types/actors |
| Sensitive email content | Notifications omit addresses, amounts, evidence, and notes | Notification-copy and idempotency tests |
| Browser embedding or referral leakage | No-store, no-referrer, no-sniff, anti-framing, same-origin opener/resource isolation, token-free current-client agreement/report/snapshot paths, token-free evidence action paths, and report CSP headers | Private-read URL, evidence path, party authorization, cross-site POST, evidence/report/static-response header, and legacy-compatibility tests |

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
  agreements, archive preferences, other participants' sessions, or bearer invitation links. If
  the active account changes during revocation, completed server containment remains valid while
  global local cleanup, provider sign-out, and reload are skipped for the new account.
- Evidence key rotation can retain historical decryption keys by non-secret key ID. New evidence
  also records a one-way master-key fingerprint so readiness can reject wrong backup bytes under
  the expected ID. A legacy row receives that fingerprint only after an authorized, successful
  decrypt-and-digest verification.

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

The exact-source credential-free incident rehearsal packages fifteen controls covering invalid
identity tokens, cross-account access, cross-site read isolation, participant-scoped session
containment, targeted lost-tenant-invitation rotation with co-tenant continuity, a realistic
multi-agreement privacy inventory with encrypted-evidence exclusion and clean rediscovery,
corrupted ciphertext/key/digest data, isolated D1/R2 restoration with missing and mislabeled
backup rejection, R2 upload/download outages, compensating R2 deletion and encrypted-IPFS
unpinning after D1 metadata failure, notification-provider recovery, spoofed receipts, and RPC
fallback. It produces local JSON and JUnit evidence without touching hosted systems.

A supervised pilot must still additionally exercise:

- lost verified-email escalation and the human verification/notification steps around a lost
  invitation, without sharing secrets;
- evidence-key backup restoration in a separate real operator environment, including confirmation
  that readiness rejects missing or mismatched bytes before the approved backup is restored;
- email/RPC/R2 outage and retry behavior;
- suspected cross-account disclosure, including containment and participant notice;
- privacy export plus deletion/legal-hold decision; and
- stopping the pilot while preserving an authorized incident record.

Any cross-account disclosure, plaintext evidence publication, unrecoverable key loss, accepted
spoofed receipt, or unauthorized withdrawal is an immediate stop condition.

The operational sequence, containment limits, privacy-request drill, incident-log template, and
resumption criteria are in
[`testnet-incident-response-runbook.md`](./testnet-incident-response-runbook.md).
