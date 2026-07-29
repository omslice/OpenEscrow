# OpenEscrow testnet incident-response and privacy-request drill

This runbook is for the Base Sepolia demonstration and supervised testnet pilot. It is an internal
engineering and operations draft, not a legal incident-response plan, privacy policy, breach
determination, or authorization to handle real rental deposits or real tenancy data.

Use invented identities, synthetic evidence, worthless test tokens, and separate browser profiles.
Never copy a password, private key, identity token, invitation token, evidence-encryption key,
provider secret, or recovery phrase into an incident log, email, ticket, or chat.

## Automated rehearsal

From `frontend`, run:

```text
npm run incident:rehearse
```

The command exercises ten credential-free controls in memory:

1. forged, expired, and wrong-application identity rejection;
2. cross-account record and archive isolation;
3. verified-account session containment;
4. role-isolated, token-free privacy inventory;
5. ciphertext, key-material, and digest tamper rejection;
6. evidence-upload outage and safe retry;
7. evidence-download outage and privacy-safe failure;
8. notification-provider outage and idempotent recovery;
9. Base Sepolia receipt/event spoof rejection; and
10. bounded receipt verification during public-RPC rate limiting.

Machine-readable JSON and JUnit evidence is written under
`frontend/.incident-rehearsal/`. The artifact records the exact Git commit. It touches no hosted
identity, D1/R2 object, provider, contract, notification, secret, or real fund.

Passing automation proves only those engineering controls. The owner-led drill below remains
required before a supervised pilot.

## Roles for the owner-led drill

Assign one person to each role before starting. One person may hold multiple roles in a small drill,
but the incident lead and recorder should be explicit.

| Role | Responsibility |
| --- | --- |
| Incident lead | Classifies severity, declares stop/resume, and approves containment steps |
| Technical lead | Confirms system state, preserves technical evidence, and executes approved recovery |
| Privacy/communications lead | Determines who may be affected and prepares approved notices |
| Recorder | Maintains the timestamped incident log without secrets or unnecessary personal data |

No role may bypass participant authorization, copy another participant's bearer token, invent a
replacement encryption key, delete shared evidence, or represent a test result as legal approval.

## Immediate stop conditions

Stop inviting testers and ask active testers to stop submitting transactions immediately if any of
these occurs:

- suspected cross-account record or evidence disclosure;
- plaintext private evidence published to a public location;
- evidence that cannot be decrypted because every approved key copy is unavailable;
- a spoofed or wrong-contract transaction receipt accepted as valid;
- an unauthorized withdrawal or wallet-role mismatch;
- real personal information or real funds entered into the testnet demonstration; or
- uncertainty about whether an onchain transaction succeeded after an RPC/provider failure.

Stopping the web workflow does not pause or reverse Base Sepolia contracts. Wallet holders can
still call a public contract directly, and confirmed public-chain records cannot be erased.

## First 15 minutes

1. Record an incident ID, detection time, reporter, affected test environment, and the observable
   symptom. Do not record bearer credentials or private evidence.
2. Tell current testers to stop new proposals, uploads, funding, claims, rulings, and withdrawals.
3. Preserve the current Git commit, public transaction hashes, privacy-safe application event IDs,
   timestamps, readiness response, and provider status. Do not alter or delete the originals.
4. Classify the suspected scope: identity/session, invitation, evidence, notification, RPC/receipt,
   wallet/onchain, compliance routing, or privacy request.
5. Use only the narrow containment action in the matrix below. If scope is uncertain, keep the
   pilot stopped and escalate to the owner.
6. Start a decision log. Record who authorized each action, what was changed, and how it was
   verified.

## Containment matrix

| Scenario | Safe testnet containment | Do not do |
| --- | --- | --- |
| Lost or untrusted signed-in browser | Use **End record sessions & sign out** from the affected verified account; confirm prior derived sessions fail | Claim this revokes Privy, Google, wallet-provider, or invitation sessions |
| Forwarded or stolen tenant invitation | Landlord uses **Reset link** for that tenant; verify the old link and tenant-context sessions fail | Rotate another tenant's link or change approved terms |
| Forwarded or stolen optional-arbiter invitation | Landlord rotates the arbiter link through the guarded recovery path; verify prior arbiter sessions fail | Enable the hidden arbiter UI for a live pilot without a product decision |
| Suspected cross-account disclosure | Stop the pilot, revoke the affected verified account's derived sessions, preserve request/event references, and escalate | Browse unrelated accounts, copy tokens, or delete records to conceal exposure |
| Evidence upload/download outage | Preserve the file hash and failure time; retry only after storage recovery; confirm no phantom metadata or event exists | Re-upload repeatedly, publish plaintext elsewhere, or substitute public IPFS |
| Evidence tamper or key mismatch | Stop evidence access, preserve ciphertext and metadata, verify the configured key ID/keyring, and restore only an approved backup | Guess a key, overwrite ciphertext, discard the recorded key ID, or remove old keys early |
| Notification outage | Preserve the failed attempt and retry once after provider recovery; verify one sent event | Mark a notice sent manually or expose agreement details in fallback email |
| RPC rate limit or uncertain transaction | Check the wallet and an independent Base Sepolia explorer/RPC before retrying; use the retained receipt-recovery control | Repeat a transaction while its status is unknown |
| Receipt/contract mismatch | Stop the pilot and preserve the receipt, expected contract/version, and rejection result | Accept a hash because it exists onchain without event, chain, and contract matching |
| Compliance source changed/stale/unreachable | Keep proposal finalization fail-closed and review the official source/version | Disable the source gate or invent a legal rule |

## Privacy-request drill

The current product deliberately has no automated deletion endpoint.

1. Sign in as the synthetic requesting account.
2. Download the account data inventory. Confirm it contains only proposal references, roles,
   statuses, archive preferences, notification settings, and active-session count.
3. Confirm the inventory contains no invitation/session token, private evidence, property address,
   or other participant's email.
4. Open each authorized Record entry and download its complete shared report and encrypted
   canonical archive through the existing agreement role.
5. Record which data also exists on Base Sepolia, in hosted D1/R2, in optional encrypted IPFS, in
   Privy/wallet providers, in the email provider, and in the browser.
6. Make a documented mock legal-hold decision. Do not delete anything. Record which owner/counsel
   decisions would be required before any D1 field, R2 object, key, provider record, or backup
   could be removed.
7. End the requesting account's derived record sessions and verify clean rediscovery remains
   possible.

The inventory is an intake aid, not a complete access-request response. Shared agreement data,
provider-held data, immutable blockchain records, backups, retention duties, and other parties'
rights require an approved production policy and qualified review.

## Incident log template

Record only privacy-safe references:

```text
Incident ID:
Detected at (UTC):
Reporter:
Environment and exact Git commit:
Severity:
Stop condition:
Affected synthetic accounts/record references:
Public transaction hashes or provider incident reference:
Observed behavior:
Containment action, authorizer, and timestamp:
Verification result:
Notification/privacy decision owner:
Open risks:
Resume decision, authorizer, and timestamp:
```

## Recovery and resumption

Resume only when the incident lead has documented all of the following:

- the suspected cause and affected scope are bounded;
- the relevant automated rehearsal passes at the exact candidate commit;
- prior affected sessions/links fail and intended replacement access succeeds;
- no onchain transaction remains in an unknown state;
- evidence integrity and the approved key ID/keyring are verified where relevant;
- notification retries produced no phantom or duplicate sent record;
- compliance sources and address routing are not bypassed;
- required participant/privacy communications have an identified approver; and
- the owner has explicitly accepted residual testnet risk.

Real-money operation remains prohibited regardless of this drill's result. Qualified counsel,
independent security review, provider approval, production policies, and mainnet release approval
remain separate gates.
